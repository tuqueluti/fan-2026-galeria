import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { galleryConfig } from '../src/config/gallery';
import type { GalleryConfig, GalleryManifest, ManifestPhotoItem } from '../src/types/gallery';

function createManifestWithPhotos(count: number): GalleryManifest {
  const photos: ManifestPhotoItem[] = Array.from({ length: count }, (_, idx) => {
    const n = idx + 1;
    const fileId = `1FotoIdEventoFAN2026_${String(n).padStart(4, '0')}`;
    return {
      fileId,
      originalName: `IMG_${String(n).padStart(4, '0')}.JPG`,
      thumbUrl: `/previews/thumbs/${fileId}.webp`,
      previewUrl: `/previews/large/${fileId}.webp`,
      previewStatus: n === 3 ? 'error' : 'ready',
      width: 1400,
      height: 933,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      openUrl: `https://drive.google.com/file/d/${fileId}/view`,
      downloadAvailable: n !== 4,
    };
  });

  return {
    schemaVersion: 1,
    status: 'ready',
    sourceMode: 'folder',
    generatedAt: '2026-11-12T20:00:00.000Z',
    folderId: '1PastaOficialFAN2026',
    totalPhotos: count,
    photos,
  };
}

describe('Interface pública da Galeria FAN 2026 (Critérios de aceite 1, 5–11, 14 e 15)', () => {
  it('exibe abertura obrigatória, marcas oficiais, estado vazio limpo e zero elementos de login/admin/upload', () => {
    const emptyConfig: GalleryConfig = {
      ...galleryConfig,
      sourceMode: 'folder',
      driveFolderUrl: 'COLE_AQUI_O_LINK_DA_PASTA',
      links: { ...galleryConfig.links, photoRemovalContact: '' },
    };
    const emptyManifest: GalleryManifest = {
      schemaVersion: 1,
      status: 'unconfigured',
      sourceMode: 'folder',
      generatedAt: null,
      folderId: null,
      totalPhotos: 0,
      photos: [],
    };
    render(<App config={emptyConfig} manifest={emptyManifest} />);

    expect(
      screen.getByRole('heading', { name: 'Suas fotos do FAN 2026 estão aqui.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Encontre seu momento e baixe gratuitamente a foto original em alta resolução.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver fotos do evento/i })).toHaveAttribute(
      'href',
      '#galeria',
    );
    expect(screen.getByRole('link', { name: 'Fotos' })).toHaveAttribute('href', '#galeria');
    expect(screen.getByRole('link', { name: /Conheça a Moove/i })).toHaveAttribute(
      'href',
      'https://moove.marketing/',
    );
    expect(screen.getByText('Galeria por Moove Connect')).toBeInTheDocument();

    // Estado vazio sem fotos fictícias nem instruções técnicas de código/API para o visitante
    expect(screen.getByText('0 fotos publicadas')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-grid')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/GOOGLE_DRIVE_API_KEY|src\/config/i);

    // Zero login, cadastro, upload ou área restrita
    expect(
      screen.queryByRole('button', { name: /login|entrar|cadastrar|upload|enviar|admin/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /login|entrar|cadastrar|upload|painel|admin/i }),
    ).not.toBeInTheDocument();

    // Contato de retirada oculto enquanto vazio na configuração padrão
    expect(
      screen.queryByRole('link', { name: /Solicitar retirada de fotografia/i }),
    ).not.toBeInTheDocument();
  });

  it('exibe contato de retirada apenas quando configurado com dado real', () => {
    const cfgWithRemoval: GalleryConfig = {
      ...galleryConfig,
      links: {
        ...galleryConfig.links,
        photoRemovalContact: 'mailto:privacidade@moove.marketing',
      },
    };
    render(<App config={cfgWithRemoval} />);

    const link = screen.getByRole('link', { name: 'Solicitar retirada de fotografia' });
    expect(link).toHaveAttribute('href', 'mailto:privacidade@moove.marketing');
  });

  it('mantém numeração FAN-1..FAN-N imutável ao paginar, buscar e navegar no lightbox, com links diretos abaixo de cada card', async () => {
    const user = userEvent.setup();
    const populatedConfig: GalleryConfig = {
      ...galleryConfig,
      sourceMode: 'folder',
      driveFolderUrl: 'https://drive.google.com/drive/folders/1PastaOficialFAN2026',
      pagination: { pageSize: 12 },
    };
    const manifest = createManifestWithPhotos(30);

    render(<App config={populatedConfig} manifest={manifest} />);

    expect(screen.getByText('30 fotos disponíveis')).toBeInTheDocument();

    // Card FAN-1 possui rótulo e link direto logo abaixo apontando para o Drive (nunca para o WebP)
    const firstDownload = screen.getByRole('link', { name: 'Baixar FAN-1 em alta ↓' });
    expect(firstDownload).toHaveAttribute(
      'href',
      'https://drive.google.com/uc?export=download&id=1FotoIdEventoFAN2026_0001',
    );
    expect(firstDownload.getAttribute('href')).not.toContain('.webp');

    // FAN-3 com prévia indisponível mostra estado de erro claro sem esconder o código
    expect(screen.getByText('Prévia indisponível')).toBeInTheDocument();

    // FAN-4 com download desativado na origem informa claramente sem fingir download
    expect(
      screen.getByText('Download desativado na origem (Google Drive)'),
    ).toBeInTheDocument();

    // Paginação para página 2 mantém numeração real FAN-13 até FAN-24 (nunca reinicia em FAN-1)
    await user.click(screen.getByRole('button', { name: /Próxima/i }));
    expect(screen.getByRole('link', { name: 'Baixar FAN-13 em alta ↓' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Baixar FAN-1 em alta ↓' })).not.toBeInTheDocument();

    // Busca pelo código FAN-25 preserva a identificação FAN-25
    const searchInput = screen.getByLabelText('Buscar pelo código');
    await user.type(searchInput, 'FAN-25');
    expect(screen.getByRole('link', { name: 'Baixar FAN-25 em alta ↓' })).toHaveAttribute(
      'href',
      'https://drive.google.com/uc?export=download&id=1FotoIdEventoFAN2026_0025',
    );

    // Limpa busca e abre Lightbox em FAN-1, navegando por teclado para FAN-2 e retornando foco ao fechar
    await user.click(screen.getByRole('button', { name: 'Limpar busca por código' }));
    const openFan1Btn = screen.getByRole('button', { name: 'Ampliar fotografia FAN-1' });
    await user.click(openFan1Btn);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('FAN-1')).toBeInTheDocument();
    const modalDownload1 = within(dialog).getByRole('link', { name: 'Baixar FAN-1 em alta ↓' });
    expect(modalDownload1).toHaveAttribute(
      'href',
      'https://drive.google.com/uc?export=download&id=1FotoIdEventoFAN2026_0001',
    );

    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('FAN-2')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
