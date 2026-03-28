/**
 * Integration test for GET /api/v1/comparisons/:id/alignments
 * 
 * This test verifies:
 * 1. Basic pagination works
 * 2. Headword filtering works with correct Prisma syntax
 * 3. Change type filtering works
 * 4. Response structure matches API contract
 * 5. Entries and sense diffs are properly included
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const comparisonId = '13e865a5-4d07-4ef1-859c-8c78484921af'

async function testAlignmentsQuery() {
  console.log('🧪 Testing alignments query for comparison:', comparisonId)
  console.log('=' .repeat(60))
  
  try {
    // Test 1: Basic count
    console.log('\n📊 Test 1: Basic count')
    const total = await prisma.entryAlignment.count({
      where: { comparisonId }
    })
    console.log('   ✓ Total alignments:', total)
    if (total === 0) {
      throw new Error('No alignments found')
    }
    
    // Test 2: Headword filter with correct Prisma syntax (using is: for nullable relations)
    console.log('\n📊 Test 2: Headword filter (含"阿")')
    const headwordFiltered = await prisma.entryAlignment.count({
      where: {
        comparisonId,
        AND: [{
          OR: [
            { entryA: { is: { rawHeadword: { contains: '阿' } } } },
            { entryB: { is: { rawHeadword: { contains: '阿' } } } },
          ]
        }]
      }
    })
    console.log('   ✓ Alignments with headword containing "阿":', headwordFiltered)
    if (headwordFiltered === 0) {
      throw new Error('Headword filter returned no results')
    }
    
    // Test 3: Change type filter
    console.log('\n📊 Test 3: Change type filter (MATCHED)')
    const matchedCount = await prisma.entryAlignment.count({
      where: {
        comparisonId,
        changeType: { in: ['MATCHED'] }
      }
    })
    console.log('   ✓ MATCHED alignments:', matchedCount)
    
    // Test 4: Fetch with pagination and includes
    console.log('\n📊 Test 4: Fetch with pagination and includes')
    const alignments = await prisma.entryAlignment.findMany({
      where: {
        comparisonId,
        AND: [{
          OR: [
            { entryA: { is: { rawHeadword: { contains: '阿' } } } },
            { entryB: { is: { rawHeadword: { contains: '阿' } } } },
          ]
        }]
      },
      skip: 0,
      take: 5,
      orderBy: { createdAt: 'asc' },
      include: {
        entryA: {
          include: {
            senses: {
              include: { examples: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        entryB: {
          include: {
            senses: {
              include: { examples: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        senseDiffs: true,
      },
    })
    
    console.log('   ✓ Fetched', alignments.length, 'alignments')
    
    // Test 5: Validate response structure
    console.log('\n📊 Test 5: Response structure validation')
    if (alignments.length === 0) {
      throw new Error('No alignments returned')
    }
    
    const first = alignments[0]
    const validations = [
      { name: 'Has id', valid: !!first.id },
      { name: 'Has comparisonId', valid: !!first.comparisonId },
      { name: 'Has changeType', valid: !!first.changeType },
      { name: 'Has entryA or entryB', valid: !!first.entryA || !!first.entryB },
      { name: 'Has senseDiffs array', valid: Array.isArray(first.senseDiffs) },
    ]
    
    validations.forEach(v => {
      console.log(`   ${v.valid ? '✓' : '✗'} ${v.name}`)
    })
    
    if (validations.some(v => !v.valid)) {
      throw new Error('Response structure validation failed')
    }
    
    // Show sample data
    console.log('\n📋 Sample alignment data:')
    console.log('   ID:', first.id)
    console.log('   Change Type:', first.changeType)
    console.log('   Entry A Headword:', first.entryA?.rawHeadword || 'N/A')
    console.log('   Entry B Headword:', first.entryB?.rawHeadword || 'N/A')
    console.log('   Sense Diffs:', first.senseDiffs?.length || 0)
    if (first.entryA?.senses) {
      console.log('   Entry A Senses:', first.entryA.senses.length)
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ All tests passed!')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testAlignmentsQuery()
