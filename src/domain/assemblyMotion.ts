import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  generate,
  type UIGenerationOptions,
  type UIGenerationRun,
} from '../vendor/ui-generation/ui-generation.js';

function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Executa a animação de construção generativa (`transitions-ui-generation`) sobre um elemento real
 * após carregamento das fontes e estabilização do layout.
 * Em ambientes de teste sem layout real (jsdom, onde width === 0) ou em `prefers-reduced-motion`,
 * preserva o elemento imediatamente visível sem bloquear interações.
 */
export function useGenerativeBuild<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UIGenerationOptions,
): void {
  const hasPlayedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || hasPlayedRef.current) return;
    if (isReducedMotionPreferred()) return;

    // Em jsdom (testes unitários), getBoundingClientRect() retorna 0x0: mantém visível sem rodar RAF
    const initialRect = el.getBoundingClientRect();
    if (initialRect.width < 16 || initialRect.height < 16) {
      return;
    }

    hasPlayedRef.current = true;
    let cancelled = false;
    let activeRun: UIGenerationRun | null = null;

    // Salva a opacidade original no contrato esperado por ui-generation.js antes de pré-ocultar
    const genEl = el as T & { __tGenOpacity?: string; __tTigOpacity?: string };
    const originalInlineOpacity = el.style.opacity;
    genEl.__tGenOpacity = originalInlineOpacity;
    genEl.__tTigOpacity = originalInlineOpacity;
    el.style.opacity = '0';

    const startBuild = async () => {
      try {
        const readinessTasks: Array<Promise<unknown>> = [];

        if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
          readinessTasks.push(document.fonts.ready);
        }

        const images = Array.from(el.querySelectorAll('img'));
        for (const img of images) {
          if (!img.complete) {
            readinessTasks.push(
              new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              }),
            );
          }
        }

        if (readinessTasks.length > 0) {
          await Promise.race([
            Promise.allSettled(readinessTasks),
            new Promise((resolve) => setTimeout(resolve, 450)),
          ]);
        }

        // Aguarda um ciclo de pintura caso algum fallback (ex.: logo pendente) tenha atualizado estado React
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      } catch {
        // segue normalmente
      }

      if (cancelled || !ref.current) {
        if (ref.current) ref.current.style.opacity = originalInlineOpacity;
        return;
      }

      const rect = ref.current.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) {
        ref.current.style.opacity = originalInlineOpacity;
        return;
      }

      try {
        activeRun = generate(ref.current, optionsRef.current);
      } catch {
        // Garante restauração caso o navegador restrinja SVG/Canvas
        if (ref.current) {
          ref.current.style.opacity = originalInlineOpacity;
        }
      }
    };

    startBuild();

    return () => {
      cancelled = true;
      if (activeRun) {
        activeRun.cancel();
      } else if (ref.current) {
        ref.current.style.opacity = originalInlineOpacity;
      }
    };
  }, [ref]);
}

/**
 * Dispara a montagem arquitetural de seções e cards quando entram no campo de visão
 * (inspirado em `AnimatedContent` do React Bits + tokens de `transitions.dev`).
 */
export function useScrollAssembly<T extends HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
}): { ref: RefObject<T | null>; isAssembled: boolean } {
  const ref = useRef<T | null>(null);
  const [isAssembled, setIsAssembled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (isReducedMotionPreferred()) return true;
    if (!('IntersectionObserver' in window)) return true;
    return false;
  });

  const threshold = options?.threshold ?? 0.1;
  const rootMargin = options?.rootMargin ?? '0px 0px -24px 0px';

  useEffect(() => {
    if (isAssembled) return;
    const el = ref.current;
    if (!el) return;

    // Fallback para jsdom caso IntersectionObserver exista sem disparar callback
    if (el.getBoundingClientRect().width === 0 && el.getBoundingClientRect().height === 0) {
      setIsAssembled(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsAssembled(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isAssembled, rootMargin, threshold]);

  return { ref, isAssembled };
}
