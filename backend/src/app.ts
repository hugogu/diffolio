import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import socketio from 'fastify-socket.io'
import { ApiError, extractRootCause, ErrorResponse } from './lib/errors.js'
import { Prisma } from '@prisma/client'

// Plugins
import prismaPlugin from './plugins/prisma.js'
import bullmqPlugin from './plugins/bullmq.js'
import socketioPlugin from './plugins/socketio.js'

// Routes
import authRoutes from './routes/auth.js'
import healthRoutes from './routes/health.js'
import dictionaryRoutes from './routes/dictionaries.js'
import versionRoutes from './routes/versions.js'
import fileRoutes from './routes/files.js'
import parseTaskRoutes from './routes/parse-tasks.js'
import comparisonRoutes from './routes/comparisons.js'
import searchRoutes from './routes/search.js'
import exportRoutes from './routes/exports.js'
import diffRoutes from './routes/diff.js'
import formatConfigRoutes from './routes/format-configs.js'
import taxonomyRoutes from './routes/taxonomy.js'
import adminUserRoutes from './routes/admin/users.js'
import adminFileRoutes from './routes/admin/files.js'
import adminSubscriptionManageRoutes from './routes/admin/subscription-manage.js'
import adminSubscriptionPlansRoutes from './routes/admin/subscription-plans.js'
import adminParseErrorRoutes from './routes/admin/parse-errors.js'
import adminParseArtifactRoutes from './routes/admin/parse-artifacts.js'
import subscriptionRoutes from './routes/subscription.js'
import energyRoutes from './routes/energy.js'
import systemConfigRoutes from './routes/system-configs.js'
import userConfigRoutes from './routes/user-configs.js'
import adminSystemConfigRoutes from './routes/admin/system-configs.js'
import conversionRoutes from './routes/conversions.js'
import tagRoutes from './routes/tags.js'

// Environment check
const isDev = process.env.NODE_ENV !== 'production'

