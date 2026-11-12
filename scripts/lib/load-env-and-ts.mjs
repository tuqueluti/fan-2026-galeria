import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

/**
 * Carrega variáveis de `.env` e `.env.local` apenas no processo Node de build,
 * sem sobrescrever variáveis já definidas no ambiente do terminal.
 */
export async function loadLocalEnvFiles(projectRoot) {
  const candidates = ['.env.local', '.env'];
  for (const fileName of candidates) {
    const fullPath = path.join(projectRoot, fileName);
    let content;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Compila em memória/arquivo temporário um módulo TypeScript do projeto usando o esbuild já incluído no Vite,
 * permitindo importar `src/config/gallery.ts` e `src/sync/syncEngine.ts` diretamente no Node CLI.
 */
export async function importProjectTsModule(entryPath, projectRoot) {
  const tmpDir = path.join(projectRoot, 'node_modules', '.tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpOut = path.join(
    tmpDir,
    `fan2026-cli-${path.basename(entryPath, '.ts')}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );

  await build({
    entryPoints: [entryPath],
    outfile: tmpOut,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['sharp'],
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(tmpOut).href);
  } finally {
    await fs.unlink(tmpOut).catch(() => {});
  }
}
