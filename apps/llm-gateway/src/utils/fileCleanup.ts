import { getDatabase } from '../database.js';
import { logger } from '../log.js';
import { createStorageAdapter } from '../storage/index.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

/**
 * Clean up old deleted files
 * Removes files that have been soft-deleted for more than the retention period
 */
export async function cleanupOldFiles(retentionDays: number = 30): Promise<{
  deleted: number;
  errors: number;
}> {
  const db = getDatabase();
  const retentionSeconds = retentionDays * 24 * 60 * 60;
  const cutoffTime = Math.floor(Date.now() / 1000) - retentionSeconds;

  try {
    // Find files that were deleted before the cutoff time
    const oldFiles = db.prepare(`
      SELECT id, storage_path, user_id
      FROM uploads
      WHERE deleted_at IS NOT NULL
        AND deleted_at > 0
        AND deleted_at < ?
    `).all(cutoffTime) as Array<{
      id: string;
      storage_path: string;
      user_id: string;
    }>;

    let deleted = 0;
    let errors = 0;
    const storage = createStorageAdapter();

    for (const file of oldFiles) {
      try {
        // Delete from storage
        if (process.env.STORAGE_BACKEND === 'local' || !process.env.STORAGE_BACKEND) {
          const basePath = process.env.UPLOAD_STORAGE_PATH || './data/uploads';
          const basePathResolved = join(process.cwd(), basePath);
          const fullPath = join(basePathResolved, file.storage_path.replace('uploads/', ''));

          if (existsSync(fullPath)) {
            unlinkSync(fullPath);
          }
        } else {
          // For S3, use storage adapter delete method if available
          await storage.delete?.(file.storage_path);
        }

        // Remove from database
        db.prepare('DELETE FROM uploads WHERE id = ?').run(file.id);
        deleted++;
      } catch (error: any) {
        logger.error({ error: error?.message, uploadId: file.id }, 'Failed to delete file during cleanup');
        errors++;
      }
    }

    logger.info({ deleted, errors, total: oldFiles.length }, 'File cleanup completed');

    return { deleted, errors };
  } catch (error: any) {
    logger.error({ error: error?.message }, 'File cleanup job failed');
    throw error;
  }
}

/**
 * Run cleanup job (can be called by cron or scheduled task)
 */
export async function runCleanupJob(): Promise<{
  deleted: number;
  errors: number;
}> {
  const retentionDays = parseInt(process.env.UPLOAD_RETENTION_DAYS || '30');
  return await cleanupOldFiles(retentionDays);
}

