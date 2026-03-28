import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import path from 'node:path'
import logger from '../lib/worker-logger.js'
import fs from 'node:fs'
import { ExportJobData } from '../plugins/bullmq.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const prisma = new PrismaClient()
const STORAGE_PATH = process.env.FILE_STORAGE_LOCAL_PATH ?? '/data/uploads'

// Row fill colours (by change type)
const FILL_ADDED   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6F5D6' } } as const
const FILL_DELETED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD6D6' } } as const
const FILL_CHANGED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0CC' } } as const
const FILL_MATCHED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } } as const

type SenseForDisplay = {
  rawNumber: string
  rawDefinition: string
  examples: { rawText: string }[]
}

/** Format one sense as original text: ①原始释义文本｜例句1｜例句2 */
function senseFullText(s: SenseForDisplay): string {
  let text = s.rawNumber + s.rawDefinition
  for (const ex of s.examples) {
    text += '\n｜' + ex.rawText
  }
  return text
}

/** Join all senses into one cell string, prepending the entry-level phonetic if present. */
function entryFullText(phonetic: string | null | undefined, senses: SenseForDisplay[]): string {
  const text = senses.map(senseFullText).join('\n')
  if (phonetic && text) return phonetic + ' ' + text
  return text
}

function alignmentStatus(changeType: string, senseDiffs: { changeType: string }[]): string {
  if (changeType === 'ADDED') return '新增'
  if (changeType === 'DELETED') return '删除'
  const hasDefChange = senseDiffs.some((d) => d.changeType === 'DEFINITION_CHANGED')
  const hasPosChange = senseDiffs.some((d) => d.changeType === 'POS_CHANGED')
  const hasExChange  = senseDiffs.some((d) => d.changeType === 'EXAMPLE_CHANGED')
  if (hasDefChange) return '释义变更'
  if (hasPosChange) return '词性变更'
  if (hasExChange)  return '例句变更'
  if (changeType === 'MATCHED_VARIANT') return '变体匹配'
  return '匹配'
}

