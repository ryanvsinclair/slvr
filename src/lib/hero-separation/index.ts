/** Easing curve — slow start, accelerating finish */
export const ease = (t: number) => t * t * (3 - 2 * t) * t;

/** Extra travel beyond viewport edge (1 = just clears screen) */
export const SEPARATION_SCALE = 6;

/** Horizontal movement is this many times the vertical movement at full exit */
export const H_TO_V_RATIO = 3;

/** Horizontal split finishes within this fraction of total scroll (0–1) */
export const H_SCROLL_FRACTION = 0.32;

/** Vertical split starts after this fraction of total scroll (0–1) */
export const V_SCROLL_DELAY = 0.42;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Front-loaded: most horizontal travel happens early in the scroll */
export const horizontalProgress = (p: number) =>
  ease(clamp(p / H_SCROLL_FRACTION, 0, 1));

/** Back-loaded: vertical travel ramps up only after horizontal has begun */
export const verticalProgress = (p: number) =>
  ease(clamp((p - V_SCROLL_DELAY) / (1 - V_SCROLL_DELAY), 0, 1));

export type QuadRefs = {
  tl: HTMLElement;
  tr: HTMLElement;
  bl: HTMLElement;
  br: HTMLElement;
};

export type SeparationOffsets = {
  x: number;
  y: number;
};

/** Compute x/y pixel offsets for each quadrant at scroll progress p (0–1) */
export function getSeparationOffsets(
  exitX: number,
  p: number,
): SeparationOffsets {
  const maxX = exitX * SEPARATION_SCALE;
  const maxY = maxX / H_TO_V_RATIO;
  return {
    x: maxX * horizontalProgress(p),
    y: maxY * verticalProgress(p),
  };
}

/** Apply transforms to the four hero quadrants */
export function applyQuadTransforms(
  quads: QuadRefs,
  { x, y }: SeparationOffsets,
) {
  quads.tl.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
  quads.tr.style.transform = `translate3d(${x}px, ${-y}px, 0)`;
  quads.bl.style.transform = `translate3d(${-x}px, ${y}px, 0)`;
  quads.br.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

export type HeroSeparationCallbacks = {
  onProgress?: (p: number) => void;
};

export type HeroSeparationElements = {
  stage: HTMLElement;
  grid: HTMLElement;
  quads: QuadRefs;
};

/** Wire up scroll-driven quadrant separation. Returns a cleanup function. */
export function bindHeroSeparation(
  { stage, grid, quads }: HeroSeparationElements,
  callbacks: HeroSeparationCallbacks = {},
): () => void {
  let exitX = 0;

  const measure = () => {
    const half = grid.offsetWidth / 2;
    exitX = window.innerWidth / 2 + half;
  };

  measure();

  let ticking = false;

  const update = () => {
    ticking = false;

    const rect = stage.getBoundingClientRect();
    const scrollable = stage.offsetHeight - window.innerHeight;
    const p = Math.min(1, Math.max(0, -rect.top / scrollable));

    applyQuadTransforms(quads, getSeparationOffsets(exitX, p));
    callbacks.onProgress?.(p);
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  const onResize = () => {
    measure();
    update();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  update();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
  };
}
