// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { galleryConfig } from '../src/config/gallery';
import { runGallerySync } from '../src/sync/syncEngine';
import type { GalleryConfig } from '../src/types/gallery';

async function makeTestImageBuffer(width: number, height: number, color = '#7246e5'): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
}

describe('Motor de sincronização e geração de prévias WebP estáveis (build-time)', () => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fan2026-sync-test-'));
  });

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('falha com diagnóstico explícito quando pasta ou API key estão ausentes', async () => {
    const unconfiguredRes = await runGallerySync({
      projectRoot: tempRoot,
      config: { ...galleryConfig, sourceMode: 'folder', driveFolderUrl: 'COLE_AQUI_O_LINK_DA_PASTA' },
      apiKey: 'AIzaFakeKey123456',
    });
    expect(unconfiguredRes.ok).toBe(false);
    if (!unconfiguredRes.ok) {
      expect(unconfiguredRes.code).toBe('UNCONFIGURED_FOLDER');
    }

    const noKeyRes = await runGallerySync({
      projectRoot: tempRoot,
      config: {
        ...galleryConfig,
        sourceMode: 'folder',
        driveFolderUrl: 'https://drive.google.com/drive/folders/1PastaRealTeste12345',
      },
      apiKey: '',
    });
    expect(noKeyRes.ok).toBe(false);
    if (!noKeyRes.ok) {
      expect(noKeyRes.code).toBe('MISSING_API_KEY');
    }
  });

  it('percorre nextPageToken, filtra arquivos inválidos, ordena naturalmente, gera WebPs leves sem ampliar pequenos e usa cache', async () => {
    const largeJpeg = await makeTestImageBuffer(2400, 1600, '#825aff');
    const smallPng = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#22aa66' },
    })
      .png()
      .toBuffer();
    const tinyGenericIcon = await makeTestImageBuffer(32, 32, '#cccccc');

    let mediaDownloadCalls = 0;
    const fakeApiKey = 'AIzaSyTestSecretKeyDoNotLeak999';

    const fakeFetch: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());

      // 1) Checagem da pasta raiz com resourceKey
      if (url.pathname === '/drive/v3/files/1PastaEventoFAN2026') {
        const rkHeader = new Headers(init?.headers).get('X-Goog-Drive-Resource-Keys');
        expect(rkHeader).toContain('1PastaEventoFAN2026/0-pastaRK');
        return new Response(
          JSON.stringify({
            id: '1PastaEventoFAN2026',
            name: 'FAN 2026 Fotos',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      // 2) Listagem paginada (Página 1 -> Página 2)
      if (url.pathname === '/drive/v3/files') {
        expect(url.searchParams.get('supportsAllDrives')).toBe('true');
        expect(url.searchParams.get('includeItemsFromAllDrives')).toBe('true');
        const token = url.searchParams.get('pageToken');

        if (!token) {
          return new Response(
            JSON.stringify({
              nextPageToken: 'pagina-2',
              files: [
                {
                  id: '1FotoDezID000010',
                  name: 'FAN_10.jpg',
                  mimeType: 'image/jpeg',
                  trashed: false,
                  modifiedTime: '2026-11-12T10:00:00Z',
                  md5Checksum: 'md5-10',
                  resourceKey: '0-rk10',
                  webContentLink: 'https://drive.google.com/uc?id=1FotoDezID000010&export=download',
                  webViewLink: 'https://drive.google.com/file/d/1FotoDezID000010/view',
                  thumbnailLink: 'https://lh3.googleusercontent.com/d/1FotoDezID000010=s220',
                  hasThumbnail: true,
                  imageMediaMetadata: { width: 2400, height: 1600 },
                  capabilities: { canDownload: true },
                },
                {
                  id: '1SubpastaIgnorada99',
                  name: 'Bastidores',
                  mimeType: 'application/vnd.google-apps.folder',
                  trashed: false,
                },
                {
                  id: '1VideoIgnorado888',
                  name: 'abertura.mp4',
                  mimeType: 'video/mp4',
                  trashed: false,
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (token === 'pagina-2') {
          return new Response(
            JSON.stringify({
              files: [
                {
                  // Duplicado da página 1: deve ser removido por fileId
                  id: '1FotoDezID000010',
                  name: 'FAN_10.jpg',
                  mimeType: 'image/jpeg',
                  trashed: false,
                },
                {
                  // Nome natural menor: FAN_2.png deve ordenar ANTES de FAN_10.jpg
                  id: '1FotoDoisPequena02',
                  name: 'FAN_2.png',
                  mimeType: 'image/png',
                  trashed: false,
                  modifiedTime: '2026-11-12T10:05:00Z',
                  md5Checksum: 'md5-02',
                  webContentLink: 'https://drive.google.com/uc?id=1FotoDoisPequena02&export=download',
                  thumbnailLink: 'https://lh3.googleusercontent.com/d/1FotoDoisPequena02=s220',
                  hasThumbnail: true,
                  imageMediaMetadata: { width: 320, height: 240 },
                  capabilities: { canDownload: false },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
      }

      // 3) Miniaturas temporárias durante o build:
      // Para 1FotoDezID000010 devolve ícone minúsculo 32x32 para forçar fallback ao original temporário!
      if (url.hostname === 'lh3.googleusercontent.com') {
        if (url.pathname.includes('1FotoDezID000010')) {
          return new Response(tinyGenericIcon, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          });
        }
        if (url.pathname.includes('1FotoDoisPequena02')) {
          return new Response(smallPng, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          });
        }
      }

      // 4) Download temporário do original via alt=media no build
      if (
        url.pathname === '/drive/v3/files/1FotoDezID000010' ||
        url.searchParams.get('alt') === 'media'
      ) {
        mediaDownloadCalls += 1;
        return new Response(largeJpeg, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        });
      }

      return new Response('Not found', { status: 404 });
    };

    const testConfig: GalleryConfig = {
      ...galleryConfig,
      sourceMode: 'folder',
      driveFolderUrl:
        'https://drive.google.com/drive/folders/1PastaEventoFAN2026?resourcekey=0-pastaRK',
      includeSubfolders: false,
    };

    const firstRun = await runGallerySync({
      projectRoot: tempRoot,
      config: testConfig,
      apiKey: fakeApiKey,
      fetchImpl: fakeFetch,
    });

    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) return;

    expect(firstRun.stats.pagesFetched).toBe(2);
    expect(firstRun.stats.skippedFolders).toBe(1);
    expect(firstRun.stats.skippedIncompatible).toBe(1);
    expect(firstRun.stats.duplicatesRemoved).toBe(1);
    expect(firstRun.manifest.totalPhotos).toBe(2);
    expect(mediaDownloadCalls).toBe(1);

    // Ordenação numérica natural: FAN_2.png (1FotoDoisPequena02) antes de FAN_10.jpg (1FotoDezID000010)
    const [firstPhoto, secondPhoto] = firstRun.manifest.photos;
    expect(firstPhoto.fileId).toBe('1FotoDoisPequena02');
    expect(firstPhoto.downloadAvailable).toBe(false);
    expect(secondPhoto.fileId).toBe('1FotoDezID000010');
    expect(secondPhoto.downloadAvailable).toBe(true);
    expect(secondPhoto.downloadUrl).toContain('resourcekey=0-rk10');

    // Dimensões das prévias geradas em disco: sem ampliar imagem pequena (320x240) e limitando a grande (<=1400)
    const smallLargeMeta = await sharp(
      await fs.readFile(path.join(tempRoot, 'public', 'previews', 'large', '1FotoDoisPequena02.webp')),
    ).metadata();
    expect(smallLargeMeta.width).toBe(320);
    expect(smallLargeMeta.height).toBe(240);

    const bigThumbMeta = await sharp(
      await fs.readFile(path.join(tempRoot, 'public', 'previews', 'thumbs', '1FotoDezID000010.webp')),
    ).metadata();
    expect(bigThumbMeta.width).toBe(560);

    const bigLargeMeta = await sharp(
      await fs.readFile(path.join(tempRoot, 'public', 'previews', 'large', '1FotoDezID000010.webp')),
    ).metadata();
    expect(bigLargeMeta.width).toBe(1400);

    // Manifesto não contém API key nem thumbnailLink temporário, e não há originais JPG/PNG em public/
    const rawManifestText = await fs.readFile(
      path.join(tempRoot, 'src', 'generated', 'gallery-manifest.json'),
      'utf-8',
    );
    expect(rawManifestText).not.toContain(fakeApiKey);
    expect(rawManifestText).not.toContain('googleusercontent.com');

    // Segunda execução idêntica deve usar 100% do cache (0 novos downloads de mídia)
    const secondRun = await runGallerySync({
      projectRoot: tempRoot,
      config: testConfig,
      apiKey: fakeApiKey,
      fetchImpl: fakeFetch,
    });
    expect(secondRun.ok).toBe(true);
    if (secondRun.ok) {
      expect(secondRun.stats.cacheHits).toBe(2);
      expect(secondRun.stats.generatedPreviews).toBe(0);
    }
    expect(mediaDownloadCalls).toBe(1);
  });

  it('sincroniza modo manual preservando a ordem exata da lista sem consultar pasta', async () => {
    const localSampleDir = path.join(tempRoot, 'public', 'samples');
    await fs.mkdir(localSampleDir, { recursive: true });
    const imgBuf = await makeTestImageBuffer(1800, 1200, '#6a36d1');
    await fs.writeFile(path.join(localSampleDir, 'manual-a.jpg'), imgBuf);
    await fs.writeFile(path.join(localSampleDir, 'manual-b.jpg'), imgBuf);

    const manualConfig: GalleryConfig = {
      ...galleryConfig,
      sourceMode: 'manual',
      driveFolderUrl: 'COLE_AQUI_O_LINK_DA_PASTA',
      photos: [
        {
          shareUrl: 'https://drive.google.com/file/d/1ZetaPrimeiroNaOrdem/view?usp=sharing',
          previewUrl: '/samples/manual-a.jpg',
          originalName: 'Z_999.jpg',
        },
        {
          shareUrl: 'https://drive.google.com/open?id=1AlfaSegundoNaOrdem',
          previewUrl: '/samples/manual-b.jpg',
          originalName: 'A_001.jpg',
        },
        {
          // Duplicado do primeiro item: deve ser ignorado mantendo a ordem
          fileId: '1ZetaPrimeiroNaOrdem',
          previewUrl: '/samples/manual-a.jpg',
        },
      ],
    };

    const res = await runGallerySync({
      projectRoot: tempRoot,
      config: manualConfig,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.manifest.photos.map((p) => p.fileId)).toEqual([
      '1ZetaPrimeiroNaOrdem',
      '1AlfaSegundoNaOrdem',
    ]);
  });
});
