// Worker entry point - starts all BullMQ workers
import './parse.worker.js'
import './comparison.worker.js'
import './export.worker.js'
import './taxonomy.worker.js'
import './email.worker.js'
import './subscription.worker.js'
import './conversion.worker.js'
import logger from '../lib/worker-logger.js'

logger.info('All workers started (parse, comparison, export, taxonomy, email, subscription, conversion)')
