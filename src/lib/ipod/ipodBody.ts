import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export type IpodBodyParams = {
  bodyW: number;
  bodyH: number;
  cornerR: number;
  faceInset: number;
  bendReach: number;
  bendDepth: number;
  /** 0 = smootherstep, 1 = linear, >1 = flatter center */
  bendPower: number;
  plateTopZ: number;
  edgeDrop: number;
  rimWidth: number;
  sideDepth: number;
  pillowGridX: number;
  pillowGridY: number;
  chromeRoughness: number;
  chromeMetalness: number;
  chromeEnvIntensity: number;
  shellRoughness: number;
  shellMetalness: number;
  shellEnvIntensity: number;
  wheelX: number;
  wheelY: number;
  /** Fine-tune from auto flush height (plateTopZ - wheelTop) */
  wheelZOffset: number;
  wheelInnerR: number;
  wheelOuterR: number;
  wheelTop: number;
  wheelBottom: number;
  /** 0.5 = ring midline; higher pushes MENU toward outer edge */
  menuRingBias: number;
  menuSymbolW: number;
  menuSymbolH: number;
  iconSymbolW: number;
  iconSymbolH: number;
  playSymbolW: number;
  screenW: number;
  screenBottomY: number;
  screenZ: number;
};

export const DEFAULT_IPOD_BODY_PARAMS: IpodBodyParams = {
  bodyW: 1.209,
  bodyH: 2.025,
  cornerR: 0.145,
  faceInset: 0.015,
  bendReach: 0.105,
  bendDepth: 0.007,
  bendPower: 0,
  plateTopZ: 0.169,
  edgeDrop: 0.01,
  rimWidth: 0.008,
  sideDepth: 0.0954,
  pillowGridX: 120,
  pillowGridY: 200,
  chromeRoughness: 0.28,
  chromeMetalness: 0.92,
  chromeEnvIntensity: 0.32,
  shellRoughness: 0.12,
  shellMetalness: 1.0,
  shellEnvIntensity: 0.48,
  wheelX: 0,
  wheelY: 0.577,
  wheelZOffset: 0,
  wheelInnerR: 0.157,
  wheelOuterR: 0.352,
  wheelTop: 0.005,
  wheelBottom: 0.007,
  menuRingBias: 0.76,
  menuSymbolW: 0.218,
  menuSymbolH: 0.046,
  iconSymbolW: 0.108,
  iconSymbolH: 0.068,
  playSymbolW: 0.092,
  screenW: 0.994,
  screenBottomY: 1.1075,
  screenZ: 0.172,
};

export type IpodScreenLayout = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  z: number;
};

export type IpodBodyBuildResult = {
  wheelMesh: THREE.Mesh | null;
  buttonMesh: THREE.Mesh | null;
  buttonBaseZ: number;
  wheelParts: THREE.Object3D[];
  dispose: () => void;
};

function wheelSymbolRadii(innerR: number, outerR: number, menuBias: number) {
  const band = outerR - innerR;
  return {
    iconR: innerR + band * 0.5,
    menuR: innerR + band * menuBias,
  };
}

function wheelSurfaceZ(
  x: number,
  y: number,
  cx: number,
  cy: number,
  outerR: number,
  params: Pick<
    IpodBodyParams,
    "bodyW" | "bodyH" | "cornerR" | "plateTopZ" | "bendReach" | "bendDepth" | "bendPower"
  >,
  lift: number,
  epsilon = 0.00045,
): number {
  const dy = (y - cy) / outerR;
  const topBias = Math.max(0, dy) * 0.0015;
  return faceZAt(x, y, params) + lift + topBias + epsilon;
}

/** Wheel / button deck height at a point on the pillow face */
export function faceZAt(
  x: number,
  y: number,
  params: Pick<
    IpodBodyParams,
    "bodyW" | "bodyH" | "cornerR" | "plateTopZ" | "bendReach" | "bendDepth" | "bendPower"
  >,
): number {
  const inset = distToRoundedRectBorder(
    x,
    y,
    params.bodyW,
    params.bodyH,
    params.cornerR,
  );
  return (
    params.plateTopZ -
    pillowDrop(inset, params.bendReach, params.bendDepth, params.bendPower)
  );
}

