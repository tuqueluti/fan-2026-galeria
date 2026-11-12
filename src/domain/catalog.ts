import type {
  CatalogPhoto,
  GalleryConfig,
  GalleryManifest,
  GallerySortBy,
  ManifestPhotoItem,
  ManualPhotoInput,
} from '../types/gallery';
import {
  buildDriveDownloadUrl,
  buildDriveOpenUrl,
  isTemporaryDriveThumbnailUrl,
  parseDriveFileInput,
  parseDriveFolderInput,
} from './driveLinks';

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

const naturalCollator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});

export interface RawDriveFileMetadata {
  id: string;
  name?: string;
  mimeType?: string;
  trashed?: boolean;
  createdTime?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  resourceKey?: string;
  webContentLink?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  hasThumbnail?: boolean;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    rotation?: number;
  };
  capabilities?: {
    canDownload?: boolean;
  };
  copyRequiresWriterPermission?: boolean;
}

/**
 * Verifica se um item retornado pela Google Drive API v3 é uma fotografia válida para a galeria,
 * excluindo lixeira, pastas, atalhos, vídeos, PDFs e formatos incompatíveis.
 */
export function isEligibleDriveImage(file: RawDriveFileMetadata): boolean {
  if (!file || typeof file.id !== 'string' || file.id.trim().length === 0) {
    return false;
  }
  if (file.trashed === true) {
    return false;
  }
  const mime = (file.mimeType ?? '').toLowerCase().trim();
  if (mime === 'application/vnd.google-apps.folder') {
    return false;
  }
  if (mime.startsWith('application/vnd.google-apps.')) {
    return false;
  }
  if (ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    return true;
  }
  // Caso raro de upload sem MIME específico mas extensão de imagem suportada
  if (mime === 'application/octet-stream' && file.name && ALLOWED_IMAGE_EXTENSIONS.test(file.name)) {
    return true;
  }
  return false;
}

/**
 * Ordena itens de forma determinística, com comparação numérica natural dos nomes
 * (ex.: IMG_2.jpg antes de IMG_10.jpg) e desempate estável por `fileId`.
 */
export function sortDriveFilesDeterministically<
  T extends { id: string; name?: string; createdTime?: string },
