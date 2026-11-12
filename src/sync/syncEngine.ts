import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import {
  isEligibleDriveImage,
  normalizeManualPhotoEntries,
  sortDriveFilesDeterministically,
  type RawDriveFileMetadata,
} from '../domain/catalog';
import {
  buildDriveDownloadUrl,
  buildDriveOpenUrl,
  isPlaceholderValue,
  isTemporaryDriveThumbnailUrl,
  parseDriveFileInput,
  parseDriveFolderInput,
  sanitizeFileIdForFilename,
} from '../domain/driveLinks';
import type {
  GalleryConfig,
  GalleryManifest,
  ManifestPhotoItem,
  ManualPhotoInput,
} from '../types/gallery';

export const THUMB_MAX_SIDE = 560;
export const LARGE_MAX_SIDE = 1400;
const MIN_PHOTO_DIMENSION = 65; // Rejeita ícones genéricos pequenos do Drive (16px/32px/64px)
const CACHE_SCHEMA_VERSION = 1;

// Evita retenção de handles de arquivo mmap pelo libvips no Windows durante regravação/limpeza
sharp.cache(false);

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_LIST_FIELDS = [
  'nextPageToken',
  'files(id,name,mimeType,trashed,md5Checksum,modifiedTime,createdTime,resourceKey,webContentLink,webViewLink,thumbnailLink,hasThumbnail,imageMediaMetadata(width,height,rotation),capabilities(canDownload),copyRequiresWriterPermission)',
].join(',');

interface SyncCacheEntry {
  schemaVersion: number;
  modifiedTime: string | null;
  md5Checksum: string | null;
  thumbMaxSide: number;
  largeMaxSide: number;
  width: number;
  height: number;
}

type SyncCacheMap = Record<string, SyncCacheEntry>;

export interface SyncLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export type ExternalFolderLister = (params: {
  rootFolderId: string;
  rootResourceKey?: string;
  includeSubfolders: boolean;
  stats: SyncStats;
  logger: SyncLogger;
}) => Promise<{ ok: true; files: RawDriveFileMetadata[] } | { ok: false; message: string }>;

export type ExternalFileDownloader = (fileId: string, destTempPath: string) => Promise<void>;

export interface SyncOptions {
  projectRoot: string;
  config: GalleryConfig;
  apiKey?: string;
  concurrency?: number;
  fetchImpl?: typeof fetch;
  externalFolderLister?: ExternalFolderLister;
  externalFileDownloader?: ExternalFileDownloader;
  logger?: SyncLogger;
}

export interface SyncStats {
  pagesFetched: number;
  totalListedItems: number;
  validPhotos: number;
  skippedFolders: number;
  skippedIncompatible: number;
  skippedTrashed: number;
  duplicatesRemoved: number;
  cacheHits: number;
  generatedPreviews: number;
  failedPreviews: number;
  prunedOrphans: number;
}

export type SyncResult =
  | {
      ok: true;
      manifest: GalleryManifest;
      stats: SyncStats;
    }
  | {
      ok: false;
      code:
        | 'UNCONFIGURED_FOLDER'
        | 'INVALID_FOLDER_URL'
        | 'MISSING_API_KEY'
        | 'DRIVE_ACCESS_ERROR'
        | 'EMPTY_MANUAL_LIST'
        | 'INVALID_MANUAL_ENTRIES';
      message: string;
      stats: SyncStats;
    };

const silentLogger: SyncLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function createEmptyStats(): SyncStats {
  return {
    pagesFetched: 0,
    totalListedItems: 0,
    validPhotos: 0,
    skippedFolders: 0,
    skippedIncompatible: 0,
    skippedTrashed: 0,
    duplicatesRemoved: 0,
    cacheHits: 0,
    generatedPreviews: 0,
    failedPreviews: 0,
    prunedOrphans: 0,
  };
}

function clampConcurrency(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(8, Math.floor(value)));
}

