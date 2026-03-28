import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const storageType = process.env.FILE_STORAGE_TYPE ?? 'local'
const localPath = process.env.FILE_STORAGE_LOCAL_PATH ?? '/data/uploads'

export async function saveFile(
  stream: Readable,
  filename: string
): Promise<string> {
  if (storageType === 'local') {
    fs.mkdirSync(localPath, { recursive: true })
    const dest = path.join(localPath, filename)
    const out = fs.createWriteStream(dest)
    await pipeline(stream, out)
    return dest
  }
  throw new Error(`Storage type '${storageType}' not implemented`)
}

export function getFileStream(filePath: string): fs.ReadStream {
  if (storageType === 'local') {
    return fs.createReadStream(filePath)
  }
  throw new Error(`Storage type '${storageType}' not implemented`)
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath)
    return true
  } catch {
    return false
  }
}

export function deleteFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}
