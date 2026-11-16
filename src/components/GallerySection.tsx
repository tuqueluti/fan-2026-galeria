import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScrollAssembly } from '../domain/assemblyMotion';
import { filterPhotosByCode, type ResolvedCatalogState } from '../domain/catalog';
import { gallerySound } from '../domain/soundEffects';
import type { CatalogPhoto, GalleryConfig } from '../types/gallery';
import { FolderDeck, type FolderBurstOrigin } from './FolderDeck';
import { LightboxModal } from './LightboxModal';
import { PhotoCard } from './PhotoCard';

export interface GallerySectionProps {
  config: GalleryConfig;
  catalog: ResolvedCatalogState;
}

type PageTurnDirection = 'initial' | 'next' | 'prev' | 'filter' | 'folder-burst';

interface FolderBurstState {
  seq: number;
  folderId: string;
  originX: number;
  originY: number;
}

function formatPhotoCountLabel(total: number): string {
  if (total === 0) return '0 fotos publicadas';
  if (total === 1) return '1 foto disponível';
  return `${total.toLocaleString('pt-BR')} fotos disponíveis`;
}

function buildPaginationSlots(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }
  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const slots: Array<number | 'ellipsis'> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      slots.push('ellipsis');
    }
    slots.push(sorted[i]);
  }
  return slots;
}

