import { useRef, useState } from 'react';
import { useScrollAssembly } from '../domain/assemblyMotion';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import type { CatalogFolderView } from '../domain/catalog';

export interface FolderBurstOrigin {
  x: number;
  y: number;
}

export interface FolderDeckProps {
  folders: readonly CatalogFolderView[];
  activeFolderId: string;
  onSelectFolder: (folderId: string, origin: FolderBurstOrigin) => void;
}

export function FolderDeck({ folders, activeFolderId, onSelectFolder }: FolderDeckProps) {
  const pocketRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [burstingFolderId, setBurstingFolderId] = useState<string | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const { ref: deckRef, isAssembled } = useScrollAssembly<HTMLDivElement>({
    threshold: 0.1,
  });

  if (folders.length <= 1) {
    return null;
  }

  const handleFolderClick = (folderId: string) => {
    const pocketEl = pocketRefs.current[folderId];
    let origin: FolderBurstOrigin = {
      x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
      y: 260,
    };

    if (pocketEl) {
      const rect = pocketEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        origin = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height * 0.45,
        };
      }
    }

    if (burstTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(burstTimerRef.current);
    }
    setBurstingFolderId(folderId);
    if (typeof window !== 'undefined') {
      burstTimerRef.current = window.setTimeout(() => {
        setBurstingFolderId((prev) => (prev === folderId ? null : prev));
      }, 780);
    }

    onSelectFolder(folderId, origin);
  };

  return (
    <div
      ref={deckRef}
      className={isAssembled ? 'folder-deck is-assembled' : 'folder-deck'}
      role="group"
      aria-label="Pastas de fotografias do evento"
    >
      <div className="folder-deck__intro">
        <span className="folder-deck__eyebrow">Pastas do Evento</span>
        <p className="folder-deck__hint">
          Toque em uma pasta para espalhar e ordenar as miniaturas na tela
        </p>
      </div>

      <div className="folder-deck__grid">
        {folders.map((folder, index) => {
          const isActive = folder.id === activeFolderId;
          const isBursting = folder.id === burstingFolderId;
          const thumbs = folder.coverThumbs
            .map((t) => resolvePublicAssetUrl(t))
            .filter((t): t is string => Boolean(t));

          const cardClass = [
            'folder-card',
            isActive ? 'folder-card--active' : '',
            isBursting ? 'folder-card--bursting' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={folder.id}
              type="button"
              data-folder-id={folder.id}
              aria-pressed={isActive}
              className={cardClass}
              style={{ '--folder-idx': index } as React.CSSProperties}
              onClick={() => handleFolderClick(folder.id)}
            >
              <div
                ref={(node) => {
                  pocketRefs.current[folder.id] = node;
                }}
                className="folder-card__visual"
                aria-hidden="true"
              >
                <span className="folder-card__burst-ring" />
                <div className="folder-card__back">
                  <span className="folder-card__tab" />
                </div>

                <div className="folder-card__sheets">
                  {[0, 1, 2].map((slot) => {
                    const thumbSrc = thumbs[slot];
                    return (
                      <span
                        key={slot}
                        className={`folder-card__sheet folder-card__sheet--${slot}`}
                      >
                        {thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="folder-card__sheet-img"
                          />
                        ) : (
                          <span className="folder-card__sheet-placeholder" />
                        )}
                      </span>
                    );
                  })}
                </div>

                <div className="folder-card__flap">
                  <span className="folder-card__flap-shine" />
                </div>
              </div>

              <div className="folder-card__meta">
                <div className="folder-card__header">
                  <span className="folder-card__title">{folder.title}</span>
                  <span className="folder-card__status">
                    {isActive ? 'Aberta' : 'Abrir'}
                  </span>
                </div>

                {folder.subtitle && (
                  <span className="folder-card__subtitle">{folder.subtitle}</span>
                )}

                <div className="folder-card__footer">
                  <span className="folder-card__count">
                    {folder.photoCount.toLocaleString('pt-BR')}{' '}
                    {folder.photoCount === 1 ? 'foto' : 'fotos'}
                  </span>
                  {folder.firstCode && folder.lastCode && (
                    <span className="folder-card__range">
                      {folder.firstCode} a {folder.lastCode}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
