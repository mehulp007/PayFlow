import { readFileSync, unlinkSync } from 'node:fs';
import { open, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * PGlite allows one process per data folder. A lock file holding the owner's PID stops a second API
 * process early; a lock left behind by a process that no longer exists is cleared automatically.
 */
export async function acquireDataLock(lockPath: string): Promise<void> {
  const owner = `${process.pid}:${randomUUID()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(lockPath, 'wx');
      try {
        await file.writeFile(owner);
      } finally {
        await file.close();
      }
      process.once('exit', () => {
        try {
          if (readFileSync(lockPath, 'utf8') === owner) unlinkSync(lockPath);
        } catch {
          // The lock file is already gone.
        }
      });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number((await readFile(lockPath, 'utf8').catch(() => '')).split(':')[0]);
      if (Number.isInteger(pid) && pid > 0 && isRunning(pid)) {
        throw new Error('Another PayFlow API is using the local data folder. Stop it before starting a second server.');
      }
      await unlink(lockPath).catch(() => {});
    }
  }
  throw new Error('Unable to acquire the local database lock');
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
