// services/converter/mdx-to-txt.ts

import fs from 'node:fs'
import { createLogger } from '../../lib/logger.js'
import { convertHtmlToLines } from './text-utils.js'
import { Converter, ConvertOptions } from './types.js'

const logger = createLogger({ name: 'mdx-to-txt' })

// Dynamic import for mdict-js (CommonJS module)
async function loadMdict(): Promise<any> {
  const mdictModule = await import('mdict-js')
  // Handle the nested default export structure: { default: { default: MdictClass } }
  const MdictClass = mdictModule.default?.default || mdictModule.default || mdictModule
  return MdictClass
}

export class MdxToTxtConverter implements Converter {
  readonly inputFormat = 'MDX' as const
  readonly outputFormat = 'TXT' as const

  async convert(options: ConvertOptions): Promise<void> {
    const { inputPath, outputPath, onProgress } = options

    logger.info({ inputPath, outputPath }, 'Starting MDX to TXT conversion')

    const Mdict = await loadMdict()
    const dict = new Mdict(inputPath)

    let keys: string[] = []
    try {
      keys = dict.keys()
    } catch (e) {
      try {
        const keyList = dict.rangeKeyWords()
        keys = keyList.map((item: { keyText: string }) => item.keyText)
      } catch (e2) {
        throw new Error('Failed to read MDX file: unable to extract keys')
      }
    }

    const outputStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' })
    let processed = 0
    const total = keys.length

    try {
      for (const key of keys) {
        processed++

        try {
          const result = dict.lookup(key)
          if (result?.definition) {
            const lines = convertHtmlToLines(result.definition)

            outputStream.write(`【${key}】\n`)
            for (const line of lines) {
              outputStream.write(`${line}\n`)
            }
            outputStream.write('\n')
          }
        } catch (error) {
          logger.warn({ key, error }, 'Failed to convert entry')
        }

        if (onProgress && processed % 100 === 0) {
          const progress = Math.round((processed / total) * 100)
          await onProgress(progress)
        }
      }

      if (onProgress) {
        await onProgress(100)
      }

      logger.info({ processed, total }, 'MDX to TXT conversion completed')
    } finally {
      outputStream.end()
    }
  }
}
