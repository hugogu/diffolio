import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('CLI Setup Verification', () => {
  const cliDir = resolve(__dirname, '..');

  describe('Package Structure', () => {
    it('should have package.json with required dependencies', () => {
      const packagePath = resolve(cliDir, 'package.json');
      expect(existsSync(packagePath)).toBe(true);
      
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies.commander).toBeDefined();
      expect(pkg.dependencies['@prisma/client']).toBeDefined();
      expect(pkg.dependencies.zod).toBeDefined();
    });

    it('should have TypeScript configuration', () => {
      expect(existsSync(resolve(cliDir, 'tsconfig.json'))).toBe(true);
    });

    it('should have source directory structure', () => {
      expect(existsSync(resolve(cliDir, 'src'))).toBe(true);
      expect(existsSync(resolve(cliDir, 'src/index.ts'))).toBe(true);
      expect(existsSync(resolve(cliDir, 'src/commands'))).toBe(true);
      expect(existsSync(resolve(cliDir, 'src/lib'))).toBe(true);
    });
  });

  describe('Core Library Files', () => {
    it('should have database module', () => {
      expect(existsSync(resolve(cliDir, 'src/lib/database.ts'))).toBe(true);
    });

    it('should have progress reporting module', () => {
      expect(existsSync(resolve(cliDir, 'src/lib/progress.ts'))).toBe(true);
    });

    it('should have error handling module', () => {
      expect(existsSync(resolve(cliDir, 'src/lib/errors.ts'))).toBe(true);
    });

    it('should have config loading module', () => {
      expect(existsSync(resolve(cliDir, 'src/lib/config.ts'))).toBe(true);
    });
  });

  describe('CLI Commands', () => {
    it('should have parse command', () => {
      expect(existsSync(resolve(cliDir, 'src/commands/parse.ts'))).toBe(true);
    });
  });
});

describe('Backend Integration', () => {
  const backendDir = resolve(__dirname, '../../backend');

  it('should have access to backend services', () => {
    expect(existsSync(resolve(backendDir, 'src/services/config-engine.ts'))).toBe(true);
    expect(existsSync(resolve(backendDir, 'src/services/parser'))).toBe(true);
    expect(existsSync(resolve(backendDir, 'src/services/aligner.ts'))).toBe(true);
    expect(existsSync(resolve(backendDir, 'src/services/differ.ts'))).toBe(true);
  });

  it('should have Prisma schema', () => {
    expect(existsSync(resolve(backendDir, 'prisma/schema.prisma'))).toBe(true);
  });
});

describe('Documentation', () => {
  const cliDir = resolve(__dirname, '..');

  it('should have CLI README', () => {
    expect(existsSync(resolve(cliDir, 'README.md'))).toBe(true);
  });
});
