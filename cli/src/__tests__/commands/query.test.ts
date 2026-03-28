import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createQueryCommand } from '../../commands/query.js';

describe('Query Command', () => {
  let command: Command;

  beforeEach(() => {
    command = createQueryCommand();
  });

  it('should create command with correct name', () => {
    expect(command.name()).toBe('query');
  });

  it('should have required database option', () => {
    const dbOption = command.options.find(o => o.attributeName() === 'database');
    expect(dbOption).toBeDefined();
    expect(dbOption?.required).toBe(true);
  });

  it('should have headword filter', () => {
    const hwOption = command.options.find(o => o.attributeName() === 'headword');
    expect(hwOption).toBeDefined();
  });

  it('should have phonetic filter', () => {
    const phOption = command.options.find(o => o.attributeName() === 'phonetic');
    expect(phOption).toBeDefined();
  });

  it('should have pos filter', () => {
    const posOption = command.options.find(o => o.attributeName() === 'pos');
    expect(posOption).toBeDefined();
  });

  it('should have version-id filter', () => {
    const vOption = command.options.find(o => o.attributeName() === 'versionId');
    expect(vOption).toBeDefined();
  });

  it('should have comparison-id filter', () => {
    const cOption = command.options.find(o => o.attributeName() === 'comparisonId');
    expect(cOption).toBeDefined();
  });

  it('should have change-type filter', () => {
    const ctOption = command.options.find(o => o.attributeName() === 'changeType');
    expect(ctOption).toBeDefined();
  });

  it('should have detail flag', () => {
    const dOption = command.options.find(o => o.attributeName() === 'detail');
    expect(dOption).toBeDefined();
  });

  it('should have limit option with default 50', () => {
    const lOption = command.options.find(o => o.attributeName() === 'limit');
    expect(lOption).toBeDefined();
    expect(lOption?.defaultValue).toBe('50');
  });

  it('should have offset option with default 0', () => {
    const oOption = command.options.find(o => o.attributeName() === 'offset');
    expect(oOption).toBeDefined();
    expect(oOption?.defaultValue).toBe('0');
  });

  it('should have format option with default table', () => {
    const fOption = command.options.find(o => o.attributeName() === 'format');
    expect(fOption).toBeDefined();
    expect(fOption?.defaultValue).toBe('table');
  });

  it('should accept table format', () => {
    const fOption = command.options.find(o => o.attributeName() === 'format');
    expect(fOption?.description).toContain('table');
  });

  it('should accept json format', () => {
    const fOption = command.options.find(o => o.attributeName() === 'format');
    expect(fOption?.description).toContain('json');
  });
});
