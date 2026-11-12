import { useMemo, useState } from 'react';
import { Footer } from './components/Footer';
import { GallerySection } from './components/GallerySection';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import defaultConfig from './config/gallery';
import { resolvePublishedCatalog } from './domain/catalog';
import { gallerySound } from './domain/soundEffects';
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => gallerySound.isEnabled());

  const catalog = useMemo(
    () => resolvePublishedCatalog(config, manifest),
    [config, manifest],
  );

  const handleToggleSound = () => {
    const next = !soundEnabled;
    gallerySound.setEnabled(next);
    setSoundEnabled(next);
    if (next) {
      gallerySound.play('photo-next');
    }
  };

  return (
    <div className="app-shell">
      <Header
        config={config}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
      />
      <main className="app-main">
        <Hero config={config} />
        <GallerySection config={config} catalog={catalog} />
      </main>
      <Footer config={config} />
    </div>
  );
}

export default App;
