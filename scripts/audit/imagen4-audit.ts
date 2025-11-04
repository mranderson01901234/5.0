#!/usr/bin/env tsx
/**
 * Imagen 4 Usage Audit Script
 * 
 * Non-destructive audit that inventories all Imagen 4 usage and configuration
 * across the codebase. Produces markdown, JSON, and CSV reports.
 */

import { globby } from 'globby';
import { Project, SyntaxKind, Node, CallExpression, PropertyAssignment, ObjectLiteralExpression } from 'ts-morph';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import stripJsonComments from 'strip-json-comments';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');

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
  uiBindings?: Array<{ control: string; label: string; mappedParam: string }>;
  envRefs?: string[];
  notes?: string[];
}

interface AuditResult {
  findings: Finding[];
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
}

// Scan patterns
const SCAN_PATTERNS = [
  'apps/**/src/**/*.{ts,tsx,js,jsx}',
  'packages/**/src/**/*.{ts,tsx,js,jsx}',
  'src/**/*.{ts,tsx,js,jsx}',
  'server/**/*.{ts,tsx,js,jsx}',
  'pages/api/**/*.{ts,tsx}',
  'app/**/api/**/*.{ts,tsx}',
  'workers/**/*.{ts,tsx,js,jsx}',
];

// Imagen-related string patterns
const IMAGEN_PATTERNS = [
  'imagen-4', 'imagen-4.0', 'imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001', 'imagen-4.0-fast-generate-001',
  'ultra', 'fast', 'generateImage', 'images:generate', 'imagegeneration.googleapis.com',
  'vertex', 'google.ai.generativelanguage', 'GenerativeModel', 'model:', 'safetySettings',
  'watermark', 'synthid', 'promptRewrite', 'rewrite', 'aspect', 'width', 'height',
  'samples', 'sampleCount', 'seed', 'timeout', 'retry', 'backoff', 'queue',
  'p-limit', 'bull', 'resqueue', 'rateLimit', 'bottleneck',
];

// Model identifiers
const IMAGEN_MODELS = {
  STANDARD: 'imagen-4.0-generate-001',
  ULTRA: 'imagen-4.0-ultra-generate-001',
  FAST: 'imagen-4.0-fast-generate-001',
};

// Environment variable patterns
const ENV_PATTERNS = [
  'GOOGLE_PROJECT_ID', 'GOOGLE_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS',
  'GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_SERVICE_ACCOUNT_PATH',
  'VERTEX_AI_ACCESS_TOKEN', 'VERTEX_AI_API_KEY', 'GOOGLE_API_KEY',
  'IMAGE_GEN_ENABLED',
];

async function findFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const pattern of SCAN_PATTERNS) {
    const matches = await globby(pattern, { cwd: ROOT, absolute: true });
    files.push(...matches);
  }
  return [...new Set(files)];
}

function extractStringPatterns(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    for (const pattern of IMAGEN_PATTERNS) {
      if (line.toLowerCase().includes(pattern.toLowerCase())) {
        findings.push({
          file: filePath,
          line: lineNum,
          callExprSnippet: line.trim().substring(0, 200),
        });
        break; // Avoid duplicate findings per line
      }
    }
  }
  
  return findings;
}

function extractEnvRefs(content: string): string[] {
  const envRefs: string[] = [];
  for (const pattern of ENV_PATTERNS) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    if (regex.test(content)) {
      envRefs.push(pattern);
    }
  }
  return [...new Set(envRefs)];
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
                // Just note its presence
                if (!finding.notes) finding.notes = [];
                finding.notes.push('Negative prompt present');
                break;
              case 'personGeneration':
                // Just note its presence
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
      if (ref.getText().includes('STANDARD')) finding.model = IMAGEN_MODELS.STANDARD;
      if (ref.getText().includes('ULTRA')) finding.model = IMAGEN_MODELS.ULTRA;
      if (ref.getText().includes('FAST')) finding.model = IMAGEN_MODELS.FAST;
    }

    findings.push(finding);
  }

  // Check for timeout/retry patterns
  const timeoutPatterns = [
    /timeout/i,
    /retry/i,
    /backoff/i,
    /p-limit/i,
    /bull/i,
    /resqueue/i,
    /rateLimit/i,
    /bottleneck/i,
  ];

  const content = sourceFile.getFullText();
  for (const pattern of timeoutPatterns) {
    if (pattern.test(content)) {
      const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        const lineNum = content.substring(0, match.index!).split('\n').length;
        findings.push({
          file: filePath,
          line: lineNum,
          callExprSnippet: content.substring(match.index!, match.index! + 100),
          notes: [`${pattern.source} pattern found`],
        });
      }
    }
  }

  return findings;
}

