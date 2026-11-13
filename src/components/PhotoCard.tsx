import {
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useScrollAssembly } from '../domain/assemblyMotion';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import type { CatalogPhoto } from '../types/gallery';

export interface PhotoCardProps {
  photo: CatalogPhoto;
  eventName: string;
  indexOnPage?: number;
  onOpenLightbox: (photo: CatalogPhoto) => void;
}

export function PhotoCard({
  photo,
  eventName,
  indexOnPage = 0,
  onOpenLightbox,
}: PhotoCardProps) {
  const [imageError, setImageError] = useState(false);
  const { ref, isAssembled } = useScrollAssembly<HTMLElement>({
    threshold: 0.08,
    rootMargin: '0px 0px -16px 0px',
  });

  useEffect(() => {
    setImageError(false);
  }, [photo.thumbUrl]);

  const resolvedThumbUrl = resolvePublicAssetUrl(photo.thumbUrl);
  const hasValidPreview =
    photo.previewStatus === 'ready' && Boolean(resolvedThumbUrl) && !imageError;
  const isPortrait = photo.height > photo.width;

  const cardStyle = {
    '--card-index': Math.min(indexOnPage, 16),
    '--col-stagger': `${(indexOnPage % 4) * 65}ms`,
  } as CSSProperties;

  const handlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    e.currentTarget.style.setProperty('--spot-x', `${(e.clientX - rect.left).toFixed(0)}px`);
    e.currentTarget.style.setProperty('--spot-y', `${(e.clientY - rect.top).toFixed(0)}px`);
  };

  return (
    <article
      ref={ref}
      className={isAssembled ? 'photo-card is-assembled' : 'photo-card'}
      data-photo-code={photo.code}
      style={cardStyle}
      onPointerMove={handlePointerMove}
    >
      <span className="photo-card__corner photo-card__corner--tl" aria-hidden="true" />
      <span className="photo-card__corner photo-card__corner--tr" aria-hidden="true" />
      <span className="photo-card__corner photo-card__corner--bl" aria-hidden="true" />
      <span className="photo-card__corner photo-card__corner--br" aria-hidden="true" />

      <div className="photo-card__media">
        <span className="photo-card__scanline" aria-hidden="true" />
        <button
          type="button"
          className="photo-card__preview-btn"
          data-photo-trigger={photo.fileId}
          onClick={() => onOpenLightbox(photo)}
          aria-label={`Ampliar fotografia ${photo.code}`}
        >
          {hasValidPreview && resolvedThumbUrl ? (
            <>
              <img
                src={resolvedThumbUrl}
                alt={`Fotografia ${photo.code} do evento ${eventName}`}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
                className={
                  isPortrait
                    ? 'photo-card__img photo-card__img--portrait'
                    : 'photo-card__img'
                }
                onError={() => setImageError(true)}
              />
              <span className="photo-card__zoom-hint" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </span>
            </>
          ) : (
            <div className="photo-card__unavailable" data-preview-state="unavailable">
              <svg
                aria-hidden="true"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
              <span className="photo-card__unavailable-title">Prévia indisponível</span>
              <span className="photo-card__unavailable-note">
                Baixe o arquivo original pelo botão abaixo
              </span>
            </div>
          )}
        </button>
      </div>

      <div className="photo-card__body">
        <div className="photo-card__header-row">
          <span className="photo-card__code">{photo.code}</span>
        </div>

        {photo.downloadAvailable ? (
          <a
            href={photo.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="photo-card__download-link"
          >
            Baixar {photo.code} em alta ↓
          </a>
        ) : (
          <p className="photo-card__download-disabled" role="status">
            Download desativado na origem (Google Drive)
          </p>
        )}
      </div>
    </article>
  );
}
