declare module 'word-extractor' {
  interface WordExtractorDocument {
    getBody(): string
    getFootnotes(): string
    getHeaders(): Record<string, string>
    getFooters(): Record<string, string>
    getAnnotations(): string
  }

  class WordExtractor {
    extract(filePath: string): Promise<WordExtractorDocument>
  }

  export = WordExtractor
}
