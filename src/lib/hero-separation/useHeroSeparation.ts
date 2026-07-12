import { useEffect } from "react";
import {
  bindHeroSeparation,
  type HeroSeparationCallbacks,
  type QuadRefs,
} from "./index";

type UseHeroSeparationArgs = {
  stageRef: React.RefObject<HTMLElement | null>;
  gridRef: React.RefObject<HTMLElement | null>;
  tlRef: React.RefObject<HTMLElement | null>;
  trRef: React.RefObject<HTMLElement | null>;
  blRef: React.RefObject<HTMLElement | null>;
  brRef: React.RefObject<HTMLElement | null>;
  callbacks?: HeroSeparationCallbacks;
};

/** React hook — attach scroll-driven SLVR quadrant separation */
export function useHeroSeparation({
  stageRef,
  gridRef,
  tlRef,
  trRef,
  blRef,
  brRef,
  callbacks,
}: UseHeroSeparationArgs) {
  useEffect(() => {
    const stage = stageRef.current;
    const grid = gridRef.current;
    const quads: QuadRefs | null =
      tlRef.current && trRef.current && blRef.current && brRef.current
        ? {
            tl: tlRef.current,
            tr: trRef.current,
            bl: blRef.current,
            br: brRef.current,
          }
        : null;

    if (!stage || !grid || !quads) return;

    return bindHeroSeparation({ stage, grid, quads }, callbacks);
  }, [stageRef, gridRef, tlRef, trRef, blRef, brRef, callbacks]);
}
