import fs from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'
import WordExtractor from 'word-extractor'
import pdfParse from 'pdf-parse'
import type { CompiledTaxonomyConfig } from './config.js'

const extractor = new WordExtractor()

export type FileType = 'TXT' | 'DOC' | 'DOCX' | 'PDF'

export function detectFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.doc') return 'DOC'
  if (ext === '.docx') return 'DOCX'
  if (ext === '.pdf') return 'PDF'
  return 'TXT'
}

export async function extractText(
  filePath: string,
  config?: CompiledTaxonomyConfig
): Promise<string> {
  const fileType = detectFileType(filePath)
  
  let text: string
  switch (fileType) {
    case 'DOCX':
      text = await extractDocx(filePath)
      break
    case 'DOC':
      text = await extractDoc(filePath)
      break
    case 'PDF':
      text = await extractPdf(filePath)
      break
    case 'TXT':
    default:
      text = await fs.promises.readFile(filePath, 'utf-8')
  }
  
  // Apply configurable text sanitization
  return sanitizeText(text, config?.textSanitization)
}

interface SanitizationConfig {
  enabled: boolean
  removeNullBytes: boolean
  removeControlChars: boolean
  customReplacements: Array<{ regex: RegExp; replacement: string }>
}

export function sanitizeText(
  text: string,
  config?: SanitizationConfig
): string {
  // Default: enabled with null bytes and control chars removal
  const sanitization = config ?? {
    enabled: true,
    removeNullBytes: true,
    removeControlChars: true,
    customReplacements: [],
  }

  if (!sanitization.enabled) {
    return text
  }

  let result = text

  // Remove null bytes (0x00) - always do this for PostgreSQL compatibility
  if (sanitization.removeNullBytes) {
    result = result.replace(/\x00/g, '')
  }

  // Remove control characters except \t, \n, \r
  if (sanitization.removeControlChars) {
    result = result.replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '')
  }

  // Apply custom replacements
  for (const { regex, replacement } of sanitization.customReplacements) {
    result = result.replace(regex, replacement)
  }

  return result
}

async function extractDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}

async function extractDoc(filePath: string): Promise<string> {
  const extracted = await extractor.extract(filePath)
  return extracted.getBody()
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const result = await pdfParse(buffer)
  return result.text
}
