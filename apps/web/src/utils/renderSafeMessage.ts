import { linkify } from '@/utils/urls';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import { getSanitizeWorker } from './sanitizeWorkerClient';

export function renderSafeMessage(input: string): string {
  const withLinks = linkify(input);
  return sanitizeHtml(withLinks);
}

export async function renderSafeMessageAsync(input: string): Promise<string> {
  const worker = getSanitizeWorker();
  // Linkify in worker, sanitize in main thread (DOMPurify needs DOM)
  const withLinks = await worker.linkifyMessage(input);
  return sanitizeHtml(withLinks);
}

