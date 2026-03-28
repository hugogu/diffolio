import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function parseArgs(): { email: string; password: string } {
  const args = process.argv.slice(2)
  const emailIdx = args.indexOf('--email')
  const passIdx = args.indexOf('--password')
  const email = emailIdx >= 0 ? args[emailIdx + 1] : (process.env.ADMIN_EMAIL || 'admin@localhost')
  const password = passIdx >= 0 ? args[passIdx + 1] : (process.env.ADMIN_PASSWORD || 'Changeme!23')
  return { email, password }
}

async function main() {
  const { email, password } = parseArgs()

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin user with email ${email} already exists (id: ${existing.id})`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email,
      emailVerified: true,
      passwordHash,
      role: 'ADMIN',
      exportEnabled: true,
      maxVersions: 9999,
      maxBooks: 9999,
      canEditBuiltinConfigs: true,
    },
  })

  console.log(`Created admin user: ${admin.email} (id: ${admin.id})`)
  console.log('Default password: change immediately after first login!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
