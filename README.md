# Galeria Oficial de Fotos · FAN 2026 (Moove Connect & ACIVA)

Aplicação web estática e responsiva para consulta e download gratuito das fotografias do **FAN 2026 (Fórum ACIVA de Networking)**, apresentada pela **Moove Connect** com presença institucional da **ACIVA**.

## Como a arquitetura funciona

A solução separa o armazenamento dos arquivos originais da entrega da interface web:

1. **Google Drive (armazenamento dos originais):** guarda todas as fotografias em resolução original e responde diretamente pelos downloads individuais feitos pelos visitantes.
2. **Aplicação estática em HTML, CSS e JavaScript (`dist/`):** exibe apenas prévias leves em WebP geradas durante o build (`~560 px` na grade e até `1.400 px` no lightbox), numera o acervo de `FAN-1` até `FAN-N` e aponta cada botão de download para o arquivo correspondente no Google Drive.

Não há login, cadastro, banco de dados, formulário de upload, painel administrativo nem download em massa por ZIP. Nenhum arquivo original em alta resolução entra no repositório ou no pacote publicado, e o navegador do visitante nunca consulta a Google Drive API nem recebe chaves técnicas.

## Estado atual dos ativos e da configuração

Você pode conferir o diagnóstico completo a qualquer momento executando:

```bash
npm run status
```

Situação entregue no projeto:

- `public/logos/moove-connect.png` e `public/logos/moove-symbol.png`: integrados com os arquivos PNG transparentes oficiais da Moove Connect (`moove.marketing`).
- `public/logos/aciva.png`: integrado com o arquivo PNG transparente oficial da ACIVA para fundo escuro (`acivaararangua.com.br`).
- `public/logos/fan-2026.png`: **pendente de arquivo oficial**. Como não há PNG transparente isolado da marca do FAN 2026 publicado fora das peças gráficas compostas do evento, nenhum logotipo foi redesenhado ou improvisado. Basta salvar o arquivo oficial transparente em `public/logos/fan-2026.png` para que a abertura e o rodapé passem a exibi-lo automaticamente.
- Origem de fotos (`src/config/gallery.ts`): configurada e sincronizada com a pasta oficial do evento (`1Lnh0VZpmXKEU8YLWIGv86oz0s9mpJWXu`, incluindo a subpasta `Dia 01` via `includeSubfolders: true`), totalizando **207 fotografias publicadas** (`FAN-1` até `FAN-207`) com prévias leves em WebP e download individual direto do Google Drive.

## Requisitos e instalação

- Node.js `20+` (testado em Node `22.19.0`) e `npm`.

```bash
npm install
```

## Passo a passo para publicar fotos a partir de uma pasta do Google Drive

### 1. Compartilhar a pasta no Google Drive

1. Coloque as fotografias finais (`.jpg`, `.jpeg`, `.png` ou `.webp`) na pasta do evento no Google Drive.
2. Clique com o botão direito na pasta, abra **Compartilhar** e ajuste o acesso geral para **Qualquer pessoa com o link** com permissão de **Leitor**.
3. Certifique-se de que a opção que bloqueia o download para leitores esteja desmarcada nas configurações dos arquivos.
4. Copie o link da pasta e abra um dos arquivos em uma janela anônima do navegador (sem conta Google conectada) para confirmar que o download público está liberado.

### 2. Configurar a chave da Google Drive API no ambiente local

Para listar uma pasta pública em tempo de build sem exigir login OAuth, o script `npm run sync` utiliza uma API key da Google Drive API v3:

