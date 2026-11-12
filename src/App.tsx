import { useMemo } from 'react';
import { Footer } from './components/Footer';
import { GallerySection } from './components/GallerySection';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import defaultConfig from './config/gallery';
import { resolvePublishedCatalog } from './domain/catalog';
import rawManifest from './generated/gallery-manifest.json';
import type { GalleryConfig, GalleryManifest } from './types/gallery';

export interface AppProps {
  config?: GalleryConfig;
  manifest?: GalleryManifest;
}

export function App({
  config = defaultConfig,
  manifest = rawManifest as GalleryManifest,
}: AppProps) {
  const catalog = useMemo(
    () => resolvePublishedCatalog(config, manifest),
    [config, manifest],
  );

  return (
    <div className="app-shell">
      <Header config={config} />
      <main className="app-main">
        <Hero config={config} />
        <GallerySection config={config} catalog={catalog} />
      </main>
      <Footer config={config} />
    </div>
  );
}

export default App;