>(files: readonly T[], sortBy: GallerySortBy = 'name_natural'): T[] {
  const uniqueById = new Map<string, T>();
  for (const item of files) {
    const cleanId = item.id.trim();
    if (!uniqueById.has(cleanId)) {
      uniqueById.set(cleanId, item);
    }
  }

  return Array.from(uniqueById.values()).sort((a, b) => {
    if (sortBy === 'created_asc' || sortBy === 'created_desc') {
      const timeA = a.createdTime ? Date.parse(a.createdTime) : Number.NaN;
      const timeB = b.createdTime ? Date.parse(b.createdTime) : Number.NaN;
      if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
        return sortBy === 'created_asc' ? timeA - timeB : timeB - timeA;
      }
    }

    const nameA = (a.name ?? '').trim();
    const nameB = (b.name ?? '').trim();
    const naturalCmp = naturalCollator.compare(nameA, nameB);
    if (naturalCmp !== 0) return naturalCmp;

    // Desempate exato de caixa/acento e por último fileId imutável
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface NormalizedManualEntriesResult {
  items: ManifestPhotoItem[];
  errors: string[];
}

/**
 * Valida, remove duplicados por `fileId` e preserva rigorosamente a ordem da lista manual.
 */
export function normalizeManualPhotoEntries(
  entries: readonly ManualPhotoInput[],
): NormalizedManualEntriesResult {
  const seenIds = new Set<string>();
  const items: ManifestPhotoItem[] = [];
  const errors: string[] = [];

  entries.forEach((entry, idx) => {
    const parsed = parseDriveFileInput(entry);
    if (parsed.kind === 'invalid') {
      errors.push(`Item manual #${idx + 1}: ${parsed.reason}`);
      return;
    }

    const { fileId, resourceKey } = parsed;
    if (seenIds.has(fileId)) {
      return; // Remove duplicados preservando a primeira ocorrência na ordem da lista
    }
    seenIds.add(fileId);

    const rawPreview = entry.previewUrl?.trim() || null;
    const rawThumb = entry.thumbUrl?.trim() || rawPreview;

    if (isTemporaryDriveThumbnailUrl(rawPreview) || isTemporaryDriveThumbnailUrl(rawThumb)) {
      errors.push(
        `Item manual #${idx + 1} (${fileId}): não utilize thumbnailLink temporário do Google Drive como URL permanente de prévia. Rode "npm run sync" para gerar prévias locais estáveis em WebP.`,
      );
      return;
    }

    let downloadUrl: string;
    try {
      downloadUrl = buildDriveDownloadUrl({
        fileId,
        resourceKey,
        explicitDownloadUrl: entry.downloadUrl,
        forbiddenPreviewUrls: [rawPreview, rawThumb],
      });
    } catch (err) {
      errors.push(
        `Item manual #${idx + 1} (${fileId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const openUrl = buildDriveOpenUrl({
      fileId,
      resourceKey,
      explicitOpenUrl: entry.openUrl,
    });

    const hasPreview = Boolean(rawThumb && rawPreview);
    items.push({
      fileId,
      ...(entry.originalName ? { originalName: entry.originalName.trim() } : {}),
      thumbUrl: rawThumb,
      previewUrl: rawPreview,
      previewStatus: hasPreview ? 'ready' : 'error',
      width: entry.width && entry.width > 0 ? entry.width : 1200,
      height: entry.height && entry.height > 0 ? entry.height : 800,
      downloadUrl,
      openUrl,
      downloadAvailable: entry.downloadAvailable !== false,
      ...(resourceKey ? { resourceKey } : {}),
      ...(entry.createdTime ? { createdTime: entry.createdTime } : {}),
    });
  });

  return { items, errors };
}

/**
 * Atribui os rótulos sequenciais imutáveis `FAN-1` até `FAN-N` sobre a lista completa validada.
 */
export function assignSequentialCodes(
  items: readonly ManifestPhotoItem[],
  photoPrefix = 'FAN',
): CatalogPhoto[] {
  const cleanPrefix = (photoPrefix.trim() || 'FAN').toUpperCase();
  return items.map((item, idx) => {
    const sequenceNumber = idx + 1;
    return {
      ...item,
      sequenceNumber,
      code: `${cleanPrefix}-${sequenceNumber}`,
    };
  });
}

export interface ResolvedCatalogState {
  state: 'ready' | 'empty_unconfigured' | 'empty_configured' | 'config_error';
  photos: CatalogPhoto[];
  totalPhotos: number;
  /** Mensagem segura e clara voltada ao visitante (sem instruções de API ou código) */
  visitorNotice?: string;
}

/**
 * Resolve o catálogo publicado a partir da configuração central e do manifesto local gerado no build.
 * Não realiza chamadas à Google Drive API no navegador do visitante.
 */
export function resolvePublishedCatalog(
  config: GalleryConfig,
  manifest: GalleryManifest,
): ResolvedCatalogState {
  const prefix = config.photoPrefix || 'FAN';

  if (config.sourceMode === 'manual') {
    if (!config.photos || config.photos.length === 0) {
      return {
        state: 'empty_unconfigured',
        photos: [],
        totalPhotos: 0,
        visitorNotice:
          'As fotografias oficiais do FAN 2026 estão sendo organizadas e estarão disponíveis para download gratuito nesta página em breve.',
      };
    }

    // Se o manifesto já foi sincronizado no modo manual com os mesmos IDs, aproveita as prévias WebP locais geradas no build
    const manifestById = new Map<string, ManifestPhotoItem>();
    if (manifest.sourceMode === 'manual' && Array.isArray(manifest.photos)) {
      for (const mp of manifest.photos) {
        manifestById.set(mp.fileId, mp);
      }
    }

    const normalized = normalizeManualPhotoEntries(config.photos);
    if (normalized.items.length === 0 && normalized.errors.length > 0) {
      return {
        state: 'config_error',
        photos: [],
        totalPhotos: 0,
        visitorNotice:
          'Não foi possível carregar o catálogo de fotos neste momento. Tente novamente mais tarde.',
      };
    }

    const mergedItems: ManifestPhotoItem[] = normalized.items.map((manualItem) => {
      const synced = manifestById.get(manualItem.fileId);
      if (synced && synced.previewStatus === 'ready' && synced.thumbUrl && synced.previewUrl) {
        return {
          ...manualItem,
          thumbUrl: manualItem.thumbUrl ?? synced.thumbUrl,
          previewUrl: manualItem.previewUrl ?? synced.previewUrl,
          previewStatus: 'ready',
          width: entryHasExplicitSize(config.photos, manualItem.fileId)
            ? manualItem.width
            : synced.width,
          height: entryHasExplicitSize(config.photos, manualItem.fileId)
            ? manualItem.height
            : synced.height,
          downloadAvailable: synced.downloadAvailable && manualItem.downloadAvailable,
        };
      }
      return manualItem;
    });

    const numbered = assignSequentialCodes(mergedItems, prefix);
    return {
      state: 'ready',
      photos: numbered,
      totalPhotos: numbered.length,
    };
  }

  // Modo pasta ("folder")
  const parsedFolder = parseDriveFolderInput(config.driveFolderUrl);
  if (parsedFolder.kind === 'unconfigured') {
    return {
      state: 'empty_unconfigured',
      photos: [],
      totalPhotos: 0,
      visitorNotice:
        'As fotografias oficiais do FAN 2026 estão sendo preparadas e serão publicadas aqui em breve.',
    };
  }

  if (parsedFolder.kind === 'invalid') {
    return {
      state: 'config_error',
      photos: [],
      totalPhotos: 0,
      visitorNotice:
        'O acervo fotográfico passa por atualização no momento. Volte em instantes para acessar os registros do evento.',
    };
  }

  if (manifest.status === 'error') {
    return {
      state: 'config_error',
      photos: [],
      totalPhotos: 0,
      visitorNotice:
        'Não foi possível carregar as prévias sincronizadas do evento neste momento.',
    };
  }

  // Garante que o manifesto corresponde à pasta atualmente configurada em gallery.ts
  if (manifest.folderId && manifest.folderId !== parsedFolder.folderId) {
    return {
      state: 'empty_configured',
      photos: [],
      totalPhotos: 0,
      visitorNotice:
        'O catálogo fotográfico foi atualizado e aguarda a publicação das novas prévias.',
    };
  }

  const validManifestPhotos = (manifest.photos ?? []).filter(
    (p) =>
      Boolean(p.fileId) &&
      !isTemporaryDriveThumbnailUrl(p.thumbUrl) &&
      !isTemporaryDriveThumbnailUrl(p.previewUrl),
  );

  if (validManifestPhotos.length === 0) {
    return {
      state: manifest.status === 'ready' ? 'empty_configured' : 'empty_unconfigured',
      photos: [],
      totalPhotos: 0,
      visitorNotice:
        manifest.status === 'ready'
          ? 'Nenhuma fotografia publicada nesta pasta até o momento.'
          : 'As fotografias oficiais do FAN 2026 serão publicadas nesta galeria em breve.',
    };
  }

  const numbered = assignSequentialCodes(validManifestPhotos, prefix);
  return {
    state: 'ready',
    photos: numbered,
    totalPhotos: numbered.length,
  };
}

function entryHasExplicitSize(entries: readonly ManualPhotoInput[], fileId: string): boolean {
  return entries.some((entry) => {
    const parsed = parseDriveFileInput(entry);
    return (
      parsed.kind === 'ok' &&
      parsed.fileId === fileId &&
      typeof entry.width === 'number' &&
      typeof entry.height === 'number'
    );
  });
}

/**
 * Filtra fotos pelo código `FAN-N` (aceita "FAN-125", "fan 125", "fan125", "125" ou "FAN-0125")
 * sem jamais renumerar ou alterar o código original de cada fotografia.
 */
export function filterPhotosByCode(
  photos: readonly CatalogPhoto[],
  rawQuery: string,
  photoPrefix = 'FAN',
): CatalogPhoto[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return [...photos];
  }

  const cleanPrefix = (photoPrefix.trim() || 'FAN').toUpperCase();
  const upper = trimmed.toUpperCase();

  // Normaliza prefixo opcional: "FAN-125", "FAN 125", "FAN_125", "FAN125" ou apenas "125"
  const escapedPrefix = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const codePattern = new RegExp(`^(?:${escapedPrefix}[\\s\\-_#]*)?0*(\\d+)$`, 'i');
  const match = upper.match(codePattern);

  if (match) {
    const numericTarget = match[1]; // sem zeros à esquerda (ex.: "0125" -> "125", "0" -> "0")
    return photos.filter((photo) => String(photo.sequenceNumber).startsWith(numericTarget));
  }

  // Se o visitante digitou apenas parte do prefixo (ex.: "FA" ou "FAN" ou "FAN-"), mantém todas na ordem original
  if (`${cleanPrefix}-`.startsWith(upper)) {
    return [...photos];
  }

  // Qualquer outro termo alfanumérico compara contra o código público FAN-N sem alterar rótulos
  return photos.filter((photo) => photo.code.toUpperCase().includes(upper));
}
