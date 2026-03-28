import { Command } from 'commander';
import chalk from 'chalk';
import { PrismaClient } from '@prisma/client';
import { connectDatabase, disconnectDatabase } from '../lib/database.js';
import { CLIError, ExitCodes } from '../lib/errors.js';
import { addGlobalOptions, GlobalOptions } from '../lib/options.js';

interface QueryOptions extends GlobalOptions {
  database: string;
  headword?: string;
  phonetic?: string;
  pos?: string;
  versionId?: string;
  comparisonId?: string;
  changeType?: string;
  detail?: boolean;
  limit: number;
  offset: number;
  format: 'table' | 'json';
}

// Format entry for table output
function formatTableEntry(entry: any): string {
  const senses = entry.senses?.map((s: any, i: number) => {
    let senseStr = `  ${i + 1}. [${s.grammaticalCat || 'N/A'}]`;
    if (s.phonetic) senseStr += ` ${s.phonetic}`;
    senseStr += ` ${s.definition || 'N/A'}`;
    if (s.examples?.length) {
      senseStr += `\n     例: ${s.examples.slice(0, 2).map((e: any) => e.content).join(' | ')}`;
    }
    return senseStr;
  }).join('\n') || '  No senses';

  return `
${chalk.bold.cyan(entry.rawHeadword)} ${entry.phonetic ? chalk.gray(`[${entry.phonetic}]`) : ''}
${senses}
`;
}

// Format comparison alignment for table output
function formatComparisonAlignment(alignment: any, detail: boolean): string {
  const entryA = alignment.entryA;
  const entryB = alignment.entryB;
  
  let output = '\n';
  
  // Show change type with color
  let changeTypeStr = alignment.changeType;
  switch (alignment.changeType) {
    case 'MATCHED':
      changeTypeStr = chalk.green(alignment.changeType);
      break;
    case 'MATCHED_VARIANT':
      changeTypeStr = chalk.yellow(alignment.changeType);
      break;
    case 'ADDED':
      changeTypeStr = chalk.blue(alignment.changeType);
      break;
    case 'DELETED':
      changeTypeStr = chalk.red(alignment.changeType);
      break;
  }
  
  output += chalk.bold(`Change Type: ${changeTypeStr}\n`);
  
  // Version A
  if (entryA) {
    output += chalk.gray(`Version A: ${entryA.rawHeadword}`);
    if (entryA.phonetic) output += chalk.gray(` [${entryA.phonetic}]`);
    output += '\n';
  } else {
    output += chalk.gray(`Version A: (not present)\n`);
  }
  
  // Version B
  if (entryB) {
    output += chalk.gray(`Version B: ${entryB.rawHeadword}`);
    if (entryB.phonetic) output += chalk.gray(` [${entryB.phonetic}]`);
    output += '\n';
  } else {
    output += chalk.gray(`Version B: (not present)\n`);
  }
  
  // Show sense diffs if detail mode
  if (detail && alignment.senseDiffs?.length > 0) {
    output += chalk.bold('\n  Sense Differences:\n');
    for (const diff of alignment.senseDiffs) {
      const senseA = diff.senseA;
      const senseB = diff.senseB;
      
      output += `    ${diff.changeType}:\n`;
      
      if (senseA) {
        output += chalk.gray(`      A: [${senseA.grammaticalCat || 'N/A'}] ${senseA.definition?.substring(0, 50)}${senseA.definition?.length > 50 ? '...' : ''}\n`);
      }
      
      if (senseB) {
        output += chalk.gray(`      B: [${senseB.grammaticalCat || 'N/A'}] ${senseB.definition?.substring(0, 50)}${senseB.definition?.length > 50 ? '...' : ''}\n`);
      }
    }
  }
  
  return output;
}

// Format entries for JSON output
function formatJsonOutput(entries: any[]): string {
  return JSON.stringify(entries.map(e => ({
    id: e.id,
    headword: e.rawHeadword,
    normalizedHeadword: e.normalizedHeadword,
    phonetic: e.phonetic,
    entrySequence: e.entrySequence,
    dictionaryId: e.dictionaryId,
    dictionary: e.dictionary?.name,
    senses: e.senses?.map((s: any) => ({
      id: s.id,
      number: s.rawNumber,
      definition: s.definition,
      phonetic: s.phonetic,
      grammaticalCat: s.grammaticalCat,
      register: s.register,
      examples: s.examples?.map((ex: any) => ({
        content: ex.content,
        translation: ex.translation,
      })),
    })),
  })), null, 2);
}

