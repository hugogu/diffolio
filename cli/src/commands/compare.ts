import { Command } from 'commander';
import chalk from 'chalk';
import { PrismaClient } from '@prisma/client';
import { connectDatabase, disconnectDatabase } from '../lib/database.js';
import { createProgressReporter } from '../lib/progress.js';
import { CLIError, ExitCodes } from '../lib/errors.js';
import { addGlobalOptions, GlobalOptions } from '../lib/options.js';

interface CompareOptions extends GlobalOptions {
  versionA: string;
  versionB: string;
  database: string;
  name?: string;
}

// Import backend services
async function getAligner() {
  const aligner = await import('../../../backend/src/services/aligner.js');
  return {
    alignEntries: aligner.alignEntries,
    ChangeType: aligner.ChangeType,
  };
}

async function getDiffer() {
  const differ = await import('../../../backend/src/services/differ.js');
  return {
    diffSenses: differ.diffSenses,
  };
}

async function executeCompare(options: CompareOptions): Promise<void> {
  const startTime = Date.now();
  const progress = createProgressReporter(options.silent);
  let prisma: PrismaClient | null = null;

  try {
    // Connect to database
    prisma = await connectDatabase(options.database);

    // Verify both versions exist
    const [dictA, dictB] = await Promise.all([
      prisma.dictionary.findUnique({
        where: { id: options.versionA },
        select: { id: true, name: true },
      }),
      prisma.dictionary.findUnique({
        where: { id: options.versionB },
        select: { id: true, name: true },
      }),
    ]);

    if (!dictA) {
      throw new CLIError(
        `Version A not found: ${options.versionA}`,
        ExitCodes.INVALID_ARGS
      );
    }

    if (!dictB) {
      throw new CLIError(
        `Version B not found: ${options.versionB}`,
        ExitCodes.INVALID_ARGS
      );
    }

    console.log(chalk.blue(`Comparing:`));
    console.log(chalk.gray(`  Version A: ${dictA.name} (${dictA.id})`));
    console.log(chalk.gray(`  Version B: ${dictB.name} (${dictB.id})`));

    // Create comparison record
    const comparison = await prisma.comparison.create({
      data: {
        name: options.name || `${dictA.name} vs ${dictB.name}`,
        versionAId: dictA.id,
        versionBId: dictB.id,
        status: 'PROCESSING',
      },
    });

    console.log(chalk.blue(`\nCreated comparison: ${comparison.id}`));

    // Get aligner service
    const { alignEntries } = await getAligner();

    // Get all entries from both versions
    const entriesA = await prisma.entry.findMany({
      where: { dictionaryId: dictA.id },
      orderBy: { createdAt: 'asc' },
    });

    const entriesB = await prisma.entry.findMany({
      where: { dictionaryId: dictB.id },
      orderBy: { createdAt: 'asc' },
    });

    console.log(chalk.gray(`  Entries in version A: ${entriesA.length}`));
    console.log(chalk.gray(`  Entries in version B: ${entriesB.length}`));

    // Run alignment
    progress.start(entriesA.length + entriesB.length, 'Aligning entries...');

    const alignmentResults = await alignEntries(entriesA, entriesB);

    progress.update(entriesA.length + entriesB.length, 'Alignment complete');
    progress.complete();

    // Create entry alignments
    let aligned = 0;
    let added = 0;
    let deleted = 0;
    let variants = 0;

    progress.start(alignmentResults.length, 'Creating alignments...');

    for (let i = 0; i < alignmentResults.length; i++) {
      const result = alignmentResults[i];

      await prisma.entryAlignment.create({
        data: {
          comparisonId: comparison.id,
          entryAId: result.entryAId,
          entryBId: result.entryBId,
          changeType: result.changeType,
          alignScore: result.alignScore,
        },
      });

      // Track statistics
      switch (result.changeType) {
        case 'MATCHED':
          aligned++;
          break;
        case 'ADDED':
          added++;
          break;
        case 'DELETED':
          deleted++;
          break;
        case 'MATCHED_VARIANT':
          variants++;
          break;
      }

      if (i % 100 === 0) {
        progress.update(i, `Created ${i} alignments...`);
      }
    }

    progress.complete();

    // Compute sense differences for matched entries
    console.log(chalk.blue('\nComputing sense differences...'));
    
    const matchedAlignments = alignmentResults.filter(
      r => r.changeType === 'MATCHED' || r.changeType === 'MATCHED_VARIANT'
    );

    progress.start(matchedAlignments.length, 'Computing differences...');

    const { diffSenses } = await getDiffer();

    for (let i = 0; i < matchedAlignments.length; i++) {
      const alignment = matchedAlignments[i];

      if (alignment.entryAId && alignment.entryBId) {
        // Get senses for both entries
        const [sensesA, sensesB] = await Promise.all([
          prisma.sense.findMany({
            where: { entryId: alignment.entryAId },
            include: { examples: true },
            orderBy: { position: 'asc' },
          }),
          prisma.sense.findMany({
            where: { entryId: alignment.entryBId },
            include: { examples: true },
            orderBy: { position: 'asc' },
          }),
        ]);

        // Compute sense differences
        const senseDiffs = await diffSenses(sensesA, sensesB);

        // Create sense diff records
        for (const diff of senseDiffs) {
          await prisma.senseDiff.create({
            data: {
              entryAlignmentId: (await prisma.entryAlignment.findFirst({
                where: {
                  comparisonId: comparison.id,
                  entryAId: alignment.entryAId,
                  entryBId: alignment.entryBId,
                },
              }))!.id,
              senseAId: diff.senseAId,
              senseBId: diff.senseBId,
              changeType: diff.changeType,
              diffSummary: JSON.stringify(diff.diffSummary),
            },
          });
        }
      }

      if (i % 50 === 0) {
        progress.update(i, `Processed ${i} entries...`);
      }
    }

    progress.complete();

    // Update comparison status
    await prisma.comparison.update({
      where: { id: comparison.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Print summary
    console.log(chalk.green('\n✓ Comparison complete!'));
    console.log(chalk.gray(`  Duration: ${duration}s`));
    console.log(chalk.gray(`  Comparison ID: ${comparison.id}`));
    console.log(chalk.gray(`\n  Results:`));
    console.log(chalk.gray(`    Matched: ${aligned}`));
    console.log(chalk.gray(`    Added: ${added}`));
    console.log(chalk.gray(`    Deleted: ${deleted}`));
    console.log(chalk.gray(`    Variants: ${variants}`));
    console.log(chalk.gray(`    Total: ${alignmentResults.length}`));
    console.log(chalk.gray(`\n  Next steps:`));
    console.log(chalk.gray(`    Query results: diffolio query -d ${options.database} --comparison-id ${comparison.id}`));
    console.log(chalk.gray(`    Export results: diffolio export -c ${comparison.id} -o results.xlsx -d ${options.database}`));

  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Comparison failed: ${error instanceof Error ? error.message : String(error)}`,
      ExitCodes.COMPARE_ERROR
    );
  } finally {
    if (prisma) {
      await disconnectDatabase(prisma);
    }
  }
}

export function createCompareCommand(): Command {
  const command = new Command('compare');

  command
    .description('Compare two dictionary versions and compute differences')
    .requiredOption('-a, --version-a <id>', 'First version ID')
    .requiredOption('-b, --version-b <id>', 'Second version ID')
    .requiredOption('-d, --database <url>', 'Database connection URL')
    .option('-n, --name <name>', 'Comparison name/description')
    .addHelpText('after', `
Examples:
  # Compare two versions
  $ diffolio compare -a "version-id-1" -b "version-id-2" -d file:./db.sqlite

  # Compare with custom name
  $ diffolio compare -a "v1" -b "v2" -d file:./db.sqlite -n "V1 to V2 comparison"

  # Compare using PostgreSQL
  $ diffolio compare -a "v1" -b "v2" -d "postgresql://localhost/db"

Change Types:
  - MATCHED: Entry exists in both versions
  - MATCHED_VARIANT: Entry exists with glyph variant differences
  - ADDED: Entry exists only in version B (new)
  - DELETED: Entry exists only in version A (removed)
    `);

  addGlobalOptions(command);

  command.action(async (options) => {
    await executeCompare(options as CompareOptions);
  });

  return command;
}
