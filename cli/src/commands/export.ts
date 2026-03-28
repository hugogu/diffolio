import { Command } from 'commander';
import chalk from 'chalk';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { connectDatabase, disconnectDatabase } from '../lib/database.js';
import { createProgressReporter } from '../lib/progress.js';
import { CLIError, ExitCodes } from '../lib/errors.js';
import { addGlobalOptions, GlobalOptions } from '../lib/options.js';

interface ExportOptions extends GlobalOptions {
  comparisonId: string;
  output: string;
  database: string;
  orderBy: 'headword' | 'phonetic' | 'change_type';
  filter?: 'all' | 'added' | 'deleted' | 'modified';
}

// Row fill colours (by change type)
const FILL_ADDED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6F5D6' } } as const;
const FILL_DELETED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD6D6' } } as const;
const FILL_CHANGED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0CC' } } as const;
const FILL_MATCHED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } } as const;

function getFill(changeType: string) {
  switch (changeType) {
    case 'ADDED':
      return FILL_ADDED;
    case 'DELETED':
      return FILL_DELETED;
    case 'MATCHED_VARIANT':
      return FILL_CHANGED;
    default:
      return FILL_MATCHED;
  }
}

function alignmentStatus(changeType: string, hasChanges: boolean): string {
  if (changeType === 'ADDED') return '新增';
  if (changeType === 'DELETED') return '删除';
  if (changeType === 'MATCHED_VARIANT') return '变体匹配';
  if (hasChanges) return '有变更';
  return '匹配';
}

