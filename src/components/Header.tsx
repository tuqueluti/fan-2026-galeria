import { useEffect, useRef, useState } from 'react';
import { useGenerativeBuild } from '../domain/assemblyMotion';
import { resolvePublicAssetUrl } from '../domain/assetUrl';
import type { GalleryConfig } from '../types/gallery';
import { BrandLogo } from './BrandLogo';

export interface HeaderProps {
  config: GalleryConfig;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

function SoundIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

export function Header({ config, soundEnabled, onToggleSound }: HeaderProps) {
  const mastheadRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Animação generativa de montagem arquitetural (transitions-ui-generation) no palco do cabeçalho
  useGenerativeBuild(mastheadRef, {
    variant: 'ui',
    mode: 'skeleton',
    duration: 1650,
    keys: 4,
    maxParts: 32,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => {
      setIsScrolled(window.scrollY > 320);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const symbolSrc = resolvePublicAssetUrl(config.logos.mooveSymbol ?? config.logos.moove);

  return (
    <>
      <header className="site-header">
        <a href="#galeria" className="skip-link">
          Pular para a galeria de fotos
        </a>

        <div className="container">
          <div ref={mastheadRef} className="site-header__stage">
            <span className="blueprint-corner blueprint-corner--tl" aria-hidden="true" />
            <span className="blueprint-corner blueprint-corner--tr" aria-hidden="true" />
            <span className="blueprint-corner blueprint-corner--bl" aria-hidden="true" />
            <span className="blueprint-corner blueprint-corner--br" aria-hidden="true" />

            <div className="site-header__showcase">
              <span className="site-header__eyebrow">Apresentação Oficial</span>
              <a
                href={config.mooveWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="site-header__brand"
                aria-label={`Apresentado por ${config.agencyName}`}
              >
                <BrandLogo
                  variant="moove"
                  src={config.logos.moove}
                  alt={config.agencyName}
                  context="header"
                />
              </a>
            </div>

            <nav className="site-header__nav" aria-label="Navegação principal">
              <button
                type="button"
                onClick={onToggleSound}
                aria-pressed={soundEnabled}
                aria-label={
                  soundEnabled
                    ? 'Silenciar efeitos sonoros de página'
                    : 'Ativar efeitos sonoros de página'
                }
                title={
                  soundEnabled
                    ? 'Som de página ativo (clique para silenciar)'
                    : 'Som silenciado (clique para ativar)'
                }
                className={
                  soundEnabled
                    ? 'site-header__sound-btn site-header__sound-btn--active'
                    : 'site-header__sound-btn'
                }
              >
                <SoundIcon active={soundEnabled} />
                <span className="site-header__sound-label">
                  {soundEnabled ? 'Som' : 'Mudo'}
                </span>
              </button>

              <a href="#galeria" className="site-header__link">
                Fotos
              </a>

              <a
                href={config.mooveWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="site-header__link site-header__link--external"
              >
                <span>Conheça a Moove</span>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17L17 7" />
                  <path d="M8 7h9v9" />
                </svg>
              </a>
            </nav>
          </div>
        </div>
      </header>

      {isScrolled && (
        <div className="site-dock" role="region" aria-label="Atalhos rápidos da galeria">
          <div className="site-dock__inner">
            <a href="#topo" className="site-dock__top-link">
              {symbolSrc && (
                <img
                  src={symbolSrc}
                  alt=""
                  aria-hidden="true"
                  className="site-dock__symbol"
                  decoding="async"
                />
              )}
              <span>Topo ↑</span>
            </a>

            <div className="site-dock__actions">
              <button
                type="button"
                onClick={onToggleSound}
                aria-pressed={soundEnabled}
                className={
                  soundEnabled
                    ? 'site-header__sound-btn site-header__sound-btn--active'
                    : 'site-header__sound-btn'
                }
              >
                <SoundIcon active={soundEnabled} />
                <span>{soundEnabled ? 'Som' : 'Mudo'}</span>
              </button>
              <a href="#galeria" className="site-dock__pill">
                Grade
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
