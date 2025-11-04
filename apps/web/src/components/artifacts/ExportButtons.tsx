import React from "react";
import { useExportState } from "@/hooks/useExportState";
import { Artifact } from "@/store/artifactStore";
import { Download, Loader2, FileText, Sheet } from "lucide-react";

/**
 * Export Button Component - Reusable for all artifact types
 */
export const ExportButtons: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const { handleExport, getButtonText, isExporting } = useExportState(artifact);
  
  // Determine which formats are supported for each artifact type
  const getSupportedFormats = (): Array<"pdf" | "docx" | "xlsx"> => {
    switch (artifact.type) {
      case "table":
        return ["pdf", "docx", "xlsx"];
      case "doc":
        return ["pdf", "docx"]; // Documents can export as PDF or DOCX
      case "sheet":
        return ["pdf", "xlsx"]; // Sheets can export as PDF or XLSX
      default:
        return ["pdf", "docx", "xlsx"];
    }
  };

  const supportedFormats = getSupportedFormats();

  return (
    <div className="flex gap-2">
      {supportedFormats.includes("pdf") && (
        <button
          onClick={() => handleExport('pdf')}
          disabled={isExporting('pdf')}
          className="px-3 py-1.5 text-xs glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as PDF"
        >
          {isExporting('pdf') ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {getButtonText('pdf')}
        </button>
      )}
      {supportedFormats.includes("docx") && (
        <button
          onClick={() => handleExport('docx')}
          disabled={isExporting('docx')}
          className="px-3 py-1.5 text-xs glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as DOCX"
        >
          {isExporting('docx') ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
          {getButtonText('docx')}
        </button>
      )}
      {supportedFormats.includes("xlsx") && (
        <button
          onClick={() => handleExport('xlsx')}
          disabled={isExporting('xlsx')}
          className="px-3 py-1.5 text-xs glass-light text-white/70 hover:text-white rounded-md transition-colors duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export as XLSX"
        >
          {isExporting('xlsx') ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sheet className="w-3.5 h-3.5" />
          )}
          {getButtonText('xlsx')}
        </button>
      )}
    </div>
  );
};

