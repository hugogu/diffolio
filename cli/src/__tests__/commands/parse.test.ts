import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createParseCommand } from '../../commands/parse.js';

describe('Parse Command', () => {
  let command: Command;

  beforeEach(() => {
    command = createParseCommand();
  });

  it('should create command with correct name', () => {
    expect(command.name()).toBe('parse');
  });

  it('should have required file option', () => {
    const fOption = command.options.find(o => o.attributeName() === 'file');
    expect(fOption).toBeDefined();
    expect(fOption?.required).toBe(true);
  });

  it('should have required config option', () => {
    const cOption = command.options.find(o => o.attributeName() === 'config');
    expect(cOption).toBeDefined();
    expect(cOption?.required).toBe(true);
  });

  it('should have required database option', () => {
    const dOption = command.options.find(o => o.attributeName() === 'database');
    expect(dOption).toBeDefined();
    expect(dOption?.required).toBe(true);
  });

  it('should have required version-name option', () => {
    const vOption = command.options.find(o => o.attributeName() === 'versionName');
    expect(vOption).toBeDefined();
    expect(vOption?.required).toBe(true);
  });

  it('should have format option', () => {
    const fOption = command.options.find(o => o.attributeName() === 'format');
    expect(fOption).toBeDefined();
  });
});
