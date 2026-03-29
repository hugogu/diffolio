import type { MultipartFields } from '@fastify/multipart'
import type { ConversionInputFormat, ConversionOutputFormat } from '@prisma/client'
import { FastifyPluginAsync } from 'fastify'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { authGuard, requireSessionUser } from '../lib/auth-guard.js'
import { badRequest, notFound } from '../lib/errors.js'
import { fileExists, deleteFile } from '../lib/storage.js'
import { ensureDefaultConvertersRegistered, registry } from '../services/converter/index.js'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

function getMultipartFieldValue(fields: MultipartFields, fieldName: string): string | undefined {
  const field = fields[fieldName]
  if (!field) {
    return undefined
  }

  if (Array.isArray(field)) {
    const firstField = field.find((part) => part.type === 'field')
    return firstField?.type === 'field' ? String(firstField.value) : undefined
  }

  return field.type === 'field' ? String(field.value) : undefined
}

// Ensure conversion directory exists
const CONVERSION_DIR = path.join(process.env.FILE_STORAGE_LOCAL_PATH || '/data/uploads', 'conversions')
if (!fs.existsSync(CONVERSION_DIR)) {
  fs.mkdirSync(CONVERSION_DIR, { recursive: true })
}

const conversionRoutes: FastifyPluginAsync = async (fastify) => {
  ensureDefaultConvertersRegistered()

  // List tasks - must be before /:id routes
  fastify.get('/', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const db = fastify.db

    const { page = '1', pageSize = '20' } = request.query as { page?: string; pageSize?: string }
    const pageNum = parseInt(page, 10)
    const pageSizeNum = parseInt(pageSize, 10)
    const skip = (pageNum - 1) * pageSizeNum

    const [tasks, total] = await Promise.all([
      db.conversionTask.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      db.conversionTask.count({
        where: { userId: user.id }
      })
    ])

    return {
      data: tasks.map((task) => ({
        id: task.id,
        inputFormat: task.inputFormat,
        outputFormat: task.outputFormat,
        status: task.status,
        progress: task.progress,
        fileSize: Number(task.fileSize),
        errorMessage: task.errorMessage,
        createdAt: task.createdAt.toISOString(),
        completedAt: task.completedAt?.toISOString() || null,
        expiresAt: task.expiresAt?.toISOString() || null,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    }
  })

  // Create task
  fastify.post('/', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const db = fastify.db

    const data = await request.file()
    if (!data) {
      throw badRequest('No file provided')
    }

    const inputFormat = (getMultipartFieldValue(data.fields, 'inputFormat') || 'MDX') as ConversionInputFormat
    const outputFormat = (getMultipartFieldValue(data.fields, 'outputFormat') || 'TXT') as ConversionOutputFormat

    // Validate format combination
    if (!registry.isSupported(inputFormat, outputFormat)) {
      const supportedOutputs = registry.getSupportedOutputs(inputFormat)
      const details = supportedOutputs.length > 0
        ? ` Supported outputs: ${supportedOutputs.join(', ')}`
        : ''
      throw badRequest(`Unsupported conversion: ${inputFormat} → ${outputFormat}.${details}`)
    }

    // Validate file extension
    const ext = path.extname(data.filename).toLowerCase()
    if (ext !== '.mdx') {
      throw badRequest('Only .mdx files are supported')
    }

    // Save file first (stream to disk)
    const taskId = crypto.randomUUID()
    const userDir = path.join(CONVERSION_DIR, user.id)
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }

    const inputFileName = `${taskId}-input.mdx`
    const outputFileName = `${taskId}-output.${outputFormat.toLowerCase()}`
    const inputPath = path.join(userDir, inputFileName)
    const outputPath = path.join(userDir, outputFileName)

    // Stream file to disk using pipeline
    const outStream = fs.createWriteStream(inputPath)
    await pipeline(data.file, outStream)

    // Check file size after save
    const stats = fs.statSync(inputPath)
    const fileSize = stats.size
    if (fileSize > MAX_FILE_SIZE) {
      deleteFile(inputPath)
      throw badRequest(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
    }

    // Create database record
    const task = await db.conversionTask.create({
      data: {
        id: taskId,
        userId: user.id,
        inputFormat,
        outputFormat,
        inputFilePath: inputPath,
        outputFilePath: null,
        status: 'PENDING',
        progress: 0,
        fileSize: BigInt(fileSize),
      }
    })

    // Add to queue
    await fastify.conversionQueue.add('convert', {
      taskId,
      inputPath,
      outputPath,
      inputFormat,
      outputFormat,
    })

    return reply.status(201).send({
      id: task.id,
      inputFormat: task.inputFormat,
      outputFormat: task.outputFormat,
      status: task.status,
      progress: task.progress,
      fileSize: Number(task.fileSize),
      createdAt: task.createdAt.toISOString(),
    })
  })

  // Get task details - must be after list routes
  fastify.get('/:id', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const db = fastify.db
    const { id } = request.params as { id: string }

    const task = await db.conversionTask.findFirst({
      where: { id, userId: user.id }
    })

    if (!task) {
      throw notFound('ConversionTask', id)
    }

    // Check if expired
    if (task.status === 'COMPLETED' && task.expiresAt && task.expiresAt < new Date()) {
      await db.conversionTask.update({
        where: { id },
        data: { status: 'EXPIRED' }
      })
      task.status = 'EXPIRED'
    }

    return {
      id: task.id,
      inputFormat: task.inputFormat,
      outputFormat: task.outputFormat,
      status: task.status,
      progress: task.progress,
      fileSize: Number(task.fileSize),
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      completedAt: task.completedAt?.toISOString() || null,
      expiresAt: task.expiresAt?.toISOString() || null,
    }
  })

  // Download result
  fastify.get('/:id/download', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const db = fastify.db
    const { id } = request.params as { id: string }

    const task = await db.conversionTask.findFirst({
      where: { id, userId: user.id }
    })

    if (!task) {
      throw notFound('ConversionTask', id)
    }

    if (task.status !== 'COMPLETED') {
      throw badRequest('Conversion not completed')
    }

    if (task.expiresAt && task.expiresAt < new Date()) {
      throw badRequest('File has expired')
    }

    if (!task.outputFilePath || !fileExists(task.outputFilePath)) {
      throw notFound('Converted file', id)
    }

    const ext = task.outputFormat.toLowerCase()
    const contentType = ext === 'txt' ? 'text/plain; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const downloadName = `converted.${ext}`

    reply.header('Content-Disposition', `attachment; filename="${downloadName}"`)
    reply.header('Content-Type', contentType)

    return reply.send(fs.createReadStream(task.outputFilePath))
  })

  // Delete task
  fastify.delete('/:id', { preHandler: authGuard() }, async (request, reply) => {
    const user = requireSessionUser(request)
    const db = fastify.db
    const { id } = request.params as { id: string }

    const task = await db.conversionTask.findFirst({
      where: { id, userId: user.id }
    })

    if (!task) {
      throw notFound('ConversionTask', id)
    }

    // Delete physical files
    if (task.inputFilePath) {
      deleteFile(task.inputFilePath)
    }
    if (task.outputFilePath) {
      deleteFile(task.outputFilePath)
    }

    // Delete database record
    await db.conversionTask.delete({
      where: { id }
    })

    return reply.status(204).send()
  })
}

export default conversionRoutes
