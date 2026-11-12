import type { ManualPhotoInput } from '../types/gallery';

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^cole_aqui/i,
  /^seu_link/i,
  /^insira_aqui/i,
  /^paste_here/i,
  /^todo$/i,
  /^changeme$/i,
];

const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]{10,120}$/;

const ALLOWED_DRIVE_HOSTS = new Set([
  'drive.google.com',
  'www.drive.google.com',
  'drive.usercontent.google.com',
  'docs.google.com',
]);

export type ParsedFolderResult =
  | { kind: 'unconfigured' }
  | { kind: 'ok'; folderId: string; resourceKey?: string }
  | { kind: 'invalid'; reason: string };

export type ParsedFileResult =
  | { kind: 'ok'; fileId: string; resourceKey?: string }
  | { kind: 'invalid'; reason: string };

export function isPlaceholderValue(raw: string | undefined | null): boolean {
  const trimmed = (raw ?? '').trim();
  return PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed));
}

export function isValidDriveId(candidate: string | undefined | null): candidate is string {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (isPlaceholderValue(trimmed)) return false;
  return DRIVE_ID_REGEX.test(trimmed);
}

/**
 * Garante que o identificador usado em nomes de arquivos locais contenha apenas caracteres seguros.
 */
export function sanitizeFileIdForFilename(fileId: string): string {
  const trimmed = fileId.trim();
  if (!isValidDriveId(trimmed)) {
    throw new Error(`Identificador de arquivo inválido para geração de ativo local: "${fileId}"`);
  }
  return trimmed;
}

function readResourceKeyFromParams(searchParams: URLSearchParams): string | undefined {
  for (const [k, v] of searchParams.entries()) {
    if (k.toLowerCase() === 'resourcekey' && v.trim().length > 0) {
      return v.trim();
    }
  }
  return undefined;
}

/**
 * Extrai `folderId` e `resourceKey` opcional de URLs de pastas do Google Drive ou de um ID puro.
 */
export function parseDriveFolderInput(rawInput: string | undefined | null): ParsedFolderResult {
  const raw = (rawInput ?? '').trim();
  if (isPlaceholderValue(raw)) {
    return { kind: 'unconfigured' };
  }

  // Caso o responsável informe diretamente o ID da pasta
  if (!raw.includes('/') && !raw.includes(':') && !raw.includes('?')) {
    if (isValidDriveId(raw)) {
      return { kind: 'ok', folderId: raw };
    }
    return {
      kind: 'invalid',
      reason: `O identificador de pasta "${raw}" não possui o formato válido do Google Drive.`,
    };
  }

  const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return {
      kind: 'invalid',
      reason: `A URL de pasta informada ("${raw}") não pôde ser interpretada.`,
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_DRIVE_HOSTS.has(host)) {
    return {
      kind: 'invalid',
      reason: `Domínio "${host}" incompatível. Informe um link de pasta do Google Drive (drive.google.com).`,
    };
  }

  if (/\/file\/d\/[A-Za-z0-9_-]+/i.test(parsed.pathname)) {
    return {
      kind: 'invalid',
      reason:
        'O link informado em driveFolderUrl aponta para um único arquivo (/file/d/...), e não para uma pasta. Use um link /drive/folders/ID ou ative sourceMode: "manual".',
    };
  }

  const resourceKey = readResourceKeyFromParams(parsed.searchParams);

  // Formato /drive/folders/ID ou /drive/u/0/folders/ID
  const folderMatch = parsed.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/i);
  if (folderMatch && isValidDriveId(folderMatch[1])) {
    return {
      kind: 'ok',
      folderId: folderMatch[1],
      ...(resourceKey ? { resourceKey } : {}),
    };
  }

  // Formato /open?id=ID
  if (parsed.pathname === '/open' || parsed.pathname.endsWith('/open')) {
    const queryId = parsed.searchParams.get('id')?.trim();
    if (isValidDriveId(queryId)) {
      return {
        kind: 'ok',
        folderId: queryId,
        ...(resourceKey ? { resourceKey } : {}),
      };
    }
  }

  return {
    kind: 'invalid',
    reason: `Não foi possível extrair o ID da pasta a partir de "${raw}". Esperado: https://drive.google.com/drive/folders/ID_DA_PASTA`,
  };
}