/** Escape CSV field */
function csvEscape(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

type AlignmentType = {
  id: string
  changeType: string
  entryA: any
  entryB: any
  senseDiffs: { changeType: string }[]
}

interface ExportRow {
  level1: string
  level2: string
  level3: string
  headword: string
  phonetic: string
  status: string
  defA: string
  defB: string
}

async function processExportJob(job: Job<ExportJobData>) {
  const { exportJobId, comparisonId, senseChangeTypes, orderBy, taxonomySourceId, userId, userEmail } = job.data

  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: { status: 'RUNNING' },
  })

  try {
    const noFilter = !senseChangeTypes || senseChangeTypes.length === 0

    const comparison = await prisma.comparison.findUnique({
      where: { id: comparisonId },
      include: {
        versionA: { include: { dictionary: true } },
        versionB: { include: { dictionary: true } },
        alignments: {
          orderBy: { createdAt: 'asc' },
          include: {
            entryA: { include: { senses: { include: { examples: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } } },
            entryB: { include: { senses: { include: { examples: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } } },
            senseDiffs: true,
          },
        },
      },
    })

    if (!comparison) throw new Error(`Comparison ${comparisonId} not found`)

    const labelA = `${comparison.versionA.dictionary.name} ${comparison.versionA.label}`
    const labelB = `${comparison.versionB.dictionary.name} ${comparison.versionB.label}`

    const exportRows: ExportRow[] = []

    if (orderBy === 'taxonomy' && taxonomySourceId) {
      // 1. Get all nodes that have entries (any level), sorted by path
      // First get all nodes
      const allNodes = await prisma.taxonomyNode.findMany({
        where: { taxonomySourceId },
        select: { id: true, label: true, level: true, path: true },
        orderBy: { path: 'asc' },
      })
      
      // Filter to only nodes that have entries
      const nodesWithEntries = []
      for (const node of allNodes) {
        const count = await prisma.taxonomyEntry.count({
          where: { taxonomySourceId, nodeId: node.id }
        })
        if (count > 0) {
          nodesWithEntries.push(node)
        }
      }
      
      const leafNodes = nodesWithEntries

      logger.info({ leafNodes: leafNodes.length, totalNodes: allNodes.length }, 'Export: taxonomy nodes with entries')

      // 2. Build path map for all nodes (reuse allNodes from above)
      const pathToNodeMap = new Map<string, typeof allNodes[0]>()
      for (const node of allNodes) {
        pathToNodeMap.set(node.path, node)
      }

      // Helper to get level labels - leafNode is level 4 (has entries), we need its parent (level 3) as the category
      function getLevelLabels(leafNode: typeof allNodes[0]): { level1: string; level2: string; level3: string } {
        let level1 = '', level2 = '', level3 = ''

        let currentNode: typeof allNodes[0] | undefined = leafNode
        const nodeChain: typeof allNodes[0][] = []

        // Walk up the tree to collect all ancestors
        while (currentNode) {
          nodeChain.unshift(currentNode) // Add to front
          if (currentNode.level === 1) {
            level1 = currentNode.label
            break
          }
          const parentPath = currentNode.path.split('/').slice(0, -1).join('/')
          currentNode = parentPath ? pathToNodeMap.get(parentPath) : undefined
        }

        // leafNode is level 4, its parent is level 3 (the category)
        // level3 should be the level 3 node's label, not level 4
        const level3Node = nodeChain.find(n => n.level === 3)
        if (level3Node) level3 = level3Node.label
        
        const level2Node = nodeChain.find(n => n.level === 2)
        if (level2Node) level2 = level2Node.label

        return { level1, level2, level3 }
      }

      // 3. Build alignment lookup map (ALL alignments, no filter here)
      const alignmentMap = new Map<string, AlignmentType>()
      for (const alignment of comparison.alignments) {
        const normalizedHw = alignment.entryA?.normalizedHeadword ?? alignment.entryB?.normalizedHeadword ?? ''
        if (!alignmentMap.has(normalizedHw)) {
          alignmentMap.set(normalizedHw, alignment as AlignmentType)
        }
      }

      logger.info({ alignmentMapSize: alignmentMap.size }, 'Export: alignment map built')
      
      // Log some sample keys from alignment map for debugging
      const sampleKeys = Array.from(alignmentMap.keys()).slice(0, 5)
      logger.debug({ sampleKeys }, 'Export: sample alignment keys')

      // 4. Traverse leaf nodes and collect ALL entries
      let totalEntries = 0
      let matchedEntries = 0

      for (const leafNode of leafNodes) {
        const entries = await prisma.taxonomyEntry.findMany({
          where: { taxonomySourceId, nodeId: leafNode.id },
          select: { normalizedHeadword: true, headword: true },
          orderBy: { sequencePosition: 'asc' },
        })

        totalEntries += entries.length

        const { level1, level2, level3 } = getLevelLabels(leafNode)
        
        // Log first few entries for debugging
        if (entries.length > 0) {
          logger.debug({ node: leafNode.label, entryCount: entries.length }, 'Export: node entries')
        }

        for (const entry of entries) {
          // Try both formats: with and without 【】 brackets
          let alignment = alignmentMap.get(entry.normalizedHeadword)
          if (!alignment) {
            // Try with brackets
            alignment = alignmentMap.get(`【${entry.normalizedHeadword}】`)
          }

          // Check if matches filter
          let matchesFilter = true
          if (!noFilter && alignment) {
            matchesFilter = alignment.senseDiffs.some((sd: { changeType: string }) =>
              senseChangeTypes!.includes(sd.changeType)
            )
          }

          // Only include if matches filter or has no alignment (to show all taxonomy entries)
          if (matchesFilter || !alignment) {
            if (alignment) matchedEntries++

            const phonetic = alignment?.entryA?.phonetic ?? alignment?.entryB?.phonetic ?? ''
            const status = alignment ? alignmentStatus(alignment.changeType, alignment.senseDiffs) : '—'

            let defA = '', defB = ''
            if (alignment) {
              if (alignment.changeType === 'ADDED') {
                defA = ''
                defB = alignment.entryB ? entryFullText(alignment.entryB.phonetic, alignment.entryB.senses as SenseForDisplay[]) : ''
              } else if (alignment.changeType === 'DELETED') {
                defA = alignment.entryA ? entryFullText(alignment.entryA.phonetic, alignment.entryA.senses as SenseForDisplay[]) : ''
                defB = ''
              } else {
                const hasDefChange = alignment.senseDiffs.some((d: { changeType: string }) => d.changeType !== 'MATCHED')
                defA = alignment.entryA ? entryFullText(alignment.entryA.phonetic, alignment.entryA.senses as SenseForDisplay[]) : ''
                defB = hasDefChange
                  ? (alignment.entryB ? entryFullText(alignment.entryB.phonetic, alignment.entryB.senses as SenseForDisplay[]) : '')
                  : '同前'
              }
            }

            exportRows.push({
              level1,
              level2,
              level3,
              headword: entry.headword,
              phonetic,
              status,
              defA,
              defB,
            })
          }
        }
      }

      logger.info({ totalEntries, matchedEntries, exportRows: exportRows.length }, 'Export: row summary')

    } else {
      // Alphabetical mode - just export all alignments
      for (const alignment of comparison.alignments) {
        // Check filter
        if (!noFilter) {
          const matches = alignment.senseDiffs.some((sd: { changeType: string }) =>
            senseChangeTypes!.includes(sd.changeType)
          )
          if (!matches) continue
        }

        const headword = alignment.entryA?.rawHeadword ?? alignment.entryB?.rawHeadword ?? ''
        const phonetic = alignment.entryA?.phonetic ?? alignment.entryB?.phonetic ?? ''
        const status = alignmentStatus(alignment.changeType, alignment.senseDiffs as { changeType: string }[])

        let defA = '', defB = ''
        if (alignment.changeType === 'ADDED') {
          defB = alignment.entryB ? entryFullText(alignment.entryB.phonetic, alignment.entryB.senses as SenseForDisplay[]) : ''
        } else if (alignment.changeType === 'DELETED') {
          defA = alignment.entryA ? entryFullText(alignment.entryA.phonetic, alignment.entryA.senses as SenseForDisplay[]) : ''
        } else {
          const hasDefChange = (alignment.senseDiffs as { changeType: string }[]).some(d => d.changeType !== 'MATCHED')
          defA = alignment.entryA ? entryFullText(alignment.entryA.phonetic, alignment.entryA.senses as SenseForDisplay[]) : ''
          defB = hasDefChange
            ? (alignment.entryB ? entryFullText(alignment.entryB.phonetic, alignment.entryB.senses as SenseForDisplay[]) : '')
            : '同前'
        }

        exportRows.push({
          level1: '',
          level2: '',
          level3: '',
          headword,
          phonetic,
          status,
          defA,
          defB,
        })
      }
    }

    // Generate both CSV and Excel
    fs.mkdirSync(STORAGE_PATH, { recursive: true })
    const timestamp = Date.now()
    const baseFilename = `export_${comparisonId}_${timestamp}`

    // 1. Generate CSV
    const csvLines: string[] = []
    if (orderBy === 'taxonomy' && taxonomySourceId) {
      csvLines.push('一级分类,二级分类,三级分类,词头,拼音,对比状态,' + csvEscape(labelA + ' 释义') + ',' + csvEscape(labelB + ' 释义'))
      for (const row of exportRows) {
        csvLines.push([
          csvEscape(row.level1),
          csvEscape(row.level2),
          csvEscape(row.level3),
          csvEscape(row.headword),
          csvEscape(row.phonetic),
          csvEscape(row.status),
          csvEscape(row.defA),
          csvEscape(row.defB),
        ].join(','))
      }
    } else {
      csvLines.push('词头,对比状态,' + csvEscape(labelA + ' 释义') + ',' + csvEscape(labelB + ' 释义'))
      for (const row of exportRows) {
        csvLines.push([
          csvEscape(row.headword),
          csvEscape(row.status),
          csvEscape(row.defA),
          csvEscape(row.defB),
        ].join(','))
      }
    }

    const csvContent = csvLines.join('\n')
    const csvPath = path.join(STORAGE_PATH, `${baseFilename}.csv`)
    fs.writeFileSync(csvPath, csvContent, 'utf-8')
    logger.info({ csvPath, rows: exportRows.length }, 'Export: CSV saved')

    // 2. Generate Excel
    const workbook = new ExcelJS.Workbook()

    // Embed user traceability in document properties (visible in file Properties dialog)
    const exportedAt = new Date()
    workbook.creator = userEmail
    workbook.lastModifiedBy = userEmail
    workbook.created = exportedAt
    workbook.modified = exportedAt
    workbook.title = `词典对比导出 — ${labelA} vs ${labelB}`
    workbook.subject = `${labelA} vs ${labelB}`
    workbook.description = `导出用户：${userEmail}（ID: ${userId}）｜导出时间：${exportedAt.toISOString()}｜任务 ID：${exportJobId}`
    workbook.keywords = `${userId} ${userEmail} ${exportJobId}`
    workbook.category = '词典对比'
    workbook.company = userId

    const sheet = workbook.addWorksheet('词条对比')

    if (orderBy === 'taxonomy' && taxonomySourceId) {
      sheet.columns = [
        { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 },
        { width: 10 }, { width: 10 }, { width: 50 }, { width: 50 },
      ]

      const headerRow = sheet.addRow([
        '一级分类', '二级分类', '三级分类', '词头', '拼音', '对比状态',
        `${labelA} 释义`, `${labelB} 释义`,
      ])
      headerRow.font = { bold: true }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }

      let currentLevel1 = '', currentLevel2 = '', currentLevel3 = ''
      let level1StartRow = 2, level2StartRow = 2, level3StartRow = 2

      for (let i = 0; i < exportRows.length; i++) {
        const row = exportRows[i]
        const sheetRow = sheet.addRow([row.level1, row.level2, row.level3, row.headword, row.phonetic, row.status, row.defA, row.defB])

        // Set fill color
        if (row.status === '新增') sheetRow.fill = FILL_ADDED
        else if (row.status === '删除') sheetRow.fill = FILL_DELETED
        else if (row.status !== '匹配' && row.status !== '—') sheetRow.fill = FILL_CHANGED
        else sheetRow.fill = FILL_MATCHED

        sheetRow.getCell(7).alignment = { wrapText: true, vertical: 'top' }
        sheetRow.getCell(8).alignment = { wrapText: true, vertical: 'top' }

        // Track merges
        if (row.level1 !== currentLevel1) {
          if (i > 0 && level1StartRow < 1 + i) {
            sheet.mergeCells(level1StartRow, 1, 1 + i, 1)
          }
          currentLevel1 = row.level1
          level1StartRow = 2 + i
        }
        if (row.level2 !== currentLevel2) {
          if (i > 0 && level2StartRow < 1 + i) {
            sheet.mergeCells(level2StartRow, 2, 1 + i, 2)
          }
          currentLevel2 = row.level2
          level2StartRow = 2 + i
        }
        if (row.level3 !== currentLevel3) {
          if (i > 0 && level3StartRow < 1 + i) {
            sheet.mergeCells(level3StartRow, 3, 1 + i, 3)
          }
          currentLevel3 = row.level3
          level3StartRow = 2 + i
        }
      }

      const lastDataRow = 1 + exportRows.length
      if (exportRows.length > 0) {
        if (level1StartRow < lastDataRow) sheet.mergeCells(level1StartRow, 1, lastDataRow, 1)
        if (level2StartRow < lastDataRow) sheet.mergeCells(level2StartRow, 2, lastDataRow, 2)
        if (level3StartRow < lastDataRow) sheet.mergeCells(level3StartRow, 3, lastDataRow, 3)
      }
    } else {
      sheet.columns = [{ width: 14 }, { width: 12 }, { width: 70 }, { width: 70 }]

      const headerRow = sheet.addRow(['词头', '对比状态', `${labelA} 释义`, `${labelB} 释义`])
      headerRow.font = { bold: true }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }

      for (const row of exportRows) {
        const sheetRow = sheet.addRow([row.headword, row.status, row.defA, row.defB])

        if (row.status === '新增') sheetRow.fill = FILL_ADDED
        else if (row.status === '删除') sheetRow.fill = FILL_DELETED
        else if (row.status !== '匹配' && row.status !== '—') sheetRow.fill = FILL_CHANGED
        else sheetRow.fill = FILL_MATCHED

        sheetRow.getCell(3).alignment = { wrapText: true, vertical: 'top' }
        sheetRow.getCell(4).alignment = { wrapText: true, vertical: 'top' }
      }
    }

    // Summary sheet
    const summarySheet = workbook.addWorksheet('概况')
    summarySheet.columns = [{ width: 20 }, { width: 40 }]
    summarySheet.addRow(['版本 A', labelA])
    summarySheet.addRow(['版本 B', labelB])
    summarySheet.addRow(['版本 A 条目总数', comparison.totalA])
    summarySheet.addRow(['版本 B 条目总数', comparison.totalB])
    summarySheet.addRow(['匹配条目', comparison.matched])
    summarySheet.addRow(['新增 (B)', comparison.addedInB])
    summarySheet.addRow(['删除 (A)', comparison.deletedFromA])
    summarySheet.addRow(['导出行数', exportRows.length])
    if (!noFilter) {
      summarySheet.addRow([])
      summarySheet.addRow(['导出筛选', senseChangeTypes!.join(', ')])
    }
    if (orderBy === 'taxonomy' && taxonomySourceId) {
      summarySheet.addRow(['排序方式', '义类序'])
      summarySheet.addRow(['分类词典', taxonomySourceId])
    }
    // Watermark — user traceability metadata
    summarySheet.addRow([])
    const watermarkHeader = summarySheet.addRow(['── 导出追踪信息 ──', ''])
    watermarkHeader.font = { bold: true, color: { argb: 'FF888888' } }
    summarySheet.addRow(['导出用户', userEmail])
    summarySheet.addRow(['用户 ID', userId])
    summarySheet.addRow(['导出任务 ID', exportJobId])
    summarySheet.addRow(['导出时间', exportedAt.toISOString()])

    const excelPath = path.join(STORAGE_PATH, `${baseFilename}.xlsx`)
    await workbook.xlsx.writeFile(excelPath)
    logger.info({ excelPath }, 'Export: Excel saved')

    // Update job with both files
    const downloadUrl = `/api/v1/exports/${exportJobId}/download`
    const csvDownloadUrl = `/api/v1/exports/${exportJobId}/download?format=csv`

    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'COMPLETED',
        downloadPath: excelPath,
        downloadUrl,
        expiresAt: null,
        completedAt: new Date(),
      },
    })

    await redis.publish('export:ready', JSON.stringify({
      exportId: exportJobId,
      comparisonId,
      downloadUrl,
      csvDownloadUrl,
      expiresAt: null,
    }))

    logger.info({ exportJobId }, 'Export: job completed successfully')
  } catch (err) {
    logger.error({ exportJobId, err: err instanceof Error ? err.message : String(err) }, 'Export: job failed')
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: { status: 'FAILED' },
    })
    throw err
  }
}

const worker = new Worker<ExportJobData>('export', processExportJob, {
  connection: redis,
  concurrency: 1,
})

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Export job completed'))
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Export job failed'))

export default worker
