import * as THREE from "three";

export type ShotLayout = {
  mobile: boolean;
  screenPos: THREE.Vector3;
  screenW: number;
  screenH: number;
  lens: THREE.Vector3;
  ifw: number;
  ifh: number;
  cin: { pos: THREE.Vector3; tgt: THREE.Vector3 };
  cinOff: { x: number; y: number };
};

const MOBILE_IFW = 390;
const MOBILE_IFH = 780;
const DESKTOP_IFW = 1280;
const DESKTOP_IFH = 720;
const CAMERA_FOV = 35;

/** Touch-first or narrow viewports use the tall portrait projection screen. */
export function isMobileViewport(
  w: number = typeof window !== "undefined" ? window.innerWidth : 390,
  h: number = typeof window !== "undefined" ? window.innerHeight : 844,
): boolean {
  if (w <= 768) return true;
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return Math.min(w, h) <= 900;
  }
  return false;
}

function fitScreenSize(
  camPos: THREE.Vector3,
  screenCenter: THREE.Vector3,
  fovDeg: number,
  viewAspect: number,
  contentAspect: number,
  margin = 0.86,
): { screenW: number; screenH: number } {
  const dist = camPos.distanceTo(screenCenter);
  const vFov = (fovDeg * Math.PI) / 180;
  const maxH = 2 * dist * Math.tan(vFov / 2) * margin;
  const maxW = maxH * viewAspect;

  if (maxW / maxH > contentAspect) {
    return { screenH: maxH, screenW: maxH * contentAspect };
  }
  return { screenW: maxW, screenH: maxW / contentAspect };
}

export function getShotLayout(
  viewW: number,
  viewH: number,
  fovDeg = CAMERA_FOV,
): ShotLayout {
  const mobile = isMobileViewport(viewW, viewH);
  // A hidden or not-yet-laid-out window can report 0x0; fall back to the
  // content aspect so screen sizes stay finite (0/0 is NaN and poisons
  // every geometry built from the layout).
  const hasViewport =
    Number.isFinite(viewW) && Number.isFinite(viewH) && viewW > 0 && viewH > 0;
  const viewAspect = hasViewport
    ? viewW / viewH
    : (mobile ? MOBILE_IFW / MOBILE_IFH : DESKTOP_IFW / DESKTOP_IFH);

  if (mobile) {
    const screenPos = new THREE.Vector3(0, 2.4, -3.8);
    const cin = {
      pos: new THREE.Vector3(0, 2.4, 3.2),
      tgt: new THREE.Vector3(0, 2.4, -3.8),
    };
    const contentAspect = MOBILE_IFW / MOBILE_IFH;
    const { screenW, screenH } = fitScreenSize(
      cin.pos,
      screenPos,
      fovDeg,
      viewAspect,
      contentAspect,
    );

    return {
      mobile: true,
      screenPos,
      screenW,
      screenH,
      lens: new THREE.Vector3(0.85, 0.24, 2.25),
      ifw: MOBILE_IFW,
      ifh: MOBILE_IFH,
      cin,
      cinOff: { x: -0.75, y: -1.0 },
    };
  }

  return {
    mobile: false,
    screenPos: new THREE.Vector3(0, 2.5, -3.8),
    screenW: 4.8,
    screenH: 2.7,
    lens: new THREE.Vector3(1.51, 0.24, 2.25),
    ifw: DESKTOP_IFW,
    ifh: DESKTOP_IFH,
    cin: {
      pos: new THREE.Vector3(0, 2.35, 3.0),
      tgt: new THREE.Vector3(0, 2.45, -3.8),
    },
    cinOff: { x: -1.55, y: -0.5 },
  };
}

export function layoutNeedsUpdate(a: ShotLayout, b: ShotLayout): boolean {
  // NaN compares false against everything, so an invalid current layout
  // would otherwise never be replaced.
  if (!Number.isFinite(a.screenW) || !Number.isFinite(a.screenH)) return true;
  return (
    a.mobile !== b.mobile ||
    Math.abs(a.screenW - b.screenW) > 0.04 ||
    Math.abs(a.screenH - b.screenH) > 0.04 ||
    a.ifw !== b.ifw ||
    a.ifh !== b.ifh
  );
}

export function projAnchorPosition(lens: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(lens.x + 0.11, 0.15, lens.z + 0.17);
}