// Format comparison results for JSON output
function formatComparisonJsonOutput(alignments: any[]): string {
  return JSON.stringify(alignments.map(a => ({
    id: a.id,
    changeType: a.changeType,
    alignScore: a.alignScore,
    entryA: a.entryA ? {
      id: a.entryA.id,
      headword: a.entryA.rawHeadword,
      phonetic: a.entryA.phonetic,
    } : null,
    entryB: a.entryB ? {
      id: a.entryB.id,
      headword: a.entryB.rawHeadword,
      phonetic: a.entryB.phonetic,
    } : null,
    senseDiffs: a.senseDiffs?.map((d: any) => ({
      changeType: d.changeType,
      senseA: d.senseA ? { id: d.senseA.id, definition: d.senseA.definition } : null,
      senseB: d.senseB ? { id: d.senseB.id, definition: d.senseB.definition } : null,
    })),
  })), null, 2);
}

async function queryDictionary(prisma: PrismaClient, options: QueryOptions): Promise<void> {
  // Build where clause
  const where: any = {};

  // Headword filter (supports partial matching)
  if (options.headword) {
    // Check if it's a prefix search (ends with %)
    if (options.headword.endsWith('%')) {
      const prefix = options.headword.slice(0, -1);
      where.rawHeadword = { startsWith: prefix };
    } else {
      where.rawHeadword = { contains: options.headword };
    }
  }

  // Phonetic filter
  if (options.phonetic) {
    where.phonetic = { contains: options.phonetic };
  }

  // Version filter
  if (options.versionId) {
    where.dictionaryId = options.versionId;
  }

  // POS filter - needs to filter through senses
  let posFilter = {};
  if (options.pos) {
    posFilter = {
      senses: {
        some: {
          grammaticalCat: options.pos,
        },
      },
    };
  }

  // Combine filters
  const finalWhere = { ...where, ...posFilter };

  // Query entries with pagination
  const entries = await prisma.entry.findMany({
    where: finalWhere,
    take: options.limit,
    skip: options.offset,
    include: {
      dictionary: {
        select: { name: true },
      },
      senses: {
        include: {
          examples: true,
        },
        orderBy: {
          position: 'asc',
        },
      },
    },
    orderBy: {
      normalizedHeadword: 'asc',
    },
  });

  // Get total count for pagination info
  const total = await prisma.entry.count({
    where: finalWhere,
  });

  if (entries.length === 0) {
    console.log(chalk.yellow('No entries found matching your criteria.'));
    return;
  }

  // Output results
  if (options.format === 'json') {
    console.log(formatJsonOutput(entries));
  } else {
    // Table format (default)
    console.log(chalk.bold(`\nFound ${entries.length} of ${total} entries:\n`));
    
    for (const entry of entries) {
      console.log(formatTableEntry(entry));
    }

    // Show pagination info
    if (total > options.limit) {
      const currentPage = Math.floor(options.offset / options.limit) + 1;
      const totalPages = Math.ceil(total / options.limit);
      console.log(chalk.gray(`\nPage ${currentPage} of ${totalPages} (showing ${options.offset + 1}-${Math.min(options.offset + options.limit, total)} of ${total})`));
      console.log(chalk.gray(`Use --offset ${options.offset + options.limit} to see more results`));
    }
  }
}

