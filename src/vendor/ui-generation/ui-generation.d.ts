export interface UIGenerationOptions {
  variant?: 'ui' | 'text' | 'small-text' | 'image' | 'auto';
  mode?: 'skeleton' | 'skeleton-texts';
  duration?: number;
  delay?: number;
  steps?: string[];
  done?: string;
  code?: string[] | null;
  title?: string | null;
  maxParts?: number;
  keys?: number;
  onDone?: ((element: HTMLElement) => void) | null;
  display?: number;
  maxGlyphs?: number;
  fade?: number;
  fadeDelay?: number;
  fadeStagger?: number | null;
  sequenceEase?: string | [number, number, number, number];
  fadeBy?: 'character' | 'word' | 'gradient';
  dotScale?: number;
  guides?: boolean;
  focus?: boolean;
  readout?: boolean;
  particles?: boolean;
}

export interface UIGenerationRun {
  finished: Promise<HTMLElement>;
  cancel: () => void;
  element: HTMLElement;
}

export function generate(
  element: HTMLElement | string,
  options?: UIGenerationOptions,
): UIGenerationRun;

export function auto(root?: ParentNode): void;
