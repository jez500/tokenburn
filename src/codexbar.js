import { execFile } from 'node:child_process';

export function runCodexbar(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || err.message || '').toString().trim().slice(-500);
        reject(new Error(`codexbar ${args.join(' ')} failed: ${tail}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`codexbar ${args.join(' ')} returned invalid JSON: ${String(stdout).slice(-500)}`));
      }
    });
  });
}
