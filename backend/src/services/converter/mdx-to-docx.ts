// services/converter/mdx-to-docx.ts

import fs from 'node:fs'
import { Document, Paragraph, TextRun, HeadingLevel } from 'docx'
import { createLogger } from '../../lib/logger.js'
import { Converter, ConvertOptions } from './types.js'

const logger = createLogger({ name: 'mdx-to-docx' })

// Dynamic import for mdict-js (CommonJS module)
async function loadMdict(): Promise<any> {
  const mdictModule = await import('mdict-js')
  // Handle the nested default export structure: { default: { default: MdictClass } }
  const MdictClass = mdictModule.default?.default || mdictModule.default || mdictModule
  return MdictClass
}

// Convert HTML definition to plain text lines
// Adapted from mdict.parser.ts
function convertHtmlToLines(html: string): string[] {
  const { htmlToText } = require('html-to-text')

  const text = htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'link', format: 'skip' },
      { selector: 'a', format: 'skip' },
      { selector: 'div', format: 'block' },
      { selector: 'p', format: 'block' },
      { selector: 'entry', format: 'block' },
      { selector: 'hwg', format: 'block' },
      { selector: 'def', format: 'block' },
      { selector: 'column', format: 'block' },
      { selector: 'span', format: 'inline' },
      { selector: 'sup', format: 'inline' },
      { selector: 'small', format: 'inline' },
      { selector: 'ex', format: 'inline' },
      { selector: 'note', format: 'inline' },
      { selector: 'num', format: 'inline' },
      { selector: 'ps', format: 'inline' },
      { selector: 'pinyin', format: 'inline' },
      {
        selector: 'hw',
        format: 'inline',
        options: {
          trailingLineBreaks: 0,
        },
      },
      {
        selector: 'pinyin',
        format: 'inline',
        options: {
          leadingLineBreaks: 0,
        },
      },
      { selector: 'ci', format: 'skip' },
      { selector: 'cont', format: 'skip' },
      { selector: 'br', format: 'inline' },
    ],
    preserveNewlines: true,
  })

  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/\x00/g, ''))
}

export class MdxToDocxConverter implements Converter {
  readonly inputFormat = 'MDX' as const
  readonly outputFormat = 'DOCX' as const

  async convert(options: ConvertOptions): Promise<void> {
    const { inputPath, outputPath, onProgress } = options

    logger.info({ inputPath, outputPath }, 'Starting MDX to DOCX conversion')

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

    const paragraphs: Paragraph[] = []
    let processed = 0
    const total = keys.length

    for (const key of keys) {
      processed++

      try {
        const result = dict.lookup(key)
        if (result?.definition) {
          const lines = convertHtmlToLines(result.definition)

          // Add headword as heading
          paragraphs.push(
            new Paragraph({
              text: key,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            })
          )

          // Add content lines
          for (const line of lines) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun(line)],
                spacing: { after: 60 },
              })
            )
          }

          // Entry separator
          paragraphs.push(new Paragraph({ text: '' }))
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

    // Create document and save
    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    })

    const buffer = await doc.save()
    fs.writeFileSync(outputPath, buffer)

    logger.info({ processed, total }, 'MDX to DOCX conversion completed')
  }
}
