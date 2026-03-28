export const runtime = 'nodejs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

const execAsync = promisify(exec);

/** GET: cron-triggered git backup of ~/.claude/ to GitHub */
export async function GET() {
  const agentDir = `${process.env.HOME}/.claude`;
  try {
    // Check for changes
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: agentDir });
    const hasChanges = statusOut.trim().length > 0;

    if (!hasChanges) {
      return apiOk({ committed: false, pushed: false, message: 'Nothing to commit' });
    }

    const date = new Date().toISOString().slice(0, 10);
    await execAsync('git add -A', { cwd: agentDir });
    const { stdout: commitOut } = await execAsync(
      `git commit -m "chore: automated backup ${date}"`,
      { cwd: agentDir }
    );
    await execAsync('git push', { cwd: agentDir });

    return apiOk({ committed: true, pushed: true, message: commitOut.trim() });
  } catch (err) {
    captureError('backup/agent-system', err);
    return apiError(500, String(err));
  }
}
