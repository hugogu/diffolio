import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { connectDatabase, disconnectDatabase } from '../lib/database.js';
import { loadConfig } from '../lib/config.js';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

describe('Database Integration', () => {
  const testDbPath = resolve(__dirname, '../../test-integration.db');
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await disconnectDatabase(prisma);
    }
    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('should connect to SQLite database', async () => {
    const dbUrl = `file:${testDbPath}`;
    prisma = await connectDatabase(dbUrl);
    expect(prisma).toBeDefined();
  });

  it('should be able to query database', async () => {
    const count = await prisma.dictionary.count();
    expect(typeof count).toBe('number');
  });
});

describe('Config Loading', () => {
  const testConfigPath = resolve(__dirname, '../../test-config.json');

  it('should load valid config file', () => {
    const config = loadConfig(testConfigPath);
    expect(config).toBeDefined();
    expect(config.name).toBe('test-dict');
    expect(config.headwordPattern).toBeDefined();
  });

  it('should throw error for non-existent config', () => {
    expect(() => loadConfig('non-existent.json')).toThrow('Config file not found');
  });
});

describe('CLI Entry Point', () => {
  it('should import index without errors', async () => {
    // This will fail if there are import errors
    const { program } = await import('../index.js');
    expect(program).toBeDefined();
    expect(program.name).toBeDefined();
  });
});
