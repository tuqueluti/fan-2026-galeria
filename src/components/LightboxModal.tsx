import { useEffect, useRef, useState } from 'react';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import type { CatalogPhoto } from '../types/gallery';

export interface LightboxModalProps {
  photos: readonly CatalogPhoto[];
  currentIndex: number;
  eventName: string;
  onSelectIndex: (nextIndex: number) => void;
  onClose: () => void;
}

export function LightboxModal({
  photos,
  currentIndex,
  eventName,
  onSelectIndex,
  onClose,
}: LightboxModalProps) {
  const photo = photos[currentIndex];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [imgError, setImgError] = useState(false);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  useEffect(() => {
    setImgError(false);
  }, [photo?.fileId]);

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
        onSelectIndex(currentIndex - 1);
        return;
      }
      if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onSelectIndex(currentIndex + 1);
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
  }, [currentIndex, hasNext, hasPrev, onClose, onSelectIndex]);

  if (!photo) return null;

  const displaySrc = resolvePublicAssetUrl(photo.previewUrl ?? photo.thumbUrl);
  const canShowImage = photo.previewStatus === 'ready' && Boolean(displaySrc) && !imgError;

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
            if (dx > 0 && hasPrev) onSelectIndex(currentIndex - 1);
            if (dx < 0 && hasNext) onSelectIndex(currentIndex + 1);
          }
        }}
      >
        <header className="lightbox__topbar">
          <div className="lightbox__meta">
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
            onClick={() => onSelectIndex(currentIndex - 1)}
            aria-label="Fotografia anterior"
          >
            ‹
          </button>

          <div className="lightbox__figure">
            {canShowImage && displaySrc ? (
              <img
                src={displaySrc}
                alt={`Fotografia ${photo.code} do evento ${eventName} em tamanho ampliado`}
                className="lightbox__img"
                decoding="async"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="lightbox__error" role="status">
                <p className="lightbox__error-title">Prévia ampliada indisponível</p>
                <p className="lightbox__error-text">
                  Utilize o botão abaixo para acessar o arquivo diretamente no Google Drive.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            disabled={!hasNext}
            onClick={() => onSelectIndex(currentIndex + 1)}
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

            <a
              href={photo.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary lightbox__open-btn"
            >
              Abrir no Drive ↗
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