export function getScreenLayout(params: IpodBodyParams): IpodScreenLayout {
  const faceHalfW = (params.bodyW - 2 * params.faceInset) / 2;
  const faceTopY = params.bodyH - params.faceInset;
  const faceSideMargin = faceHalfW - params.screenW / 2;
  const screenTopY = faceTopY - faceSideMargin;
  const screenH = screenTopY - params.screenBottomY;
  const screenCy = (screenTopY + params.screenBottomY) / 2;
  return {
    cx: 0,
    cy: screenCy,
    w: params.screenW,
    h: screenH,
    z: params.screenZ,
  };
}

export function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function distToRoundedRectBorder(
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): number {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const bx = hw - rad;
  const by = hh - rad;
  if (ax > bx && ay > by) {
    return rad - Math.hypot(ax - bx, ay - by);
  }
  return Math.min(hw - ax, hh - ay);
}

export function pillowDrop(
  inset: number,
  reach: number,
  depth: number,
  power: number,
): number {
  const t = THREE.MathUtils.clamp(inset / reach, 0, 1);
  let ease: number;
  if (power <= 0) {
    ease = t * t * t * (t * (t * 6 - 15) + 10);
  } else {
    ease = Math.pow(t, power);
  }
  return depth * (1 - ease);
}

function edgeLen2d(pos: number[], ia: number, ib: number): number {
  const ax = pos[ia * 3];
  const ay = pos[ia * 3 + 1];
  const bx = pos[ib * 3];
  const by = pos[ib * 3 + 1];
  return Math.hypot(bx - ax, by - ay);
}

function subdivideTriangles(
  positions: number[],
  indices: number[],
  maxEdge: number,
  maxPasses = 14,
): { positions: number[]; indices: number[] } {
  let pos = positions;
  let idx = indices;

  for (let pass = 0; pass < maxPasses; pass++) {
    const mids = new Map<string, number>();
    const nextPos = [...pos];
    const nextIdx: number[] = [];
    let split = false;

    const getMid = (a: number, b: number) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const cached = mids.get(key);
      if (cached !== undefined) return cached;
      const i = nextPos.length / 3;
      nextPos.push(
        (pos[a * 3] + pos[b * 3]) * 0.5,
        (pos[a * 3 + 1] + pos[b * 3 + 1]) * 0.5,
        (pos[a * 3 + 2] + pos[b * 3 + 2]) * 0.5,
      );
      mids.set(key, i);
      return i;
    };

    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i];
      const b = idx[i + 1];
      const c = idx[i + 2];
      const lab = edgeLen2d(pos, a, b);
      const lbc = edgeLen2d(pos, b, c);
      const lca = edgeLen2d(pos, c, a);
      const max = Math.max(lab, lbc, lca);
      if (max > maxEdge) {
        split = true;
        if (max === lab) {
          const m = getMid(a, b);
          nextIdx.push(a, m, c, m, b, c);
        } else if (max === lbc) {
          const m = getMid(b, c);
          nextIdx.push(b, m, a, m, c, a);
        } else {
          const m = getMid(c, a);
          nextIdx.push(c, m, b, m, a, b);
        }
      } else {
        nextIdx.push(a, b, c);
      }
    }

    pos = nextPos;
    idx = nextIdx;
    if (!split) break;
  }

  return { positions: pos, indices: idx };
}

function cornerCurveSegments(r: number): number {
  return Math.max(48, Math.round(r * 220));
}

