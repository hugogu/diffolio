import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

// Import from backend using path alias
// Note: This assumes the backend exports these types/functions
// We'll need to verify this in T011

export interface FormatConfig {
  headwordPattern?: string;
  senseNumberPatterns?: string[];
  phoneticPattern?: string;
  posPattern?: string;
  registerPattern?: string;
  exampleSeparator?: string;
  headwordVariantSuffixPattern?: string;
  crossReferencePattern?: string;
  skipLinePatterns?: string[];
  substitutionRules?: Array<{ symbol: string; expandTo: string }>;
  glyphVariants?: Array<{ canonical: string; variants: string[] }>;
  tradSimpMap?: Record<string, string>;
  entrySequencePattern?: string;
  sensePhoneticPattern?: string;
}

export function loadConfig(configPath: string): FormatConfig {
  const fullPath = resolve(configPath);
  
  if (!existsSync(fullPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const config: FormatConfig = JSON.parse(content);
    
    console.log(chalk.green(`✓ Config loaded: ${configPath}`));
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file: ${error.message}`);
    }
    throw new Error(`Failed to load config: ${error}`);
  }
}

export function validateConfig(config: FormatConfig): void {
  // Basic validation - at minimum need headword pattern
  if (!config.headwordPattern) {
    throw new Error('Config must have headwordPattern');
  }

  // Additional validation can be added here
  // Ideally, we would import the backend's validateConfig function
}
