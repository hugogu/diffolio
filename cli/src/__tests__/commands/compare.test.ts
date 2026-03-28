import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createCompareCommand } from '../../commands/compare.js';

describe('Compare Command', () => {
  let command: Command;

  beforeEach(() => {
    command = createCompareCommand();
  });

  it('should create command with correct name', () => {
    expect(command.name()).toBe('compare');
  });

  it('should have required version-a option', () => {
    const aOption = command.options.find(o => o.attributeName() === 'versionA');
    expect(aOption).toBeDefined();
    expect(aOption?.required).toBe(true);
  });

  it('should have required version-b option', () => {
    const bOption = command.options.find(o => o.attributeName() === 'versionB');
    expect(bOption).toBeDefined();
    expect(bOption?.required).toBe(true);
  });

  it('should have required database option', () => {
    const dOption = command.options.find(o => o.attributeName() === 'database');
    expect(dOption).toBeDefined();
    expect(dOption?.required).toBe(true);
  });

  it('should have name option', () => {
    const nOption = command.options.find(o => o.attributeName() === 'name');
    expect(nOption).toBeDefined();
  });

  it('should include verbose option', () => {
    const vOption = command.options.find(o => o.attributeName() === 'verbose');
    expect(vOption).toBeDefined();
  });

  it('should include silent option', () => {
    const sOption = command.options.find(o => o.attributeName() === 'silent');
    expect(sOption).toBeDefined();
  });
});
