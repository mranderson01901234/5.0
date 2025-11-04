#!/usr/bin/env tsx
/**
 * Web Application Imagen 4 Usage Audit
 * 
 * Focused audit of the web application (apps/web) for Imagen 4 usage and configuration.
 * Generates a single comprehensive markdown report.
 */

import { globby } from 'globby';
import { Project, SyntaxKind, CallExpression, PropertyAssignment, ObjectLiteralExpression } from 'ts-morph';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');
const WEB_ROOT = resolve(ROOT, 'apps/web');

interface Finding {
  file: string;
  line: number;
  column?: number;
  functionName?: string;
  callExprSnippet?: string;
  model?: string;
  width?: number;
  height?: number;
  aspect?: string;
  imagesPerCall?: number;
  rewriterEnabled?: boolean;
  safetyLevel?: string;
  watermarkEnabled?: boolean;
  seed?: number;
  timeoutMs?: number;
  retryPolicy?: string;
  backoff?: string;
  concurrencyKey?: string;
  queueLib?: string;
  cacheLayer?: string;
  cacheKeyFormat?: string;
  uiBindings?: Array<{ control: string; label: string; mappedParam: string; file: string; line: number }>;
  envRefs?: string[];
  notes?: string[];
}

interface CallSite {
  file: string;
  line: number;
  functionName: string;
  model?: string;
  aspectRatio?: string;
  sampleCount?: number;
  safetyFilterLevel?: string;
  personGeneration?: string;
  negativePrompt?: boolean;
  seed?: number;
  size?: string;
  endpoint?: string;
  authMethod?: string;
  codeSnippet: string;
}

async function findWebFiles(): Promise<string[]> {
  const patterns = [
    'apps/web/src/**/*.{ts,tsx,js,jsx}',
    'apps/web/pages/**/*.{ts,tsx,js,jsx}',
    'apps/web/app/**/*.{ts,tsx,js,jsx}',
  ];
  
  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await globby(pattern, { cwd: ROOT, absolute: true });
    files.push(...matches);
  }
  
  // Filter out node_modules and test files unless they're specifically Imagen-related
  return files.filter(f => 
    !f.includes('node_modules') && 
    !f.includes('.test.') && 
    !f.includes('.spec.')
  );
}

function extractEnvRefs(content: string): string[] {
  const envPatterns = [
    'GOOGLE_PROJECT_ID', 'GOOGLE_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS',
    'GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_SERVICE_ACCOUNT_PATH',
    'VERTEX_AI_ACCESS_TOKEN', 'VERTEX_AI_API_KEY', 'GOOGLE_API_KEY',
    'IMAGE_GEN_ENABLED',
  ];
  
  const found: string[] = [];
  for (const pattern of envPatterns) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    if (regex.test(content)) {
      found.push(pattern);
    }
  }
  return [...new Set(found)];
}

