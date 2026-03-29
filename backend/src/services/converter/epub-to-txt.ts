import fs from 'node:fs'
import { createLogger } from '../../lib/logger.js'
import { extractEpubSections } from './epub-extractor.js'
import { Converter, ConvertOptions } from './types.js'

const logger = createLogger({ name: 'epub-to-txt' })

export class EpubToTxtConverter implements Converter {
  readonly inputFormat = 'EPUB' as const
  readonly outputFormat = 'TXT' as const

  async convert(options: ConvertOptions): Promise<void> {
    const { inputPath, outputPath, onProgress } = options

    logger.info({ inputPath, outputPath }, 'Starting EPUB to TXT conversion')

    const sections = await extractEpubSections(inputPath, onProgress)
    const outputStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' })

    try {
      for (const section of sections) {
        if (section.title) {
          outputStream.write(`【${section.title}】\n`)
        }

        for (const line of section.lines) {
          outputStream.write(`${line}\n`)
        }

        outputStream.write('\n')
      }

      logger.info({ sectionCount: sections.length }, 'EPUB to TXT conversion completed')
    } finally {
      outputStream.end()
    }
  }
}
