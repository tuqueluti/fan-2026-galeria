import { useEffect, useState } from 'react';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import type { CatalogPhoto } from '../types/gallery';

export interface PhotoCardProps {
  photo: CatalogPhoto;
  eventName: string;
  onOpenLightbox: (photo: CatalogPhoto) => void;
}

export function PhotoCard({ photo, eventName, onOpenLightbox }: PhotoCardProps) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [photo.thumbUrl]);

  const resolvedThumbUrl = resolvePublicAssetUrl(photo.thumbUrl);
  const hasValidPreview =
    photo.previewStatus === 'ready' && Boolean(resolvedThumbUrl) && !imageError;
  const isPortrait = photo.height > photo.width;

  return (
    <article className="photo-card" data-photo-code={photo.code}>
      <div className="photo-card__media">
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
                Acesse o arquivo pelo Google Drive abaixo
              </span>
            </div>
          )}
        </button>
      </div>

      <div className="photo-card__body">
        <div className="photo-card__header-row">
          <span className="photo-card__code">{photo.code}</span>
          <a
            href={photo.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="photo-card__open-link"
            aria-label={`Abrir ${photo.code} no Google Drive`}
          >
            Abrir no Drive ↗
          </a>
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
