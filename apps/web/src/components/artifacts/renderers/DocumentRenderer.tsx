import React from "react";
import { Artifact } from "@/store/artifactStore";
import { FileText } from "lucide-react";
import { ExportButtons } from "../ExportButtons";

/**
 * Document Renderer Component
 */
export const DocumentRenderer: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const data = artifact.data as any;
  
  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-white/70" />
          <div>
            <h2 className="text-white/90 text-lg font-semibold mb-1">Document</h2>
            <p className="text-white/60 text-xs">
              {data?.sections?.length || 0} section{(data?.sections?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ExportButtons artifact={artifact} />
      </div>
      
      <div className="border border-white/10 rounded-lg p-4">
        {data?.title && (
          <h1 className="text-white/90 text-2xl font-bold mb-4">{data.title}</h1>
        )}
        {data?.sections && data.sections.length > 0 ? (
          <div className="space-y-4">
            {data.sections.map((section: any, idx: number) => (
              <div key={idx} className="space-y-2">
                {section.heading && (
                  <h2 className={`text-white/90 font-semibold ${
                    section.level === 1 ? 'text-xl' :
                    section.level === 2 ? 'text-lg' :
                    section.level === 3 ? 'text-base' : 'text-sm'
                  }`}>
                    {section.heading}
                  </h2>
                )}
                {section.content && (
                  <p className="text-white/70 text-sm whitespace-pre-wrap">{section.content}</p>
                )}
              </div>
            ))}
          </div>
        ) : data?.content ? (
          <p className="text-white/70 text-sm whitespace-pre-wrap">{data.content}</p>
        ) : (
          <div className="text-white/70 text-sm">Empty document</div>
        )}
      </div>
    </div>
  );
};