function buildWheelAnnulusGeometry(
  innerR: number,
  outerR: number,
  cx: number,
  cy: number,
  params: Pick<
    IpodBodyParams,
    "bodyW" | "bodyH" | "cornerR" | "plateTopZ" | "bendReach" | "bendDepth" | "bendPower"
  >,
  lift = 0.0012,
  segments = 128,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const r of [innerR, outerR]) {
      const x = cx + r * c;
      const y = cy + r * s;
      positions.push(x, y, wheelSurfaceZ(x, y, cx, cy, outerR, params, lift, 0));
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildButtonDishGeometry(
  innerR: number,
  depth: number,
  segments = 96,
  rings = 24,
): THREE.BufferGeometry {
  const positions: number[] = [0, 0, -depth];
  const indices: number[] = [];

  for (let j = 1; j <= rings; j++) {
    const t = j / rings;
    const r = t * innerR;
    const z = -depth * (1 - t) * (1 - t);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(r * Math.cos(a), r * Math.sin(a), z);
    }
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + i, 1 + next);
  }

  for (let j = 1; j < rings; j++) {
    const row0 = 1 + (j - 1) * segments;
    const row1 = 1 + j * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(row0 + i, row1 + i, row0 + next);
      indices.push(row1 + i, row1 + next, row0 + next);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function clipTrianglesInsideCircle(
  positions: number[],
  indices: number[],
  hole: { cx: number; cy: number; r: number },
): number[] {
  const r2 = hole.r * hole.r;
  const inside = (x: number, y: number) => {
    const dx = x - hole.cx;
    const dy = y - hole.cy;
    return dx * dx + dy * dy <= r2;
  };
  const kept: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const triInside =
      inside(ax, ay) || inside(bx, by) || inside(cx, cy);
    const midInside = inside(
      (ax + bx + cx) / 3,
      (ay + by + cy) / 3,
    );
    if (!triInside && !midInside) {
      kept.push(indices[i], indices[i + 1], indices[i + 2]);
    }
  }
  return kept;
}

export function buildPillowFaceGeometry(
  w: number,
  h: number,
  r: number,
  bendReach: number,
  bendDepth: number,
  topZ: number,
  bendPower: number,
  gridX: number,
  gridY: number,
  wheelHole?: { cx: number; cy: number; r: number },
): THREE.BufferGeometry {
  const shapeGeo = new THREE.ShapeGeometry(
    roundedRect(w, h, r),
    cornerCurveSegments(r),
  );
  const maxEdge = Math.min(w / gridX, h / gridY);
  let positions = Array.from(shapeGeo.attributes.position.array);
  const indices = shapeGeo.index
    ? Array.from(shapeGeo.index.array)
    : Array.from({ length: positions.length / 3 }, (_, i) => i);

  const subdivided = subdivideTriangles(positions, indices, maxEdge);
  positions = subdivided.positions;
  let finalIndices = subdivided.indices;
  if (wheelHole) {
    finalIndices = clipTrianglesInsideCircle(positions, finalIndices, wheelHole);
  }

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const inset = distToRoundedRectBorder(x, y, w, h, r);
    positions[i + 2] = topZ - pillowDrop(inset, bendReach, bendDepth, bendPower);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(finalIndices);
  geo.computeVertexNormals();
  shapeGeo.dispose();
  return geo;
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
    if ((mesh as THREE.Mesh).material) {
      const materials = (mesh as THREE.Mesh).material;
      const list = Array.isArray(materials) ? materials : [materials];
      for (const m of list) {
        const basic = m as THREE.MeshBasicMaterial;
        if (basic.map) basic.map.dispose();
      }
    }
  });
}