export async function buildApp(jwtSecret?: string): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  // CORS
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  // Cookie (required by @fastify/jwt cookie integration)
  await fastify.register(cookie)

  // JWT — supports both Authorization: Bearer header and auth_token cookie
  await fastify.register(jwt, {
    secret: jwtSecret ?? process.env.SESSION_SECRET ?? 'change-me-in-production-must-be-32-chars-min',
    sign: { expiresIn: '7d' },
    cookie: { cookieName: 'auth_token', signed: false },
  })

  // File upload
  const maxSizeMb = parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? '500', 10)
  await fastify.register(multipart, {
    limits: {
      fileSize: maxSizeMb * 1024 * 1024,
    },
  })

  // Rate limiting
  await fastify.register(rateLimit, {
    global: false,  // Only apply to routes that opt-in
  })

  // Socket.io
  await fastify.register(socketio, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  })

  // Business plugins
  await fastify.register(prismaPlugin)
  await fastify.register(bullmqPlugin)
  await fastify.register(socketioPlugin)

  // Global Error Handler
  fastify.setErrorHandler((error, request, reply) => {
    const errorResponse: ErrorResponse = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    }

    // Handle ApiError - our custom application errors
    if (error instanceof ApiError) {
      errorResponse.code = error.code
      errorResponse.message = error.message
      if (error.details !== undefined) {
        errorResponse.details = error.details
      }
      if (error.rootCause) {
        errorResponse.rootCause = error.rootCause
      }
      
      reply.status(error.statusCode).send(errorResponse)
      return
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2025': // Record not found
          errorResponse.code = 'NOT_FOUND'
          errorResponse.message = 'Record not found'
          errorResponse.rootCause = `Prisma error ${error.code}: ${error.message}`
          reply.status(404).send(errorResponse)
          return
        
        case 'P2002': // Unique constraint violation
          errorResponse.code = 'CONFLICT'
          errorResponse.message = 'Record already exists'
          errorResponse.rootCause = `Prisma error ${error.code}: ${error.message}`
          reply.status(409).send(errorResponse)
          return
        
        case 'P2003': // Foreign key constraint failed
          errorResponse.code = 'CONFLICT'
          errorResponse.message = 'Referenced record does not exist'
          errorResponse.rootCause = `Prisma error ${error.code}: ${error.message}`
          reply.status(409).send(errorResponse)
          return
        
        case 'P2020': // Value out of range
          errorResponse.code = 'BAD_REQUEST'
          errorResponse.message = 'Value out of range'
          errorResponse.rootCause = `Prisma error ${error.code}: ${error.message}`
          reply.status(400).send(errorResponse)
          return
        
        default:
          errorResponse.code = 'DATABASE_ERROR'
          errorResponse.message = 'Database operation failed'
          errorResponse.rootCause = `Prisma error ${error.code}: ${error.message}`
          reply.status(500).send(errorResponse)
          return
      }
    }

    // Handle Prisma validation errors
    if (error instanceof Prisma.PrismaClientValidationError) {
      errorResponse.code = 'VALIDATION_ERROR'
      errorResponse.message = 'Invalid data provided'
      errorResponse.rootCause = extractRootCause(error)
      if (isDev) {
        errorResponse.details = error.message
      }
      reply.status(400).send(errorResponse)
      return
    }

    // Handle Prisma connection errors
    if (error instanceof Prisma.PrismaClientInitializationError) {
      errorResponse.code = 'DATABASE_ERROR'
      errorResponse.message = 'Database connection failed'
      errorResponse.rootCause = extractRootCause(error)
      reply.status(503).send(errorResponse)
      return
    }

    if (error instanceof Prisma.PrismaClientRustPanicError) {
      errorResponse.code = 'DATABASE_ERROR'
      errorResponse.message = 'Database engine error'
      errorResponse.rootCause = extractRootCause(error)
      reply.status(503).send(errorResponse)
      return
    }

    // Fastify validation errors
    if (error.validation) {
      errorResponse.code = 'VALIDATION_ERROR'
      errorResponse.message = 'Request validation failed'
      errorResponse.details = error.validation
      errorResponse.rootCause = error.message
      reply.status(400).send(errorResponse)
      return
    }

    // HTTP errors from plugins (like rate limit)
    if (error.statusCode === 429) {
      errorResponse.code = 'RATE_LIMITED'
      errorResponse.message = 'Rate limit exceeded'
      errorResponse.rootCause = error.message
      reply.status(429).send(errorResponse)
      return
    }

    if (error.statusCode === 413) {
      errorResponse.code = 'PAYLOAD_TOO_LARGE'
      errorResponse.message = 'Request payload too large'
      errorResponse.rootCause = error.message
      reply.status(413).send(errorResponse)
      return
    }

    // Log unexpected errors
    fastify.log.error({
      err: error,
      requestId: request.id,
      path: request.routeOptions?.url ?? request.url,
      method: request.method,
    }, 'Unexpected error occurred')

    // Generic internal error
    errorResponse.rootCause = isDev ? extractRootCause(error) : 'An unexpected error occurred'
    if (isDev && error.stack) {
      errorResponse.stack = error.stack
    }

    reply.status(500).send(errorResponse)
  })

  // Routes
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes, { prefix: '/api/v1' })
  await fastify.register(dictionaryRoutes, { prefix: '/api/v1' })
  await fastify.register(versionRoutes, { prefix: '/api/v1' })
  await fastify.register(fileRoutes, { prefix: '/api/v1' })
  await fastify.register(parseTaskRoutes, { prefix: '/api/v1' })
  await fastify.register(comparisonRoutes, { prefix: '/api/v1' })
  await fastify.register(searchRoutes, { prefix: '/api/v1' })
  await fastify.register(exportRoutes, { prefix: '/api/v1' })
  await fastify.register(diffRoutes, { prefix: '/api/v1' })
  await fastify.register(formatConfigRoutes, { prefix: '/api/v1' })
  await fastify.register(taxonomyRoutes, { prefix: '/api/v1' })
  await fastify.register(adminUserRoutes, { prefix: '/api/v1' })
  await fastify.register(adminFileRoutes, { prefix: '/api/v1' })
  await fastify.register(adminSubscriptionManageRoutes, { prefix: '/api/v1' })
  await fastify.register(adminSubscriptionPlansRoutes, { prefix: '/api/v1' })
  await fastify.register(adminParseErrorRoutes, { prefix: '/api/v1' })
  await fastify.register(adminParseArtifactRoutes, { prefix: '/api/v1' })
  await fastify.register(subscriptionRoutes, { prefix: '/api/v1' })
  await fastify.register(energyRoutes, { prefix: '/api/v1' })
  await fastify.register(systemConfigRoutes, { prefix: '/api/v1' })
  await fastify.register(userConfigRoutes, { prefix: '/api/v1' })
  await fastify.register(adminSystemConfigRoutes, { prefix: '/api/v1' })
  await fastify.register(tagRoutes, { prefix: '/api/v1' })
  await fastify.register(conversionRoutes, { prefix: '/api/v1/conversions' })

  return fastify
}
