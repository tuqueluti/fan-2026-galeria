import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './vendor/ui-generation/ui-generation.css';
import './vendor/ui-generation/text-image-generation.css';
import './styles/gallery.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