function redactSecrets(text: string, apiKey?: string): string {
  let out = text.replace(/([?&]key=)[^&\s"']+/gi, '$1<REDACTED>');
  if (apiKey && apiKey.trim().length >= 6) {
    out = out.split(apiKey.trim()).join('<REDACTED>');
  }
  return out;
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

function buildResourceKeysHeader(
  pairs: Array<{ id: string; resourceKey?: string }>,
): Record<string, string> {
  const tokens = pairs
    .filter((p) => Boolean(p.id && p.resourceKey))
    .map((p) => `${p.id}/${p.resourceKey}`);
  if (tokens.length === 0) return {};
  return {
    'X-Goog-Drive-Resource-Keys': tokens.join(','),
  };
}

async function fetchJsonWithDiagnostics(
  url: URL,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  apiKey: string,
  contextLabel: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; message: string }> {
  let resp: Response;
  try {
    resp = await fetchImpl(url.toString(), { headers });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      message: `Falha de rede ao consultar ${contextLabel}: ${redactSecrets(rawMsg, apiKey)}`,
    };
  }

  if (!resp.ok) {
    let apiReason = '';
    try {
      const errBody = (await resp.json()) as { error?: { message?: string } };
      apiReason = errBody?.error?.message ?? '';
    } catch {
      apiReason = resp.statusText;
    }
    const cleanReason = redactSecrets(apiReason, apiKey);

    if (resp.status === 404) {
      return {
        ok: false,
        status: 404,
        message: `${contextLabel} não encontrada ou privada (HTTP 404). Confirme se o compartilhamento no Google Drive está como "Qualquer pessoa com o link -> Leitor". Detalhe: ${cleanReason}`,
      };
    }
    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        status: resp.status,
        message: `Acesso negado ao consultar ${contextLabel} (HTTP ${resp.status}). Verifique se a Google Drive API v3 está ativada para a chave configurada e se a pasta está pública ("Qualquer pessoa com o link"). Detalhe: ${cleanReason}`,
      };
    }
    if (resp.status === 400) {
      return {
        ok: false,
        status: 400,
        message: `Requisição rejeitada pela Google Drive API (HTTP 400) em ${contextLabel}. Confira se GOOGLE_DRIVE_API_KEY e o link da pasta são válidos. Detalhe: ${cleanReason}`,
      };
    }
    return {
      ok: false,
      status: resp.status,
      message: `Erro HTTP ${resp.status} na Google Drive API em ${contextLabel}: ${cleanReason}`,
    };
  }

  const data = (await resp.json()) as unknown;
  return { ok: true, data };
}

function upgradeDriveThumbnailSize(thumbnailLink: string, targetMaxSide = 1600): string {
  // Links de miniatura do Drive terminam tipicamente em `=s220`; amplia em tempo de build para gerar WebP nítido
  if (/=s\d+[^/]*$/i.test(thumbnailLink)) {
    return thumbnailLink.replace(/=s\d+[^/]*$/i, `=s${targetMaxSide}`);
  }
  return thumbnailLink;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadSyncCache(cachePath: string): Promise<SyncCacheMap> {
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as SyncCacheMap;
    }
  } catch {
    // Cache inexistente ou inválido: inicia vazio
  }
  return {};
}

async function saveSyncCache(cachePath: string, cache: SyncCacheMap): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8');
}

interface GeneratedPreviewMeta {
  width: number;
  height: number;
  thumbUrl: string;
  previewUrl: string;
}

/**
 * Processa um buffer ou arquivo temporário com Sharp, respeitando orientação EXIF, espaço de cor sRGB
 * e `withoutEnlargement: true` (sem jamais esticar imagens pequenas), gerando apenas WebPs leves.
 */
async function writeWebpPreviewsFromInput(
  input: Buffer | string,
  thumbOutPath: string,
  largeOutPath: string,
  fileId: string,
): Promise<GeneratedPreviewMeta> {
  const sourceBuffer = typeof input === 'string' ? await fs.readFile(input) : input;
  const probe = await sharp(sourceBuffer, { failOn: 'truncated' }).metadata();
  if (!probe.width || !probe.height) {
    throw new Error('Metadados de dimensão ausentes no arquivo de imagem.');
  }
  if (probe.width < MIN_PHOTO_DIMENSION || probe.height < MIN_PHOTO_DIMENSION) {
    throw new Error(
      `Imagem descartada por dimensão mínima (${probe.width}x${probe.height}px < ${MIN_PHOTO_DIMENSION}px, provável ícone genérico).`,
    );
  }

  await fs.mkdir(path.dirname(thumbOutPath), { recursive: true });
  await fs.mkdir(path.dirname(largeOutPath), { recursive: true });

  await sharp(sourceBuffer, { failOn: 'truncated' })
    .rotate()
    .toColorspace('srgb')
    .resize({
      width: THUMB_MAX_SIDE,
      height: THUMB_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 4 })
    .toFile(thumbOutPath);

  const largeInfo = await sharp(sourceBuffer, { failOn: 'truncated' })
    .rotate()
    .toColorspace('srgb')
    .resize({
      width: LARGE_MAX_SIDE,
      height: LARGE_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 4 })
    .toFile(largeOutPath);

  return {
    width: largeInfo.width,
    height: largeInfo.height,
    thumbUrl: `/previews/thumbs/${fileId}.webp`,
    previewUrl: `/previews/large/${fileId}.webp`,
  };
}