function isReducedMotionActive(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GallerySection({ config, catalog }: GallerySectionProps) {
  const hasMultipleFolders = catalog.folders.length > 1;
  const defaultFolderId = catalog.folders[0]?.id ?? 'acervo';

  const [activeFolderId, setActiveFolderId] = useState<string>(defaultFolderId);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTurnDir, setPageTurnDir] = useState<PageTurnDirection>('initial');
  const [pageTurnCount, setPageTurnCount] = useState(0);
  const [folderBurst, setFolderBurst] = useState<FolderBurstState | null>(null);
  const [activeLightboxId, setActiveLightboxId] = useState<string | null>(null);

  const sectionRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeAnimationsRef = useRef<Animation[]>([]);
  const { ref: toolbarRef, isAssembled: toolbarAssembled } = useScrollAssembly<HTMLDivElement>({
    threshold: 0.15,
  });

  // Mantém pasta ativa sincronizada caso o catálogo mude
  useEffect(() => {
    if (catalog.folders.length > 0 && !catalog.folders.some((f) => f.id === activeFolderId)) {
      setActiveFolderId(catalog.folders[0].id);
    }
  }, [catalog.folders, activeFolderId]);

  const pageSize = Math.max(1, config.pagination.pageSize || 24);
  const isFiltering = searchQuery.trim().length > 0;

  const activeFolderView = useMemo(
    () => catalog.folders.find((f) => f.id === activeFolderId) ?? catalog.folders[0] ?? null,
    [catalog.folders, activeFolderId],
  );

  // Quando há busca por código, pesquisa em todo o acervo sem alterar os rótulos FAN-N;
  // sem busca, exibe as fotos da pasta aberta no momento.
  const scopedPhotos = useMemo(() => {
    if (!hasMultipleFolders || isFiltering) {
      return catalog.photos;
    }
    return catalog.photos.filter(
      (p) => (p.folderId ?? defaultFolderId) === activeFolderId,
    );
  }, [catalog.photos, hasMultipleFolders, isFiltering, activeFolderId, defaultFolderId]);

  const filteredPhotos = useMemo(
    () => filterPhotosByCode(scopedPhotos, searchQuery, config.photoPrefix),
    [scopedPhotos, searchQuery, config.photoPrefix],
  );

  const totalPages = Math.max(1, Math.ceil(filteredPhotos.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const pagePhotos = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredPhotos.slice(start, start + pageSize);
  }, [filteredPhotos, safePage, pageSize]);

  const activeLightboxIndex = useMemo(() => {
    if (!activeLightboxId) return -1;
    return filteredPhotos.findIndex((p) => p.fileId === activeLightboxId);
  }, [filteredPhotos, activeLightboxId]);

  // Coreografia FLIP / Web Animations API: ao clicar em uma pasta, as miniaturas emergem
  // de dentro da pasta clicada em arco de leque e vão se ordenando nos seus lugares na grade.
  useLayoutEffect(() => {
    if (!folderBurst) return;
    if (isReducedMotionActive()) return;

    const gridEl = gridRef.current;
    if (!gridEl) return;

    // Cancela animações anteriores se o visitante clicar em outra pasta rapidamente
    for (const anim of activeAnimationsRef.current) {
      try {
        anim.cancel();
      } catch {
        // ignora
      }
    }
    activeAnimationsRef.current = [];

    const cards = Array.from(gridEl.querySelectorAll<HTMLElement>('.photo-card'));
    if (cards.length === 0) return;

    const createdAnimations: Animation[] = [];

    cards.forEach((cardEl, idx) => {
      if (typeof cardEl.animate !== 'function') return;
      const rect = cardEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      const dx = folderBurst.originX - cardCenterX;
      const dy = folderBurst.originY - cardCenterY;

      // Espalhamento em leque ao sair da boca da pasta antes de alinhar na grade
      const normalizedSpread = ((idx % 5) - 2) / 2; // -1 .. +1
      const tiltDeg = normalizedSpread * 11;
      const fanSpreadX = normalizedSpread * 38;
      const liftArcY = 58 + (idx % 3) * 14;

      const delay = Math.min(idx, 18) * 32;
      const duration = 680 + Math.min(idx, 14) * 20;

      try {
        const anim = cardEl.animate(
          [
            {
              offset: 0,
              transform: `translate3d(${dx.toFixed(1)}px, ${(dy + 12).toFixed(1)}px, 0) scale(0.14) rotate(${tiltDeg.toFixed(1)}deg)`,
              opacity: 0,
            },
            {
              offset: 0.26,
              transform: `translate3d(${(dx * 0.74 + fanSpreadX).toFixed(1)}px, ${(dy - liftArcY).toFixed(1)}px, 0) scale(0.35) rotate(${(tiltDeg * 1.32).toFixed(1)}deg)`,
              opacity: 0.98,
            },
            {
              offset: 0.68,
              transform: `translate3d(${(dx * 0.06).toFixed(1)}px, ${(dy * 0.04 - 6).toFixed(1)}px, 0) scale(0.97) rotate(${(tiltDeg * 0.14).toFixed(1)}deg)`,
              opacity: 1,
            },
            {
              offset: 1,
              transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)',
              opacity: 1,
            },
          ],
          {
            duration,
            delay,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'backwards',
          },
        );
        createdAnimations.push(anim);
      } catch {
        // Ambientes sem suporte completo a WAAPI exibem os cards normalmente
      }
    });

    activeAnimationsRef.current = createdAnimations;

    return () => {
      for (const anim of createdAnimations) {
        try {
          anim.cancel();
        } catch {
          // ignora
        }
      }
    };
  }, [folderBurst]);

  const handleSelectFolder = (folderId: string, origin: FolderBurstOrigin) => {
    setActiveFolderId(folderId);
    setSearchQuery('');
    setCurrentPage(1);
    setPageTurnDir('folder-burst');
    setPageTurnCount((c) => c + 1);
    setFolderBurst((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      folderId,
      originX: origin.x,
      originY: origin.y,
    }));
    gallerySound.play('folder-burst');
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    setFolderBurst(null);
    setPageTurnDir('filter');
    setPageTurnCount((c) => c + 1);
  };

  const handlePageSelect = (targetPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, targetPage));
    if (clamped === safePage) return;

    const direction: PageTurnDirection = clamped > safePage ? 'next' : 'prev';
    setFolderBurst(null);
    setPageTurnDir(direction);
    setPageTurnCount((c) => c + 1);
    setCurrentPage(clamped);

    gallerySound.play(direction === 'next' ? 'page-turn-next' : 'page-turn-prev');

    if (sectionRef.current && typeof sectionRef.current.scrollIntoView === 'function') {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleOpenLightbox = (photo: CatalogPhoto) => {
    gallerySound.play('lightbox-open');
    setActiveLightboxId(photo.fileId);
  };

  const handleCloseLightbox = () => {
    const closingId = activeLightboxId;
    gallerySound.play('lightbox-close');
    setActiveLightboxId(null);
    if (closingId) {
      requestAnimationFrame(() => {
        const trigger = document.querySelector<HTMLButtonElement>(
          `[data-photo-trigger="${CSS.escape(closingId)}"]`,
        );
        trigger?.focus();
      });
    }
  };

  const isCatalogReady = catalog.state === 'ready' && catalog.totalPhotos > 0;

  const gridClassName =
    pageTurnDir === 'next'
      ? 'photo-grid photo-grid--turn-next'
      : pageTurnDir === 'prev'
        ? 'photo-grid photo-grid--turn-prev'
        : pageTurnDir === 'filter'
          ? 'photo-grid photo-grid--fade'
          : pageTurnDir === 'folder-burst'
            ? 'photo-grid photo-grid--folder-burst'
            : 'photo-grid';

  const headingLabel =
    hasMultipleFolders && activeFolderView && !isFiltering
      ? `Fotografias · ${activeFolderView.title}`
      : 'Fotografias do evento';

  const countDescription = !isCatalogReady
    ? formatPhotoCountLabel(0)
    : isFiltering
      ? `${filteredPhotos.length.toLocaleString('pt-BR')} resultado(s) no acervo completo (${formatPhotoCountLabel(catalog.totalPhotos)})`
      : hasMultipleFolders && activeFolderView
        ? `${formatPhotoCountLabel(activeFolderView.photoCount)} nesta pasta · ${catalog.totalPhotos.toLocaleString('pt-BR')} no acervo total`
        : formatPhotoCountLabel(catalog.totalPhotos);

  return (
    <section
      id="galeria"
      ref={sectionRef}
      className="gallery-section"
      aria-labelledby="gallery-heading"
    >
      <div className="container">
        {isCatalogReady && hasMultipleFolders && (
          <FolderDeck
            folders={catalog.folders}
            activeFolderId={activeFolderId}
            onSelectFolder={handleSelectFolder}
          />
        )}

        <div
          ref={toolbarRef}
          className={toolbarAssembled ? 'gallery-toolbar is-assembled' : 'gallery-toolbar'}
        >
          <div className="gallery-toolbar__info">
            <h2 id="gallery-heading" className="gallery-toolbar__title">
              {headingLabel}
            </h2>
            <p className="gallery-toolbar__count" aria-live="polite">
              {countDescription}
            </p>
          </div>

          <div className="gallery-search">
            <label htmlFor="photo-code-search" className="gallery-search__label">
              Buscar pelo código
            </label>
            <div className="gallery-search__field">
              <svg
                aria-hidden="true"
                className="gallery-search__icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="photo-code-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                placeholder={`Ex.: ${config.photoPrefix}-125`}
                value={searchQuery}
                disabled={!isCatalogReady}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="gallery-search__input"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="gallery-search__clear"
                  aria-label="Limpar busca por código"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {!isCatalogReady ? (
          <div className="gallery-empty" data-gallery-state={catalog.state} role="status">
            <div className="gallery-empty__badge" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
            <h3 className="gallery-empty__title">Galeria em preparação</h3>
            <p className="gallery-empty__text">
              {catalog.visitorNotice ??
                'As fotografias oficiais do FAN 2026 serão publicadas nesta galeria em breve.'}
            </p>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="gallery-empty" data-gallery-state="no-search-results" role="status">
            <h3 className="gallery-empty__title">
              Nenhuma fotografia encontrada para “{searchQuery.trim()}”
            </h3>
            <p className="gallery-empty__text">
              Confira o número desejado (entre {config.photoPrefix}-1 e {config.photoPrefix}-
              {catalog.totalPhotos}) ou limpe o filtro para ver a pasta atual.
            </p>
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="btn-secondary"
            >
              Mostrar fotos da pasta
            </button>
          </div>
        ) : (
          <>
            <div
              key={`grid-${activeFolderId}-${safePage}-${pageTurnCount}`}
              ref={gridRef}
              className={gridClassName}
              data-testid="photo-grid"
              data-active-folder={activeFolderId}
              data-turn-direction={pageTurnDir}
              data-burst-seq={folderBurst?.seq ?? 0}
            >
              {pagePhotos.map((photo, idx) => (
                <PhotoCard
                  key={photo.fileId}
                  photo={photo}
                  eventName={config.eventName}
                  indexOnPage={idx}
                  dealtFromFolder={pageTurnDir === 'folder-burst'}
                  onOpenLightbox={handleOpenLightbox}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="pagination" aria-label="Paginação da galeria">
                <p className="pagination__summary">
                  Página {safePage} de {totalPages} · Exibindo {pagePhotos[0]?.code} até{' '}
                  {pagePhotos[pagePhotos.length - 1]?.code}
                </p>

                <div className="pagination__controls">
                  <button
                    type="button"
                    className="pagination__btn"
                    disabled={safePage <= 1}
                    onClick={() => handlePageSelect(safePage - 1)}
                  >
                    ← Anterior
                  </button>

                  <div className="pagination__pages">
                    {buildPaginationSlots(safePage, totalPages).map((slot, idx) =>
                      slot === 'ellipsis' ? (
                        <span
                          key={`ellipsis-${idx}`}
                          className="pagination__ellipsis"
                          aria-hidden="true"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handlePageSelect(slot)}
                          aria-current={slot === safePage ? 'page' : undefined}
                          className={
                            slot === safePage
                              ? 'pagination__page pagination__page--active'
                              : 'pagination__page'
                          }
                        >
                          {slot}
                        </button>
                      ),
                    )}
                  </div>

                  <button
                    type="button"
                    className="pagination__btn"
                    disabled={safePage >= totalPages}
                    onClick={() => handlePageSelect(safePage + 1)}
                  >
                    Próxima →
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </div>

      {activeLightboxIndex >= 0 && filteredPhotos[activeLightboxIndex] && (
        <LightboxModal
          photos={filteredPhotos}
          currentIndex={activeLightboxIndex}
          eventName={config.eventName}
          agencyName={config.agencyName}
          mooveLogoSrc={config.logos.moove}
          onSelectIndex={(idx) => {
            const target = filteredPhotos[idx];
            if (target) {
              setActiveLightboxId(target.fileId);
            }
          }}
          onClose={handleCloseLightbox}
        />
      )}
    </section>
  );
}