/**
 * Extrai `fileId` e `resourceKey` de entradas manuais (`shareUrl` nos formatos comuns ou `fileId`).
 */
export function parseDriveFileInput(entry: ManualPhotoInput): ParsedFileResult {
  const explicitResourceKey = entry.resourceKey?.trim() || undefined;
  const explicitId = entry.fileId?.trim();
  const rawShareUrl = entry.shareUrl?.trim();

  if (explicitId && !rawShareUrl) {
    if (!isValidDriveId(explicitId)) {
      return {
        kind: 'invalid',
        reason: `fileId manual inválido: "${explicitId}".`,
      };
    }
    return {
      kind: 'ok',
      fileId: explicitId,
      ...(explicitResourceKey ? { resourceKey: explicitResourceKey } : {}),
    };
  }

  if (!rawShareUrl) {
    return {
      kind: 'invalid',
      reason: 'Item manual sem shareUrl nem fileId configurados.',
    };
  }

  if (isPlaceholderValue(rawShareUrl)) {
    return {
      kind: 'invalid',
      reason: `Link manual contém marcador não preenchido ("${rawShareUrl}").`,
    };
  }

  // Se shareUrl na verdade recebeu apenas um ID puro
  if (!rawShareUrl.includes('/') && !rawShareUrl.includes(':') && !rawShareUrl.includes('?')) {
    if (isValidDriveId(rawShareUrl)) {
      return {
        kind: 'ok',
        fileId: rawShareUrl,
        ...(explicitResourceKey ? { resourceKey: explicitResourceKey } : {}),
      };
    }
    return {
      kind: 'invalid',
      reason: `Valor "${rawShareUrl}" não é um link ou fileId válido do Google Drive.`,
    };
  }

  const normalizedUrl = /^https?:\/\//i.test(rawShareUrl) ? rawShareUrl : `https://${rawShareUrl}`;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return {
      kind: 'invalid',
      reason: `URL manual malformada: "${rawShareUrl}".`,
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_DRIVE_HOSTS.has(host)) {
    return {
      kind: 'invalid',
      reason: `Domínio "${host}" não pertence ao Google Drive em "${rawShareUrl}".`,
    };
  }

  if (/\/folders\/[A-Za-z0-9_-]+/i.test(parsed.pathname)) {
    return {
      kind: 'invalid',
      reason:
        'URL de pasta detectada dentro da lista manual `photos`. Cadastrar o link de uma pasta não preenche a lista manual: use `sourceMode: "folder"` e `driveFolderUrl`.',
    };
  }

  const urlResourceKey = readResourceKeyFromParams(parsed.searchParams);
  const resourceKey = explicitResourceKey ?? urlResourceKey;

  // 1) drive.google.com/file/d/ID/view (ou /edit, /preview)
  const filePathMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/i);
  if (filePathMatch && isValidDriveId(filePathMatch[1])) {
    const resolvedId = explicitId && isValidDriveId(explicitId) ? explicitId : filePathMatch[1];
    return {
      kind: 'ok',
      fileId: resolvedId,
      ...(resourceKey ? { resourceKey } : {}),
    };
  }

  // 2) drive.google.com/open?id=ID, drive.google.com/uc?id=ID ou drive.usercontent.google.com/download?id=ID
  const queryId = parsed.searchParams.get('id')?.trim();
  if (
    (parsed.pathname.endsWith('/open') ||
      parsed.pathname.endsWith('/uc') ||
      parsed.pathname.endsWith('/download')) &&
    isValidDriveId(queryId)
  ) {
    const resolvedId = explicitId && isValidDriveId(explicitId) ? explicitId : queryId;
    return {
      kind: 'ok',
      fileId: resolvedId,
      ...(resourceKey ? { resourceKey } : {}),
    };
  }

  if (explicitId && isValidDriveId(explicitId)) {
    return {
      kind: 'ok',
      fileId: explicitId,
      ...(resourceKey ? { resourceKey } : {}),
    };
  }

  return {
    kind: 'invalid',
    reason: `Formato de link não reconhecido em "${rawShareUrl}". Use /file/d/ID/view, /open?id=ID ou /uc?id=ID.`,
  };
}

