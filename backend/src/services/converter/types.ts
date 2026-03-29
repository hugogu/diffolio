// services/converter/types.ts

export interface ConvertOptions {
  inputPath: string
  outputPath: string
  inputFormat: 'MDX' | 'EPUB'
  outputFormat: 'TXT' | 'DOCX'
  onProgress?: (progress: number) => void | Promise<void>
}

export interface Converter {
  readonly inputFormat: 'MDX' | 'EPUB'
  readonly outputFormat: 'TXT' | 'DOCX'
  convert(options: ConvertOptions): Promise<void>
}

export interface ConversionResult {
  success: boolean
  outputPath?: string
  error?: string
  entriesProcessed?: number
}
