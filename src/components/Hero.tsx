import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGenerativeBuild } from '../domain/assemblyMotion';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import type { GalleryConfig } from '../types/gallery';
import { BrandLogo } from './BrandLogo';

export interface HeroProps {
  config: GalleryConfig;
}

export function Hero({ config }: HeroProps) {
  const coverSrc = resolvePublicAssetUrl(config.coverImage);
  const brandsRef = useRef<HTMLDivElement | null>(null);
  const [textShown, setTextShown] = useState(false);

  // Construção generativa por wireframe pontilhado e scanline no painel de marcas do evento
  useGenerativeBuild(brandsRef, {
    variant: 'ui',
    mode: 'skeleton',
    delay: 200,
    duration: 1700,
    keys: 3,
    maxParts: 24,
  });

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setTextShown(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const titleText = `Suas fotos do ${config.eventName} estão aqui.`;
  const words = titleText.split(' ');

  return (
    <section
      id="topo"
      className={textShown ? 'hero is-assembled' : 'hero'}
      aria-labelledby="hero-heading"
    >
      {coverSrc ? (
        <div className="hero__cover" aria-hidden="true">
          <img src={coverSrc} alt="" className="hero__cover-img" decoding="async" />
          <div className="hero__cover-scrim" />
        </div>
      ) : (
        <div className="hero__ambient" aria-hidden="true" />
      )}

      <div className="container hero__inner">
        <div className="hero__eyebrow hero-assemble-step hero-assemble-step--1">
          <span className="hero__dot" aria-hidden="true" />
          <span>Galeria Oficial · {config.eventSubtitle}</span>
        </div>

        <div
          ref={brandsRef}
          className="hero__brands"
          aria-label="Marcas institucionais do evento"
        >
          <span className="blueprint-corner blueprint-corner--tl" aria-hidden="true" />
          <span className="blueprint-corner blueprint-corner--tr" aria-hidden="true" />
          <span className="blueprint-corner blueprint-corner--bl" aria-hidden="true" />
          <span className="blueprint-corner blueprint-corner--br" aria-hidden="true" />

          <div className="hero__brand-primary">
            <BrandLogo
              variant="fan"
              src={config.logos.fan}
              alt={`${config.eventName} · ${config.eventSubtitle}`}
              context="hero"
              eventName={config.eventName}
              eventSubtitle={config.eventSubtitle}
            />
          </div>

          <span className="hero__brand-divider" aria-hidden="true" />

          <div className="hero__brand-secondary">
            <span className="hero__brand-caption">Realização</span>
            <BrandLogo
              variant="aciva"
              src={config.logos.aciva}
              alt={`${config.organizerName} · Associação Empresarial de Araranguá e Extremo Sul Catarinense`}
              context="hero"
            />
          </div>
        </div>

        <h1 id="hero-heading" className="hero__title">
          {words.map((word, idx) => (
            <span key={`${word}-${idx}`}>
              <span
                className="hero__word"
                style={{ '--word-index': idx } as CSSProperties}
              >
                {word}
              </span>
              {idx < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h1>

        <p className="hero__subtitle hero-assemble-step hero-assemble-step--2">
          Encontre seu momento e baixe gratuitamente a foto original em alta resolução.
        </p>

        <div className="hero__actions hero-assemble-step hero-assemble-step--3">
          <a href="#galeria" className="btn-primary">
            <span>Ver fotos do evento</span>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
