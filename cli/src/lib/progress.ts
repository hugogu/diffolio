import cliProgress from 'cli-progress';
import chalk from 'chalk';

export interface ProgressReporter {
  start(total: number, label: string): void;
  update(current: number, message?: string): void;
  increment(amount?: number, message?: string): void;
  complete(message?: string): void;
  error(message: string): void;
  stop(): void;
}

export class CLIProgressReporter implements ProgressReporter {
  private progressBar: cliProgress.SingleBar | null = null;
  private label: string = '';

  start(total: number, label: string): void {
    this.label = label;
    this.progressBar = new cliProgress.SingleBar({
      format: `${chalk.cyan('{bar}')} {percentage}% | {value}/{total} {label}`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
    });

    this.progressBar.start(total, 0, { label });
  }

  update(current: number, message?: string): void {
    if (this.progressBar) {
      this.progressBar.update(current, { label: message || this.label });
    }
  }

  increment(amount: number = 1, message?: string): void {
    if (this.progressBar) {
      this.progressBar.increment(amount, { label: message || this.label });
    }
  }

  complete(message?: string): void {
    if (this.progressBar) {
      this.progressBar.stop();
      console.log(chalk.green(`✓ ${message || this.label}`));
    }
  }

  error(message: string): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
    console.error(chalk.red(`✗ ${message}`));
  }

  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
  }
}

export class SilentProgressReporter implements ProgressReporter {
  start(): void {}
  update(): void {}
  increment(): void {}
  complete(message?: string): void {
    if (message) {
      console.log(chalk.green(`✓ ${message}`));
    }
  }
  error(message: string): void {
    console.error(chalk.red(`✗ ${message}`));
  }
  stop(): void {}
}

export function createProgressReporter(silent: boolean = false): ProgressReporter {
  return silent ? new SilentProgressReporter() : new CLIProgressReporter();
}
