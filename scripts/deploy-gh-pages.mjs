import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}

async function main() {
  const indexHtml = path.join(distDir, 'index.html');
  try {
    await fs.access(indexHtml);
  } catch {
    throw new Error('Pacote estático não encontrado em dist/. Execute `npm run build` antes de publicar.');
  }

  const originUrl = await runGit(['remote', 'get-url', 'origin'], projectRoot);
  if (!originUrl) {
    throw new Error('Nenhum remote `origin` configurado neste repositório Git.');
  }

  const tempDeployDir = path.join(os.tmpdir(), `fan2026-ghpages-${randomUUID()}`);
  try {
    await fs.cp(distDir, tempDeployDir, { recursive: true });
    await fs.writeFile(path.join(tempDeployDir, '.nojekyll'), '', 'utf-8');

    await runGit(['init', '-b', 'gh-pages'], tempDeployDir);
    await runGit(['add', '-A'], tempDeployDir);
    await runGit(
      ['commit', '-m', `deploy: atualiza pacote estático (${new Date().toISOString()})`],
      tempDeployDir,
    );
    await runGit(['push', '--force', originUrl, 'gh-pages:gh-pages'], tempDeployDir);
    console.log('[PUBLICADO] Pacote dist/ enviado para a branch gh-pages com sucesso.');
  } finally {
    await fs.rm(tempDeployDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[ERRO NO DEPLOY]', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
