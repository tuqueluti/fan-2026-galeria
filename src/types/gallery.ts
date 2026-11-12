export type SourceMode = 'folder' | 'manual';

export type GallerySortBy = 'name_natural' | 'created_asc' | 'created_desc';

export type PreviewStatus = 'ready' | 'error';

/**
 * Item individual configurado manualmente em `src/config/gallery.ts`
 * quando `sourceMode` está definido como `"manual"`.
 */
export interface ManualPhotoInput {
  /** Link de compartilhamento do arquivo no Google Drive (/file/d/ID/view, /open?id=ID ou /uc?id=ID) */
  shareUrl?: string;
  /** ID explícito do arquivo no Google Drive (alternativa ou complemento ao shareUrl) */
  fileId?: string;
  /** Parâmetro resourceKey do Google Drive, quando exigido pelo link compartilhado */
  resourceKey?: string;
  /** Caminho local (ex.: "/previews/custom/foto-1.webp") ou URL durável de prévia ampliada */
  previewUrl?: string;
  /** Caminho local opcional para miniatura da grade; se omitido, usa previewUrl ou a miniatura gerada no sync */
  thumbUrl?: string;
  /** URL explícita de download direto do original no Google Drive, quando disponível */
  downloadUrl?: string;
  /** URL explícita para abrir a visualização do arquivo no Google Drive */
  openUrl?: string;
  /** Nome original do arquivo (informativo e usado apenas para acessibilidade/metadados internos) */
  originalName?: string;
  /** Largura conhecida da imagem em pixels para reserva de proporção */
  width?: number;
  /** Altura conhecida da imagem em pixels para reserva de proporção */
  height?: number;
  /** Data ISO opcional de criação/captura */
  createdTime?: string;
  /** Permite sinalizar explicitamente se o download público está permitido na origem (padrão: true) */
  downloadAvailable?: boolean;
}

export interface GalleryLogosConfig {
  /** Logo principal da Moove Connect (branca com símbolo circular roxo) */
  moove: string;
  /** Símbolo circular isolado da Moove Connect */
  mooveSymbol?: string;
  /** Logo institucional oficial da ACIVA para fundo escuro */
  aciva: string;
  /** Logo oficial da edição FAN 2026 */
  fan: string;
}

export interface GalleryInstitutionalLinks {
  /** Site oficial da Moove Connect */
  mooveWebsite: string;
  /** Instagram oficial da Moove Connect */
  mooveInstagram: string;
  /** Site institucional da ACIVA */
  acivaWebsite?: string;
  /** Página oficial de referência do evento FAN 2026 */
  eventPageUrl?: string;
  /**
   * Canal real para solicitar retirada de fotografia (ex.: "mailto:contato@..." ou link WhatsApp).
   * Deixe vazio ("") enquanto não houver canal confirmado; o rodapé oculta o link automaticamente.
   */
  photoRemovalContact?: string;
}

export interface GalleryConfig {
  /** Nome principal do evento exibido na abertura e no cabeçalho de contexto */
  eventName: string;
  /** Subtítulo oficial do evento */
  eventSubtitle: string;
  /** Nome oficial da agência apresentadora da galeria */
  agencyName: string;
  /** Nome curto da entidade realizadora */
  organizerName: string;
  /** Prefixo usado na numeração sequencial das fotografias (ex.: "FAN" -> FAN-1..FAN-N) */
  photoPrefix: string;
  /** Origem do catálogo: "folder" (pasta pública do Drive sincronizada no build) ou "manual" (lista individual) */
  sourceMode: SourceMode;
  /** Link público da pasta no Google Drive usado pelo script de sincronização quando sourceMode = "folder" */
  driveFolderUrl: string;
  /**
   * Quando true, percorre subpastas explicitamente durante a sincronização da pasta do Drive.
   * Por padrão deve permanecer false (apenas arquivos diretos da pasta configurada).
   */
  includeSubfolders: boolean;
  /** Atalho direto para o site oficial da Moove Connect */
  mooveWebsite: string;
  /** Links institucionais centralizados */
  links: GalleryInstitutionalLinks;
  /** Caminhos públicos das logos obrigatórias */
  logos: GalleryLogosConfig;
  /** Caminho opcional de imagem de capa real do evento (deixe null para não exibir foto de capa) */
  coverImage: string | null;
  /** Configuração de ordenação determinística no modo pasta */
  sorting: {
    by: GallerySortBy;
  };
  /** Configuração de paginação/carregamento incremental na grade */
  pagination: {
    pageSize: number;
  };
  /** Lista de links individuais usada quando sourceMode = "manual" */
  photos: ManualPhotoInput[];
}

/**
 * Item gravado no manifesto local gerado pelo script de build (`src/generated/gallery-manifest.json`).
 * Nunca armazena `thumbnailLink` temporário do Drive nem chaves de API.
 */
export interface ManifestPhotoItem {
  fileId: string;
  originalName?: string;
  thumbUrl: string | null;
  previewUrl: string | null;
  previewStatus: PreviewStatus;
  width: number;
  height: number;
  downloadUrl: string;
  openUrl: string;
  downloadAvailable: boolean;
  resourceKey?: string;
  createdTime?: string;
  modifiedTime?: string;
}

export type ManifestStatus = 'unconfigured' | 'ready' | 'error';

export interface GalleryManifest {
  schemaVersion: 1;
  status: ManifestStatus;
  sourceMode: SourceMode;
  generatedAt: string | null;
  folderId?: string | null;
  totalPhotos: number;
  photos: ManifestPhotoItem[];
}

/**
 * Fotografia pronta para exibição na interface, com numeração permanente `FAN-1` até `FAN-N`
 * atribuída sobre a lista completa antes de qualquer busca ou paginação.
 */
export interface CatalogPhoto extends ManifestPhotoItem {
  /** Posição sequencial 1-based na lista completa (1..N) */
  sequenceNumber: number;
  /** Código público imutável da foto (ex.: "FAN-1", "FAN-125") */
  code: string;
}
