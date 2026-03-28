import { PrismaClient } from '@prisma/client';

async function test() {
  console.log('Testing Prisma client...');
  
  const prisma = new PrismaClient({ 
    datasources: { 
      db: { url: 'file:./test.db' } 
    } 
  });
  
  console.log('✓ PrismaClient instance created');
  
  await prisma.$connect();
  console.log('✓ Connected to database');
  
  // Test a simple query
  const dictCount = await prisma.dictionary.count();
  console.log(`✓ Dictionary count: ${dictCount}`);
  
  await prisma.$disconnect();
  console.log('✓ Disconnected');
}

test().catch(console.error);
