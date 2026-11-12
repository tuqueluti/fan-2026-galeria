import { useEffect, useState } from 'react';
import { resolvePublicAssetUrl } from '../domain/assetUrl';

export type BrandVariant = 'moove' | 'aciva' | 'fan';

export interface BrandLogoProps {
  variant: BrandVariant;
  src: string;
  alt: string;
  context: 'header' | 'hero' | 'footer';
  eventName?: string;
  eventSubtitle?: string;
}

/**
 * Exibe um ativo oficial de marca preservando proporções, transparência e área de proteção.
 * Caso um arquivo oficial ainda não esteja presente em `public/logos/` (ex.: `/logos/fan-2026.png`),
 * não cria marca fictícia nem imita logotipo: apresenta identificação institucional neutra e honesta.
 */
export function BrandLogo({
  variant,
  src,
  alt,
  context,
  eventName = 'FAN 2026',
  eventSubtitle = 'Fórum ACIVA de Networking',
}: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const resolvedSrc = resolvePublicAssetUrl(src);

  if (!resolvedSrc || failed) {
    if (variant === 'fan') {
      return (
        <div
          className={`brand-pending brand-pending--${context}`}
          data-brand="fan"
          data-brand-status="pending"
          aria-label={`${eventName} (${eventSubtitle})`}
        >
          <span className="brand-pending__title">{eventName}</span>
          {context === 'hero' && (
            <span className="brand-pending__subtitle">{eventSubtitle}</span>
          )}
        </div>
      );
    }

    const label = variant === 'moove' ? 'Moove Connect' : 'ACIVA';
    return (
      <span
        className={`brand-pending brand-pending--${context}`}
        data-brand={variant}
        data-brand-status="pending"
      >
        <span className="brand-pending__title">{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`brand-logo brand-logo--${variant} brand-logo--${context}`}
      data-brand={variant}
      data-brand-status="loaded"
    >
      <img
        src={resolvedSrc}
        alt={alt}
        className="brand-logo__img"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
