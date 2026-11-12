import { useCallback, useEffect, useRef, useState } from 'react';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import { gallerySound } from '../domain/soundEffects';
import type { CatalogPhoto } from '../types/gallery';
import { BrandLogo } from './BrandLogo';

export interface LightboxModalProps {
  photos: readonly CatalogPhoto[];
  currentIndex: number;
  eventName: string;
  agencyName: string;
  mooveLogoSrc: string;
  onSelectIndex: (nextIndex: number) => void;
  onClose: () => void;
}

type SlideDirection = 'open' | 'next' | 'prev';

export function LightboxModal({
  photos,
  currentIndex,
  eventName,
  agencyName,
  mooveLogoSrc,
  onSelectIndex,
  onClose,
}: LightboxModalProps) {
  const photo = photos[currentIndex];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const [slideDir, setSlideDir] = useState<SlideDirection>('open');

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const navigateTo = useCallback(
    (targetIndex: number, direction: 'next' | 'prev') => {
      if (targetIndex < 0 || targetIndex >= photos.length) return;
      setSlideDir(direction);
      gallerySound.play(direction === 'next' ? 'photo-next' : 'photo-prev');
      onSelectIndex(targetIndex);
    },
    [onSelectIndex, photos.length],
  );

  useEffect(() => {
    setImgError(false);
  }, [photo?.fileId]);

  // Pré-carrega fotos vizinhas em segundo plano para passagem fluida sem espera
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    const neighbors = [photos[currentIndex - 1], photos[currentIndex + 1]];
    for (const item of neighbors) {
      if (!item || item.previewStatus !== 'ready') continue;
      const url = resolvePublicAssetUrl(item.previewUrl ?? item.thumbUrl);
      if (url) {
        const preloader = new Image();
        preloader.decoding = 'async';
        preloader.src = url;
      }
    }
  }, [currentIndex, photos]);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        navigateTo(currentIndex - 1, 'prev');
        return;
      }
      if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        navigateTo(currentIndex + 1, 'next');
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, hasNext, hasPrev, navigateTo, onClose]);

  if (!photo) return null;

  const displaySrc = resolvePublicAssetUrl(photo.previewUrl ?? photo.thumbUrl);
  const canShowImage = photo.previewStatus === 'ready' && Boolean(displaySrc) && !imgError;

  const stageImgClass =
    slideDir === 'next'
      ? 'lightbox__img lightbox__img--slide-next'
      : slideDir === 'prev'
        ? 'lightbox__img lightbox__img--slide-prev'
        : 'lightbox__img lightbox__img--open';

  return (
    <div
      className="lightbox-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lightbox-photo-code"
        onTouchStart={(e) => {
          const touch = e.changedTouches[0];
          if (touch) {
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          const touch = e.changedTouches[0];
          touchStartRef.current = null;
          if (!start || !touch) return;
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            if (dx > 0 && hasPrev) navigateTo(currentIndex - 1, 'prev');
            if (dx < 0 && hasNext) navigateTo(currentIndex + 1, 'next');
          }
        }}
      >
        <header className="lightbox__topbar">
          <div className="lightbox__meta">
            <span className="lightbox__brand" aria-hidden="true">
              <BrandLogo
                variant="moove"
                src={mooveLogoSrc}
                alt={agencyName}
                context="lightbox"
              />
            </span>
            <span className="lightbox__meta-divider" aria-hidden="true" />
            <span id="lightbox-photo-code" className="lightbox__code">
              {photo.code}
            </span>
            <span className="lightbox__counter">
              {currentIndex + 1} de {photos.length}
            </span>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="lightbox__close"
            onClick={onClose}
            aria-label="Fechar visualização ampliada"
          >
            <span>Fechar</span>
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="lightbox__stage">
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            disabled={!hasPrev}
            onClick={() => navigateTo(currentIndex - 1, 'prev')}
            aria-label="Fotografia anterior"
          >
            ‹
          </button>

          <div className="lightbox__figure">
            {canShowImage && displaySrc ? (
              <img
                key={photo.fileId}
                src={displaySrc}
                alt={`Fotografia ${photo.code} do evento ${eventName} em tamanho ampliado`}
                className={stageImgClass}
                data-slide-direction={slideDir}
                decoding="async"
                onError={() => setImgError(true)}
              />
            ) : (
              <div key={`err-${photo.fileId}`} className="lightbox__error" role="status">
                <p className="lightbox__error-title">Prévia ampliada indisponível</p>
                <p className="lightbox__error-text">
                  Utilize o botão abaixo para baixar o arquivo original diretamente do Google Drive.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            disabled={!hasNext}
            onClick={() => navigateTo(currentIndex + 1, 'next')}
            aria-label="Próxima fotografia"
          >
            ›
          </button>
        </div>

        <footer className="lightbox__footer">
          <div className="lightbox__actions">
            {photo.downloadAvailable ? (
              <a
                href={photo.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary lightbox__download-btn"
              >
                Baixar {photo.code} em alta ↓
              </a>
            ) : (
              <p className="lightbox__disabled-msg" role="status">
                Download desativado na origem (Google Drive)
              </p>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
