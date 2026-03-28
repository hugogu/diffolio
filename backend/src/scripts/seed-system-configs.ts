import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { validateConfig } from '../services/config-engine.js'

const prisma = new PrismaClient()

const SAMPLES_DIR = path.join(process.cwd(), 'samples')
const EXCLUDE = ['taxonomy-config-example.json']

async function main() {
  // Find the first ADMIN user to set as creator
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  if (!adminUser) {
    console.error('No ADMIN user found. Run seed-admin.ts first.')
    process.exit(1)
  }

  console.log(`Using admin user: ${adminUser.email} (id: ${adminUser.id})`)

  const files = fs.readdirSync(SAMPLES_DIR).filter(
    (f) => f.endsWith('.json') && !EXCLUDE.includes(f)
  )

  let created = 0
  let updated = 0
  let skipped = 0

  for (const filename of files) {
    const filePath = path.join(SAMPLES_DIR, filename)
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      console.warn(`  SKIP ${filename}: invalid JSON`)
      skipped++
      continue
    }

    const name = (raw['name'] as string | undefined) ?? filename.replace('.json', '')
    const description = (raw['description'] as string | undefined) ?? null

    const validationResult = validateConfig(raw)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationReportJson = validationResult.errors.length > 0 || validationResult.warnings.length > 0
      ? { errors: validationResult.errors, warnings: validationResult.warnings } as any
      : undefined

    // Upsert by name (idempotent)
    const existing = await prisma.systemFormatConfig.findFirst({ where: { name } })

    if (existing) {
      await prisma.systemFormatConfig.update({
        where: { id: existing.id },
        data: {
          configJson: raw as any,
          description,
          validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
          validationReport: validationReportJson,
        },
      })
      console.log(`  UPDATED ${name} (${validationResult.isValid ? 'VALID' : 'INVALID'})`)
      updated++
    } else {
      await prisma.systemFormatConfig.create({
        data: {
          name,
          description,
          configJson: raw as any,
          visibility: 'ALL_USERS',
          createdById: adminUser.id,
          validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
          validationReport: validationReportJson,
        },
      })
      console.log(`  CREATED ${name} (${validationResult.isValid ? 'VALID' : 'INVALID'})`)
      created++
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
