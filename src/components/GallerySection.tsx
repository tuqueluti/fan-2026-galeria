import { useMemo, useRef, useState } from 'react';
import { filterPhotosByCode, type ResolvedCatalogState } from '../domain/catalog';
import { gallerySound } from '../domain/soundEffects';
import type { CatalogPhoto, GalleryConfig } from '../types/gallery';
import { LightboxModal } from './LightboxModal';
import { PhotoCard } from './PhotoCard';

export interface GallerySectionProps {
  config: GalleryConfig;
  catalog: ResolvedCatalogState;
}

type PageTurnDirection = 'initial' | 'next' | 'prev' | 'filter';

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

export function GallerySection({ config, catalog }: GallerySectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTurnDir, setPageTurnDir] = useState<PageTurnDirection>('initial');
  const [pageTurnCount, setPageTurnCount] = useState(0);
  const [activeLightboxId, setActiveLightboxId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const pageSize = Math.max(1, config.pagination.pageSize || 24);

  const filteredPhotos = useMemo(
    () => filterPhotosByCode(catalog.photos, searchQuery, config.photoPrefix),
    [catalog.photos, searchQuery, config.photoPrefix],
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

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    setPageTurnDir('filter');
    setPageTurnCount((c) => c + 1);
  };

  const handlePageSelect = (targetPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, targetPage));
    if (clamped === safePage) return;

    const direction: PageTurnDirection = clamped > safePage ? 'next' : 'prev';
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
  const isFiltering = searchQuery.trim().length > 0;

  const gridClassName =
    pageTurnDir === 'next'
      ? 'photo-grid photo-grid--turn-next'
      : pageTurnDir === 'prev'
        ? 'photo-grid photo-grid--turn-prev'
        : pageTurnDir === 'filter'
          ? 'photo-grid photo-grid--fade'
          : 'photo-grid';

  return (
    <section
      id="galeria"
      ref={sectionRef}
      className="gallery-section"
      aria-labelledby="gallery-heading"
    >
      <div className="container">
        <div className="gallery-toolbar">
          <div className="gallery-toolbar__info">
            <h2 id="gallery-heading" className="gallery-toolbar__title">
              Fotografias do evento
            </h2>
            <p className="gallery-toolbar__count" aria-live="polite">
              {isFiltering && isCatalogReady
                ? `${filteredPhotos.length.toLocaleString('pt-BR')} resultado(s) de ${formatPhotoCountLabel(catalog.totalPhotos)}`
                : formatPhotoCountLabel(catalog.totalPhotos)}
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
              {catalog.totalPhotos}) ou limpe o filtro para ver toda a galeria.
            </p>
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="btn-secondary"
            >
              Mostrar todas as fotos
            </button>
          </div>
        ) : (
          <>
            <div
              key={`grid-${safePage}-${pageTurnCount}`}
              className={gridClassName}
              data-testid="photo-grid"
              data-turn-direction={pageTurnDir}
            >
              {pagePhotos.map((photo, idx) => (
                <PhotoCard
                  key={photo.fileId}
                  photo={photo}
                  eventName={config.eventName}
                  indexOnPage={idx}
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
                        <span key={`ellipsis-${idx}`} className="pagination__ellipsis" aria-hidden="true">
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