async function executeExport(options: ExportOptions): Promise<void> {
  const startTime = Date.now();
  const progress = createProgressReporter(options.silent);
  let prisma: PrismaClient | null = null;

  try {
    // Check if output file already exists
    const outputPath = resolve(options.output);
    if (existsSync(outputPath)) {
      console.log(chalk.yellow(`Warning: Output file already exists: ${outputPath}`));
      // In a real implementation, we might want to prompt for confirmation
      // For CLI, we'll overwrite by default
    }

    // Connect to database
    prisma = await connectDatabase(options.database);

    // Verify comparison exists
    const comparison = await prisma.comparison.findUnique({
      where: { id: options.comparisonId },
      include: {
        versionA: true,
        versionB: true,
      },
    });

    if (!comparison) {
      throw new CLIError(
        `Comparison not found: ${options.comparisonId}`,
        ExitCodes.INVALID_ARGS
      );
    }

    console.log(chalk.blue(`Exporting comparison:`));
    console.log(chalk.gray(`  ${comparison.versionA.name} vs ${comparison.versionB.name}`));
    console.log(chalk.gray(`  Output: ${outputPath}`));

    // Build filter
    const where: any = {
      comparisonId: options.comparisonId,
    };

    if (options.filter && options.filter !== 'all') {
      switch (options.filter) {
        case 'added':
          where.changeType = 'ADDED';
          break;
        case 'deleted':
          where.changeType = 'DELETED';
          break;
        case 'modified':
          where.changeType = { in: ['MATCHED', 'MATCHED_VARIANT'] };
          break;
      }
    }

    // Get alignments with related data
    const alignments = await prisma.entryAlignment.findMany({
      where,
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
    });

    console.log(chalk.gray(`  Total alignments to export: ${alignments.length}`));

    // Sort alignments
    alignments.sort((a, b) => {
      switch (options.orderBy) {
        case 'headword':
          const hwA = a.entryA?.rawHeadword || a.entryB?.rawHeadword || '';
          const hwB = b.entryA?.rawHeadword || b.entryB?.rawHeadword || '';
          return hwA.localeCompare(hwB);
        case 'phonetic':
          const phA = a.entryA?.phonetic || a.entryB?.phonetic || '';
          const phB = b.entryA?.phonetic || b.entryB?.phonetic || '';
          return phA.localeCompare(phB);
        case 'change_type':
          const order = { ADDED: 0, DELETED: 1, MATCHED_VARIANT: 2, MATCHED: 3 };
          return (order[a.changeType as keyof typeof order] || 4) - (order[b.changeType as keyof typeof order] || 4);
        default:
          return 0;
      }
    });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Diffolio CLI';
    workbook.created = new Date();

    // Sheet 1: Summary
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 30 },
    ];

    const stats = {
      total: alignments.length,
      matched: alignments.filter(a => a.changeType === 'MATCHED').length,
      matchedVariant: alignments.filter(a => a.changeType === 'MATCHED_VARIANT').length,
      added: alignments.filter(a => a.changeType === 'ADDED').length,
      deleted: alignments.filter(a => a.changeType === 'DELETED').length,
    };

    summarySheet.addRows([
      { metric: 'Comparison Name', value: comparison.name },
      { metric: 'Version A', value: comparison.versionA.name },
      { metric: 'Version B', value: comparison.versionB.name },
      { metric: 'Total Alignments', value: stats.total },
      { metric: 'Matched', value: stats.matched },
      { metric: 'Matched (Variant)', value: stats.matchedVariant },
      { metric: 'Added', value: stats.added },
      { metric: 'Deleted', value: stats.deleted },
      { metric: 'Export Date', value: new Date().toISOString() },
    ]);

    // Sheet 2: Alignments
    const alignmentsSheet = workbook.addWorksheet('Alignments');
    alignmentsSheet.columns = [
      { header: 'Change Type', key: 'changeType', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Headword A', key: 'headwordA', width: 15 },
      { header: 'Phonetic A', key: 'phoneticA', width: 12 },
      { header: 'Definition A', key: 'defA', width: 40 },
      { header: 'Headword B', key: 'headwordB', width: 15 },
      { header: 'Phonetic B', key: 'phoneticB', width: 12 },
      { header: 'Definition B', key: 'defB', width: 40 },
    ];

    // Add header row styling
    alignmentsSheet.getRow(1).font = { bold: true };
    alignmentsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    progress.start(alignments.length, 'Exporting alignments...');

    for (let i = 0; i < alignments.length; i++) {
      const alignment = alignments[i];
      const hasChanges = alignment.senseDiffs.length > 0;

      // Format definitions
      const formatSenses = (senses: any[]) => {
        return senses?.map((s: any, idx: number) => {
          let text = `${s.rawNumber || idx + 1}. ${s.definition || ''}`;
          if (s.examples?.length) {
            text += ' | ' + s.examples.slice(0, 2).map((e: any) => e.content).join(' | ');
          }
          return text;
        }).join('\n') || '';
      };

      const row = alignmentsSheet.addRow({
        changeType: alignment.changeType,
        status: alignmentStatus(alignment.changeType, hasChanges),
        headwordA: alignment.entryA?.rawHeadword || '',
        phoneticA: alignment.entryA?.phonetic || '',
        defA: formatSenses(alignment.entryA?.senses),
        headwordB: alignment.entryB?.rawHeadword || '',
        phoneticB: alignment.entryB?.phonetic || '',
        defB: formatSenses(alignment.entryB?.senses),
      });

      // Apply fill color based on change type
      row.fill = getFill(alignment.changeType);

      // Set row height for multi-line cells
      row.height = 30;

      if (i % 100 === 0) {
        progress.update(i, `Exported ${i} of ${alignments.length}...`);
      }
    }

    progress.complete();

    // Sheet 3: Details (if there are sense diffs)
    const hasSenseDiffs = alignments.some(a => a.senseDiffs.length > 0);
    if (hasSenseDiffs) {
      const detailsSheet = workbook.addWorksheet('Details');
      detailsSheet.columns = [
        { header: 'Headword', key: 'headword', width: 15 },
        { header: 'Sense Change', key: 'changeType', width: 20 },
        { header: 'Definition A', key: 'defA', width: 40 },
        { header: 'Definition B', key: 'defB', width: 40 },
      ];

      detailsSheet.getRow(1).font = { bold: true };
      detailsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      for (const alignment of alignments) {
        if (alignment.senseDiffs.length === 0) continue;

        const headword = alignment.entryA?.rawHeadword || alignment.entryB?.rawHeadword || 'Unknown';

        for (const diff of alignment.senseDiffs) {
          detailsSheet.addRow({
            headword,
            changeType: diff.changeType,
            defA: diff.senseAId ? 'Present' : 'N/A',
            defB: diff.senseBId ? 'Present' : 'N/A',
          });
        }
      }
    }

    // Write workbook to file
    await workbook.xlsx.writeFile(outputPath);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(chalk.green('\n✓ Export complete!'));
    console.log(chalk.gray(`  Duration: ${duration}s`));
    console.log(chalk.gray(`  File: ${outputPath}`));
    console.log(chalk.gray(`  Alignments exported: ${alignments.length}`));

  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Export failed: ${error instanceof Error ? error.message : String(error)}`,
      ExitCodes.EXPORT_ERROR
    );
  } finally {
    if (prisma) {
      await disconnectDatabase(prisma);
    }
  }
}

export function createExportCommand(): Command {
  const command = new Command('export');

  command
    .description('Export comparison results to Excel')
    .requiredOption('-c, --comparison-id <id>', 'Comparison ID to export')
    .requiredOption('-o, --output <path>', 'Output file path (.xlsx)')
    .requiredOption('-d, --database <url>', 'Database connection URL')
    .option('--order-by <field>', 'Sort order: headword, phonetic, change_type', 'headword')
    .option('--filter <type>', 'Filter alignments: all, added, deleted, modified', 'all')
    .addHelpText('after', `
Examples:
  # Export all results
  $ diffolio export -c "comparison-id" -o ./results.xlsx -d file:./db.sqlite

  # Export with specific sort order
  $ diffolio export -c "comparison-id" -o ./results.xlsx -d file:./db.sqlite --order-by change_type

  # Export only added entries
  $ diffolio export -c "comparison-id" -o ./added.xlsx -d file:./db.sqlite --filter added

  # Export only modified entries
  $ diffolio export -c "comparison-id" -o ./modified.xlsx -d file:./db.sqlite --filter modified

Excel Output:
  - Summary sheet: Statistics and overview
  - Alignments sheet: All entry alignments with change types
  - Details sheet: Sense-level differences (if present)
    `);

  addGlobalOptions(command);

  command.action(async (options) => {
    await executeExport(options as ExportOptions);
  });

  return command;
}
