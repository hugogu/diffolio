import { MigrationKind, PrismaClient } from '@prisma/client'

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue

    const key = current.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args.set(key, true)
      continue
    }

    args.set(key, next)
    index += 1
  }

  return args
}

async function claimBatch(prisma: PrismaClient, kind: MigrationKind) {
  const existing = await prisma.migrationBatch.findFirst({
    where: { kind, status: { in: ['PENDING', 'RUNNING', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) {
    return prisma.migrationBatch.update({
      where: { id: existing.id },
      data: {
        status: 'RUNNING',
        startedAt: existing.startedAt ?? new Date(),
      },
    })
  }

  return prisma.migrationBatch.create({
    data: {
      kind,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  })
}

async function completeBatch(
  prisma: PrismaClient,
  batchId: string,
  input: { processedCount?: number; errorCount?: number; cursor?: unknown; notes?: unknown }
) {
  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: 'COMPLETED',
      processedCount: input.processedCount ?? 0,
      errorCount: input.errorCount ?? 0,
      cursor: input.cursor as object | undefined,
      notes: input.notes as object | undefined,
      completedAt: new Date(),
    },
  })
}

async function failBatch(prisma: PrismaClient, batchId: string, error: unknown) {
  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      notes: {
        error: error instanceof Error ? error.message : String(error),
      },
    },
  })
}

async function runPhase(prisma: PrismaClient, kind: MigrationKind, dryRun: boolean) {
  const batch = await claimBatch(prisma, kind)
  const notes = {
    dryRun,
    message: 'Shared-storage migration scaffold claimed the batch. Backfill handlers are implemented in later tasks.',
  }

  if (dryRun) {
    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: 'PENDING',
        notes,
      },
    })
    return
  }

  await completeBatch(prisma, batch.id, {
    processedCount: 0,
    errorCount: 0,
    cursor: null,
    notes,
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const requestedKinds = String(args.get('kind') ?? 'FILES,CONFIGS,ARTIFACTS,LINKS')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as MigrationKind[]
  const dryRun = Boolean(args.get('dry-run'))

  const prisma = new PrismaClient()

  try {
    for (const kind of requestedKinds) {
      await runPhase(prisma, kind, dryRun)
    }
  } catch (error) {
    const failedKind = requestedKinds[0]
    const batch = await prisma.migrationBatch.findFirst({
      where: { kind: failedKind, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
    })

    if (batch) {
      await failBatch(prisma, batch.id, error)
    }

    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
