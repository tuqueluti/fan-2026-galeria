import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(async () => {
  if (typeof window !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});

// Polyfill CSS.escape para ambiente jsdom quando ausente
if (
  typeof window !== 'undefined' &&
  (typeof globalThis.CSS === 'undefined' || typeof globalThis.CSS.escape !== 'function')
) {
  globalThis.CSS = {
    ...(globalThis.CSS ?? {}),
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'),
  } as typeof CSS;
}