async function fetchBufferChecked(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  const resp = await fetchImpl(url, { headers, redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const contentType = (resp.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error(
      'Resposta HTML recebida em vez de imagem (arquivo privado ou confirmação interativa do Drive).',
    );
  }
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Baixa temporariamente o original em diretório temporário do sistema operacional (`os.tmpdir()`),
 * gera as prévias WebP e apaga imediatamente o arquivo temporário no bloco `finally`.
 * Nenhum original em alta entra no repositório nem na pasta pública.
 */
async function generateFromTemporaryOriginal(options: {
  fileId: string;
  resourceKey?: string;
  apiKey?: string;
  fallbackDownloadUrl: string;
  thumbOutPath: string;
  largeOutPath: string;
  fetchImpl: typeof fetch;
  externalFileDownloader?: ExternalFileDownloader;
}): Promise<GeneratedPreviewMeta> {
  const {
    fileId,
    resourceKey,
    apiKey,
    fallbackDownloadUrl,
    thumbOutPath,
    largeOutPath,
    fetchImpl,
    externalFileDownloader,
  } = options;
  const tempFilePath = path.join(os.tmpdir(), `fan2026-sync-${fileId}-${randomUUID()}.tmp`);

  try {
    let buffer: Buffer | null = null;

    if (apiKey && !isPlaceholderValue(apiKey)) {
      const mediaUrl = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`);
      mediaUrl.searchParams.set('alt', 'media');
      mediaUrl.searchParams.set('supportsAllDrives', 'true');
      mediaUrl.searchParams.set('key', apiKey);
      const headers = buildResourceKeysHeader([{ id: fileId, resourceKey }]);
      try {
        buffer = await fetchBufferChecked(mediaUrl.toString(), headers, fetchImpl);
      } catch {
        buffer = null;
      }
    }

    if (!buffer) {
      try {
        buffer = await fetchBufferChecked(fallbackDownloadUrl, {}, fetchImpl);
      } catch (err) {
        if (externalFileDownloader) {
          await externalFileDownloader(fileId, tempFilePath);
          return await writeWebpPreviewsFromInput(tempFilePath, thumbOutPath, largeOutPath, fileId);
        }
        throw err;
      }
    }

    await fs.writeFile(tempFilePath, buffer);
    buffer = null; // Libera referência em memória antes do decode
    return await writeWebpPreviewsFromInput(tempFilePath, thumbOutPath, largeOutPath, fileId);
  } finally {
    await fs.unlink(tempFilePath).catch(() => {});
  }
}

async function prepareDurablePreviewsForDriveItem(options: {
  file: RawDriveFileMetadata;
  folderResourceKey?: string;
  folderId?: string;
  apiKey?: string;
  projectRoot: string;
  cache: SyncCacheMap;
  fetchImpl: typeof fetch;
  externalFileDownloader?: ExternalFileDownloader;
  logger: SyncLogger;
}): Promise<{
  thumbUrl: string | null;
  previewUrl: string | null;
  previewStatus: 'ready' | 'error';
  width: number;
  height: number;
  fromCache: boolean;
}> {
  const { file, apiKey, projectRoot, cache, fetchImpl, externalFileDownloader, logger } = options;
  const cleanId = sanitizeFileIdForFilename(file.id);
  const thumbOutPath = path.join(projectRoot, 'public', 'previews', 'thumbs', `${cleanId}.webp`);
  const largeOutPath = path.join(projectRoot, 'public', 'previews', 'large', `${cleanId}.webp`);

  const cached = cache[cleanId];
  if (
    cached &&
    cached.schemaVersion === CACHE_SCHEMA_VERSION &&
    cached.thumbMaxSide === THUMB_MAX_SIDE &&
    cached.largeMaxSide === LARGE_MAX_SIDE &&
    cached.modifiedTime === (file.modifiedTime ?? null) &&
    cached.md5Checksum === (file.md5Checksum ?? null) &&
    (await fileExists(thumbOutPath)) &&
    (await fileExists(largeOutPath))
  ) {
    return {
      thumbUrl: `/previews/thumbs/${cleanId}.webp`,
      previewUrl: `/previews/large/${cleanId}.webp`,
      previewStatus: 'ready',
      width: cached.width,
      height: cached.height,
      fromCache: true,
    };
  }

  const fallbackDownloadUrl = buildDriveDownloadUrl({
    fileId: cleanId,
    resourceKey: file.resourceKey,
    webContentLink: file.webContentLink,
  });

  const knownOriginalMaxSide = Math.max(
    file.imageMediaMetadata?.width ?? 0,
    file.imageMediaMetadata?.height ?? 0,
  );

  // 1) Tenta obter miniatura ampliada no build via thumbnailLink, validando qualidade real
  if (file.thumbnailLink && file.hasThumbnail !== false) {
    try {
      const upgradedThumbUrl = upgradeDriveThumbnailSize(file.thumbnailLink, 1600);
      const thumbBuf = await fetchBufferChecked(upgradedThumbUrl, {}, fetchImpl);
      const meta = await sharp(thumbBuf, { failOn: 'truncated' }).metadata();
      const fetchedMaxSide = Math.max(meta.width ?? 0, meta.height ?? 0);

      // Se o original é grande (> 900px), exige pelo menos 700px na captura para não degradar o lightbox
      const qualityIsSufficient =
        fetchedMaxSide >= MIN_PHOTO_DIMENSION &&
        (knownOriginalMaxSide <= 900 || fetchedMaxSide >= 700);

      if (qualityIsSufficient) {
        const generated = await writeWebpPreviewsFromInput(
          thumbBuf,
          thumbOutPath,
          largeOutPath,
          cleanId,
        );
        cache[cleanId] = {
          schemaVersion: CACHE_SCHEMA_VERSION,
          modifiedTime: file.modifiedTime ?? null,
          md5Checksum: file.md5Checksum ?? null,
          thumbMaxSide: THUMB_MAX_SIDE,
          largeMaxSide: LARGE_MAX_SIDE,
          width: generated.width,
          height: generated.height,
        };
        return {
          ...generated,
          previewStatus: 'ready',
          fromCache: false,
        };
      }
    } catch {
      // Cai para o processamento temporário a partir do original
    }
  }

  // 2) Fallback: baixa temporariamente o original no tmp do SO, gera WebPs leves e descarta o original
  try {
    const generated = await generateFromTemporaryOriginal({
      fileId: cleanId,
      resourceKey: file.resourceKey,
      apiKey,
      fallbackDownloadUrl,
      thumbOutPath,
      largeOutPath,
      fetchImpl,
      externalFileDownloader,
    });
    cache[cleanId] = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      modifiedTime: file.modifiedTime ?? null,
      md5Checksum: file.md5Checksum ?? null,
      thumbMaxSide: THUMB_MAX_SIDE,
      largeMaxSide: LARGE_MAX_SIDE,
      width: generated.width,
      height: generated.height,
    };
    return {
      ...generated,
      previewStatus: 'ready',
      fromCache: false,
    };
  } catch (err) {
    const reason = redactSecrets(err instanceof Error ? err.message : String(err), apiKey);
    logger.warn(`[AVISO] Prévia indisponível para ${cleanId} (${file.name ?? 'sem nome'}): ${reason}`);
    return {
      thumbUrl: null,
      previewUrl: null,
      previewStatus: 'error',
      width: file.imageMediaMetadata?.width ?? 1200,
      height: file.imageMediaMetadata?.height ?? 800,
      fromCache: false,
    };
  }
}

async function pruneOrphanPreviews(
  projectRoot: string,
  activeFileIds: Set<string>,
  cache: SyncCacheMap,
): Promise<number> {
  let pruned = 0;
  const dirs = [
    path.join(projectRoot, 'public', 'previews', 'thumbs'),
    path.join(projectRoot, 'public', 'previews', 'large'),
  ];

  for (const dir of dirs) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const fileName of entries) {
      if (!fileName.endsWith('.webp')) continue;
      const baseId = fileName.slice(0, -'.webp'.length);
      if (!activeFileIds.has(baseId)) {
        await fs.unlink(path.join(dir, fileName)).catch(() => {});
        pruned++;
      }
    }
  }

  for (const cachedId of Object.keys(cache)) {
    if (!activeFileIds.has(cachedId)) {
      delete cache[cachedId];
    }
  }

  return pruned;
}

async function writeManifestFile(projectRoot: string, manifest: GalleryManifest): Promise<void> {
  // Verificação defensiva de segurança antes de gravar no repositório/build
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (/[?&]key=/i.test(serialized)) {
    throw new Error('Violação de segurança bloqueada: parâmetro key detectado no manifesto.');
  }
  for (const item of manifest.photos) {
    if (
      isTemporaryDriveThumbnailUrl(item.thumbUrl) ||
      isTemporaryDriveThumbnailUrl(item.previewUrl)
    ) {
      throw new Error(
        `Violação bloqueada: thumbnailLink temporário detectado no manifesto para ${item.fileId}.`,
      );
    }
  }

  const outPath = path.join(projectRoot, 'src', 'generated', 'gallery-manifest.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, serialized, 'utf-8');
}

async function listFolderFilesPaginated(options: {
  rootFolderId: string;
  rootResourceKey?: string;
  includeSubfolders: boolean;
  apiKey: string;
  fetchImpl: typeof fetch;
  stats: SyncStats;
  logger: SyncLogger;
}): Promise<
  | { ok: true; files: RawDriveFileMetadata[] }
  | { ok: false; message: string }
> {
  const {
    rootFolderId,
    rootResourceKey,
    includeSubfolders,
    apiKey,
    fetchImpl,
    stats,
    logger,
  } = options;

  // 1) Verifica existência e permissão da pasta raiz antes de listar
  const rootMetaUrl = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(rootFolderId)}`);
  rootMetaUrl.searchParams.set('supportsAllDrives', 'true');
  rootMetaUrl.searchParams.set('fields', 'id,name,mimeType,trashed,resourceKey');
  rootMetaUrl.searchParams.set('key', apiKey);

  const rootHeaders = buildResourceKeysHeader([
    { id: rootFolderId, resourceKey: rootResourceKey },
  ]);
  const rootCheck = await fetchJsonWithDiagnostics(
    rootMetaUrl,
    rootHeaders,
    fetchImpl,
    apiKey,
    `a pasta (${rootFolderId})`,
  );
  if (!rootCheck.ok) {
    return { ok: false, message: rootCheck.message };
  }

  const rootMeta = rootCheck.data as RawDriveFileMetadata;
  if (rootMeta.trashed) {
    return {
      ok: false,
      message: `A pasta configurada (${rootFolderId}) está na lixeira do Google Drive.`,
    };
  }
  if (rootMeta.mimeType && rootMeta.mimeType !== 'application/vnd.google-apps.folder') {
    return {
      ok: false,
      message: `O identificador ${rootFolderId} não corresponde a uma pasta do Google Drive (mimeType: ${rootMeta.mimeType}).`,
    };
  }

  const collected: RawDriveFileMetadata[] = [];
  const visitedFolders = new Set<string>();
  const queue: Array<{ id: string; resourceKey?: string }> = [
    { id: rootFolderId, resourceKey: rootResourceKey ?? rootMeta.resourceKey },
  ];

  while (queue.length > 0) {
    const currentFolder = queue.shift()!;
    if (visitedFolders.has(currentFolder.id)) continue;
    visitedFolders.add(currentFolder.id);

    let pageToken: string | undefined = undefined;
    const folderHeaders = buildResourceKeysHeader([
      { id: rootFolderId, resourceKey: rootResourceKey },
      currentFolder,
    ]);

    do {
      const listUrl = new URL(`${DRIVE_API_BASE}/files`);
      listUrl.searchParams.set('q', `'${currentFolder.id}' in parents and trashed = false`);
      listUrl.searchParams.set('pageSize', '1000');
      listUrl.searchParams.set('supportsAllDrives', 'true');
      listUrl.searchParams.set('includeItemsFromAllDrives', 'true');
      listUrl.searchParams.set('fields', DRIVE_LIST_FIELDS);
      listUrl.searchParams.set('orderBy', 'name_natural');
      if (pageToken) {
        listUrl.searchParams.set('pageToken', pageToken);
      }
      listUrl.searchParams.set('key', apiKey);

      const pageRes = await fetchJsonWithDiagnostics(
        listUrl,
        folderHeaders,
        fetchImpl,
        apiKey,
        `os arquivos da pasta (${currentFolder.id})`,
      );
      let resolvedPageData: unknown;
      if (!pageRes.ok) {
        // Caso uma instância antiga da API rejeite orderBy=name_natural, refaz sem orderBy pois ordenamos localmente de forma determinística
        if (pageRes.status === 400 && listUrl.searchParams.has('orderBy')) {
          listUrl.searchParams.delete('orderBy');
          const retryRes = await fetchJsonWithDiagnostics(
            listUrl,
            folderHeaders,
            fetchImpl,
            apiKey,
            `os arquivos da pasta (${currentFolder.id})`,
          );
          if (!retryRes.ok) {
            return { ok: false, message: retryRes.message };
          }
          resolvedPageData = retryRes.data;
        } else {
          return { ok: false, message: pageRes.message };
        }
      } else {
        resolvedPageData = pageRes.data;
      }

      stats.pagesFetched += 1;
      const body = resolvedPageData as {
        nextPageToken?: string;
        files?: RawDriveFileMetadata[];
      };

      const batch = Array.isArray(body.files) ? body.files : [];
      stats.totalListedItems += batch.length;

      for (const item of batch) {
        if (item.trashed) {
          stats.skippedTrashed += 1;
          continue;
        }
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          if (includeSubfolders) {
            queue.push({ id: item.id, resourceKey: item.resourceKey });
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

      pageToken = body.nextPageToken || undefined;
    } while (pageToken);
  }

  if (stats.skippedFolders > 0 && !includeSubfolders) {
    logger.info(
      `[INFO] ${stats.skippedFolders} subpasta(s) ignorada(s) (includeSubfolders = false por padrão).`,
    );
  }

  return { ok: true, files: collected };
}

async function syncManualMode(options: {
  projectRoot: string;
  config: GalleryConfig;
  apiKey?: string;
  concurrency: number;
  fetchImpl: typeof fetch;
  externalFileDownloader?: ExternalFileDownloader;
  stats: SyncStats;
  logger: SyncLogger;
}): Promise<SyncResult> {
  const {
    projectRoot,
    config,
    apiKey,
    concurrency,
    fetchImpl,
    externalFileDownloader,
    stats,
    logger,
  } = options;

  if (!config.photos || config.photos.length === 0) {
    return {
      ok: false,
      code: 'EMPTY_MANUAL_LIST',
      message:
        'Modo manual ativo (`sourceMode: "manual"`), mas a lista `photos` em `src/config/gallery.ts` está vazia.',
      stats,
    };
  }

  const normalized = normalizeManualPhotoEntries(config.photos);
  if (normalized.errors.length > 0) {
    return {
      ok: false,
      code: 'INVALID_MANUAL_ENTRIES',
      message: `Foram encontrados erros na lista manual em src/config/gallery.ts:\n- ${normalized.errors.join('\n- ')}`,
      stats,
    };
  }

  stats.totalListedItems = config.photos.length;
  stats.duplicatesRemoved = config.photos.length - normalized.items.length;
  stats.validPhotos = normalized.items.length;

  const cachePath = path.join(projectRoot, '.cache', 'gallery-sync-cache.json');
  const cache = await loadSyncCache(cachePath);
  const hasApiKey = Boolean(apiKey && !isPlaceholderValue(apiKey));

  // Mapeia entradas originais por fileId para inspecionar caminhos locais explícitos
  const rawEntryById = new Map<string, ManualPhotoInput>();
  for (const raw of config.photos) {
    const parsed = parseDriveFileInput(raw);
    if (parsed.kind === 'ok' && !rawEntryById.has(parsed.fileId)) {
      rawEntryById.set(parsed.fileId, raw);
    }
  }

  const syncedItems = await runWithConcurrency(
    normalized.items,
    concurrency,
    async (item): Promise<ManifestPhotoItem> => {
      const rawEntry = rawEntryById.get(item.fileId);

      // Se o usuário forneceu um caminho local em `public/...`, otimiza/valida ou preserva como ativo estável
      if (rawEntry?.previewUrl && rawEntry.previewUrl.startsWith('/')) {
        const localSource = path.join(projectRoot, 'public', rawEntry.previewUrl.replace(/^\/+/, ''));
        if (await fileExists(localSource)) {
          const thumbOutPath = path.join(
            projectRoot,
            'public',
            'previews',
            'thumbs',
            `${item.fileId}.webp`,
          );
          const largeOutPath = path.join(
            projectRoot,
            'public',
            'previews',
            'large',
            `${item.fileId}.webp`,
          );
          try {
            const generated = await writeWebpPreviewsFromInput(
              localSource,
              thumbOutPath,
              largeOutPath,
              item.fileId,
            );
            stats.generatedPreviews += 1;
            return {
              ...item,
              thumbUrl: rawEntry.thumbUrl ?? generated.thumbUrl,
              previewUrl: rawEntry.previewUrl ?? generated.previewUrl,
              previewStatus: 'ready',
              width: generated.width,
              height: generated.height,
            };
          } catch (err) {
            logger.warn(
              `[AVISO] Não foi possível converter prévia local de ${item.fileId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      // Consulta metadados opcionais do arquivo na Drive API se houver chave configurada
      let fileMeta: RawDriveFileMetadata = {
        id: item.fileId,
        name: item.originalName,
        resourceKey: item.resourceKey,
      };

      if (hasApiKey && apiKey) {
        const metaUrl = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(item.fileId)}`);
        metaUrl.searchParams.set('supportsAllDrives', 'true');
        metaUrl.searchParams.set(
          'fields',
          'id,name,mimeType,trashed,md5Checksum,modifiedTime,createdTime,resourceKey,webContentLink,webViewLink,thumbnailLink,hasThumbnail,imageMediaMetadata(width,height,rotation),capabilities(canDownload),copyRequiresWriterPermission',
        );
        metaUrl.searchParams.set('key', apiKey);
        const headers = buildResourceKeysHeader([
          { id: item.fileId, resourceKey: item.resourceKey },
        ]);
        const metaRes = await fetchJsonWithDiagnostics(
          metaUrl,
          headers,
          fetchImpl,
          apiKey,
          `o arquivo manual (${item.fileId})`,
        );
        if (metaRes.ok) {
          fileMeta = metaRes.data as RawDriveFileMetadata;
        }
      }

      const previewRes = await prepareDurablePreviewsForDriveItem({
        file: fileMeta,
        apiKey: hasApiKey ? apiKey : undefined,
        projectRoot,
        cache,
        fetchImpl,
        externalFileDownloader,
        logger,
      });

      if (previewRes.fromCache) {
        stats.cacheHits += 1;
      } else if (previewRes.previewStatus === 'ready') {
        stats.generatedPreviews += 1;
      } else {
        stats.failedPreviews += 1;
      }

      const effectiveResourceKey = item.resourceKey ?? fileMeta.resourceKey;
      const downloadAllowedByDrive =
        fileMeta.capabilities?.canDownload !== false &&
        fileMeta.copyRequiresWriterPermission !== true;

      const resolvedThumb = item.thumbUrl ?? previewRes.thumbUrl;
      const resolvedPreview = item.previewUrl ?? previewRes.previewUrl;

      const downloadUrl = buildDriveDownloadUrl({
        fileId: item.fileId,
        resourceKey: effectiveResourceKey,
        webContentLink: fileMeta.webContentLink,
        explicitDownloadUrl: rawEntry?.downloadUrl,
        forbiddenPreviewUrls: [resolvedThumb, resolvedPreview],
      });

      const openUrl = buildDriveOpenUrl({
        fileId: item.fileId,
        resourceKey: effectiveResourceKey,
        webViewLink: fileMeta.webViewLink,
        explicitOpenUrl: rawEntry?.openUrl,
      });

      return {
        fileId: item.fileId,
        ...(item.originalName || fileMeta.name
          ? { originalName: item.originalName ?? fileMeta.name }
          : {}),
        thumbUrl: resolvedThumb,
        previewUrl: resolvedPreview,
        previewStatus: resolvedThumb && resolvedPreview ? 'ready' : 'error',
        width: previewRes.width,
        height: previewRes.height,
        downloadUrl,
        openUrl,
        downloadAvailable: item.downloadAvailable && downloadAllowedByDrive,
        ...(effectiveResourceKey ? { resourceKey: effectiveResourceKey } : {}),
        ...(item.createdTime || fileMeta.createdTime
          ? { createdTime: item.createdTime ?? fileMeta.createdTime }
          : {}),
        ...(fileMeta.modifiedTime ? { modifiedTime: fileMeta.modifiedTime } : {}),
      };
    },
  );

  const activeIds = new Set(syncedItems.map((i) => i.fileId));
  stats.prunedOrphans = await pruneOrphanPreviews(projectRoot, activeIds, cache);
  await saveSyncCache(cachePath, cache);

  const manifest: GalleryManifest = {
    schemaVersion: 1,
    status: 'ready',
    sourceMode: 'manual',
    generatedAt: new Date().toISOString(),
    folderId: null,
    totalPhotos: syncedItems.length,
    photos: syncedItems,
  };

  await writeManifestFile(projectRoot, manifest);
  return { ok: true, manifest, stats };
}

/**
 * Executa a sincronização completa (modo pasta ou modo manual), gerando prévias WebP estáveis
 * e gravando `src/generated/gallery-manifest.json` sem vazar chaves nem armazenar originais em alta.
 */
export async function runGallerySync(options: SyncOptions): Promise<SyncResult> {
  const {
    projectRoot,
    config,
    apiKey,
    concurrency: rawConcurrency,
    fetchImpl = globalThis.fetch,
    externalFolderLister,
    externalFileDownloader,
    logger = silentLogger,
  } = options;

  const stats = createEmptyStats();
  const concurrency = clampConcurrency(rawConcurrency);

  if (config.sourceMode === 'manual') {
    return syncManualMode({
      projectRoot,
      config,
      apiKey,
      concurrency,
      fetchImpl,
      externalFileDownloader,
      stats,
      logger,
    });
  }

  // Modo pasta ("folder")
  const parsedFolder = parseDriveFolderInput(config.driveFolderUrl);
  if (parsedFolder.kind === 'unconfigured') {
    return {
      ok: false,
      code: 'UNCONFIGURED_FOLDER',
      message:
        'O link da pasta ainda não foi configurado em `src/config/gallery.ts` (`driveFolderUrl`). Cole o link público da pasta do Google Drive antes de sincronizar.',
      stats,
    };
  }

  if (parsedFolder.kind === 'invalid') {
    return {
      ok: false,
      code: 'INVALID_FOLDER_URL',
      message: parsedFolder.reason,
      stats,
    };
  }

  const trimmedKey = (apiKey ?? '').trim();
  const hasApiKey = !isPlaceholderValue(trimmedKey);

  if (!hasApiKey && !externalFolderLister) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      message:
        'A variável de ambiente `GOOGLE_DRIVE_API_KEY` não está configurada. Copie `.env.example` para `.env`, informe sua chave da Google Drive API v3 e execute `npm run sync` novamente.',
      stats,
    };
  }

  logger.info(
    `[SYNC] Consultando pasta do Google Drive (${parsedFolder.folderId})${config.includeSubfolders ? ' incluindo subpastas' : ''}...`,
  );

  const listResult = hasApiKey
    ? await listFolderFilesPaginated({
        rootFolderId: parsedFolder.folderId,
        rootResourceKey: parsedFolder.resourceKey,
        includeSubfolders: config.includeSubfolders,
        apiKey: trimmedKey,
        fetchImpl,
        stats,
        logger,
      })
    : await externalFolderLister!({
        rootFolderId: parsedFolder.folderId,
        rootResourceKey: parsedFolder.resourceKey,
        includeSubfolders: config.includeSubfolders,
        stats,
        logger,
      });

  if (!listResult.ok) {
    return {
      ok: false,
      code: 'DRIVE_ACCESS_ERROR',
      message: listResult.message,
      stats,
    };
  }

  const orderedUniqueFiles = sortDriveFilesDeterministically(listResult.files, config.sorting.by);
  stats.duplicatesRemoved = listResult.files.length - orderedUniqueFiles.length;
  stats.validPhotos = orderedUniqueFiles.length;

  logger.info(
    `[SYNC] ${orderedUniqueFiles.length} foto(s) válida(s) encontrada(s) em ${stats.pagesFetched} página(s). Gerando prévias leves (concorrência: ${concurrency})...`,
  );

  const cachePath = path.join(projectRoot, '.cache', 'gallery-sync-cache.json');
  const cache = await loadSyncCache(cachePath);

  const manifestItems = await runWithConcurrency(
    orderedUniqueFiles,
    concurrency,
    async (file): Promise<ManifestPhotoItem> => {
      const cleanId = sanitizeFileIdForFilename(file.id);
      const previewRes = await prepareDurablePreviewsForDriveItem({
        file,
        folderId: parsedFolder.folderId,
        folderResourceKey: parsedFolder.resourceKey,
        apiKey: hasApiKey ? trimmedKey : undefined,
        projectRoot,
        cache,
        fetchImpl,
        externalFileDownloader,
        logger,
      });

      if (previewRes.fromCache) {
        stats.cacheHits += 1;
      } else if (previewRes.previewStatus === 'ready') {
        stats.generatedPreviews += 1;
      } else {
        stats.failedPreviews += 1;
      }

      const downloadAllowed =
        file.capabilities?.canDownload !== false && file.copyRequiresWriterPermission !== true;

      const downloadUrl = buildDriveDownloadUrl({
        fileId: cleanId,
        resourceKey: file.resourceKey,
        webContentLink: file.webContentLink,
        forbiddenPreviewUrls: [previewRes.thumbUrl, previewRes.previewUrl],
      });

      const openUrl = buildDriveOpenUrl({
        fileId: cleanId,
        resourceKey: file.resourceKey,
        webViewLink: file.webViewLink,
      });

      return {
        fileId: cleanId,
        ...(file.name ? { originalName: file.name } : {}),
        thumbUrl: previewRes.thumbUrl,
        previewUrl: previewRes.previewUrl,
        previewStatus: previewRes.previewStatus,
        width: previewRes.width,
        height: previewRes.height,
        downloadUrl,
        openUrl,
        downloadAvailable: downloadAllowed,
        ...(file.resourceKey ? { resourceKey: file.resourceKey } : {}),
        ...(file.createdTime ? { createdTime: file.createdTime } : {}),
        ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
      };
    },
  );

  const activeIds = new Set(manifestItems.map((i) => i.fileId));
  stats.prunedOrphans = await pruneOrphanPreviews(projectRoot, activeIds, cache);
  await saveSyncCache(cachePath, cache);

  const manifest: GalleryManifest = {
    schemaVersion: 1,
    status: 'ready',
    sourceMode: 'folder',
    generatedAt: new Date().toISOString(),
    folderId: parsedFolder.folderId,
    totalPhotos: manifestItems.length,
    photos: manifestItems,
  };

  await writeManifestFile(projectRoot, manifest);
  return { ok: true, manifest, stats };
}
