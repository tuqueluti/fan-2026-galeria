import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { importProjectTsModule, loadLocalEnvFiles } from './lib/load-env-and-ts.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function execGdriveReadonly(args) {
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'cmd.exe' : 'gdrive';
  const finalArgs = isWin ? ['/d', '/s', '/c', 'gdrive', ...args] : args;
  const { stdout } = await execFileAsync(bin, finalArgs, {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function isGdriveCliAvailable() {
  try {
    await execGdriveReadonly(['--version']);
    return true;
  } catch {
    return false;
  }
}

function createGdriveCliFolderLister(isEligibleDriveImage) {
  return async ({ rootFolderId, includeSubfolders, stats, logger }) => {
    try {
      const infoOut = await execGdriveReadonly(['readonly', 'info', rootFolderId, '--json']);
      const rootMeta = JSON.parse(infoOut);
      if (rootMeta.trashed) {
        return {
          ok: false,
          message: `A pasta configurada (${rootFolderId}) está na lixeira do Google Drive.`,
        };
      }
      if (rootMeta.mimeType && rootMeta.mimeType !== 'application/vnd.google-apps.folder') {
        return {
          ok: false,
          message: `O identificador ${rootFolderId} não corresponde a uma pasta do Google Drive.`,
        };
      }
    } catch (err) {
      return {
        ok: false,
        message: `Não foi possível acessar a pasta ${rootFolderId} via Google Drive: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const collected = [];
    const visited = new Set();
    const queue = [rootFolderId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      let entries = [];
      try {
        const lsOut = await execGdriveReadonly([
          'readonly',
          'ls',
          currentId,
          '--max',
          '0',
          '--json',
        ]);
        entries = JSON.parse(lsOut) || [];
      } catch (err) {
        return {
          ok: false,
          message: `Erro ao listar itens da pasta ${currentId}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      stats.pagesFetched += 1;
      stats.totalListedItems += entries.length;

      for (const item of entries) {
        if (item.trashed) {
          stats.skippedTrashed += 1;
          continue;
        }
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          if (includeSubfolders) {
            queue.push(item.id);
          } else {
            stats.skippedFolders += 1;
          }
          continue;
        }
        if (!isEligibleDriveImage(item)) {
          stats.skippedIncompatible += 1;
          continue;
        }
        collected.push(item);
      }
    }

    if (stats.skippedFolders > 0 && !includeSubfolders) {
      logger.info(
        `[INFO] ${stats.skippedFolders} subpasta(s) ignorada(s) (includeSubfolders = false).`,
      );
    }

    return { ok: true, files: collected };
  };
}

async function main() {
  await loadLocalEnvFiles(projectRoot);

  const [{ galleryConfig }, { runGallerySync }, { isEligibleDriveImage }] = await Promise.all([
    importProjectTsModule(path.join(projectRoot, 'src', 'config', 'gallery.ts'), projectRoot),
    importProjectTsModule(path.join(projectRoot, 'src', 'sync', 'syncEngine.ts'), projectRoot),
    importProjectTsModule(path.join(projectRoot, 'src', 'domain', 'catalog.ts'), projectRoot),
  ]);

  const rawConcurrency = process.env.SYNC_CONCURRENCY
    ? Number.parseInt(process.env.SYNC_CONCURRENCY, 10)
    : 6;

  const logger = {
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };

  const gdriveAvailable = await isGdriveCliAvailable();

  console.log('==============================================================');
  console.log(`Sincronização da Galeria · ${galleryConfig.eventName} (${galleryConfig.agencyName})`);
  console.log(`Modo de origem: ${galleryConfig.sourceMode}`);
  console.log('==============================================================');

  const result = await runGallerySync({
    projectRoot,
    config: galleryConfig,
    apiKey: process.env.GOOGLE_DRIVE_API_KEY,
    externalFolderLister: gdriveAvailable
      ? createGdriveCliFolderLister(isEligibleDriveImage)
      : undefined,
    externalFileDownloader: gdriveAvailable
      ? async (fileId, destTempPath) => {
          await execGdriveReadonly(['readonly', 'download', fileId, '--out', destTempPath]);
        }
      : undefined,
    concurrency: rawConcurrency,
    logger,
  });

  if (!result.ok) {
    console.error(`\n[PENDENTE / ERRO: ${result.code}]`);
    console.error(result.message);
    console.error('\nA sincronização foi interrompida sem disfarçar a pendência como sucesso.');
    process.exitCode = 1;
    return;
  }

  const { stats, manifest } = result;
  console.log('\n[CONCLUÍDO] Catálogo e prévias atualizados:');
  console.log(
    `  - Fotos publicadas (${galleryConfig.photoPrefix}-1..${galleryConfig.photoPrefix}-${manifest.totalPhotos}): ${manifest.totalPhotos}`,
  );
  console.log(`  - Prévias geradas nesta execução: ${stats.generatedPreviews}`);
  console.log(`  - Prévias reaproveitadas do cache: ${stats.cacheHits}`);
  if (stats.failedPreviews > 0) {
    console.warn(`  - Prévias com falha (sinalizadas claramente na grade): ${stats.failedPreviews}`);
  }
  if (stats.duplicatesRemoved > 0) {
    console.log(`  - Duplicados removidos por fileId: ${stats.duplicatesRemoved}`);
  }
  if (stats.prunedOrphans > 0) {
    console.log(`  - Prévias antigas removidas: ${stats.prunedOrphans}`);
  }
  console.log('  - Manifesto salvo em: src/generated/gallery-manifest.json');
  console.log('\nExecute agora `npm run build` para gerar o pacote estático de publicação.');
}

main().catch((err) => {
  console.error('[ERRO FATAL NA SINCRONIZAÇÃO]', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
