import type { GalleryConfig } from '../types/gallery';
import { BrandLogo } from './BrandLogo';

export interface FooterProps {
  config: GalleryConfig;
}

export function Footer({ config }: FooterProps) {
  const removalContact = config.links.photoRemovalContact?.trim() || '';
  const hasRealRemovalContact = removalContact.length > 0;

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__brands" aria-label="Marcas apresentadoras e institucionais">
          <a
            href={config.links.mooveWebsite || config.mooveWebsite}
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer__brand-item site-footer__brand-item--moove"
            aria-label={`Apresentação oficial por ${config.agencyName}`}
          >
            <span className="site-footer__brand-role site-footer__brand-role--moove">
              Apresentação Oficial
            </span>
            <BrandLogo
              variant="moove"
              src={config.logos.moove}
              alt={config.agencyName}
              context="footer"
            />
          </a>

          <div className="site-footer__brand-item">
            <span className="site-footer__brand-role">Realização</span>
            <BrandLogo
              variant="aciva"
              src={config.logos.aciva}
              alt={`${config.organizerName} · Associação Empresarial de Araranguá e Extremo Sul Catarinense`}
              context="footer"
            />
          </div>

          <div className="site-footer__brand-item">
            <span className="site-footer__brand-role">Evento</span>
            <BrandLogo
              variant="fan"
              src={config.logos.fan}
              alt={`${config.eventName} · ${config.eventSubtitle}`}
              context="footer"
              eventName={config.eventName}
              eventSubtitle={config.eventSubtitle}
            />
          </div>
        </div>

        <div className="site-footer__bottom">
          <div className="site-footer__signature">
            <p className="site-footer__credit">Galeria por {config.agencyName}</p>
            <p className="site-footer__note">
              {config.eventName} · {config.eventSubtitle}. Downloads gratuitos fornecidos diretamente pelo Google Drive.
            </p>
          </div>

          <ul className="site-footer__links">
            <li>
              <a
                href={config.links.mooveWebsite || config.mooveWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="site-footer__link"
              >
                Site da Moove Connect ↗
              </a>
            </li>
            {config.links.mooveInstagram && (
              <li>
                <a
                  href={config.links.mooveInstagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-footer__link"
                >
                  Instagram @mooveconnect ↗
                </a>
              </li>
            )}
            {hasRealRemovalContact && (
              <li>
                <a
                  href={removalContact}
                  target={removalContact.startsWith('mailto:') ? undefined : '_blank'}
                  rel={removalContact.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                  className="site-footer__link site-footer__link--muted"
                >
                  Solicitar retirada de fotografia
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </footer>
  );
}
