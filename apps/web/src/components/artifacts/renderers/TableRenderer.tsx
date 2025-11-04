import React from "react";
import { TableArtifact } from "@/store/artifactStore";
import { Table as TableIcon } from "lucide-react";
import { ExportButtons } from "./ExportButtons";

/**
 * Table Renderer Component
 * Renders a table artifact with proper styling
 */
export const TableRenderer: React.FC<{ artifact: TableArtifact }> = ({ artifact }) => {
  const { data } = artifact;

  if (!data || data.length === 0) {
    return (
      <div className="text-white/70 text-sm">
        Empty table
      </div>
    );
  }

  const headers = data[0] || [];
  const rows = data.slice(1);

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <TableIcon className="w-5 h-5 text-white/70" />
          <div>
            <h2 className="text-white/90 text-lg font-semibold mb-1">Table</h2>
            <p className="text-white/60 text-xs">
              {rows.length} row{rows.length !== 1 ? 's' : ''}, {headers.length} column{headers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ExportButtons artifact={artifact} />
      </div>

      <div className="border border-white/10 rounded-lg">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left text-white/90 font-semibold text-xs uppercase tracking-wider"
                >
                  {header || `Column ${idx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                {headers.map((_, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-3 text-white/80 text-sm"
                  >
                    {row[colIdx] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

