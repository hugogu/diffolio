import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import IORedis from 'ioredis'

declare module 'fastify' {
  interface FastifyInstance {
    emitToUser: (userId: string, event: string, data: unknown) => void
    emitToAll: (event: string, data: unknown) => void
  }
}

const socketioPlugin: FastifyPluginAsync = fp(async (fastify) => {
  // Socket.io is registered in app.ts via @fastify/socket.io
  // This plugin sets up the user→socket mapping and Redis pub/sub bridge

  const userSockets = new Map<string, Set<string>>() // userId → Set<socketId>

  const redisSub = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })

  // Subscribe to worker progress events
  await redisSub.subscribe('parse:progress', 'parse:completed', 'parse:failed', 'export:ready', 'comparison:progress')

  redisSub.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message) as Record<string, unknown>
      const io = fastify.io

      // Map Redis channel → Socket.io event name
      const eventMap: Record<string, string> = {
        'parse:progress': 'parseProgress',
        'parse:completed': 'parseCompleted',
        'parse:failed': 'parseFailed',
        'export:ready': 'exportReady',
        'comparison:progress': 'comparisonProgress',
      }

      const event = eventMap[channel]
      if (event && io) {
        io.of('/parse').emit(event, data)
      }
    } catch {
      // ignore malformed messages
    }
  })

  fastify.decorate('emitToUser', (userId: string, event: string, data: unknown) => {
    const socketIds = userSockets.get(userId)
    if (!socketIds) return
    const io = fastify.io
    if (!io) return
    for (const socketId of socketIds) {
      io.of('/parse').to(socketId).emit(event, data)
    }
  })

  fastify.decorate('emitToAll', (event: string, data: unknown) => {
    const io = fastify.io
    if (!io) return
    io.of('/parse').emit(event, data)
  })

  // Setup socket connection handlers after server is ready
  fastify.addHook('onReady', () => {
    const io = fastify.io
    if (!io) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    io.of('/parse').on('connection', (socket: any) => {
      // Extract user from session (simplified - in production check auth)
      const userId = (socket.handshake.auth as Record<string, unknown>)?.userId as string | undefined

      if (userId) {
        if (!userSockets.has(userId)) {
          userSockets.set(userId, new Set())
        }
        userSockets.get(userId)!.add(socket.id)
      }

      socket.emit('connected', { socketId: socket.id })

      socket.on('subscribe:task', ({ taskId }: { taskId: string }, callback: (res: { ok: boolean; error?: string }) => void) => {
        socket.join(`task:${taskId}`)
        if (typeof callback === 'function') callback({ ok: true })
      })

      socket.on('unsubscribe:task', ({ taskId }: { taskId: string }) => {
        socket.leave(`task:${taskId}`)
      })

      socket.on('disconnect', () => {
        if (userId) {
          userSockets.get(userId)?.delete(socket.id)
          if (userSockets.get(userId)?.size === 0) {
            userSockets.delete(userId)
          }
        }
      })
    })
  })

  fastify.addHook('onClose', async () => {
    redisSub.disconnect()
  })
})

export default socketioPlugin
