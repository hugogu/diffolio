import chalk from 'chalk';

// Exit codes as defined in FR-013
export const ExitCodes = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGS: 2,
  DB_CONNECTION_ERROR: 3,
  FILE_NOT_FOUND: 4,
  PARSE_ERROR: 5,
  COMPARE_ERROR: 6,
  EXPORT_ERROR: 7,
} as const;

export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = ExitCodes.GENERAL_ERROR
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(ExitCodes.GENERAL_ERROR);
  }

  console.error(chalk.red(`Unknown error: ${String(error)}`));
  process.exit(ExitCodes.GENERAL_ERROR);
}

export function assertFileExists(filePath: string): void {
  const { existsSync } = require('fs');
  if (!existsSync(filePath)) {
    throw new CLIError(`File not found: ${filePath}`, ExitCodes.FILE_NOT_FOUND);
  }
}

export function assertValidArgs(condition: boolean, message: string): void {
  if (!condition) {
    throw new CLIError(message, ExitCodes.INVALID_ARGS);
  }
}
