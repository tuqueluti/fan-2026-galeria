/**
 * Resolve caminhos públicos locais (`/logos/...`, `/previews/...`) respeitando `import.meta.env.BASE_URL`.
 * Funciona tanto em domínio raiz (`/`) quanto em subcaminhos de hospedagem estática como GitHub Pages (`./`).
 */
export function resolvePublicAssetUrl(assetPath: string | null | undefined): string | null {
  if (!assetPath) return null;
  const trimmed = assetPath.trim();
  if (!trimmed) return null;

  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const base =
    (typeof import.meta.env !== 'undefined' ? import.meta.env.BASE_URL : './') || './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanRelative = trimmed.replace(/^\.?\//, '');
  return `${normalizedBase}${cleanRelative}`;
}
