import path from 'node:path'
import yauzl from 'yauzl'
import sax from 'sax'
import { convertHtmlToLines } from './text-utils.js'

export interface EpubSection {
  title?: string
  lines: string[]
}

interface ManifestItem {
  href: string
  mediaType?: string
}

interface EpubPackage {
  rootDir: string
  manifest: Map<string, ManifestItem>
  spine: string[]
}

interface ZipBundle {
  zipfile: yauzl.ZipFile
  entries: Map<string, yauzl.Entry>
}

function normalizeZipPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function resolveZipPath(baseDir: string, relativePath: string): string {
  return normalizeZipPath(path.posix.normalize(path.posix.join(baseDir, relativePath)))
}

function openZip(filePath: string): Promise<ZipBundle> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Failed to open EPUB archive'))
        return
      }

      const entries = new Map<string, yauzl.Entry>()
      zipfile.readEntry()

      zipfile.on('entry', (entry) => {
        entries.set(normalizeZipPath(entry.fileName), entry)
        zipfile.readEntry()
      })

      zipfile.on('end', () => resolve({ zipfile, entries }))
      zipfile.on('error', reject)
    })
  })
}

function readZipEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error(`Failed to read ZIP entry: ${entry.fileName}`))
        return
      }

      const chunks: Buffer[] = []
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stream.on('error', reject)
    })
  })
}

async function parseContainerXml(xml: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = sax.parser(true, { lowercase: true })
    let rootFilePath: string | undefined

    parser.onopentag = (node) => {
      if (node.name === 'rootfile') {
        const fullPath = node.attributes['full-path']
        if (typeof fullPath === 'string' && fullPath.trim()) {
          rootFilePath = normalizeZipPath(fullPath)
        }
      }
    }

    parser.onerror = reject
    parser.onend = () => {
      if (!rootFilePath) {
        reject(new Error('META-INF/container.xml does not define a package document'))
        return
      }
      resolve(rootFilePath)
    }

    parser.write(xml).close()
  })
}

async function parsePackageDocument(xml: string, packagePath: string): Promise<EpubPackage> {
  return new Promise((resolve, reject) => {
    const parser = sax.parser(true, { lowercase: true })
    const manifest = new Map<string, ManifestItem>()
    const spine: string[] = []

    parser.onopentag = (node) => {
      if (node.name === 'item') {
        const id = node.attributes['id']
        const href = node.attributes['href']
        if (typeof id === 'string' && typeof href === 'string') {
          manifest.set(id, {
            href,
            mediaType: typeof node.attributes['media-type'] === 'string'
              ? node.attributes['media-type']
              : undefined,
          })
        }
      }

      if (node.name === 'itemref') {
        const idref = node.attributes['idref']
        if (typeof idref === 'string' && idref.trim()) {
          spine.push(idref)
        }
      }
    }

    parser.onerror = reject
    parser.onend = () => {
      resolve({
        rootDir: path.posix.dirname(normalizeZipPath(packagePath)),
        manifest,
        spine,
      })
    }

    parser.write(xml).close()
  })
}

function extractSectionTitle(html: string, lines: string[]): string | undefined {
  const headingMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const candidate = headingMatch?.[1] ?? titleMatch?.[1]

  if (candidate) {
    const [title] = convertHtmlToLines(candidate)
    if (title) {
      return title
    }
  }

  const [firstLine] = lines
  if (firstLine && firstLine.length <= 80) {
    return firstLine
  }

  return undefined
}

export async function extractEpubSections(
  filePath: string,
  onProgress?: (progress: number) => void | Promise<void>,
): Promise<EpubSection[]> {
  const { zipfile, entries } = await openZip(filePath)

  try {
    const containerEntry = entries.get('META-INF/container.xml')
    if (!containerEntry) {
      throw new Error('Invalid EPUB: META-INF/container.xml not found')
    }

    const containerXml = await readZipEntry(zipfile, containerEntry)
    const packagePath = await parseContainerXml(containerXml)
    const packageEntry = entries.get(packagePath)
    if (!packageEntry) {
      throw new Error(`Invalid EPUB: package document not found at ${packagePath}`)
    }

    const packageXml = await readZipEntry(zipfile, packageEntry)
    const pkg = await parsePackageDocument(packageXml, packagePath)
    const contentItemRefs = pkg.spine
      .map((idref) => {
        const item = pkg.manifest.get(idref)
        if (!item) return undefined
        if (item.mediaType && !['application/xhtml+xml', 'text/html'].includes(item.mediaType)) {
          return undefined
        }
        return resolveZipPath(pkg.rootDir, item.href)
      })
      .filter((itemPath): itemPath is string => Boolean(itemPath))

    if (contentItemRefs.length === 0) {
      throw new Error('Invalid EPUB: no readable content documents found in spine')
    }

    const sections: EpubSection[] = []

    for (let index = 0; index < contentItemRefs.length; index++) {
      const itemPath = contentItemRefs[index]
      const entry = entries.get(itemPath)
      if (!entry) {
        continue
      }

      const html = await readZipEntry(zipfile, entry)
      const lines = convertHtmlToLines(html)
      if (lines.length === 0) {
        if (onProgress) {
          await onProgress(Math.round(((index + 1) / contentItemRefs.length) * 100))
        }
        continue
      }

      const title = extractSectionTitle(html, lines)
      const contentLines = title && lines[0] === title ? lines.slice(1) : lines
      if (contentLines.length > 0) {
        sections.push({ title, lines: contentLines })
      }

      if (onProgress) {
        await onProgress(Math.round(((index + 1) / contentItemRefs.length) * 100))
      }
    }

    if (sections.length === 0) {
      throw new Error('Failed to extract readable text from EPUB')
    }

    return sections
  } finally {
    zipfile.close()
  }
}
