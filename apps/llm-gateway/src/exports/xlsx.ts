/**
 * XLSX Export Generator
 * Exports table, document, and sheet artifacts to XLSX format
 */

import ExcelJS from 'exceljs';

export interface TableData {
  columns: string[];
  rows: any[][];
  title?: string;
}

export interface DocumentData {
  sections?: Array<{
    heading?: string;
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    content?: string;
  }>;
  title?: string;
  content?: string;
}

export interface SheetData {
  sheets?: Array<{
    name: string;
    columns: string[];
    rows: any[][];
  }>;
  title?: string;
}

export type ExportData = TableData | DocumentData | SheetData;

/**
 * Check if data is TableData
 */
function isTableData(data: ExportData): data is TableData {
  return 'columns' in data && 'rows' in data && Array.isArray(data.columns) && Array.isArray(data.rows);
}

/**
 * Check if data is DocumentData
 */
function isDocumentData(data: ExportData): data is DocumentData {
  return 'sections' in data || ('content' in data && !('columns' in data));
}

/**
 * Check if data is SheetData
 */
function isSheetData(data: ExportData): data is SheetData {
  return 'sheets' in data && Array.isArray(data.sheets);
}

export async function generateXLSX(data: ExportData, artifactType?: 'table' | 'doc' | 'sheet'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Handle sheet artifacts (native format)
  if (artifactType === 'sheet' || isSheetData(data)) {
    const sheetData = data as SheetData;

    if (sheetData.sheets && sheetData.sheets.length > 0) {
      sheetData.sheets.forEach((sheet) => {
        const worksheet = workbook.addWorksheet(sheet.name || 'Sheet');

        // Add header row
        if (sheet.columns && sheet.columns.length > 0) {
          worksheet.addRow(sheet.columns);
          const headerRow = worksheet.getRow(1);
          headerRow.font = { bold: true };
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
          };

          // Add data rows
          if (sheet.rows) {
            sheet.rows.forEach((row) => {
              worksheet.addRow(row);
            });
          }

          // Auto-fit columns
          worksheet.columns.forEach((column) => {
            if (!column || !column.eachCell) return;
            let maxLength = 0;
            column.eachCell({ includeEmpty: false }, (cell) => {
              const cellValue = cell.value?.toString() || '';
              maxLength = Math.max(maxLength, cellValue.length);
            });
            column.width = Math.min(Math.max(maxLength + 2, 10), 50);
          });
        }
      });
    }
  }
  // Handle document artifacts (convert to single sheet with sections)
  else if (artifactType === 'doc' || isDocumentData(data)) {
    const docData = data as DocumentData;
    const worksheet = workbook.addWorksheet('Document');

    let currentRow = 1;

    // Add title if provided
    if (docData.title) {
      worksheet.mergeCells(`A${currentRow}`, `D${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = docData.title;
      worksheet.getCell(`A${currentRow}`).font = { size: 14, bold: true };
      worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;
      worksheet.addRow([]); // Empty row
      currentRow++;
    }

    // Process sections
    if (docData.sections && docData.sections.length > 0) {
      docData.sections.forEach((section) => {
        if (section.heading) {
          worksheet.mergeCells(`A${currentRow}`, `D${currentRow}`);
          const headingCell = worksheet.getCell(`A${currentRow}`);
          headingCell.value = section.heading;
          headingCell.font = { size: 12, bold: true };
          currentRow++;
        }
        if (section.content) {
          section.content.split('\n').forEach((line) => {
            if (line.trim()) {
              worksheet.mergeCells(`A${currentRow}`, `D${currentRow}`);
              worksheet.getCell(`A${currentRow}`).value = line;
              currentRow++;
            }
          });
          currentRow++; // Spacing after section
        }
      });
    } else if (docData.content) {
      // Plain text content
      docData.content.split('\n').forEach((line) => {
        if (line.trim()) {
          worksheet.mergeCells(`A${currentRow}`, `D${currentRow}`);
          worksheet.getCell(`A${currentRow}`).value = line;
          currentRow++;
        }
      });
    }

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      if (column) {
        column.width = 50;
      }
    });
  }
  // Handle table artifacts (original logic)
  else if (artifactType === 'table' || isTableData(data)) {
    let tableData: TableData;

    // Handle case where data is a raw 2D array
    if (Array.isArray(data) && Array.isArray(data[0])) {
      tableData = {
        columns: (data as string[][])[0] || [],
        rows: (data as string[][]).slice(1) || [],
      };
    } else {
      tableData = data as TableData;
    }
    
    const { columns, rows, title } = tableData;
    const worksheet = workbook.addWorksheet('Sheet1');

    let currentRow = 1;

    // Add title if provided (as merged cell)
    if (title) {
      const lastCol = String.fromCharCode(64 + Math.min(columns.length, 26));
      worksheet.mergeCells(`A${currentRow}`, `${lastCol}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = title;
      worksheet.getCell(`A${currentRow}`).font = { size: 14, bold: true };
      worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;
      worksheet.addRow([]); // Empty row after title
      currentRow++;
    }

    // Add header row
    worksheet.addRow(columns);
    const headerRow = worksheet.getRow(currentRow);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    currentRow++;

    // Add data rows
    if (rows) {
      rows.forEach((row) => {
        worksheet.addRow(row);
      });
    }

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      if (!column || !column.eachCell) return;
      let maxLength = 0;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const cellValue = cell.value?.toString() || '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 50);
    });
  } else {
    throw new Error('Unsupported data format for XLSX export');
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  if (!buffer) {
    throw new Error('Failed to generate XLSX buffer');
  }
  return Buffer.from(buffer);
}