export function buildIpodBodyGroup(
  group: THREE.Group,
  params: IpodBodyParams,
  options: { includeWheel?: boolean } = {},
): IpodBodyBuildResult {
  const includeWheel = options.includeWheel ?? true;
  const meshes: THREE.Object3D[] = [];
  const wheelParts: THREE.Object3D[] = [];
  let wheelMesh: THREE.Mesh | null = null;
  let buttonMesh: THREE.Mesh | null = null;
  let buttonBaseZ = 0;

  const {
    bodyW: W,
    bodyH: H,
    cornerR: R,
    bendReach,
    bendDepth,
    bendPower,
    plateTopZ,
    edgeDrop,
    rimWidth,
    sideDepth,
    pillowGridX,
    pillowGridY,
    chromeRoughness,
    chromeMetalness,
    chromeEnvIntensity,
    shellRoughness,
    shellMetalness,
    shellEnvIntensity,
  } = params;

  const faceMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e5ea,
    metalness: chromeMetalness,
    roughness: chromeRoughness,
    envMapIntensity: chromeEnvIntensity,
    clearcoat: 0.38,
    clearcoatRoughness: 0.14,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x13151a,
    metalness: shellMetalness,
    roughness: shellRoughness,
    envMapIntensity: shellEnvIntensity,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
  });

  let faceGeo = buildPillowFaceGeometry(
    W,
    H,
    R,
    bendReach,
    bendDepth,
    plateTopZ,
    bendPower,
    pillowGridX,
    pillowGridY,
    includeWheel
      ? {
          cx: params.wheelX,
          cy: params.wheelY - H / 2,
          r: params.wheelInnerR * 0.88,
        }
      : undefined,
  );
  faceGeo = mergeVertices(faceGeo, 1e-4);
  faceGeo.computeVertexNormals();
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, H / 2, 0);
  face.castShadow = true;
  face.receiveShadow = true;
  face.renderOrder = 0;
  group.add(face);
  meshes.push(face);

  const edgeZ = plateTopZ - bendDepth;
  const rimShape = roundedRect(W, H, R);
  const rimHole = roundedRect(
    W - rimWidth,
    H - rimWidth,
    Math.max(R - rimWidth * 0.5, rimWidth * 0.5),
  );
  rimShape.holes.push(rimHole);
  let rimGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(rimShape, {
    depth: edgeDrop,
    curveSegments: cornerCurveSegments(R),
    bevelEnabled: false,
  });
  rimGeo = mergeVertices(rimGeo, 1e-4);
  rimGeo.computeVertexNormals();
  const rimBackZ = edgeZ - edgeDrop;
  const rim = new THREE.Mesh(rimGeo, faceMat);
  rim.position.set(0, H / 2, rimBackZ);
  rim.castShadow = true;
  group.add(rim);
  meshes.push(rim);

  let shellGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
    roundedRect(W, H, R),
    {
      depth: sideDepth,
      curveSegments: cornerCurveSegments(R),
      bevelEnabled: false,
    },
  );
  shellGeo = mergeVertices(shellGeo, 1e-4);
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.position.set(0, H / 2, rimBackZ - sideDepth);
  shell.castShadow = true;
  group.add(shell);
  meshes.push(shell);

  if (includeWheel) {
    const cx = params.wheelX;
    const cy = params.wheelY;
    const { wheelInnerR: INNER_R, wheelOuterR: OUTER_R, wheelTop: WHEEL_TOP } = params;

    const WHEEL_LIFT = 0.0012;
    const CONCAVE_DEPTH = WHEEL_TOP;
    const deckZ = faceZAt(cx, cy, params);
    const deckTopZ = deckZ + params.wheelZOffset + WHEEL_LIFT;

    const wheelMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    wheelMesh = new THREE.Mesh(
      buildWheelAnnulusGeometry(INNER_R, OUTER_R, cx, cy, params, WHEEL_LIFT, 128),
      wheelMat,
    );
    wheelMesh.castShadow = false;
    wheelMesh.receiveShadow = false;
    wheelMesh.renderOrder = 5;
    group.add(wheelMesh);
    meshes.push(wheelMesh);
    wheelParts.push(wheelMesh);

    const buttonMat = faceMat.clone();
    buttonMat.polygonOffset = true;
    buttonMat.polygonOffsetFactor = -8;
    buttonMat.polygonOffsetUnits = -8;
    buttonMat.userData.baseColor = 0xe2e5ea;

    buttonMesh = new THREE.Mesh(
      buildButtonDishGeometry(INNER_R * 0.992, CONCAVE_DEPTH, 96, 28),
      buttonMat,
    );
    buttonMesh.castShadow = false;
    buttonMesh.receiveShadow = false;
    buttonMesh.renderOrder = 4;
    buttonMesh.position.set(cx, cy, deckTopZ + 0.0001);
    buttonBaseZ = deckTopZ + 0.0001;
    group.add(buttonMesh);
    meshes.push(buttonMesh);

    const INK = "#6e757c";
    function makeTex(
      w: number,
      h: number,
      draw: (g2: CanvasRenderingContext2D, w: number, h: number) => void,
    ) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g2 = c.getContext("2d")!;
      g2.fillStyle = INK;
      g2.strokeStyle = INK;
      draw(g2, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    }

    const tri = (
      g2: CanvasRenderingContext2D,
      x: number,
      dir: number,
      cy2: number,
      s: number,
    ) => {
      g2.beginPath();
      g2.moveTo(x, cy2 - s);
      g2.lineTo(x, cy2 + s);
      g2.lineTo(x + dir * s * 1.5, cy2);
      g2.closePath();
      g2.fill();
    };

    const drawSkipForwardIcon = (
      g2: CanvasRenderingContext2D,
      w: number,
      h: number,
    ) => {
      const cy = h / 2;
      const s = 17;
      const barW = 6;
      const barH = 32;
      const triStep = s * 1.5 + 5;
      const barGap = 7;
      const contentW = triStep + s * 1.5 + barGap + barW;
      const x0 = (w - contentW) / 2;
      tri(g2, x0, 1, cy, s);
      tri(g2, x0 + triStep, 1, cy, s);
      g2.fillRect(x0 + triStep + s * 1.5 + barGap, cy - barH / 2, barW, barH);
    };

    const drawPlayPauseIcon = (
      g2: CanvasRenderingContext2D,
      w: number,
      h: number,
    ) => {
      const cy = h / 2;
      const s = 17;
      const barW = 6;
      const barH = 32;
      const barGap = 11;
      const triToBarGap = 8;
      const contentW = s * 1.5 + triToBarGap + barW + barGap + barW;
      const x0 = (w - contentW) / 2;
      tri(g2, x0, 1, cy, s);
      const barX = x0 + s * 1.5 + triToBarGap;
      g2.fillRect(barX, cy - barH / 2, barW, barH);
      g2.fillRect(barX + barW + barGap, cy - barH / 2, barW, barH);
    };

    const menuTex = makeTex(320, 72, (g2, w, h) => {
      g2.font = "bold 52px Helvetica Neue, Helvetica, Arial, sans-serif";
      g2.textAlign = "center";
      g2.textBaseline = "middle";
      g2.fillText("MENU", w / 2, h / 2 + 1);
    });
    const nextTex = makeTex(128, 64, (g2, w, h) => {
      drawSkipForwardIcon(g2, w, h);
    });
    const prevTex = makeTex(128, 64, (g2, w, h) => {
      g2.save();
      g2.translate(w, 0);
      g2.scale(-1, 1);
      drawSkipForwardIcon(g2, w, h);
      g2.restore();
    });
    const playTex = makeTex(128, 64, (g2, w, h) => {
      drawPlayPauseIcon(g2, w, h);
    });

    const { iconR, menuR } = wheelSymbolRadii(
      INNER_R,
      OUTER_R,
      params.menuRingBias,
    );
    const defs: [THREE.CanvasTexture, number, number, number, number][] = [
      [menuTex, params.menuSymbolW, params.menuSymbolH, cx, cy + menuR],
      [playTex, params.playSymbolW, params.iconSymbolH, cx, cy - iconR],
      [prevTex, params.iconSymbolW, params.iconSymbolH, cx - iconR, cy],
      [nextTex, params.iconSymbolW, params.iconSymbolH, cx + iconR, cy],
    ];
    for (const [tex, w, h, px, py] of defs) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          toneMapped: false,
          depthTest: false,
          depthWrite: false,
        }),
      );
      m.position.set(
        px,
        py,
        wheelSurfaceZ(px, py, cx, cy, OUTER_R, params, WHEEL_LIFT),
      );
      m.renderOrder = 10;
      group.add(m);
      meshes.push(m);
      wheelParts.push(m);
    }
  }

  return {
    wheelMesh,
    buttonMesh,
    buttonBaseZ,
    wheelParts,
    dispose: () => {
      for (const mesh of meshes) {
        group.remove(mesh);
        disposeObject3D(mesh);
      }
    },
  };
}

export function paramsToTypeScript(params: IpodBodyParams): string {
  const lines = Object.entries(params).map(([key, value]) => {
    const n = typeof value === "number" ? value : JSON.stringify(value);
    return `  ${key}: ${n},`;
  });
  return `export const IPOD_BODY_PARAMS = {\n${lines.join("\n")}\n};`;
}
