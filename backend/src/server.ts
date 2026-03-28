import { buildApp } from './app.js'
import { resolveSessionSecret } from './lib/session-secret.js'

const port = parseInt(process.env.API_PORT ?? '3000', 10)

async function main() {
  const jwtSecret = await resolveSessionSecret()
  const app = await buildApp(jwtSecret)

  try {
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`Fastify server listening on :${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