/**
 * Remove qualquer parâmetro sensível (`key`) caso algum link externo tenha sido colado com credencial,
 * e garante `resourcekey` quando exigido pelo arquivo do Google Drive.
 */
export function sanitizePublicDriveUrl(rawUrl: string, resourceKey?: string): string {
  const parsed = new URL(rawUrl);
  for (const param of Array.from(parsed.searchParams.keys())) {
    if (param.toLowerCase() === 'key') {
      parsed.searchParams.delete(param);
    }
  }
  if (
    resourceKey &&
    ALLOWED_DRIVE_HOSTS.has(parsed.hostname.toLowerCase()) &&
    !readResourceKeyFromParams(parsed.searchParams)
  ) {
    parsed.searchParams.set('resourcekey', resourceKey);
  }
  return parsed.toString();
}

/**
 * Detecta `thumbnailLink` efêmero do Google Drive/GoogleUserContent que não pode ser salvo no catálogo publicado.
 */
export function isTemporaryDriveThumbnailUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.googleusercontent.com') || host === 'googleusercontent.com') {
      return true;
    }
    if (ALLOWED_DRIVE_HOSTS.has(host) && parsed.pathname.toLowerCase().includes('/thumbnail')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface BuildDownloadUrlOptions {
  fileId: string;
  resourceKey?: string;
  webContentLink?: string | null;
  explicitDownloadUrl?: string | null;
  forbiddenPreviewUrls?: Array<string | null | undefined>;
}

/**
 * Constrói o link público individual de download direto no Google Drive,
 * priorizando `explicitDownloadUrl` (modo manual) e `webContentLink` (Drive API v3).
 */
export function buildDriveDownloadUrl(options: BuildDownloadUrlOptions): string {
  const { fileId, resourceKey, webContentLink, explicitDownloadUrl, forbiddenPreviewUrls = [] } =
    options;
  const cleanFileId = sanitizeFileIdForFilename(fileId);
  const forbiddenSet = new Set(
    forbiddenPreviewUrls.map((u) => (u ?? '').trim()).filter((u) => u.length > 0),
  );

  if (explicitDownloadUrl && explicitDownloadUrl.trim().length > 0) {
    const candidate = explicitDownloadUrl.trim();
    if (forbiddenSet.has(candidate)) {
      throw new Error(
        `O downloadUrl do item "${cleanFileId}" não pode apontar para o endereço da prévia.`,
      );
    }
    if (!/^https?:\/\//i.test(candidate)) {
      throw new Error(
        `O downloadUrl do item "${cleanFileId}" deve ser uma URL absoluta do Google Drive (https://...).`,
      );
    }
    return sanitizePublicDriveUrl(candidate, resourceKey);
  }

  if (webContentLink && webContentLink.trim().length > 0) {
    return sanitizePublicDriveUrl(webContentLink.trim(), resourceKey);
  }

  const fallback = new URL('https://drive.google.com/uc');
  fallback.searchParams.set('export', 'download');
  fallback.searchParams.set('id', cleanFileId);
  if (resourceKey) {
    fallback.searchParams.set('resourcekey', resourceKey);
  }
  return fallback.toString();
}

export interface BuildOpenUrlOptions {
  fileId: string;
  resourceKey?: string;
  webViewLink?: string | null;
  explicitOpenUrl?: string | null;
}

/**
 * Constrói o link secundário "Abrir no Drive" para visualizar o arquivo diretamente na interface do Google Drive.
 */
export function buildDriveOpenUrl(options: BuildOpenUrlOptions): string {
  const { fileId, resourceKey, webViewLink, explicitOpenUrl } = options;
  const cleanFileId = sanitizeFileIdForFilename(fileId);

  if (explicitOpenUrl && /^https?:\/\//i.test(explicitOpenUrl.trim())) {
    return sanitizePublicDriveUrl(explicitOpenUrl.trim(), resourceKey);
  }

  if (webViewLink && /^https?:\/\//i.test(webViewLink.trim())) {
    return sanitizePublicDriveUrl(webViewLink.trim(), resourceKey);
  }

  const openUrl = new URL(`https://drive.google.com/file/d/${encodeURIComponent(cleanFileId)}/view`);
  if (resourceKey) {
    openUrl.searchParams.set('resourcekey', resourceKey);
  }
  return openUrl.toString();
}
