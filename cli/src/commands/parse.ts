import { Command } from 'commander';
import { resolve, extname } from 'path';
import chalk from 'chalk';
import { connectDatabase, disconnectDatabase } from '../lib/database.js';
import { loadConfig, validateConfig } from '../lib/config.js';
import { createProgressReporter } from '../lib/progress.js';
import { CLIError, ExitCodes, assertFileExists } from '../lib/errors.js';
import { addGlobalOptions, GlobalOptions } from '../lib/options.js';

interface ParseOptions extends GlobalOptions {
  file: string;
  config: string;
  database: string;
  versionName: string;
  format?: string;
}

// File format detection
function detectFormat(filePath: string, format?: string): 'txt' | 'docx' | 'doc' | 'pdf' {
  if (format) {
    const lowerFormat = format.toLowerCase();
    if (['txt', 'docx', 'doc', 'pdf'].includes(lowerFormat)) {
      return lowerFormat as 'txt' | 'docx' | 'doc' | 'pdf';
    }
    throw new CLIError(`Unsupported format: ${format}`, ExitCodes.INVALID_ARGS);
  }

  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.txt':
      return 'txt';
    case '.docx':
      return 'docx';
    case '.doc':
      return 'doc';
    case '.pdf':
      return 'pdf';
    default:
      throw new CLIError(
        `Cannot detect format from extension: ${ext}. Use --format to specify.`,
        ExitCodes.INVALID_ARGS
      );
  }
}

// Import parser dynamically based on format
async function getParser(format: 'txt' | 'docx' | 'doc' | 'pdf') {
  // These imports will resolve via @backend/* path alias after build
  // For now, we use relative paths
  const backendPath = '../../../backend/src/services/parser';
  
  switch (format) {
    case 'txt':
      const txtModule = await import(`${backendPath}/txt.parser.js`);
      return txtModule.parseTxt;
    case 'docx':
      const docxModule = await import(`${backendPath}/docx.parser.js`);
      return docxModule.parseDocx;
    case 'doc':
      const docModule = await import(`${backendPath}/doc.parser.js`);
      return docModule.parseDoc;
    case 'pdf':
      const pdfModule = await import(`${backendPath}/pdf.parser.js`);
      return pdfModule.parsePdf;
  }
}

// Import config engine
async function getConfigEngine() {
  const backendPath = '../../../backend/src/services/config-engine.js';
  const configEngine = await import(backendPath);
  return {
    validateConfig: configEngine.validateConfig,
    compileConfig: configEngine.compileConfig,
  };
}

async function executeParse(options: ParseOptions): Promise<void> {
  const startTime = Date.now();
  const progress = createProgressReporter(options.silent);

  try {
    // Validate file exists
    assertFileExists(options.file);

    // Detect format
    const format = detectFormat(options.file, options.format);
    console.log(chalk.blue(`Parsing ${format.toUpperCase()} file...`));

    // Load and validate config
    const config = loadConfig(options.config);
    const configEngine = await getConfigEngine();
    const validation = configEngine.validateConfig(config);
    
    if (!validation.valid) {
      throw new CLIError(
        `Config validation failed: ${validation.errors?.join(', ')}`,
        ExitCodes.INVALID_ARGS
      );
    }

    const compiledConfig = configEngine.compileConfig(config);

    // Connect to database
    const prisma = await connectDatabase(options.database);

    try {
      // Create dictionary version record
      const dictionary = await prisma.dictionary.create({
        data: {
          name: options.versionName,
          formatConfig: JSON.stringify(config),
        },
      });

      console.log(chalk.blue(`Created dictionary version: ${dictionary.name} (${dictionary.id})`));

      // Get parser
      const parseFn = await getParser(format);

      // Parse file
      let entryCount = 0;
      let senseCount = 0;
      let exampleCount = 0;

      progress.start(100, 'Parsing entries...');

      // Process parser chunks
      for await (const chunk of parseFn(options.file, compiledConfig)) {
        // Update counts
        if (chunk.entries) {
          for (const entry of chunk.entries) {
            entryCount++;
            senseCount += entry.senses?.length || 0;
            exampleCount += entry.senses?.reduce(
              (sum, sense) => sum + (sense.examples?.length || 0),
              0
            ) || 0;

            // Save entry to database
            await prisma.entry.create({
              data: {
                dictionaryId: dictionary.id,
                rawHeadword: entry.rawHeadword,
                normalizedHeadword: entry.normalizedHeadword,
                entrySequence: entry.entrySequence,
                phonetic: entry.phonetic,
                senses: {
                  create: entry.senses?.map((sense, index) => ({
                    rawNumber: sense.rawNumber,
                    normalizedNumber: sense.normalizedNumber,
                    definition: sense.definition,
                    phonetic: sense.phonetic,
                    grammaticalCat: sense.grammaticalCat,
                    register: sense.register,
                    position: index,
                    examples: {
                      create: sense.examples?.map((example, exIndex) => ({
                        content: example.content,
                        translation: example.translation,
                        position: exIndex,
                      })) || [],
                    },
                  })) || [],
                },
              },
            });
          }
        }

        // Update progress (estimate based on file size or entry count)
        if (entryCount % 100 === 0) {
          progress.update(entryCount, `Parsed ${entryCount} entries...`);
        }
      }

      progress.complete();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Print statistics
      console.log(chalk.green('\n✓ Parse complete!'));
      console.log(chalk.gray(`  Duration: ${duration}s`));
      console.log(chalk.gray(`  Dictionary ID: ${dictionary.id}`));
      console.log(chalk.gray(`  Entries: ${entryCount}`));
      console.log(chalk.gray(`  Senses: ${senseCount}`));
      console.log(chalk.gray(`  Examples: ${exampleCount}`));

    } finally {
      await disconnectDatabase(prisma);
    }

  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Parse failed: ${error instanceof Error ? error.message : String(error)}`,
      ExitCodes.PARSE_ERROR
    );
  }
}

export function createParseCommand(): Command {
  const command = new Command('parse');

  command
    .description('Parse a dictionary file and save to database')
    .requiredOption('-f, --file <path>', 'Dictionary file path')
    .requiredOption('-c, --config <path>', 'Format configuration file')
    .requiredOption('-d, --database <url>', 'Database connection URL (postgresql:// or file://)')
    .requiredOption('-n, --version-name <name>', 'Version identifier for this dictionary')
    .option('--format <type>', 'File format (txt, docx, doc, pdf). Auto-detected from extension if not specified.')
    .addHelpText('after', `
Examples:
  # Parse with SQLite (local development)
  $ diffolio parse -f ./dict.txt -c ./config.json -d "file:./db.sqlite" -n "v1"

  # Parse with PostgreSQL
  $ diffolio parse -f ./dict.txt -c ./config.json -d "postgresql://user:pass@localhost/db" -n "v1"

  # Explicitly specify format
  $ diffolio parse -f ./dict --format txt -c ./config.json -d "file:./db.sqlite" -n "v1"
    `);

  addGlobalOptions(command);

  command.action(async (options) => {
    await executeParse(options as ParseOptions);
  });

  return command;
}
