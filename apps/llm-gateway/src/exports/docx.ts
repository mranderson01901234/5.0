/**
 * DOCX Export Generator
 * Exports table, document, and sheet artifacts to DOCX format
 */

import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, HeadingLevel } from 'docx';

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
  content?: string; // Plain text content if sections not provided
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

export async function generateDOCX(data: ExportData, artifactType?: 'table' | 'doc' | 'sheet'): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Handle document artifacts
  if (artifactType === 'doc' || isDocumentData(data)) {
    const docData = data as DocumentData;

    // Add title if provided
    if (docData.title) {
      children.push(
        new Paragraph({
          text: docData.title,
          heading: HeadingLevel.HEADING_1,
          alignment: 'center',
          spacing: { after: 400 },
        })
      );
    }

    // Process sections if provided
    if (docData.sections && docData.sections.length > 0) {
      docData.sections.forEach((section) => {
        if (section.heading) {
          const headingLevel = section.level 
            ? (section.level === 1 ? HeadingLevel.HEADING_1 :
               section.level === 2 ? HeadingLevel.HEADING_2 :
               section.level === 3 ? HeadingLevel.HEADING_3 :
               section.level === 4 ? HeadingLevel.HEADING_4 :
               section.level === 5 ? HeadingLevel.HEADING_5 :
               HeadingLevel.HEADING_6)
            : HeadingLevel.HEADING_1;
          children.push(
            new Paragraph({
              text: section.heading,
              heading: headingLevel,
              spacing: { before: 200, after: 200 },
            })
          );
        }
        if (section.content) {
          // Split content by lines and create paragraphs
          section.content.split('\n').forEach((line) => {
            if (line.trim()) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: line })],
                  spacing: { after: 120 },
                })
              );
            }
          });
        }
      });
    } else if (docData.content) {
      // Plain text content
      docData.content.split('\n').forEach((line) => {
        if (line.trim()) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: line })],
              spacing: { after: 120 },
            })
          );
        }
      });
    }
  }
  // Handle sheet artifacts (convert to table format)
  else if (artifactType === 'sheet' || isSheetData(data)) {
    const sheetData = data as SheetData;

    // Add title if provided
    if (sheetData.title) {
      children.push(
        new Paragraph({
          text: sheetData.title,
          heading: HeadingLevel.HEADING_1,
          alignment: 'center',
          spacing: { after: 400 },
        })
      );
    }

    // Process each sheet
    if (sheetData.sheets && Array.isArray(sheetData.sheets) && sheetData.sheets.length > 0) {
      sheetData.sheets.forEach((sheet, sheetIdx) => {
        // Add sheet name as heading
        if (sheet.name) {
          children.push(
            new Paragraph({
              text: sheet.name,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 200 },
            })
          );
        }

        // Create table for this sheet
        if (sheet.columns && sheet.columns.length > 0 && sheet.rows) {
          const tableRows: TableRow[] = [];

          // Header row
          const headerCells = sheet.columns.map(
            (col) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: col || '', bold: true })],
                  }),
                ],
              })
          );
          tableRows.push(new TableRow({ children: headerCells }));

          // Data rows
          sheet.rows.forEach((row) => {
            const cells = sheet.columns.map((_, idx) => {
              const cellValue = row[idx]?.toString() || '';
              return new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: cellValue })],
                  }),
                ],
              });
            });
            tableRows.push(new TableRow({ children: cells }));
          });

          // Create table with equal column widths
          const colWidth = 100 / sheet.columns.length;
          const table = new Table({
            rows: tableRows,
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            columnWidths: sheet.columns.map(() => colWidth),
          });

          children.push(table);

          // Add spacing between sheets (except last)
          if (sheetData.sheets && sheetIdx < sheetData.sheets.length - 1) {
            children.push(
              new Paragraph({
                text: '',
                spacing: { after: 400 },
              })
            );
          }
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
      children.push(
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          alignment: 'center',
          spacing: { after: 400 },
        })
      );
    }

    // Create table
    const tableRows: TableRow[] = [];

    // Header row
    const headerCells = columns.map(
      (col) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: col || '', bold: true })],
            }),
          ],
        })
    );
    tableRows.push(new TableRow({ children: headerCells }));

    // Data rows
    rows.forEach((row) => {
      const cells = columns.map((_, idx) => {
        const cellValue = row[idx]?.toString() || '';
        return new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: cellValue })],
            }),
          ],
        });
      });
      tableRows.push(new TableRow({ children: cells }));
    });

    // Create table with equal column widths
    const colWidth = 100 / columns.length;
    const table = new Table({
      rows: tableRows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      columnWidths: columns.map(() => colWidth),
    });

    children.push(table);
  } else {
    throw new Error('Unsupported data format for DOCX export');
  }

  // Create document
  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

