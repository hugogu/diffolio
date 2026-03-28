import yauzl from 'yauzl'
import sax from 'sax'

/**
 * Streams paragraphs from a DOCX file as text lines.
 * Each <w:p> paragraph is yielded as a trimmed string.
 * Soft line-breaks (<w:br/>) within a paragraph are treated as line separators,
 * matching the behaviour of mammoth.extractRawText().
 *
 * Memory usage stays constant regardless of file size (~paragraph buffer only).
 */
export async function* streamDocxLines(filePath: string): AsyncGenerator<string> {
  const queue: string[] = []
  let waitResolve: (() => void) | null = null
  let finished = false
  let streamError: Error | null = null

  function enqueue(line: string) {
    const trimmed = line.trim()
    if (!trimmed) return
    queue.push(trimmed)
    if (waitResolve) {
      const r = waitResolve
      waitResolve = null
      r()
    }
  }

  function finish(err?: Error | null) {
    if (finished) return
    streamError = err ?? null
    finished = true
    if (waitResolve) {
      const r = waitResolve
      waitResolve = null
      r()
    }
  }

  // Launch streaming in the background (fire-and-forget; errors surface via streamError)
  new Promise<void>(() => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { finish(err); return }

      let xmlProcessed = false

      zipfile.readEntry()

      zipfile.on('entry', (entry) => {
        if (entry.fileName !== 'word/document.xml') {
          zipfile.readEntry()
          return
        }

        xmlProcessed = true
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) { finish(err); return }

          const parser = sax.createStream(true, {})
          let paragraphText = ''
          let inText = false

          parser.on('opentag', (tag) => {
            if (tag.name === 'w:t') {
              inText = true
            } else if (tag.name === 'w:br') {
              // Soft return within paragraph — split into separate lines (matches mammoth behaviour)
              paragraphText += '\n'
              inText = false
            }
          })

          parser.on('closetag', (tagName) => {
            if (tagName === 'w:t') {
              inText = false
            } else if (tagName === 'w:p') {
              // Emit each sub-line produced by soft returns
              for (const subLine of paragraphText.split('\n')) {
                enqueue(subLine)
              }
              paragraphText = ''
              inText = false
            }
          })

          parser.on('text', (text) => {
            if (inText) paragraphText += text
          })

          parser.on('end', () => finish())
          parser.on('error', (e: Error) => finish(e))

          readStream.pipe(parser)
        })
      })

      zipfile.on('end', () => {
        if (!xmlProcessed) finish(new Error('word/document.xml not found in DOCX'))
      })

      zipfile.on('error', (e: Error) => finish(e))
    })
  }).catch(() => {}) // errors communicated via streamError / finish()

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()!
    } else if (finished) {
      break
    } else {
      await new Promise<void>((r) => { waitResolve = r })
    }
  }

  if (streamError) throw streamError
}
