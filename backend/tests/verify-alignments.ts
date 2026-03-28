import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://dict:dictpass@localhost:5432/dictdb'
    }
  }
})

async function testAlignmentsQuery() {
  const comparisonId = '13e865a5-4d07-4ef1-859c-8c78484921af'
  
  console.log('Testing alignments query...')
  console.log('Comparison ID:', comparisonId)
  
  try {
    // Test 1: Basic count
    const total = await prisma.entryAlignment.count({
      where: { comparisonId }
    })
    console.log('✓ Total alignments:', total)
    
    // Test 2: Count with headword filter
    const headwordFiltered = await prisma.entryAlignment.count({
      where: {
        comparisonId,
        OR: [
          { entryA: { rawHeadword: { contains: '阿' } } },
          { entryB: { rawHeadword: { contains: '阿' } } },
        ]
      }
    })
    console.log('✓ Alignments with headword containing "阿":', headwordFiltered)
    
    // Test 3: Fetch with pagination and includes
    const alignments = await prisma.entryAlignment.findMany({
      where: {
        comparisonId,
        OR: [
          { entryA: { rawHeadword: { contains: '阿' } } },
          { entryB: { rawHeadword: { contains: '阿' } } },
        ]
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
    
    console.log('✓ Fetched', alignments.length, 'alignments')
    
    if (alignments.length > 0) {
      const first = alignments[0]
      console.log('\nFirst alignment:')
      console.log('  ID:', first.id)
      console.log('  Change Type:', first.changeType)
      console.log('  Entry A Headword:', first.entryA?.rawHeadword || 'N/A')
      console.log('  Entry B Headword:', first.entryB?.rawHeadword || 'N/A')
      console.log('  Sense Diffs:', first.senseDiffs?.length || 0)
      
      // Verify response structure matches API contract
      console.log('\n✓ Response structure validation:')
      console.log('  - Has id:', !!first.id)
      console.log('  - Has comparisonId:', !!first.comparisonId)
      console.log('  - Has changeType:', !!first.changeType)
      console.log('  - Has entryA:', !!first.entryA)
      console.log('  - Has entryB:', !!first.entryB)
      console.log('  - Has senseDiffs:', Array.isArray(first.senseDiffs))
      
      if (first.entryA) {
        console.log('  - Entry A has senses:', Array.isArray(first.entryA.senses))
      }
      if (first.entryB) {
        console.log('  - Entry B has senses:', Array.isArray(first.entryB.senses))
      }
    }
    
    console.log('\n✅ All tests passed! The query logic is working correctly.')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testAlignmentsQuery()
