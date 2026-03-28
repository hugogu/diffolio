import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createExportCommand } from '../../commands/export.js';

describe('Export Command', () => {
  let command: Command;

  beforeEach(() => {
    command = createExportCommand();
  });

  it('should create command with correct name', () => {
    expect(command.name()).toBe('export');
  });

  it('should have required comparison-id option', () => {
    const cOption = command.options.find(o => o.attributeName() === 'comparisonId');
    expect(cOption).toBeDefined();
    expect(cOption?.required).toBe(true);
  });

  it('should have required output option', () => {
    const oOption = command.options.find(o => o.attributeName() === 'output');
    expect(oOption).toBeDefined();
    expect(oOption?.required).toBe(true);
  });

  it('should have required database option', () => {
    const dOption = command.options.find(o => o.attributeName() === 'database');
    expect(dOption).toBeDefined();
    expect(dOption?.required).toBe(true);
  });

  it('should have order-by option with default headword', () => {
    const obOption = command.options.find(o => o.attributeName() === 'orderBy');
    expect(obOption).toBeDefined();
    expect(obOption?.defaultValue).toBe('headword');
  });

  it('should support headword sort order', () => {
    const obOption = command.options.find(o => o.attributeName() === 'orderBy');
    expect(obOption?.description).toContain('headword');
  });

  it('should support phonetic sort order', () => {
    const obOption = command.options.find(o => o.attributeName() === 'orderBy');
    expect(obOption?.description).toContain('phonetic');
  });

  it('should support change_type sort order', () => {
    const obOption = command.options.find(o => o.attributeName() === 'orderBy');
    expect(obOption?.description).toContain('change_type');
  });

  it('should have filter option with default all', () => {
    const fOption = command.options.find(o => o.attributeName() === 'filter');
    expect(fOption).toBeDefined();
    expect(fOption?.defaultValue).toBe('all');
  });

  it('should support all filter', () => {
    const fOption = command.options.find(o => o.attributeName() === 'filter');
    expect(fOption?.description).toContain('all');
  });

  it('should support added filter', () => {
    const fOption = command.options.find(o => o.attributeName() === 'filter');
    expect(fOption?.description).toContain('added');
  });

  it('should support deleted filter', () => {
    const fOption = command.options.find(o => o.attributeName() === 'filter');
    expect(fOption?.description).toContain('deleted');
  });

  it('should support modified filter', () => {
    const fOption = command.options.find(o => o.attributeName() === 'filter');
    expect(fOption?.description).toContain('modified');
  });
});
