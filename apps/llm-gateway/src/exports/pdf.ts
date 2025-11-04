/**
 * PDF Export Generator
 * Exports table, document, and sheet artifacts to PDF format
 */

import PDFDocument from 'pdfkit';

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

export async function generatePDF(data: ExportData, artifactType?: 'table' | 'doc' | 'sheet'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // Helper to check if we need a new page
      const checkPageBreak = (requiredHeight: number = 30): boolean => {
        if (doc.y + requiredHeight > doc.page.height - 50) {
          doc.addPage();
          doc.y = 50;
          return true;
        }
        return false;
      };

      // Handle document artifacts
      if (artifactType === 'doc' || isDocumentData(data)) {
        const docData = data as DocumentData;

        // Add title if provided
        if (docData.title) {
          doc.fontSize(18).font('Helvetica-Bold').text(docData.title, { align: 'center' });
          doc.moveDown(1);
        }

        // Process sections if provided
        if (docData.sections && docData.sections.length > 0) {
          docData.sections.forEach((section) => {
            checkPageBreak(40);
            
            if (section.heading) {
              const fontSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
              doc.fontSize(fontSize).font('Helvetica-Bold').text(section.heading);
              doc.moveDown(0.5);
            }
            
            if (section.content) {
              doc.font('Helvetica').fontSize(10);
              section.content.split('\n').forEach((line) => {
                if (line.trim()) {
                  checkPageBreak(20);
                  doc.text(line, { align: 'left' });
                  doc.moveDown(0.3);
                }
              });
              doc.moveDown(0.5);
            }
          });
        } else if (docData.content) {
          // Plain text content
          doc.font('Helvetica').fontSize(10);
          docData.content.split('\n').forEach((line) => {
            if (line.trim()) {
              checkPageBreak(20);
              doc.text(line, { align: 'left' });
              doc.moveDown(0.3);
            }
          });
        }
      }
      // Handle sheet artifacts (convert to tables)
      else if (artifactType === 'sheet' || isSheetData(data)) {
        const sheetData = data as SheetData;

        // Add title if provided
        if (sheetData.title) {
          doc.fontSize(18).font('Helvetica-Bold').text(sheetData.title, { align: 'center' });
          doc.moveDown(1);
        }

        // Process each sheet
        if (sheetData.sheets && sheetData.sheets.length > 0) {
          sheetData.sheets.forEach((sheet, sheetIdx) => {
            checkPageBreak(60);

            // Add sheet name as heading
            if (sheet.name) {
              doc.fontSize(14).font('Helvetica-Bold').text(sheet.name);
              doc.moveDown(0.5);
            }

            // Create table for this sheet
            if (sheet.columns && sheet.columns.length > 0 && sheet.rows) {
              const pageWidth = doc.page.width - 100;
              const colWidth = pageWidth / sheet.columns.length;

              // Draw header row
              doc.fontSize(12).font('Helvetica-Bold');
              let yPos = doc.y;
              sheet.columns.forEach((col, idx) => {
                doc.text(col || `Column ${idx + 1}`, 50 + idx * colWidth, yPos, {
                  width: colWidth - 10,
                  align: 'left',
                });
              });

              // Draw separator line
              yPos += 20;
              doc.moveTo(50, yPos).lineTo(pageWidth + 50, yPos).stroke();

              // Draw data rows
              doc.font('Helvetica').fontSize(10);
              sheet.rows.forEach((row) => {
                yPos += 20;
                if (yPos > doc.page.height - 50) {
                  doc.addPage();
                  yPos = 50;
                }

                sheet.columns.forEach((_, idx) => {
                  const cellValue = row[idx]?.toString() || '';
                  doc.text(cellValue, 50 + idx * colWidth, yPos, {
                    width: colWidth - 10,
                    align: 'left',
                  });
                });
              });

              doc.moveDown(1); // Spacing between sheets
            }
          });
        }
      }
      // Handle table artifacts (original logic)
      else if (artifactType === 'table' || isTableData(data)) {
        const tableData = data as TableData;
        const { columns, rows, title } = tableData;

        // Add title if provided
        if (title) {
          doc.fontSize(18).text(title, { align: 'center' });
          doc.moveDown(0.5);
        }

        if (columns.length === 0) {
          doc.fontSize(12).text('No data available', { align: 'center' });
          doc.end();
          return;
        }

        // Calculate column widths
        const pageWidth = doc.page.width - 100; // margins
        const colWidth = pageWidth / columns.length;

        // Draw header row
        doc.fontSize(12).font('Helvetica-Bold');
        let yPos = doc.y;
        columns.forEach((col, idx) => {
          doc.text(col || `Column ${idx + 1}`, 50 + idx * colWidth, yPos, {
            width: colWidth - 10,
            align: 'left',
          });
        });

        // Draw separator line
        yPos += 20;
        doc.moveTo(50, yPos).lineTo(pageWidth + 50, yPos).stroke();

        // Draw data rows
        doc.font('Helvetica').fontSize(10);
        rows.forEach((row) => {
          yPos += 20;
          // Check if we need a new page
          if (yPos > doc.page.height - 50) {
            doc.addPage();
            yPos = 50;
          }

          columns.forEach((_, idx) => {
            const cellValue = row[idx]?.toString() || '';
            doc.text(cellValue, 50 + idx * colWidth, yPos, {
              width: colWidth - 10,
              align: 'left',
            });
          });
        });
      } else {
        reject(new Error('Unsupported data format for PDF export'));
        return;
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

