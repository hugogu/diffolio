import { Option } from 'commander';

export const globalOptions = {
  verbose: new Option('--verbose', 'Enable verbose logging').default(false),
  silent: new Option('--silent', 'Suppress all output except errors').default(false),
};

export interface GlobalOptions {
  verbose: boolean;
  silent: boolean;
}

export function addGlobalOptions(command: any): void {
  command
    .addOption(globalOptions.verbose)
    .addOption(globalOptions.silent);
}