function extractUIBindings(filePath: string, content: string): Array<{ control: string; label: string; mappedParam: string }> {
  const bindings: Array<{ control: string; label: string; mappedParam: string }> = [];
  
  // Look for UI components that reference image generation parameters
  const aspectRatioMatch = content.match(/aspectRatio[:\s]*([^,\n}]+)/gi);
  if (aspectRatioMatch) {
    bindings.push({ control: 'aspectRatio', label: 'Aspect Ratio', mappedParam: 'aspectRatio' });
  }

  const sampleCountMatch = content.match(/sampleCount[:\s]*([^,\n}]+)/gi);
  if (sampleCountMatch) {
    bindings.push({ control: 'sampleCount', label: 'Sample Count', mappedParam: 'sampleCount' });
  }

  const modelMatch = content.match(/model[:\s]*([^,\n}]+)/gi);
  if (modelMatch) {
    bindings.push({ control: 'model', label: 'Model', mappedParam: 'model' });
  }

  const safetyMatch = content.match(/safetyFilterLevel[:\s]*([^,\n}]+)/gi);
  if (safetyMatch) {
    bindings.push({ control: 'safetyFilterLevel', label: 'Safety Filter', mappedParam: 'safetyFilterLevel' });
  }

  return bindings;
}

function parseEnvFiles(): Record<string, string[]> {
  const envFiles: Record<string, string[]> = {};
  const envPatterns = ['.env', '.env.local', '.env.development', '.env.production'];
  
  for (const pattern of envPatterns) {
    const filePath = resolve(ROOT, pattern);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const vars: string[] = [];
        
        for (const line of lines) {
          for (const pattern of ENV_PATTERNS) {
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

async function runAudit(): Promise<AuditResult> {
  console.log('🔍 Scanning codebase for Imagen 4 usage...\n');
  
  const files = await findFiles();
  console.log(`Found ${files.length} files to scan\n`);

  // Try to find a tsconfig file, fallback to base config or skip
  let tsConfigPath: string | undefined;
  const possiblePaths = [
    resolve(ROOT, 'tsconfig.json'),
    resolve(ROOT, 'tsconfig.base.json'),
    resolve(ROOT, 'apps/web/tsconfig.json'),
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
      target: 99, // ES2022
      module: 99, // ES2022
      moduleResolution: 100, // bundler
      skipLibCheck: true,
      esModuleInterop: true,
    },
  });

  // Add files to project
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      // Only add TypeScript/JavaScript files
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        project.addSourceFileAtPath(file);
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  const allFindings: Finding[] = [];
  const modelTiers = new Set<string>();
  const uniqueAspects = new Set<string>();
  const uiBindings: Array<{ control: string; label: string; mappedParam: string }> = [];
  const issues: string[] = [];

  // Scan each file
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      
      // String-based scanning
      const stringFindings = extractStringPatterns(content, file);
      allFindings.push(...stringFindings);

      // AST-based scanning for TypeScript files
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        const astFindings = extractFromAST(project, file);
        allFindings.push(...astFindings);
      }

      // Extract UI bindings
      const bindings = extractUIBindings(file, content);
      uiBindings.push(...bindings);

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
          
          // Determine tier from model name
          if (finding.model.includes('ultra')) {
            modelTiers.add('ULTRA');
          } else if (finding.model.includes('fast')) {
            modelTiers.add('FAST');
          } else {
            modelTiers.add('STANDARD');
          }
        }
        if (finding.aspect) {
          uniqueAspects.add(finding.aspect);
        }
      }
    } catch (error) {
      issues.push(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Deduplicate findings
  const uniqueFindings = new Map<string, Finding>();
  for (const finding of allFindings) {
    const key = `${finding.file}:${finding.line}:${finding.callExprSnippet?.substring(0, 50)}`;
    if (!uniqueFindings.has(key)) {
      uniqueFindings.set(key, finding);
    } else {
      // Merge findings
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
    f.callExprSnippet?.toLowerCase().includes('promptrewrite')
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

  // Check for legacy endpoints
  const legacyEndpoints = deduplicatedFindings.filter(f =>
    f.callExprSnippet?.includes('v1beta') ||
    f.callExprSnippet?.includes('aiplatform.googleapis.com') ||
    f.callExprSnippet?.includes('generativelanguage.googleapis.com')
  );
  
  if (legacyEndpoints.length > 0) {
    issues.push(`Found ${legacyEndpoints.length} potential legacy endpoint references`);
  }

  // Parse env files
  const envFiles = parseEnvFiles();

  return {
    findings: deduplicatedFindings,
    summary: {
      totalCallSites: deduplicatedFindings.length,
      modelTiers,
      uniqueAspects,
      rewriterFound,
      safetyFound,
      watermarkFound,
      retriesFound,
      backoffFound,
      concurrencyFound,
      cachingFound,
      uiBindingsCount: uiBindings.length,
      issues,
    },
  };
}

function generateMarkdown(result: AuditResult, dateStr: string): string {
  const { findings, summary } = result;
  
  let md = `# Imagen 4 Usage Audit Report\n\n`;
  md += `**Generated:** ${dateStr}\n\n`;
  md += `## Summary\n\n`;
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

  md += `## Endpoints + Models Found\n\n`;
  const endpoints = new Set<string>();
  const models = new Set<string>();
  
  for (const finding of findings) {
    if (finding.callExprSnippet) {
      if (finding.callExprSnippet.includes('aiplatform.googleapis.com')) {
        endpoints.add('Vertex AI');
      }
      if (finding.callExprSnippet.includes('generativelanguage.googleapis.com')) {
        endpoints.add('Generative Language API');
      }
      if (finding.callExprSnippet.includes('imagegeneration.googleapis.com')) {
        endpoints.add('Image Generation API');
      }
    }
    if (finding.model) {
      models.add(finding.model);
    }
  }
  
  md += `### Endpoints\n`;
  if (endpoints.size > 0) {
    for (const endpoint of endpoints) {
      md += `- ${endpoint}\n`;
    }
  } else {
    md += `- None detected\n`;
  }
  
  md += `\n### Models\n`;
  if (models.size > 0) {
    for (const model of models) {
      md += `- ${model}\n`;
    }
  } else {
    md += `- None detected\n`;
  }

  md += `\n## Output Sizes and Aspects\n\n`;
  const sizeMap = new Map<string, number>();
  for (const finding of findings) {
    if (finding.width && finding.height) {
      const key = `${finding.width}x${finding.height}`;
      sizeMap.set(key, (sizeMap.get(key) || 0) + 1);
    }
    if (finding.aspect) {
      const key = finding.aspect;
      sizeMap.set(key, (sizeMap.get(key) || 0) + 1);
    }
  }
  
  if (sizeMap.size > 0) {
    md += `| Size/Aspect | Count |\n`;
    md += `|-------------|-------|\n`;
    for (const [key, count] of Array.from(sizeMap.entries()).sort()) {
      md += `| ${key} | ${count} |\n`;
    }
  } else {
    md += `No explicit sizes/aspects detected.\n`;
  }

  md += `\n## Generation Settings Matrix\n\n`;
  md += `| File | Line | Model | Aspect | Images | Safety | Seed |\n`;
  md += `|------|------|-------|--------|--------|--------|------|\n`;
  
  for (const finding of findings.slice(0, 50)) { // Limit to first 50 for readability
    const file = finding.file.replace(ROOT, '').replace(/^\//, '');
    md += `| ${file} | ${finding.line} | ${finding.model || '-'} | ${finding.aspect || '-'} | ${finding.imagesPerCall || '-'} | ${finding.safetyLevel || '-'} | ${finding.seed || '-'} |\n`;
  }
  
  if (findings.length > 50) {
    md += `\n*... and ${findings.length - 50} more findings*\n`;
  }

  md += `\n## Rewriter Usage\n\n`;
  const rewriterFindings = findings.filter(f => 
    f.callExprSnippet?.toLowerCase().includes('rewrite') ||
    f.rewriterEnabled
  );
  
  if (rewriterFindings.length > 0) {
    for (const finding of rewriterFindings) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.callExprSnippet?.substring(0, 100)}\n`;
    }
  } else {
    md += `No rewriter usage detected.\n`;
  }

  md += `\n## Safety + Watermark Configuration\n\n`;
  const safetyFindings = findings.filter(f => f.safetyLevel || f.callExprSnippet?.toLowerCase().includes('safety'));
  const watermarkFindings = findings.filter(f => 
    f.callExprSnippet?.toLowerCase().includes('watermark') ||
    f.callExprSnippet?.toLowerCase().includes('synthid')
  );
  
  md += `### Safety Settings\n`;
  if (safetyFindings.length > 0) {
    for (const finding of safetyFindings) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.safetyLevel || 'Detected in code'}\n`;
    }
  } else {
    md += `No explicit safety settings detected.\n`;
  }
  
  md += `\n### Watermark/SynthID\n`;
  if (watermarkFindings.length > 0) {
    for (const finding of watermarkFindings) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.callExprSnippet?.substring(0, 100)}\n`;
    }
  } else {
    md += `No watermark/SynthID configuration detected.\n`;
  }

  md += `\n## Timeouts/Retries/Concurrency/Queues\n\n`;
  const timeoutFindings = findings.filter(f => 
    f.timeoutMs !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('timeout')
  );
  const retryFindings = findings.filter(f => 
    f.retryPolicy !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('retry')
  );
  const concurrencyFindings = findings.filter(f => 
    f.concurrencyKey !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('concurrency') ||
    f.callExprSnippet?.toLowerCase().includes('p-limit')
  );
  const queueFindings = findings.filter(f => 
    f.queueLib !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('bull') ||
    f.callExprSnippet?.toLowerCase().includes('queue')
  );
  
  md += `### Timeouts\n`;
  if (timeoutFindings.length > 0) {
    for (const finding of timeoutFindings.slice(0, 10)) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.timeoutMs ? `${finding.timeoutMs}ms` : 'Detected'}\n`;
    }
  } else {
    md += `No timeout configuration detected.\n`;
  }
  
  md += `\n### Retries\n`;
  if (retryFindings.length > 0) {
    for (const finding of retryFindings.slice(0, 10)) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.retryPolicy || 'Detected'}\n`;
    }
  } else {
    md += `No retry policy detected.\n`;
  }
  
  md += `\n### Concurrency\n`;
  if (concurrencyFindings.length > 0) {
    for (const finding of concurrencyFindings.slice(0, 10)) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.concurrencyKey || 'Detected'}\n`;
    }
  } else {
    md += `No concurrency controls detected.\n`;
  }
  
  md += `\n### Queues\n`;
  if (queueFindings.length > 0) {
    for (const finding of queueFindings.slice(0, 10)) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.queueLib || 'Detected'}\n`;
    }
  } else {
    md += `No queue usage detected.\n`;
  }

  md += `\n## Caching Strategy\n\n`;
  const cacheFindings = findings.filter(f => 
    f.cacheLayer !== undefined ||
    f.cacheKeyFormat !== undefined ||
    f.callExprSnippet?.toLowerCase().includes('cache')
  );
  
  if (cacheFindings.length > 0) {
    for (const finding of cacheFindings.slice(0, 10)) {
      md += `- **${finding.file.replace(ROOT, '')}:${finding.line}** - ${finding.cacheLayer || finding.cacheKeyFormat || 'Detected'}\n`;
    }
  } else {
    md += `No caching strategy detected.\n`;
  }

  md += `\n## UI → API Mapping Table\n\n`;
  md += `| UI Control | Label | Mapped Parameter |\n`;
  md += `|------------|-------|-----------------|\n`;
  
  const uiBindingsMap = new Map<string, { control: string; label: string; mappedParam: string }>();
  for (const finding of findings) {
    if (finding.uiBindings) {
      for (const binding of finding.uiBindings) {
        const key = `${binding.control}:${binding.mappedParam}`;
        if (!uiBindingsMap.has(key)) {
          uiBindingsMap.set(key, binding);
        }
      }
    }
  }
  
  if (uiBindingsMap.size > 0) {
    for (const binding of uiBindingsMap.values()) {
      md += `| ${binding.control} | ${binding.label} | ${binding.mappedParam} |\n`;
    }
  } else {
    md += `| - | - | - |\n`;
    md += `\n*No explicit UI bindings detected. Check component files for implicit mappings.*\n`;
  }

  md += `\n## ENV Variables Referenced\n\n`;
  const envFiles = parseEnvFiles();
  const allEnvRefs = new Set<string>();
  
  for (const finding of findings) {
    if (finding.envRefs) {
      for (const ref of finding.envRefs) {
        allEnvRefs.add(ref);
      }
    }
  }
  
  if (allEnvRefs.size > 0 || Object.keys(envFiles).length > 0) {
    md += `### In Code\n`;
    for (const ref of Array.from(allEnvRefs).sort()) {
      md += `- ${ref}\n`;
    }
    
    md += `\n### In .env Files\n`;
    for (const [file, vars] of Object.entries(envFiles)) {
      if (vars.length > 0) {
        md += `\n**${file}:**\n`;
        for (const v of vars) {
          md += `- ${v}\n`;
        }
      }
    }
  } else {
    md += `No environment variable references detected.\n`;
  }

  md += `\n## Gaps, Risks, and TODOs\n\n`;
  if (summary.issues.length > 0) {
    for (const issue of summary.issues) {
      md += `- ⚠️ ${issue}\n`;
    }
  } else {
    md += `No issues detected.\n`;
  }
  
  // Additional checks
  if (!summary.rewriterFound) {
    md += `- ⚠️ Prompt rewriter not found - may be missing feature\n`;
  }
  if (!summary.watermarkFound) {
    md += `- ⚠️ Watermark/SynthID configuration not found - may be missing feature\n`;
  }
  if (!summary.retriesFound) {
    md += `- ⚠️ Retry logic not found - may impact reliability\n`;
  }
  if (!summary.backoffFound) {
    md += `- ⚠️ Exponential backoff not found - may impact rate limit handling\n`;
  }
  if (!summary.concurrencyFound) {
    md += `- ⚠️ Concurrency limits not found - may risk rate limits\n`;
  }
  if (!summary.cachingFound) {
    md += `- ⚠️ Caching strategy not found - may impact cost efficiency\n`;
  }

  md += `\n## Detailed Findings\n\n`;
  md += `| File | Line | Function | Model | Aspect | Images | Safety | Seed | Notes |\n`;
  md += `|------|------|----------|-------|--------|--------|--------|------|-------|\n`;
  
  for (const finding of findings.slice(0, 100)) {
    const file = finding.file.replace(ROOT, '').replace(/^\//, '');
    const func = finding.functionName || '-';
    const model = finding.model || '-';
    const aspect = finding.aspect || '-';
    const images = finding.imagesPerCall?.toString() || '-';
    const safety = finding.safetyLevel || '-';
    const seed = finding.seed?.toString() || '-';
    const notes = finding.notes?.join('; ') || '-';
    
    md += `| ${file} | ${finding.line} | ${func} | ${model} | ${aspect} | ${images} | ${safety} | ${seed} | ${notes} |\n`;
  }
  
  if (findings.length > 100) {
    md += `\n*... and ${findings.length - 100} more findings*\n`;
  }

  return md;
}

function generateJSON(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}

function generateCSV(result: AuditResult): string {
  const { findings } = result;
  
  const headers = [
    'File',
    'Line',
    'Column',
    'Function',
    'Model',
    'Width',
    'Height',
    'Aspect',
    'ImagesPerCall',
    'RewriterEnabled',
    'SafetyLevel',
    'WatermarkEnabled',
    'Seed',
    'TimeoutMs',
    'RetryPolicy',
    'Backoff',
    'ConcurrencyKey',
    'QueueLib',
    'CacheLayer',
    'CacheKeyFormat',
    'EnvRefs',
    'Notes',
  ];
  
  let csv = headers.join(',') + '\n';
  
  for (const finding of findings) {
    const row = [
      finding.file.replace(ROOT, '').replace(/^\//, ''),
      finding.line.toString(),
      finding.column?.toString() || '',
      finding.functionName || '',
      finding.model || '',
      finding.width?.toString() || '',
      finding.height?.toString() || '',
      finding.aspect || '',
      finding.imagesPerCall?.toString() || '',
      finding.rewriterEnabled?.toString() || '',
      finding.safetyLevel || '',
      finding.watermarkEnabled?.toString() || '',
      finding.seed?.toString() || '',
      finding.timeoutMs?.toString() || '',
      finding.retryPolicy || '',
      finding.backoff || '',
      finding.concurrencyKey || '',
      finding.queueLib || '',
      finding.cacheLayer || '',
      finding.cacheKeyFormat || '',
      finding.envRefs?.join(';') || '',
      finding.notes?.join(';') || '',
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    
    csv += row + '\n';
  }
  
  return csv;
}

async function main() {
  try {
    const result = await runAudit();
    
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    
    const mdPath = resolve(ROOT, `docs/audits/imagen4-audit-${dateStr}.md`);
    const jsonPath = resolve(ROOT, `docs/audits/imagen4-audit-${dateStr}.json`);
    const csvPath = resolve(ROOT, `docs/audits/imagen4-audit-${dateStr}.csv`);
    
    const markdown = generateMarkdown(result, date.toISOString());
    const json = generateJSON(result);
    const csv = generateCSV(result);
    
    const fs = await import('fs/promises');
    await fs.writeFile(mdPath, markdown, 'utf-8');
    await fs.writeFile(jsonPath, json, 'utf-8');
    await fs.writeFile(csvPath, csv, 'utf-8');
    
    console.log('\n✅ Audit complete!\n');
    console.log('Generated reports:');
    console.log(`  📄 ${mdPath}`);
    console.log(`  📄 ${jsonPath}`);
    console.log(`  📄 ${csvPath}\n`);
    
    console.log('Summary:');
    console.log(`  Total Imagen call sites: ${result.summary.totalCallSites}`);
    console.log(`  Model tiers used: ${Array.from(result.summary.modelTiers).join(', ') || 'None'}`);
    console.log(`  Unique size/aspect pairs: ${result.summary.uniqueAspects.size}`);
    console.log(`  Rewriter found: ${result.summary.rewriterFound ? 'Yes' : 'No'}`);
    console.log(`  Safety + watermark flags found: ${result.summary.safetyFound && result.summary.watermarkFound ? 'Yes' : 'No'}`);
    console.log(`  Retries/backoff/concurrency: ${result.summary.retriesFound || result.summary.backoffFound || result.summary.concurrencyFound ? 'Yes' : 'No'}`);
    console.log(`  Caching: ${result.summary.cachingFound ? 'Yes' : 'No'}`);
    console.log(`  UI bindings count: ${result.summary.uiBindingsCount}`);
    console.log(`  Suspected issues: ${result.summary.issues.length}`);
    
    if (result.summary.issues.length > 0) {
      console.log('\nIssues:');
      for (const issue of result.summary.issues) {
        console.log(`  - ${issue}`);
      }
    }
    
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

