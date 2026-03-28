#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createParseCommand } from './commands/parse.js';

const program = new Command();

program
  .name('diffolio')
  .description('Diffolio CLI - Dictionary comparison tool')
  .version('1.0.0', '-v, --version', 'Show version number')
  .helpOption('-h, --help', 'Show help')
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name(),
  });

// Register commands
program.addCommand(createParseCommand());

// Global error handler
program.exitOverride();

try {
  program.parse();
} catch (error) {
  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
  throw error;
}

// Show help if no command provided
if (process.argv.length <= 2) {
  program.help();
}

export { program };