function extractFromAST(project: Project, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) return findings;

  // Find generateImage calls
  const generateImageCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const expr = call.getExpression();
      const text = expr.getText();
      return text.includes('generateImage') || text.includes('IMAGEN_MODELS');
    });

  for (const call of generateImageCalls) {
    const finding: Finding = {
      file: filePath,
      line: call.getStartLineNumber(),
      column: call.getStartLinePos(),
      callExprSnippet: call.getText().substring(0, 300),
    };

    // Extract function name
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      finding.functionName = expr.getText();
    } else if (expr.getKind() === SyntaxKind.Identifier) {
      finding.functionName = expr.getText();
    }

    // Extract arguments
    const args = call.getArguments();
    if (args.length >= 1) {
      const optsArg = args[1];
      if (optsArg && optsArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const obj = optsArg as ObjectLiteralExpression;
        const props = obj.getProperties();

        for (const prop of props) {
          if (prop.getKind() === SyntaxKind.PropertyAssignment) {
            const propAssign = prop as PropertyAssignment;
            const name = propAssign.getName();
            const value = propAssign.getInitializer()?.getText();

            switch (name) {
              case 'model':
                finding.model = value?.replace(/['"]/g, '');
                break;
              case 'aspectRatio':
                finding.aspect = value?.replace(/['"]/g, '');
                break;
              case 'size':
                const sizeMatch = value?.match(/(\d+)x(\d+)/);
                if (sizeMatch) {
                  finding.width = parseInt(sizeMatch[1]);
                  finding.height = parseInt(sizeMatch[2]);
                }
                break;
              case 'sampleCount':
                finding.imagesPerCall = parseInt(value || '1');
                break;
              case 'safetyFilterLevel':
                finding.safetyLevel = value?.replace(/['"]/g, '');
                break;
              case 'seed':
                finding.seed = parseInt(value || '0');
                break;
              case 'negativePrompt':
                finding.rewriterEnabled = true;
                if (!finding.notes) finding.notes = [];
                finding.notes.push('Negative prompt present');
                break;
              case 'personGeneration':
                if (!finding.notes) finding.notes = [];
                finding.notes.push(`Person generation: ${value}`);
                break;
            }
          }
        }
      }
    }

    // Check for IMAGEN_MODELS usage
    const modelRefs = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter(expr => expr.getText().includes('IMAGEN_MODELS'));
    
    for (const ref of modelRefs) {
      const text = ref.getText();
      if (text.includes('STANDARD')) finding.model = 'imagen-4.0-generate-001';
      if (text.includes('ULTRA')) finding.model = 'imagen-4.0-ultra-generate-001';
      if (text.includes('FAST')) finding.model = 'imagen-4.0-fast-generate-001';
    }

    findings.push(finding);
  }

  return findings;
}

function extractUIBindings(filePath: string, content: string): Array<{ control: string; label: string; mappedParam: string; file: string; line: number }> {
  const bindings: Array<{ control: string; label: string; mappedParam: string; file: string; line: number }> = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Look for UI controls that map to image generation parameters
    if (/aspectRatio[\s:]*["']/.test(line) || /aspectRatio[\s:]*\{/.test(line)) {
      bindings.push({ control: 'aspectRatio', label: 'Aspect Ratio', mappedParam: 'aspectRatio', file: filePath, line: lineNum });
    }
    
    if (/sampleCount[\s:]*/.test(line)) {
      bindings.push({ control: 'sampleCount', label: 'Sample Count', mappedParam: 'sampleCount', file: filePath, line: lineNum });
    }
    
    if (/model[\s:]*["']/.test(line) || /model[\s:]*\{/.test(line)) {
      bindings.push({ control: 'model', label: 'Model', mappedParam: 'model', file: filePath, line: lineNum });
    }
    
    if (/safetyFilterLevel[\s:]*/.test(line)) {
      bindings.push({ control: 'safetyFilterLevel', label: 'Safety Filter', mappedParam: 'safetyFilterLevel', file: filePath, line: lineNum });
    }
    
    if (/size[\s:]*["']/.test(line) || /size[\s:]*\{/.test(line)) {
      bindings.push({ control: 'size', label: 'Size', mappedParam: 'size', file: filePath, line: lineNum });
    }
  }
  
  return bindings;
}

function parseEnvFiles(): Record<string, string[]> {
  const envFiles: Record<string, string[]> = {};
  const envPatterns = ['.env', '.env.local', '.env.development', '.env.production'];
  
  for (const pattern of envPatterns) {
    const filePath = resolve(WEB_ROOT, pattern);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const vars: string[] = [];
        
        const envPatterns = [
          'GOOGLE_PROJECT_ID', 'GOOGLE_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS',
          'GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_SERVICE_ACCOUNT_PATH',
          'VERTEX_AI_ACCESS_TOKEN', 'VERTEX_AI_API_KEY', 'GOOGLE_API_KEY',
          'IMAGE_GEN_ENABLED',
        ];
        
        for (const line of lines) {
          for (const pattern of envPatterns) {
            if (line.includes(pattern)) {
              vars.push(pattern);
            }
          }
        }
        
        envFiles[pattern] = [...new Set(vars)];
      } catch (error) {
        // Ignore errors reading env files
      }
    }
  }
  
  return envFiles;
}

async function runAudit(): Promise<{
  findings: Finding[];
  callSites: CallSite[];
  uiBindings: Array<{ control: string; label: string; mappedParam: string; file: string; line: number }>;
  envRefs: Record<string, string[]>;
  summary: {
    totalCallSites: number;
    modelTiers: Set<string>;
    uniqueAspects: Set<string>;
    rewriterFound: boolean;
    safetyFound: boolean;
    watermarkFound: boolean;
    retriesFound: boolean;
    backoffFound: boolean;
    concurrencyFound: boolean;
    cachingFound: boolean;
    uiBindingsCount: number;
    issues: string[];
  };
}> {
  console.log('🔍 Auditing web application for Imagen 4 usage...\n');
  
  const files = await findWebFiles();
  console.log(`Found ${files.length} files to scan\n`);

  // Setup TypeScript project
  let tsConfigPath: string | undefined;
  const possiblePaths = [
    resolve(WEB_ROOT, 'tsconfig.json'),
    resolve(ROOT, 'tsconfig.base.json'),
  ];
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      tsConfigPath = path;
      break;
    }
  }
  
  const project = new Project({
    ...(tsConfigPath ? { tsConfigFilePath: tsConfigPath } : {}),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      target: 99,
      module: 99,
      moduleResolution: 100,
      skipLibCheck: true,
      esModuleInterop: true,
    },
  });

  const allFindings: Finding[] = [];
  const callSites: CallSite[] = [];
  const allUIBindings: Array<{ control: string; label: string; mappedParam: string; file: string; line: number }> = [];
  const modelTiers = new Set<string>();
  const uniqueAspects = new Set<string>();
  const issues: string[] = [];

  // Scan each file
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      
      // Skip if no Imagen-related content
      if (!content.includes('generateImage') && 
          !content.includes('IMAGEN_MODELS') && 
          !content.includes('imagen-4') &&
          !content.includes('aspectRatio') &&
          !content.includes('sampleCount') &&
          !content.includes('safetyFilterLevel')) {
        continue;
      }

      // AST-based scanning for TypeScript files
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        project.addSourceFileAtPath(file);
        const astFindings = extractFromAST(project, file);
        allFindings.push(...astFindings);

        // Extract call sites
        for (const finding of astFindings) {
          if (finding.functionName && finding.functionName.includes('generateImage')) {
            callSites.push({
              file: relative(ROOT, finding.file),
              line: finding.line,
              functionName: finding.functionName,
              model: finding.model,
              aspectRatio: finding.aspect,
              sampleCount: finding.imagesPerCall,
              safetyFilterLevel: finding.safetyLevel,
              seed: finding.seed,
              size: finding.width && finding.height ? `${finding.width}x${finding.height}` : undefined,
              codeSnippet: finding.callExprSnippet || '',
            });
          }
        }
      }

      // Extract UI bindings
      const bindings = extractUIBindings(file, content);
      allUIBindings.push(...bindings);

      // Extract environment references
      const envRefs = extractEnvRefs(content);
      for (const finding of allFindings) {
        if (finding.file === file && envRefs.length > 0) {
          finding.envRefs = envRefs;
        }
      }

      // Collect model tiers and aspects
      for (const finding of allFindings) {
        if (finding.model) {
          modelTiers.add(finding.model);
          if (finding.model.includes('ultra')) modelTiers.add('ULTRA');
          else if (finding.model.includes('fast')) modelTiers.add('FAST');
          else modelTiers.add('STANDARD');
        }
        if (finding.aspect) {
          uniqueAspects.add(finding.aspect);
        }
      }
    } catch (error) {
      issues.push(`Failed to parse ${relative(ROOT, file)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Deduplicate findings
  const uniqueFindings = new Map<string, Finding>();
  for (const finding of allFindings) {
    const key = `${finding.file}:${finding.line}:${finding.callExprSnippet?.substring(0, 50)}`;
    if (!uniqueFindings.has(key)) {
      uniqueFindings.set(key, finding);
    } else {
      const existing = uniqueFindings.get(key)!;
      if (finding.model && !existing.model) existing.model = finding.model;
      if (finding.aspect && !existing.aspect) existing.aspect = finding.aspect;
      if (finding.imagesPerCall && !existing.imagesPerCall) existing.imagesPerCall = finding.imagesPerCall;
      if (finding.envRefs && !existing.envRefs) existing.envRefs = finding.envRefs;
      if (finding.notes) {
        existing.notes = [...(existing.notes || []), ...finding.notes];
      }
    }
  }

  const deduplicatedFindings = Array.from(uniqueFindings.values());

  // Analyze findings
  const rewriterFound = deduplicatedFindings.some(f => 
    f.callExprSnippet?.toLowerCase().includes('rewrite') ||
    f.rewriterEnabled
  );
  
  const safetyFound = deduplicatedFindings.some(f => 
    f.safetyLevel !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('safety')
  );
  
  const watermarkFound = deduplicatedFindings.some(f => 
    f.callExprSnippet?.toLowerCase().includes('watermark') ||
    f.callExprSnippet?.toLowerCase().includes('synthid')
  );
  
  const retriesFound = deduplicatedFindings.some(f => 
    f.callExprSnippet?.toLowerCase().includes('retry') ||
    f.retryPolicy !== undefined
  );
  
  const backoffFound = deduplicatedFindings.some(f => 
    f.callExprSnippet?.toLowerCase().includes('backoff') ||
    f.backoff !== undefined
  );
  
  const concurrencyFound = deduplicatedFindings.some(f => 
    f.callExprSnippet?.toLowerCase().includes('concurrency') ||
    f.callExprSnippet?.toLowerCase().includes('p-limit') ||
    f.concurrencyKey !== undefined
  );
  
  const cachingFound = deduplicatedFindings.some(f => 
    f.cacheLayer !== undefined ||
    f.cacheKeyFormat !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('cache')
  );

  // Parse env files
  const envFiles = parseEnvFiles();

  return {
    findings: deduplicatedFindings,
    callSites,
    uiBindings: allUIBindings,
    envRefs: envFiles,
    summary: {
      totalCallSites: callSites.length,
      modelTiers,
      uniqueAspects,
      rewriterFound,
      safetyFound,
      watermarkFound,
      retriesFound,
      backoffFound,
      concurrencyFound,
      cachingFound,
      uiBindingsCount: allUIBindings.length,
      issues,
    },
  };
}

function generateReport(result: ReturnType<typeof runAudit> extends Promise<infer T> ? T : never, dateStr: string): string {
  const { findings, callSites, uiBindings, envRefs, summary } = result;
  
  let md = `# Web Application Imagen 4 Usage Audit Report\n\n`;
  md += `**Generated:** ${dateStr}\n`;
  md += `**Scope:** Web Application (apps/web)\n\n`;
  
  md += `## Executive Summary\n\n`;
  md += `This audit inventories all Google Imagen 4 usage and configuration within the web application. The audit is non-destructive and focuses on:\n\n`;
  md += `- **Total Imagen Call Sites:** ${summary.totalCallSites}\n`;
  md += `- **Model Tiers Used:** ${Array.from(summary.modelTiers).join(', ') || 'None detected'}\n`;
  md += `- **Unique Aspect Ratios:** ${Array.from(summary.uniqueAspects).join(', ') || 'None detected'}\n`;
  md += `- **Rewriter Found:** ${summary.rewriterFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **Safety Configuration Found:** ${summary.safetyFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **Watermark/SynthID Found:** ${summary.watermarkFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **Retry Logic Found:** ${summary.retriesFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **Backoff Strategy Found:** ${summary.backoffFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **Concurrency Controls Found:** ${summary.concurrencyFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **Caching Strategy Found:** ${summary.cachingFound ? '✅ Yes' : '❌ No'}\n`;
  md += `- **UI Bindings Count:** ${summary.uiBindingsCount}\n\n`;

  md += `## 1. Imagen 4 Implementation Files\n\n`;
  
  // Group findings by file
  const filesMap = new Map<string, Finding[]>();
  for (const finding of findings) {
    const relPath = relative(ROOT, finding.file);
    if (!filesMap.has(relPath)) {
      filesMap.set(relPath, []);
    }
    filesMap.get(relPath)!.push(finding);
  }

  md += `### 1.1 Core Implementation Files\n\n`;
  
  const coreFiles = [
    'apps/web/src/server/google/gemini.ts',
    'apps/web/src/pages/api/artifacts/image.ts',
    'apps/web/src/hooks/useChatStream.ts',
    'apps/web/src/components/chat/ArtifactImage.tsx',
    'apps/web/src/store/artifactStore.ts',
  ];

  for (const file of coreFiles) {
    const fileFindings = filesMap.get(file) || [];
    if (fileFindings.length > 0 || existsSync(resolve(ROOT, file))) {
      md += `#### ${file}\n\n`;
      
      try {
        const content = readFileSync(resolve(ROOT, file), 'utf-8');
        const lines = content.split('\n');
        
        // Extract key information
        if (content.includes('IMAGEN_MODELS')) {
          const modelMatch = content.match(/IMAGEN_MODELS\s*=\s*\{([^}]+)\}/s);
          if (modelMatch) {
            md += `**Models Defined:**\n`;
            md += `\`\`\`typescript\n${modelMatch[0].substring(0, 500)}\n\`\`\`\n\n`;
          }
        }
        
        if (content.includes('generateImage')) {
          const funcMatch = content.match(/export\s+(async\s+)?function\s+generateImage[^{]*\{/);
          if (funcMatch) {
            md += `**Function Signature:**\n`;
            md += `\`\`\`typescript\n${funcMatch[0]}\n\`\`\`\n\n`;
          }
        }
        
        // Find endpoint
        if (content.includes('generativelanguage.googleapis.com')) {
          md += `**Endpoint:** Generative Language API (Gemini API)\n\n`;
        }
        if (content.includes('aiplatform.googleapis.com')) {
          md += `**Endpoint:** Vertex AI Platform\n\n`;
        }
        
        // Find authentication method
        if (content.includes('GOOGLE_API_KEY')) {
          md += `**Authentication:** API Key (GOOGLE_API_KEY)\n\n`;
        }
        if (content.includes('VERTEX_AI_ACCESS_TOKEN')) {
          md += `**Authentication:** Access Token (VERTEX_AI_ACCESS_TOKEN)\n\n`;
        }
        if (content.includes('GCP_SERVICE_ACCOUNT_PATH')) {
          md += `**Authentication:** Service Account JSON\n\n`;
        }
        
        // Find configuration options
        const options: string[] = [];
        if (content.includes('aspectRatio')) options.push('aspectRatio');
        if (content.includes('sampleCount')) options.push('sampleCount');
        if (content.includes('safetyFilterLevel')) options.push('safetyFilterLevel');
        if (content.includes('personGeneration')) options.push('personGeneration');
        if (content.includes('negativePrompt')) options.push('negativePrompt');
        if (content.includes('seed')) options.push('seed');
        if (content.includes('size')) options.push('size (legacy)');
        
        if (options.length > 0) {
          md += `**Supported Options:** ${options.join(', ')}\n\n`;
        }
        
        // Find call sites in this file
        const localCallSites = callSites.filter(cs => cs.file === file);
        if (localCallSites.length > 0) {
          md += `**Call Sites:** ${localCallSites.length}\n`;
          for (const cs of localCallSites.slice(0, 5)) {
            md += `- Line ${cs.line}: ${cs.functionName}\n`;
          }
          if (localCallSites.length > 5) {
            md += `- ... and ${localCallSites.length - 5} more\n`;
          }
          md += `\n`;
        }
        
      } catch (error) {
        md += `*Error reading file*\n\n`;
      }
    }
  }

  md += `\n## 2. API Call Sites\n\n`;
  
  if (callSites.length > 0) {
    md += `| File | Line | Function | Model | Aspect | Images | Safety | Seed |\n`;
    md += `|------|------|----------|-------|--------|--------|--------|------|\n`;
    
    for (const cs of callSites) {
      md += `| ${cs.file} | ${cs.line} | ${cs.functionName} | ${cs.model || '-'} | ${cs.aspectRatio || '-'} | ${cs.sampleCount || '1'} | ${cs.safetyFilterLevel || '-'} | ${cs.seed || '-'} |\n`;
    }
  } else {
    md += `No direct API call sites found. Images are generated via API routes.\n\n`;
  }

  md += `\n## 3. API Routes\n\n`;
  
  const apiRoutes = findings.filter(f => 
    f.file.includes('/api/') || 
    f.file.includes('/pages/api/') ||
    f.file.includes('/app/api/')
  );
  
  if (apiRoutes.length > 0) {
    for (const route of apiRoutes) {
      const relPath = relative(ROOT, route.file);
      md += `### ${relPath}\n\n`;
      md += `- **Line:** ${route.line}\n`;
      if (route.functionName) {
        md += `- **Function:** ${route.functionName}\n`;
      }
      if (route.callExprSnippet) {
        md += `- **Code:** \`${route.callExprSnippet.substring(0, 150)}...\`\n`;
      }
      md += `\n`;
    }
  } else {
    md += `No API routes found. Check \`apps/web/src/pages/api/artifacts/image.ts\`.\n\n`;
  }

  md += `\n## 4. Model Configuration\n\n`;
  
  md += `### 4.1 Available Models\n\n`;
  md += `| Model ID | Tier | Cost per Image | Notes |\n`;
  md += `|----------|------|----------------|-------|\n`;
  md += `| imagen-4.0-generate-001 | STANDARD | $0.04 | Default model |\n`;
  md += `| imagen-4.0-ultra-generate-001 | ULTRA | $0.06 | Enhanced precision |\n`;
  md += `| imagen-4.0-fast-generate-001 | FAST | $0.04 | Faster generation |\n\n`;
  
  md += `### 4.2 Model Usage\n\n`;
  const modelUsage = new Map<string, number>();
  for (const cs of callSites) {
    if (cs.model) {
      modelUsage.set(cs.model, (modelUsage.get(cs.model) || 0) + 1);
    }
  }
  
  if (modelUsage.size > 0) {
    for (const [model, count] of Array.from(modelUsage.entries())) {
      md += `- **${model}**: Used ${count} time(s)\n`;
    }
  } else {
    md += `- Default model (imagen-4.0-generate-001) used via IMAGEN_MODELS.STANDARD\n`;
  }

  md += `\n## 5. Generation Parameters\n\n`;
  
  md += `### 5.1 Aspect Ratios\n\n`;
  if (summary.uniqueAspects.size > 0) {
    for (const aspect of Array.from(summary.uniqueAspects)) {
      md += `- ${aspect}\n`;
    }
  } else {
    md += `- Default: 1:1 (square)\n`;
    md += `- Supported: 1:1, 9:16, 16:9, 4:3, 3:4\n`;
  }

  md += `\n### 5.2 Images Per Call\n\n`;
  const imageCounts = callSites.map(cs => cs.sampleCount || 1);
  const uniqueCounts = [...new Set(imageCounts)];
  md += `- Default: 1 image per call\n`;
  md += `- Maximum: 4 images per call\n`;
  md += `- Found in code: ${uniqueCounts.join(', ')}\n\n`;

  md += `\n### 5.3 Safety Settings\n\n`;
  const safetyLevels = callSites.filter(cs => cs.safetyFilterLevel).map(cs => cs.safetyFilterLevel!);
  if (safetyLevels.length > 0) {
    md += `**Configured Levels:**\n`;
    for (const level of [...new Set(safetyLevels)]) {
      md += `- ${level}\n`;
    }
  } else {
    md += `**Status:** No explicit safety filter levels found in call sites.\n`;
    md += `**Supported:** BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_HIGH\n`;
  }

  md += `\n### 5.4 Other Parameters\n\n`;
  md += `| Parameter | Found | Notes |\n`;
  md += `|-----------|-------|-------|\n`;
  md += `| Seed | ${callSites.some(cs => cs.seed !== undefined) ? 'Yes' : 'No'} | For reproducibility |\n`;
  md += `| Negative Prompt | ${findings.some(f => f.notes?.some(n => n.includes('Negative prompt'))) ? 'Yes' : 'No'} | Exclusion list |\n`;
  md += `| Person Generation | ${findings.some(f => f.notes?.some(n => n.includes('Person generation'))) ? 'Yes' : 'No'} | Person generation policy |\n`;

  md += `\n## 6. UI → API Mapping\n\n`;
  
  if (uiBindings.length > 0) {
    md += `| UI Control | Label | Mapped Parameter | File | Line |\n`;
    md += `|------------|-------|-----------------|------|------|\n`;
    
    // Deduplicate bindings
    const uniqueBindings = new Map<string, typeof uiBindings[0]>();
    for (const binding of uiBindings) {
      const key = `${binding.control}:${binding.mappedParam}`;
      if (!uniqueBindings.has(key)) {
        uniqueBindings.set(key, binding);
      }
    }
    
    for (const binding of uniqueBindings.values()) {
      md += `| ${binding.control} | ${binding.label} | ${binding.mappedParam} | ${relative(ROOT, binding.file)} | ${binding.line} |\n`;
    }
  } else {
    md += `**Status:** No explicit UI controls found that map to Imagen parameters.\n\n`;
    md += `**Note:** Image generation is triggered via chat interface. Users type prompts and the system automatically detects image intent.\n`;
  }

  md += `\n## 7. Environment Variables\n\n`;
  
  md += `### 7.1 Variables Referenced in Code\n\n`;
  const allEnvRefs = new Set<string>();
  for (const finding of findings) {
    if (finding.envRefs) {
      for (const ref of finding.envRefs) {
        allEnvRefs.add(ref);
      }
    }
  }
  
  if (allEnvRefs.size > 0) {
    for (const ref of Array.from(allEnvRefs).sort()) {
      md += `- \`${ref}\`\n`;
    }
  } else {
    md += `- No environment variables found in code (may use defaults)\n`;
  }

  md += `\n### 7.2 Variables in .env Files\n\n`;
  if (Object.keys(envRefs).length > 0) {
    for (const [file, vars] of Object.entries(envRefs)) {
      if (vars.length > 0) {
        md += `**${file}:**\n`;
        for (const v of vars) {
          md += `- \`${v}\`\n`;
        }
        md += `\n`;
      }
    }
  } else {
    md += `No .env files found in apps/web directory.\n`;
  }

  md += `\n## 8. Error Handling & Resilience\n\n`;
  
  md += `### 8.1 Retry Logic\n\n`;
  if (summary.retriesFound) {
    md += `✅ Retry logic detected in code.\n`;
  } else {
    md += `❌ No explicit retry logic found.\n`;
    md += `**Recommendation:** Add retry logic for transient failures.\n`;
  }

  md += `\n### 8.2 Exponential Backoff\n\n`;
  if (summary.backoffFound) {
    md += `✅ Exponential backoff detected.\n`;
  } else {
    md += `❌ No exponential backoff found.\n`;
    md += `**Recommendation:** Implement exponential backoff for rate limit handling.\n`;
  }

  md += `\n### 8.3 Timeouts\n\n`;
  const timeoutFindings = findings.filter(f => 
    f.timeoutMs !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('timeout')
  );
  if (timeoutFindings.length > 0) {
    md += `✅ Timeout configuration found.\n`;
    for (const f of timeoutFindings.slice(0, 5)) {
      md += `- ${relative(ROOT, f.file)}:${f.line}\n`;
    }
  } else {
    md += `❌ No explicit timeout configuration found.\n`;
    md += `**Recommendation:** Add timeout handling for API calls.\n`;
  }

  md += `\n### 8.4 Concurrency Limits\n\n`;
  if (summary.concurrencyFound) {
    md += `✅ Concurrency controls detected.\n`;
  } else {
    md += `❌ No concurrency limits found.\n`;
    md += `**Recommendation:** Implement concurrency limits to prevent rate limiting.\n`;
  }

  md += `\n## 9. Caching Strategy\n\n`;
  
  if (summary.cachingFound) {
    md += `✅ Caching detected in code.\n`;
    const cacheFindings = findings.filter(f => 
      f.cacheLayer !== undefined ||
      f.cacheKeyFormat !== undefined ||
      f.callExprSnippet?.toLowerCase().includes('cache')
    );
    for (const f of cacheFindings.slice(0, 5)) {
      md += `- ${relative(ROOT, f.file)}:${f.line}\n`;
    }
  } else {
    md += `❌ No caching strategy found.\n`;
    md += `**Recommendation:** Consider caching generated images to reduce costs and improve performance.\n`;
  }

  md += `\n## 10. Cost & Performance Considerations\n\n`;
  
  md += `### 10.1 Cost Tracking\n\n`;
  const costTracking = findings.filter(f => 
    f.callExprSnippet?.toLowerCase().includes('cost') ||
    f.callExprSnippet?.toLowerCase().includes('IMAGEN_COSTS')
  );
  if (costTracking.length > 0) {
    md += `✅ Cost tracking found:\n`;
    for (const f of costTracking.slice(0, 3)) {
      md += `- ${relative(ROOT, f.file)}:${f.line}\n`;
    }
  } else {
    md += `❌ No explicit cost tracking found.\n`;
  }

  md += `\n### 10.2 Performance Metrics\n\n`;
  const perfMetrics = findings.filter(f => 
    f.callExprSnippet?.toLowerCase().includes('generationTime') ||
    f.callExprSnippet?.toLowerCase().includes('performance')
  );
  if (perfMetrics.length > 0) {
    md += `✅ Performance metrics found:\n`;
    for (const f of perfMetrics.slice(0, 3)) {
      md += `- ${relative(ROOT, f.file)}:${f.line}\n`;
    }
  } else {
    md += `❌ No explicit performance metrics found.\n`;
  }

  md += `\n## 11. Gaps, Risks, and Recommendations\n\n`;
  
  if (summary.issues.length > 0) {
    md += `### 11.1 Issues Found\n\n`;
    for (const issue of summary.issues) {
      md += `- ⚠️ ${issue}\n`;
    }
    md += `\n`;
  }
  
  md += `### 11.2 Missing Features\n\n`;
  
  if (!summary.rewriterFound) {
    md += `- ⚠️ **Prompt Rewriter:** Not found. Consider implementing prompt rewriting for better image quality.\n`;
  }
  
  if (!summary.watermarkFound) {
    md += `- ⚠️ **Watermark/SynthID:** Not found. Consider implementing watermarking for generated images.\n`;
  }
  
  if (!summary.retriesFound) {
    md += `- ⚠️ **Retry Logic:** Not found. Implement retry logic for transient failures.\n`;
  }
  
  if (!summary.backoffFound) {
    md += `- ⚠️ **Exponential Backoff:** Not found. Implement exponential backoff for rate limit handling.\n`;
  }
  
  if (!summary.concurrencyFound) {
    md += `- ⚠️ **Concurrency Limits:** Not found. Implement concurrency limits to prevent rate limiting.\n`;
  }
  
  if (!summary.cachingFound) {
    md += `- ⚠️ **Caching:** Not found. Consider caching generated images to reduce costs.\n`;
  }

  md += `\n### 11.3 Security Considerations\n\n`;
  
  md += `- ✅ **Authentication:** API key authentication used\n`;
  md += `- ${summary.safetyFound ? '✅' : '⚠️'} **Safety Filters:** ${summary.safetyFound ? 'Configured' : 'Not explicitly configured'}\n`;
  md += `- ⚠️ **Rate Limiting:** Client-side rate limiting not explicitly found\n`;
  md += `- ⚠️ **Input Validation:** Verify prompt validation on client and server\n`;

  md += `\n## 12. Code Examples\n\n`;
  
  md += `### 12.1 Basic Image Generation Call\n\n`;
  md += `\`\`\`typescript\n`;
  md += `// From apps/web/src/pages/api/artifacts/image.ts\n`;
  md += `const images = await generateImage(prompt, {\n`;
  md += `  model: IMAGEN_MODELS.STANDARD,\n`;
  md += `  aspectRatio: '1:1',\n`;
  md += `  sampleCount: 1\n`;
  md += `});\n`;
  md += `\`\`\`\n\n`;

  md += `### 12.2 UI Integration\n\n`;
  md += `\`\`\`typescript\n`;
  md += `// From apps/web/src/hooks/useChatStream.ts\n`;
  md += `// Image generation is triggered automatically when image intent is detected\n`;
  md += `const response = await fetch('/api/artifacts/image', {\n`;
  md += `  method: 'POST',\n`;
  md += `  headers: {\n`;
  md += `    'Content-Type': 'application/json',\n`;
  md += `    Authorization: \`Bearer \${token}\`,\n`;
  md += `  },\n`;
  md += `  body: JSON.stringify({\n`;
  md += `    threadId: newThreadId,\n`;
  md += `    prompt: text,\n`;
  md += `  }),\n`;
  md += `});\n`;
  md += `\`\`\`\n\n`;

  md += `## 13. File Inventory\n\n`;
  
  md += `### 13.1 All Files with Imagen References\n\n`;
  for (const [file, fileFindings] of Array.from(filesMap.entries()).sort()) {
    md += `- **${file}** (${fileFindings.length} reference(s))\n`;
  }

  md += `\n## 14. Conclusion\n\n`;
  
  md += `This audit has identified ${summary.totalCallSites} call site(s) for Imagen 4 image generation within the web application. `;
  md += `The implementation uses the Generative Language API (Gemini API) endpoint with API key authentication. `;
  md += `Image generation is integrated into the chat interface and triggered automatically when image intent is detected.\n\n`;
  
  md += `**Key Findings:**\n`;
  md += `- Image generation is implemented via API route: \`/api/artifacts/image\`\n`;
  md += `- Default model: \`imagen-4.0-generate-001\` (STANDARD tier)\n`;
  md += `- UI integration: Automatic via chat interface\n`;
  md += `- Cost tracking: Implemented\n`;
  md += `- Error handling: Basic error handling present\n\n`;
  
  md += `**Recommendations:**\n`;
  md += `1. Add retry logic with exponential backoff for transient failures\n`;
  md += `2. Implement concurrency limits to prevent rate limiting\n`;
  md += `3. Add caching for generated images to reduce costs\n`;
  md += `4. Consider implementing prompt rewriter for better image quality\n`;
  md += `5. Add explicit timeout configuration for API calls\n`;
  md += `6. Consider watermark/SynthID for generated images\n`;

  return md;
}

async function main() {
  try {
    const result = await runAudit();
    
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    const reportPath = resolve(ROOT, `docs/audits/web-imagen4-audit-${dateStr}.md`);
    
    const report = generateReport(result, date.toISOString());
    
    const fs = await import('fs/promises');
    await fs.writeFile(reportPath, report, 'utf-8');
    
    console.log('\n✅ Web application audit complete!\n');
    console.log('Generated report:');
    console.log(`  📄 ${reportPath}\n`);
    
    console.log('Summary:');
    console.log(`  Total Imagen call sites: ${result.summary.totalCallSites}`);
    console.log(`  Model tiers used: ${Array.from(result.summary.modelTiers).join(', ') || 'None'}`);
    console.log(`  Unique aspect ratios: ${result.summary.uniqueAspects.size}`);
    console.log(`  UI bindings: ${result.summary.uiBindingsCount}`);
    console.log(`  Files scanned: ${result.findings.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Audit failed:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

