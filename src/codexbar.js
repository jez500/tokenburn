import { execFile } from 'node:child_process';

export function runCodexbar(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || err.message || '').toString().trim().slice(-500);
        // Only include the subcommand (e.g. "usage"/"cost") in the surfaced
        // message — not the full arg list — so request input isn't reflected back.
        reject(new Error(`codexbar ${args[0]} failed: ${tail}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`codexbar ${args[0]} returned invalid JSON: ${String(stdout).slice(-500)}`));
      }
    });
  });
}
