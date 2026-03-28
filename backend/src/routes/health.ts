import { FastifyPluginAsync } from 'fastify'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })
}

export default healthRoutes
