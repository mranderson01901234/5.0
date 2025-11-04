import React from "react";
import { Artifact } from "@/store/artifactStore";
import { Sheet } from "lucide-react";
import { ExportButtons } from "../ExportButtons";

/**
 * Sheet Renderer Component
 */
export const SheetRenderer: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const data = artifact.data as any;
  
  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sheet className="w-5 h-5 text-white/70" />
          <div>
            <h2 className="text-white/90 text-lg font-semibold mb-1">Spreadsheet</h2>
            <p className="text-white/60 text-xs">
              {data?.sheets?.length || 0} sheet{(data?.sheets?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ExportButtons artifact={artifact} />
      </div>
      
      <div className="border border-white/10 rounded-lg p-4">
        {data?.title && (
          <h1 className="text-white/90 text-xl font-bold mb-4">{data.title}</h1>
        )}
        {data?.sheets && data.sheets.length > 0 ? (
          <div className="space-y-6">
            {data.sheets.map((sheet: any, sheetIdx: number) => (
              <div key={sheetIdx} className="space-y-2">
                <h3 className="text-white/90 font-semibold text-base">{sheet.name || `Sheet ${sheetIdx + 1}`}</h3>
                {sheet.columns && sheet.columns.length > 0 && sheet.rows ? (
                  <div>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                          {sheet.columns.map((col: string, idx: number) => (
                            <th
                              key={idx}
                              className="px-4 py-3 text-left text-white/90 font-semibold text-xs uppercase tracking-wider"
                            >
                              {col || `Column ${idx + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.slice(0, 50).map((row: any[], rowIdx: number) => (
                          <tr
                            key={rowIdx}
                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                          >
                            {sheet.columns.map((_: any, colIdx: number) => (
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
                    {sheet.rows.length > 50 && (
                      <p className="text-white/60 text-xs mt-2">
                        Showing first 50 rows of {sheet.rows.length}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-white/60 text-sm">Empty sheet</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-white/70 text-sm">Empty spreadsheet</div>
        )}
      </div>
    </div>
  );
};

