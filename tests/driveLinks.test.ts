import { describe, expect, it } from 'vitest';
import {
  buildDriveDownloadUrl,
  buildDriveOpenUrl,
  isTemporaryDriveThumbnailUrl,
  parseDriveFileInput,
  parseDriveFolderInput,
} from '../src/domain/driveLinks';

describe('Domínio Google Drive: extração de IDs, resourceKey e links públicos', () => {
  it('identifica marcador padrão de pasta como não configurado', () => {
    expect(parseDriveFolderInput('COLE_AQUI_O_LINK_DA_PASTA')).toEqual({
      kind: 'unconfigured',
    });
    expect(parseDriveFolderInput('   ')).toEqual({ kind: 'unconfigured' });
  });

  it('extrai folderId e resourceKey de formatos de pasta do Google Drive', () => {
    expect(
      parseDriveFolderInput(
        'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx?resourcekey=0-xyz987&usp=sharing',
      ),
    ).toEqual({
      kind: 'ok',
      folderId: '1AbCdEfGhIjKlMnOpQrStUvWx',
      resourceKey: '0-xyz987',
    });

    expect(
      parseDriveFolderInput(
        'https://drive.google.com/drive/u/2/folders/1PastaCompartilhada2026ABC',
      ),
    ).toEqual({
      kind: 'ok',
      folderId: '1PastaCompartilhada2026ABC',
    });

    expect(
      parseDriveFolderInput(
        'https://drive.google.com/open?id=1PastaViaOpenParametro99&resourceKey=0-rkOpen',
      ),
    ).toEqual({
      kind: 'ok',
      folderId: '1PastaViaOpenParametro99',
      resourceKey: '0-rkOpen',
    });
  });

  it('rejeita link de arquivo único colado por engano em driveFolderUrl', () => {
    const res = parseDriveFolderInput(
      'https://drive.google.com/file/d/1ArquivoUnico123456789/view?usp=sharing',
    );
    expect(res.kind).toBe('invalid');
  });

  it('extrai fileId e resourceKey nos três formatos manuais exigidos e bloqueia link de pasta', () => {
    expect(
      parseDriveFileInput({
        shareUrl:
          'https://drive.google.com/file/d/1FotoViewId000001/view?usp=drive_link&resourcekey=0-rk1',
      }),
    ).toEqual({
      kind: 'ok',
      fileId: '1FotoViewId000001',
      resourceKey: '0-rk1',
    });

    expect(
      parseDriveFileInput({
        shareUrl: 'https://drive.google.com/open?id=1FotoOpenId000002',
      }),
    ).toEqual({
      kind: 'ok',
      fileId: '1FotoOpenId000002',
    });

    expect(
      parseDriveFileInput({
        shareUrl: 'https://drive.google.com/uc?id=1FotoUcId00000003&export=download',
      }),
    ).toEqual({
      kind: 'ok',
      fileId: '1FotoUcId00000003',
    });

    const folderInManual = parseDriveFileInput({
      shareUrl: 'https://drive.google.com/drive/folders/1PastaNaListaManual999',
    });
    expect(folderInManual.kind).toBe('invalid');
  });

  it('prioriza webContentLink, preserva resourcekey, remove qualquer key de API e bloqueia URL da prévia', () => {
    const url = buildDriveDownloadUrl({
      fileId: '1FotoSegura987654321',
      resourceKey: '0-secKey',
      webContentLink:
        'https://drive.google.com/uc?id=1FotoSegura987654321&export=download&key=VAZAMENTO_TESTE',
      forbiddenPreviewUrls: ['/previews/thumbs/1FotoSegura987654321.webp'],
    });

    expect(url).not.toContain('VAZAMENTO_TESTE');
    expect(url).not.toMatch(/[?&]key=/i);
    expect(url).toContain('resourcekey=0-secKey');
    expect(url).toContain('export=download');

    expect(() =>
      buildDriveDownloadUrl({
        fileId: '1FotoSegura987654321',
        explicitDownloadUrl: 'https://cdn.exemplo.com/preview.webp',
        forbiddenPreviewUrls: ['https://cdn.exemplo.com/preview.webp'],
      }),
    ).toThrow(/prévia/i);

    const openUrl = buildDriveOpenUrl({
      fileId: '1FotoSegura987654321',
      resourceKey: '0-secKey',
    });
    expect(openUrl).toBe(
      'https://drive.google.com/file/d/1FotoSegura987654321/view?resourcekey=0-secKey',
    );
  });

  it('detecta thumbnailLink temporário do Google Drive para impedir gravação no catálogo', () => {
    expect(
      isTemporaryDriveThumbnailUrl('https://lh3.googleusercontent.com/d/1Abc=s220'),
    ).toBe(true);
    expect(
      isTemporaryDriveThumbnailUrl('https://drive.google.com/thumbnail?id=1Abc&sz=w600'),
    ).toBe(true);
    expect(isTemporaryDriveThumbnailUrl('/previews/thumbs/1Abc.webp')).toBe(false);
  });
});
