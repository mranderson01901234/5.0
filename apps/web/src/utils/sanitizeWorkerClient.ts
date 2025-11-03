import { wrap, type Remote } from 'comlink';
import type { SanitizeWorkerApi } from '../workers/sanitize.worker.ts?worker';

let remote: Remote<SanitizeWorkerApi> | null = null;

export function getSanitizeWorker(): Remote<SanitizeWorkerApi> {
  if (remote) return remote;
  const WorkerMod = new Worker(new URL('../workers/sanitize.worker.ts', import.meta.url), { type: 'module' });
  remote = wrap<SanitizeWorkerApi>(WorkerMod);
  return remote;
}