1. No Google Cloud Console, ative a **Google Drive API** em um projeto e gere uma **Chave de API** (`API Key`).
2. Na raiz deste repositório, copie `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
3. Preencha a chave no arquivo `.env`:
   ```ini
   GOOGLE_DRIVE_API_KEY=sua_chave_aqui
   ```

Essa variável é lida apenas pelos scripts Node.js locais durante a sincronização. Ela identifica a aplicação perante a API do Google, não concede acesso a pastas privadas e nunca é incluída no JavaScript publicado em `dist/`.

### 3. Informar o link da pasta no código (`src/config/gallery.ts`)

Abra `src/config/gallery.ts` e mantenha `sourceMode: 'folder'`, colando o endereço da pasta em `driveFolderUrl`:

```ts
export const galleryConfig: GalleryConfig = {
  eventName: 'FAN 2026',
  eventSubtitle: 'Fórum ACIVA de Networking',
  agencyName: 'Moove Connect',
  organizerName: 'ACIVA',
  photoPrefix: 'FAN',
  sourceMode: 'folder',
  driveFolderUrl: 'https://drive.google.com/drive/folders/ID_DA_PASTA?usp=sharing',
  includeSubfolders: false,
  // ...
};
```

Por padrão (`includeSubfolders: false`), o sincronizador considera apenas as imagens que estão diretamente dentro da pasta informada, ignorando subpastas, lixeira e arquivos de outros formatos. Caso precise percorrer subpastas de forma recursiva, altere explicitamente `includeSubfolders` para `true`.

### 4. Sincronizar prévias e gerar o build estático

```bash
npm run sync
npm run build
```

Ou em um único comando:

```bash
npm run sync:build
```

Durante `npm run sync`, o script:

- Percorre todas as páginas da pasta via `nextPageToken` (compatível com `resourceKey` e drives compartilhados).
- Filtra imagens válidas (`JPEG`, `PNG` e `WebP`), remove duplicados por `fileId` e ordena os itens de forma determinística por comparação numérica natural dos nomes (`IMG_2.jpg` antes de `IMG_10.jpg`).
- Gera miniaturas leves (`~560 px`) em `public/previews/thumbs/<fileId>.webp` e prévias ampliadas (`até 1.400 px`, sem esticar imagens menores) em `public/previews/large/<fileId>.webp`, preservando orientação EXIF e perfil sRGB.
- Grava o catálogo estático em `src/generated/gallery-manifest.json` sem salvar `thumbnailLink` temporário do Drive.
- Reaproveita o cache em `.cache/gallery-sync-cache.json` por `fileId`, `modifiedTime` e `md5Checksum` nas execuções seguintes.

## Como usar o modo manual (links individuais sem pasta)

Quando quiser publicar uma seleção específica de links individuais sem consultar uma pasta no Drive:

1. Em `src/config/gallery.ts`, mude `sourceMode` para `'manual'`.
2. Preencha o array `photos` com os links individuais dos arquivos (`/file/d/ID/view`, `/open?id=ID`, `/uc?id=ID` ou `fileId` direto):

```ts
sourceMode: 'manual',
photos: [
  {
    shareUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view?usp=sharing',
    originalName: 'abertura-palco.jpg',
  },
  {
    shareUrl: 'https://drive.google.com/open?id=1ZyXwVuTsRqPoNmLkJiHgFeDc',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=1ZyXwVuTsRqPoNmLkJiHgFeDc',
  },
],
```

No modo manual, a ordem exata da lista `photos` é mantida e entradas repetidas com o mesmo `fileId` são descartadas. Colar apenas o link de uma pasta dentro de `photos` é rejeitado pela validação; para pastas, use `sourceMode: 'folder'`. Rode `npm run sync` antes de `npm run build` para gerar as prévias WebP locais de cada item manual.

## Regras importantes de manutenção, atualização e retirada de fotos

Adicionar, renomear ou apagar arquivos no Google Drive não altera automaticamente o site já publicado. Sempre que o conteúdo da pasta mudar, execute `npm run sync`, gere um novo `npm run build` e republique a pasta `dist/`.

Os códigos visíveis de `FAN-1` até `FAN-N` pertencem à lista completa ordenada e permanecem fixos durante buscas, paginação e navegação no lightbox. Contudo, inserir novas fotos no meio da ordenação ou remover arquivos existentes deslocará os rótulos das fotos seguintes após uma nova sincronização.

Remover um arquivo do Google Drive (ou restringir sua permissão) interrompe imediatamente novos downloads daquele original no Drive, mas a prévia WebP já publicada na grade continuará visível até que uma nova sincronização (`npm run sync`) e republicação (`npm run build`) sejam realizadas.

O link *Solicitar retirada de fotografia* no rodapé só aparece quando `links.photoRemovalContact` em `src/config/gallery.ts` recebe um contato real confirmado, como `mailto:...` ou WhatsApp oficial.

Em arquivos muito grandes ou picos intensos de acesso simultâneo, o Google Drive pode exibir telas próprias de confirmação ou limites temporários de tráfego. Caso algum arquivo esteja com download bloqueado pelo proprietário no Drive, o card sinaliza a restrição de forma transparente e mantém o atalho *Abrir no Drive*.

## Publicação (Deploy)

Após executar `npm run sync:build`, publique o conteúdo do diretório `dist/` em qualquer serviço de hospedagem estática (Cloudflare Pages, Vercel, Netlify, GitHub Pages, S3 ou servidor HTTP padrão). Nenhuma variável de ambiente ou servidor Node.js é necessário em produção.

## Comandos disponíveis

- `npm run dev`: abre o ambiente local de desenvolvimento com Vite.
- `npm run status`: verifica logos presentes/pendentes, configuração de `src/config/gallery.ts`, chave local e estado do manifesto.
- `npm run sync`: consulta o Google Drive no build, gera as prévias WebP estáveis e atualiza `src/generated/gallery-manifest.json`.
- `npm run build`: executa a checagem estrita de tipos (`tsc -b`) e compila o pacote estático em `dist/`.
- `npm run sync:build`: executa `sync` seguido de `build`.
- `npm run deploy`: compila `dist/` e publica o pacote estático na branch `gh-pages` do repositório remoto (GitHub Pages).
- `npm run preview`: serve localmente o pacote final compilado em `dist/`.
- `npm test`: executa a suíte automatizada de testes em fronteiras públicas (Vitest).
