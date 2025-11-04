/**
 * Export Generator Factory
 * Routes to appropriate export generator based on format
 */

import { generatePDF, type ExportData as PDFExportData } from './pdf.js';
import { generateDOCX, type ExportData as DOCXExportData } from './docx.js';
import { generateXLSX, type ExportData as XLSXExportData } from './xlsx.js';

export type ExportFormat = 'pdf' | 'docx' | 'xlsx';
export type ArtifactType = 'table' | 'doc' | 'sheet';

// Union type for all export data
export type ExportData = PDFExportData | DOCXExportData | XLSXExportData;

export async function generateExport(
  data: ExportData,
  format: ExportFormat,
  artifactType?: ArtifactType
): Promise<Buffer> {
  switch (format) {
    case 'pdf':
      return generatePDF(data, artifactType);
    case 'docx':
      return generateDOCX(data, artifactType);
    case 'xlsx':
      return generateXLSX(data, artifactType);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

export { generatePDF } from './pdf.js';
export { generateDOCX } from './docx.js';
export { generateXLSX } from './xlsx.js';
export type { TableData } from './pdf.js';
export type { DocumentData, SheetData } from './docx.js';

