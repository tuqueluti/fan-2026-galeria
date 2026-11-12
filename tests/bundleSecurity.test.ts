// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild } from 'vite';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function collectFilesRecursively(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursively(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

describe('Segurança do bundle público (Critério 13)', () => {
  it('não inclui GOOGLE_DRIVE_API_KEY, endpoints da Drive API v3 nem thumbnailLinks temporários no pacote publicado', async () => {
    const canarySecret = 'AIzaSyCanarySecretKey_9988776655_NEVER_EXPOSE';
    const prevKey = process.env.GOOGLE_DRIVE_API_KEY;
    process.env.GOOGLE_DRIVE_API_KEY = canarySecret;

    const outDir = path.join(projectRoot, 'node_modules', '.tmp', 'security-bundle-check');
    await fs.rm(outDir, { recursive: true, force: true });

    try {
      await viteBuild({
        root: projectRoot,
        mode: 'production',
        logLevel: 'silent',
        build: {
          outDir,
          emptyOutDir: true,
        },
      });

      const builtFiles = await collectFilesRecursively(outDir);
      const textAssets = builtFiles.filter((f) => /\.(html|js|css|json)$/i.test(f));
      expect(textAssets.length).toBeGreaterThan(0);

      for (const file of textAssets) {
        const content = await fs.readFile(file, 'utf-8');
        expect(content).not.toContain(canarySecret);
        expect(content).not.toContain('GOOGLE_DRIVE_API_KEY');
        expect(content).not.toContain('googleapis.com/drive');
        expect(content).not.toMatch(/https?:\/\/[a-z0-9.-]*googleusercontent\.com\//i);
      }
    } finally {
      if (prevKey === undefined) {
        delete process.env.GOOGLE_DRIVE_API_KEY;
      } else {
        process.env.GOOGLE_DRIVE_API_KEY = prevKey;
      }
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });
});
