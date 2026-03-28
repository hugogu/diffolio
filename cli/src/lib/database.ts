import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';

export interface DatabaseConfig {
  url: string;
}

export async function connectDatabase(url: string): Promise<PrismaClient> {
  try {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url,
        },
      },
    });

    // Test connection
    await prisma.$connect();
    
    console.log(chalk.green('✓ Database connected successfully'));
    
    return prisma;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
    throw error;
  }
}

export async function disconnectDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$disconnect();
  console.log(chalk.gray('Database connection closed'));
}

export function getDatabaseType(url: string): 'postgresql' | 'sqlite' {
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return 'postgresql';
  }
  if (url.startsWith('file:') || url.endsWith('.db') || url.endsWith('.sqlite')) {
    return 'sqlite';
  }
  throw new Error('Unsupported database URL format. Use postgresql:// or file://');
}
