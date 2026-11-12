import type { GalleryConfig } from '../types/gallery';
import { BrandLogo } from './BrandLogo';

export interface HeaderProps {
  config: GalleryConfig;
}

export function Header({ config }: HeaderProps) {
  return (
    <header className="site-header">
      <a href="#galeria" className="skip-link">
        Pular para a galeria de fotos
      </a>
      <div className="container site-header__inner">
        <a
          href="#topo"
          className="site-header__brand"
          aria-label={`${config.agencyName} · Início da galeria ${config.eventName}`}
        >
          <BrandLogo
            variant="moove"
            src={config.logos.moove}
            alt={config.agencyName}
            context="header"
          />
        </a>

        <nav className="site-header__nav" aria-label="Navegação principal">
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
    </header>
  );
}
