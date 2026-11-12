import type { GalleryConfig } from '../types/gallery';

/**
 * Configuração centralizada da Galeria Oficial do FAN 2026.
 *
 * Como atualizar a galeria:
 * 1. Para importar uma pasta pública do Google Drive:
 *    - Mantenha `sourceMode: "folder"`.
 *    - Cole o link da pasta pública em `driveFolderUrl`.
 *    - Defina `GOOGLE_DRIVE_API_KEY` no arquivo `.env` local (apenas no computador de build).
 *    - Execute `npm run sync` e depois `npm run build`.
 *
 * 2. Para usar uma lista manual de fotos individuais sem consultar pasta:
 *    - Altere `sourceMode` para `"manual"`.
 *    - Preencha `photos` com os links individuais (`/file/d/ID/view`, `/open?id=ID` ou `/uc?id=ID`).
 *    - Execute `npm run sync` (para gerar prévias WebP locais) e `npm run build`.
 */
export const galleryConfig: GalleryConfig = {
  eventName: 'FAN 2026',
  eventSubtitle: 'Fórum ACIVA de Networking',
  agencyName: 'Moove Connect',
  organizerName: 'ACIVA',
  photoPrefix: 'FAN',

  // Modo de origem: "folder" (pasta do Google Drive via build sync) ou "manual" (lista `photos` abaixo)
  sourceMode: 'folder',

  // Pasta pública oficial do evento no Google Drive ("Qualquer pessoa com o link pode ver")
  driveFolderUrl:
    'https://drive.google.com/drive/folders/1Lnh0VZpmXKEU8YLWIGv86oz0s9mpJWXu?usp=sharing',

  // Ativado explicitamente para varrer subpastas do evento (ex.: "Dia 01", "Dia 02") dentro da pasta raiz.
  includeSubfolders: true,

  // Link principal da Moove Connect (mantido também em `links` para conveniência)
  mooveWebsite: 'https://moove.marketing/',

  links: {
    mooveWebsite: 'https://moove.marketing/',
    mooveInstagram: 'https://www.instagram.com/mooveconnect/',
    acivaWebsite: 'https://www.acivaararangua.com.br/',
    eventPageUrl: 'https://www.sympla.com.br/evento/fan-forum-aciva-de-networking/3601521',
    // Preencha apenas com um canal real confirmado (ex.: "mailto:contato@moove.marketing").
    // Enquanto vazio, o link de solicitação de retirada não é exibido no rodapé.
    photoRemovalContact: '',
  },

  logos: {
    moove: '/logos/moove-connect.png',
    mooveSymbol: '/logos/moove-symbol.png',
    aciva: '/logos/aciva.png',
    fan: '/logos/fan-2026.png',
  },

  // Imagem de capa opcional (ex.: "/capa-fan-2026.webp"). Use `null` quando não houver foto oficial configurada.
  coverImage: null,

  sorting: {
    // "name_natural" aplica ordenação numérica natural determinística nos nomes dos arquivos (ex.: foto-2 antes de foto-10)
    by: 'name_natural',
  },

  pagination: {
    // Quantidade de fotos carregadas por página/lote na grade (múltiplo de 2, 3 e 4 colunas)
    pageSize: 24,
  },

  // Lista manual de fotografias individuais (usada quando `sourceMode: "manual"`).
  // Exemplo:
  // {
  //   shareUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing',
  //   originalName: 'IMG_0001.JPG',
  // }
  photos: [],
};

export default galleryConfig;
