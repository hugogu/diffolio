import { FastifyPluginAsync } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'

const SAMPLES_DIR = path.join(process.cwd(), 'samples')

const formatConfigRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/format-configs/samples
  // @deprecated — use GET /api/v1/system-configs instead; will be removed in next breaking version
  fastify.get('/format-configs/samples', async () => {
    let files: string[]
    try {
      files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }

    return files.flatMap((filename) => {
      try {
        const raw = fs.readFileSync(path.join(SAMPLES_DIR, filename), 'utf-8')
        const config = JSON.parse(raw) as Record<string, unknown>
        return [{ filename, name: String(config['name'] ?? filename), config }]
      } catch {
        return []
      }
    })
  })
}

export default formatConfigRoutes
