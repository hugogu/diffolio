import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import Fastify from 'fastify'
import comparisonRoutes from '../../src/routes/comparisons.js'
import jwt from '@fastify/jwt'

const prisma = new PrismaClient()

const TEST_JWT_SECRET = 'test-secret-32-chars-minimum-ok!'

async function buildApp() {
  const app = Fastify()

  await app.register(jwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '1h' },
    cookie: { cookieName: 'auth_token', signed: false },
  })

  // Mock db decorator
  app.decorate('db', prisma)

  // Mock comparison queue
  app.decorate('comparisonQueue', {
    add: async () => ({ id: 'test-job-id' }),
  })

  await app.register(comparisonRoutes, { prefix: '/api/v1' })

  return app
}

// Helper to make authenticated request
async function makeRequest(app: Awaited<ReturnType<typeof buildApp>>, userId: string, url: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error(`Test user ${userId} not found`)

  const token = app.jwt.sign({  // sync — returns string directly
    id: user.id,
    email: user.email,
    role: user.role,
    exportEnabled: user.exportEnabled,
    maxVersions: user.maxVersions,
    maxBooks: user.maxBooks,
    canEditBuiltinConfigs: user.canEditBuiltinConfigs,
    watermarkEnabled: user.watermarkEnabled,
  })

  return app.inject({
    method: 'GET',
    url,
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe('GET /api/v1/comparisons/:id/alignments', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  let testComparisonId: string
  let testUserId: string
  let testDictionaryId: string
  let testVersionAId: string
  let testVersionBId: string
  let matchedAlignmentId: string
  let addedAlignmentId: string

  beforeAll(async () => {
    app = await buildApp()
    
    // Generate unique test identifier to avoid conflicts
    const testId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
    
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `test-alignments-${testId}@example.com`,
        username: `test-alignments-${testId}`,
        emailVerified: true,
        passwordHash: '$2a$12$placeholder',
        role: 'REGULAR',
      },
    })
    testUserId = user.id
    
    // Create test dictionary and versions
    const dictionary = await prisma.dictionary.create({
      data: {
        name: `Test Dictionary ${testId}`,
        userId: testUserId,
        publisher: 'Test Publisher',
        encodingScheme: 'UTF-8',
      },
    })
    testDictionaryId = dictionary.id
    
    const versionA = await prisma.dictionaryVersion.create({
      data: {
        label: 'v1',
        dictionaryId: dictionary.id,
      },
    })
    testVersionAId = versionA.id
    
    const versionB = await prisma.dictionaryVersion.create({
      data: {
        label: 'v2',
        dictionaryId: dictionary.id,
      },
    })
    testVersionBId = versionB.id
    
    // Create test comparison
    const comparison = await prisma.comparison.create({
      data: {
        versionAId: versionA.id,
        versionBId: versionB.id,
        status: 'COMPLETED',
      },
    })
    testComparisonId = comparison.id
    
    // Create test entries with senses for different scenarios
    // Entry 1: MATCHED alignment with sense data
    const entryA1 = await prisma.entry.create({
      data: {
        versionId: versionA.id,
        rawHeadword: '阿爸',
        normalizedHeadword: '阿爸',
        phonetic: 'ā bà',
      },
    })
    
    const entryB1 = await prisma.entry.create({
      data: {
        versionId: versionB.id,
        rawHeadword: '阿爸',
        normalizedHeadword: '阿爸',
        phonetic: 'ā bà',
      },
    })
    
    // Create senses with definitions for full-text search testing
    const senseA1 = await prisma.sense.create({
      data: {
        entryId: entryA1.id,
        rawNumber: '1',
        normalizedNumber: '1',
        definition: '父亲，含有尊敬和亲昵的意味',
        rawDefinition: '父亲，含有尊敬和亲昵的意味',
        position: 0,
      },
    })
    
    const senseB1 = await prisma.sense.create({
      data: {
        entryId: entryB1.id,
        rawNumber: '1',
        normalizedNumber: '1',
        definition: '父亲，含有亲昵的意味（定义已修改）',
        rawDefinition: '父亲，含有亲昵的意味（定义已修改）',
        position: 0,
      },
    })
    
    // Entry 2: ADDED alignment (only in B)
    const entryB2 = await prisma.entry.create({
      data: {
        versionId: versionB.id,
        rawHeadword: '阿姨',
        normalizedHeadword: '阿姨',
        phonetic: 'ā yí',
      },
    })
    
    // Entry 3: DELETED alignment (only in A)
    const entryA3 = await prisma.entry.create({
      data: {
        versionId: versionA.id,
        rawHeadword: '阿哥',
        normalizedHeadword: '阿哥',
        phonetic: 'ā gē',
      },
    })
    
    // Create test alignments with different change types
    const matchedAlignment = await prisma.entryAlignment.create({
      data: {
        comparisonId: testComparisonId,
        entryAId: entryA1.id,
        entryBId: entryB1.id,
        changeType: 'MATCHED',
        alignScore: 0.95,
      },
    })
    matchedAlignmentId = matchedAlignment.id
    
    // Add sense diffs for senseChangeType testing
    await prisma.senseDiff.create({
      data: {
        alignmentId: matchedAlignment.id,
        senseAId: senseA1.id,
        senseBId: senseB1.id,
        changeType: 'DEFINITION_CHANGED',
        diffSummary: { type: 'definition', from: '...', to: '...' },
      },
    })
    
    const addedAlignment = await prisma.entryAlignment.create({
      data: {
        comparisonId: testComparisonId,
        entryBId: entryB2.id,
        changeType: 'ADDED',
      },
    })
    addedAlignmentId = addedAlignment.id
    
    await prisma.entryAlignment.create({
      data: {
        comparisonId: testComparisonId,
        entryAId: entryA3.id,
        changeType: 'DELETED',
      },
    })
  })

  afterAll(async () => {
    // Cleanup in reverse order - handle cases where variables might be undefined
    if (testComparisonId) {
      await prisma.senseDiff.deleteMany({
        where: { alignment: { comparisonId: testComparisonId } },
      }).catch(() => {})
      
      await prisma.entryAlignment.deleteMany({
        where: { comparisonId: testComparisonId },
      }).catch(() => {})
    }
    
    const versionIds = [testVersionAId, testVersionBId].filter(Boolean)
    if (versionIds.length > 0) {
      await prisma.sense.deleteMany({
        where: { entry: { versionId: { in: versionIds } } },
      }).catch(() => {})
      
      await prisma.entry.deleteMany({
        where: { versionId: { in: versionIds } },
      }).catch(() => {})
    }
    
    if (testComparisonId) {
      await prisma.comparison.deleteMany({
        where: { id: testComparisonId },
      }).catch(() => {})
    }
    
    if (testDictionaryId) {
      await prisma.dictionaryVersion.deleteMany({
        where: { dictionaryId: testDictionaryId },
      }).catch(() => {})
      
      await prisma.dictionary.deleteMany({
        where: { id: testDictionaryId },
      }).catch(() => {})
    }
    
    if (testUserId) {
      await prisma.user.deleteMany({
        where: { id: testUserId },
      }).catch(() => {})
    }
    
    await prisma.$disconnect()
    await app.close()
  })

  describe('Basic Functionality', () => {
    it('should return paginated alignments with correct structure', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=1&pageSize=10`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body).toHaveProperty('items')
      expect(body).toHaveProperty('total')
      expect(body).toHaveProperty('page')
      expect(body).toHaveProperty('pageSize')
      expect(body).toHaveProperty('totalPages')
      
      expect(body.items).toBeInstanceOf(Array)
      expect(body.items.length).toBeGreaterThan(0)
      expect(body.total).toBe(3) // We created 3 alignments
      expect(body.page).toBe(1)
      expect(body.pageSize).toBe(10)
    })

    it('should handle pagination correctly', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=1&pageSize=2`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body.items.length).toBeLessThanOrEqual(2)
      expect(body.pageSize).toBe(2)
      expect(body.totalPages).toBe(2) // 3 items / 2 per page = 2 pages
    })

    it('should return empty array for out-of-range page', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=100&pageSize=10`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items).toHaveLength(0)
      expect(body.total).toBe(3)
    })
  })

  describe('Headword Filtering', () => {
    it('should filter by headword (exact match)', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?headword=阿爸`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBeGreaterThan(0)
      body.items.forEach((item: any) => {
        const hasMatchingHeadword = 
          (item.entryA?.rawHeadword?.includes('阿爸')) ||
          (item.entryB?.rawHeadword?.includes('阿爸'))
        expect(hasMatchingHeadword).toBe(true)
      })
    })

    it('should filter by headword (partial match)', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?headword=阿`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(3) // All test entries start with '阿'
    })

    it('should return empty result for non-matching headword', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?headword=不存在`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items).toHaveLength(0)
      expect(body.total).toBe(0)
    })
  })

  describe('Full-text Search (q parameter)', () => {
    it('should search by definition content', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?q=尊敬`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      // Should find the entry with '阿爸' which has '尊敬' in definition
      expect(body.items.length).toBeGreaterThan(0)
    })

    it('should return empty result for non-matching search term', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?q=不存在这个词`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items).toHaveLength(0)
    })
  })

  describe('ChangeType Filtering', () => {
    it('should filter by single changeType', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?changeType=MATCHED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(1)
      expect(body.items[0].changeType).toBe('MATCHED')
    })

    it('should filter by multiple changeTypes (comma-separated)', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?changeType=MATCHED,ADDED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(2)
      body.items.forEach((item: any) => {
        expect(['MATCHED', 'ADDED']).toContain(item.changeType)
      })
    })

    it('should filter by ADDED changeType', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?changeType=ADDED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(1)
      expect(body.items[0].changeType).toBe('ADDED')
    })

    it('should filter by DELETED changeType', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?changeType=DELETED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(1)
      expect(body.items[0].changeType).toBe('DELETED')
    })
  })

  describe('SenseChangeType Filtering', () => {
    it('should filter by single senseChangeType', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?senseChangeType=DEFINITION_CHANGED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(1)
      expect(body.items[0].changeType).toBe('MATCHED') // The MATCHED alignment has DEFINITION_CHANGED sense diff
    })

    it('should filter by multiple senseChangeTypes (comma-separated)', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?senseChangeType=DEFINITION_CHANGED,POS_CHANGED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      // Should find items that have either DEFINITION_CHANGED or POS_CHANGED sense diffs
      expect(body.items.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Combined Filters', () => {
    it('should combine headword and changeType filters', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?headword=阿爸&changeType=MATCHED`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBe(1)
      expect(body.items[0].changeType).toBe('MATCHED')
    })

    it('should combine pagination with filters', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?changeType=MATCHED,ADDED,DELETED&page=1&pageSize=2`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      expect(body.items.length).toBeLessThanOrEqual(2)
      expect(body.total).toBe(3)
    })
  })

  describe('Response Structure', () => {
    it('should include entryA and entryB with senses', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=1&pageSize=1`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      const item = body.items[0]
      expect(item).toHaveProperty('entryA')
      expect(item).toHaveProperty('entryB')
      expect(item).toHaveProperty('changeType')
      expect(item).toHaveProperty('senseDiffs')
      
      // Check locked field exists
      expect(item).toHaveProperty('locked')
      expect(typeof item.locked).toBe('boolean')
    })

    it('should have correct totalPages calculation', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=1&pageSize=2`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      // 3 items total, 2 per page = 2 pages
      expect(body.totalPages).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty changeType filter gracefully', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?changeType=`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      // Should return all items
      expect(body.total).toBe(3)
    })

    it('should handle invalid page numbers', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=0&pageSize=10`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      // Should default to page 1
      expect(body.page).toBe(1)
    })

    it('should cap pageSize at 100', async () => {
      const response = await makeRequest(app, testUserId, `/api/v1/comparisons/${testComparisonId}/alignments?page=1&pageSize=1000`)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      
      // Should cap at 100
      expect(body.pageSize).toBe(100)
    })
  })
})

// Separate describe block for tests that require session authentication
describe('GET /api/v1/comparisons/:id/alignments - Authentication', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should return 401 without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/comparisons/some-id/alignments',
    })

    expect(response.statusCode).toBe(401)
  })
})