async function queryComparison(prisma: PrismaClient, options: QueryOptions): Promise<void> {
  // Verify comparison exists
  const comparison = await prisma.comparison.findUnique({
    where: { id: options.comparisonId },
    include: {
      versionA: { select: { name: true } },
      versionB: { select: { name: true } },
    },
  });

  if (!comparison) {
    throw new CLIError(
      `Comparison not found: ${options.comparisonId}`,
      ExitCodes.INVALID_ARGS
    );
  }

  // Build where clause for alignments
  const where: any = {
    comparisonId: options.comparisonId,
  };

  // Change type filter
  if (options.changeType) {
    where.changeType = options.changeType;
  }

  // Headword filter
  if (options.headword) {
    where.OR = [
      { entryA: { rawHeadword: { contains: options.headword } } },
      { entryB: { rawHeadword: { contains: options.headword } } },
    ];
  }

  // Query alignments
  const alignments = await prisma.entryAlignment.findMany({
    where,
    take: options.limit,
    skip: options.offset,
    include: {
      entryA: {
        include: {
          senses: {
            include: { examples: true },
          },
        },
      },
      entryB: {
        include: {
          senses: {
            include: { examples: true },
          },
        },
      },
      senseDiffs: {
        include: {
          senseA: true,
          senseB: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Get total count
  const total = await prisma.entryAlignment.count({ where });

  if (alignments.length === 0) {
    console.log(chalk.yellow('No alignments found matching your criteria.'));
    return;
  }

  // Output results
  if (options.format === 'json') {
    console.log(formatComparisonJsonOutput(alignments));
  } else {
    // Table format
    console.log(chalk.bold(`\nComparison: ${comparison.name}`));
    console.log(chalk.gray(`  Version A: ${comparison.versionA.name}`));
    console.log(chalk.gray(`  Version B: ${comparison.versionB.name}`));
    console.log(chalk.bold(`\nFound ${alignments.length} of ${total} alignments:\n`));

    for (const alignment of alignments) {
      console.log(formatComparisonAlignment(alignment, options.detail || false));
    }

    // Show pagination info
    if (total > options.limit) {
      const currentPage = Math.floor(options.offset / options.limit) + 1;
      const totalPages = Math.ceil(total / options.limit);
      console.log(chalk.gray(`\nPage ${currentPage} of ${totalPages} (showing ${options.offset + 1}-${Math.min(options.offset + options.limit, total)} of ${total})`));
      console.log(chalk.gray(`Use --offset ${options.offset + options.limit} to see more results`));
    }
  }
}

async function executeQuery(options: QueryOptions): Promise<void> {
  let prisma: PrismaClient | null = null;

  try {
    // Connect to database
    prisma = await connectDatabase(options.database);

    // Route to appropriate query function
    if (options.comparisonId) {
      await queryComparison(prisma, options);
    } else {
      await queryDictionary(prisma, options);
    }

  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Query failed: ${error instanceof Error ? error.message : String(error)}`,
      ExitCodes.GENERAL_ERROR
    );
  } finally {
    if (prisma) {
      await disconnectDatabase(prisma);
    }
  }
}

export function createQueryCommand(): Command {
  const command = new Command('query');

  command
    .description('Query parsed dictionary content or comparison results')
    .requiredOption('-d, --database <url>', 'Database connection URL (postgresql:// or file://)')
    .option('-w, --headword <text>', 'Filter by headword (supports partial match with %)')
    .option('-p, --phonetic <text>', 'Filter by pinyin/pronunciation')
    .option('--pos <type>', 'Filter by part of speech (e.g., 名, 动, 形)')
    .option('-v, --version-id <id>', 'Query specific version only')
    .option('--comparison-id <id>', 'Query comparison results by comparison ID')
    .option('--change-type <type>', 'Filter comparison results by change type (MATCHED, ADDED, DELETED, MATCHED_VARIANT)')
    .option('--detail', 'Show detailed sense-level differences for comparison queries')
    .option('--limit <n>', 'Maximum results to return', '50')
    .option('--offset <n>', 'Skip first N results', '0')
    .option('--format <type>', 'Output format: table or json', 'table')
    .addHelpText('after', `
Examples:
  # Query dictionary entries
  $ diffolio query -d file:./db.sqlite -w "爱"

  # Query by prefix
  $ diffolio query -d file:./db.sqlite -w "爱%"

  # Query by pinyin
  $ diffolio query -d file:./db.sqlite -p "ài"

  # Query by part of speech
  $ diffolio query -d file:./db.sqlite --pos "名"

  # Query comparison results
  $ diffolio query -d file:./db.sqlite --comparison-id "comp-id"

  # Filter comparison by change type
  $ diffolio query -d file:./db.sqlite --comparison-id "comp-id" --change-type ADDED

  # Show detailed comparison differences
  $ diffolio query -d file:./db.sqlite --comparison-id "comp-id" --detail

  # JSON output
  $ diffolio query -d file:./db.sqlite -w "爱" --format json
    `);

  addGlobalOptions(command);

  command.action(async (options) => {
    // Convert numeric options
    const parsedOptions: QueryOptions = {
      ...options,
      limit: parseInt(options.limit, 10),
      offset: parseInt(options.offset, 10),
    };
    
    await executeQuery(parsedOptions);
  });

  return command;
}
