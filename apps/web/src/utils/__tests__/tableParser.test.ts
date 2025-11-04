import { describe, test, expect } from 'vitest';
import { parseMarkdownTable, parseJsonTable, autoDetectTableFormat } from '@/utils/tableParser';

describe('tableParser', () => {
  describe('parseMarkdownTable', () => {
    test('parses simple markdown table', () => {
      const input = `| Name | Age | City |
|------|-----|------|
| John | 25  | NYC  |
| Jane | 30  | LA   |`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'NYC'],
        ['Jane', '30', 'LA'],
      ]);
    });

    test('parses table without separator row', () => {
      const input = `| Name | Age |
| John | 25  |
| Jane | 30  |`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
        ['Jane', '30'],
      ]);
    });

    test('skips separator rows', () => {
      const input = `| Name | Age |
|------|-----|
| John | 25  |
|------|-----|
| Jane | 30  |`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
        ['Jane', '30'],
      ]);
    });

    test('handles empty input', () => {
      expect(parseMarkdownTable('')).toEqual([]);
      expect(parseMarkdownTable('   ')).toEqual([]);
    });

    test('handles table with empty cells', () => {
      const input = `| Name | Age | City |
|      | 25  |      |
| Jane |     | LA   |`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age', 'City'],
        ['', '25', ''],
        ['Jane', '', 'LA'],
      ]);
    });

    test('parses table without trailing pipes', () => {
      const input = `| Language | Popularity | Year
|----------|------------|-----
| Python | 95 | 1991
| JavaScript | 92 | 1995
| TypeScript | 88 | 2012`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Language', 'Popularity', 'Year'],
        ['Python', '95', '1991'],
        ['JavaScript', '92', '1995'],
        ['TypeScript', '88', '2012'],
      ]);
      expect(result[0]?.length).toBe(3); // Ensure 3 columns, not 1
    });

    test('parses table with ragged separator', () => {
      const input = `| Name | Age | City |
|---|-----|---|
| John | 25 | NYC |
| Jane | 30 | LA |`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'NYC'],
        ['Jane', '30', 'LA'],
      ]);
      expect(result[0]?.length).toBe(3);
    });

    test('handles smart quotes in surrounding content', () => {
      const input = `Here's a "table" with smart quotes:

| Name | Age |
|------|-----|
| John | 25 |

That's the data.`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
      ]);
    });

    test('parses table completely without outer pipes', () => {
      const input = `Name | Age | City
----|-----|-----
John | 25 | NYC
Jane | 30 | LA`;

      const result = parseMarkdownTable(input);
      expect(result).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'NYC'],
        ['Jane', '30', 'LA'],
      ]);
      expect(result[0]?.length).toBe(3);
    });

    test('handles mixed pipe styles in same table', () => {
      const input = `| Language | Popularity | Year |
|---|-----|---
Python | 95 | 1991 |
| JavaScript | 92 | 1995`;

      const result = parseMarkdownTable(input);
      expect(result.length).toBeGreaterThan(0);
      // All rows should parse successfully
      expect(result[0]?.length).toBe(3);
      expect(result[1]?.length).toBe(3);
      expect(result[2]?.length).toBe(3);
    });
  });

  describe('parseJsonTable', () => {
    test('parses array of arrays', () => {
      const input = [
        ['Name', 'Age', 'City'],
        ['John', 25, 'NYC'],
        ['Jane', 30, 'LA'],
      ];

      const result = parseJsonTable(input);
      expect(result).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'NYC'],
        ['Jane', '30', 'LA'],
      ]);
    });

    test('parses array of objects', () => {
      const input = [
        { Name: 'John', Age: 25, City: 'NYC' },
        { Name: 'Jane', Age: 30, City: 'LA' },
      ];

      const result = parseJsonTable(input);
      expect(result).toEqual([
        ['Name', 'Age', 'City'],
        ['John', '25', 'NYC'],
        ['Jane', '30', 'LA'],
      ]);
    });

    test('parses object with rows property', () => {
      const input = {
        rows: [
          ['Name', 'Age'],
          ['John', '25'],
        ],
      };

      const result = parseJsonTable(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
      ]);
    });

    test('parses object with data property', () => {
      const input = {
        data: [
          ['Name', 'Age'],
          ['John', '25'],
        ],
      };

      const result = parseJsonTable(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
      ]);
    });

    test('handles null/undefined values', () => {
      const input = [
        ['Name', 'Age'],
        ['John', null],
        ['Jane', undefined],
      ];

      const result = parseJsonTable(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', ''],
        ['Jane', ''],
      ]);
    });

    test('handles empty input', () => {
      expect(parseJsonTable(null)).toEqual([]);
      expect(parseJsonTable(undefined)).toEqual([]);
      expect(parseJsonTable([])).toEqual([]);
    });
  });

  describe('autoDetectTableFormat', () => {
    test('detects markdown table', () => {
      const input = `Here is a table:

| Name | Age | City |
|------|-----|------|
| John | 25  | NYC  |
| Jane | 30  | LA   |

That's the data.`;

      const result = autoDetectTableFormat(input);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(['Name', 'Age', 'City']);
    });

    test('detects JSON table in code block', () => {
      const input = `Here is the data:

\`\`\`json
[
  ["Name", "Age"],
  ["John", "25"],
  ["Jane", "30"]
]
\`\`\`

That's it.`;

      const result = autoDetectTableFormat(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
        ['Jane', '30'],
      ]);
    });

    test('detects JSON table as array of objects', () => {
      const input = `\`\`\`json
[
  {"Name": "John", "Age": 25},
  {"Name": "Jane", "Age": 30}
]
\`\`\``;

      const result = autoDetectTableFormat(input);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('Name');
      expect(result[0]).toContain('Age');
    });

    test('prefers markdown over JSON when both present', () => {
      const input = `| Name | Age |
|------|-----|
| John | 25  |

\`\`\`json
[["X", "Y"]]
\`\`\``;

      const result = autoDetectTableFormat(input);
      expect(result).toEqual([
        ['Name', 'Age'],
        ['John', '25'],
      ]);
    });

    test('extracts table from middle of text', () => {
      const input = `Some text before.

| Name | Age |
| John | 25  |

Some text after.`;

      const result = autoDetectTableFormat(input);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(['Name', 'Age']);
    });

    test('handles empty input', () => {
      expect(autoDetectTableFormat('')).toEqual([]);
      expect(autoDetectTableFormat('   ')).toEqual([]);
    });

    test('returns empty array when no table found', () => {
      const input = 'This is just plain text with no table data.';
      expect(autoDetectTableFormat(input)).toEqual([]);
    });
  });
});

