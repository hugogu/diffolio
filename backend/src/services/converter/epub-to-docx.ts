import fs from 'node:fs'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { createLogger } from '../../lib/logger.js'
import { extractEpubSections } from './epub-extractor.js'
import { Converter, ConvertOptions } from './types.js'

const logger = createLogger({ name: 'epub-to-docx' })

export class EpubToDocxConverter implements Converter {
  readonly inputFormat = 'EPUB' as const
  readonly outputFormat = 'DOCX' as const

  async convert(options: ConvertOptions): Promise<void> {
    const { inputPath, outputPath, onProgress } = options

    logger.info({ inputPath, outputPath }, 'Starting EPUB to DOCX conversion')

    const sections = await extractEpubSections(inputPath, onProgress)
    const paragraphs: Paragraph[] = []

    for (const section of sections) {
      if (section.title) {
        paragraphs.push(new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }))
      }

      for (const line of section.lines) {
        paragraphs.push(new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 60 },
        }))
      }

      paragraphs.push(new Paragraph({ text: '' }))
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(outputPath, buffer)

    logger.info({ sectionCount: sections.length }, 'EPUB to DOCX conversion completed')
  }
}
