// Core exports for @diffolio/core

// Parser exports
export { parseTxt } from './parser/txt.parser.js';
export { parseDocx } from './parser/docx.parser.js';
export { parseDoc } from './parser/doc.parser.js';
export { parsePdf } from './parser/pdf.parser.js';
export type { ParseChunk, ParserOptions } from './parser/types.js';

// Service exports
export { alignEntries, ChangeType, type AlignmentResult } from './services/aligner.js';
export { diffSenses, type SenseDiffResult, type SenseChangeType } from './services/differ.js';
export { 
  validateConfig, 
  compileConfig, 
  type FormatConfigJson, 
  type ConfigValidationResult,
  type CompiledConfig 
} from './services/config-engine.js';
export { 
  stripForComparison, 
  normalizePhonetic, 
  normalizeHeadword 
} from './services/normalizer.js';
