import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { createParseCommand } from '../commands/parse.js';
import { createQueryCommand } from '../commands/query.js';
import { createCompareCommand } from '../commands/compare.js';
import { createExportCommand } from '../commands/export.js';

describe('CLI Commands Suite', () => {
  it('should have parse command', () => {
    const cmd = createParseCommand();
    expect(cmd.name()).toBe('parse');
  });

  it('should have query command', () => {
    const cmd = createQueryCommand();
    expect(cmd.name()).toBe('query');
  });

  it('should have compare command', () => {
    const cmd = createCompareCommand();
    expect(cmd.name()).toBe('compare');
  });

  it('should have export command', () => {
    const cmd = createExportCommand();
    expect(cmd.name()).toBe('export');
  });

  it('should create complete CLI program', () => {
    const program = new Command();
    program.addCommand(createParseCommand());
    program.addCommand(createQueryCommand());
    program.addCommand(createCompareCommand());
    program.addCommand(createExportCommand());

    const commands = program.commands.map(c => c.name());
    expect(commands).toHaveLength(4);
    expect(commands).toContain('parse');
    expect(commands).toContain('query');
    expect(commands).toContain('compare');
    expect(commands).toContain('export');
  });
});
