import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  CSS3DRenderer,
  CSS3DObject,
} from "three/addons/renderers/CSS3DRenderer.js";
import { PROJECTS, type Project } from "@/data/projects";
import { getBluetoothPixels } from "@/lib/ipod/bluetoothIcon";
import {
  getShotLayout,
  isMobileViewport,
  layoutNeedsUpdate,
  projAnchorPosition,
  type ShotLayout,
} from "@/lib/ipod/shotLayout";
import {
  buildIpodBodyGroup,
  DEFAULT_IPOD_BODY_PARAMS,
  getScreenLayout,
  roundedRect,
} from "@/lib/ipod/ipodBody";

type SceneRefs = {
  app: HTMLElement;
  css3d: HTMLElement;
  closeProj: HTMLButtonElement;
  prevProj: HTMLButtonElement;
  nextProj: HTMLButtonElement;
  stepBack: HTMLButtonElement;
  hint: HTMLElement;
  loading?: HTMLElement | null;
};

export type InitIpodSceneOptions = {
  transition?: boolean;
  onFirstFrame?: () => void;
  onIntroComplete?: () => void;
};

export type IpodSceneHandle = {
  dispose: () => void;
  startOutro: () => Promise<void>;
};

const WHEEL_R = DEFAULT_IPOD_BODY_PARAMS.wheelOuterR;

const SCREEN = getScreenLayout(DEFAULT_IPOD_BODY_PARAMS);

function beamMaterial(op: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uOp: { value: op },
      uColor: { value: new THREE.Color(0xbfd2ee) },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOp; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main() {
        float facing = pow(abs(dot(normalize(vN), normalize(-vV))), 1.7);
        float grad = mix(0.22, 1.0, vUv.y);
        gl_FragColor = vec4(uColor, uOp * facing * grad);
      }`,
  });
}

function buildHousingGeometry(caseW: number) {
  const caseH = 0.1;
  const caseD = 0.085;
  let caseGeo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
    roundedRect(caseW, caseH, 0.032),
    {
      depth: caseD,
      curveSegments: 18,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.007,
      bevelSegments: 5,
    },
  );
  caseGeo = mergeVertices(caseGeo, 1e-4);
  caseGeo.computeVertexNormals();
  return caseGeo;
}

function setPlaneGeometry(mesh: THREE.Mesh, w: number, h: number) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.PlaneGeometry(w, h);
}

function rebuildProjectorBeam(
  group: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
) {
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    group.remove(mesh);
  }
  const len = from.distanceTo(to);
  for (const [rBot, op] of [
    [2.5, 0.05],
    [1.7, 0.055],
    [1.0, 0.06],
  ] as const) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, rBot, len, 48, 1, true),
      beamMaterial(op),
    );
    cone.userData.baseOp = op;
    group.add(cone);
  }
  group.position.copy(from).add(to).multiplyScalar(0.5);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    from.clone().sub(to).normalize(),
  );
}

export function initIpodScene(
  refs: SceneRefs,
  options: InitIpodSceneOptions = {},
): IpodSceneHandle {
  const { app, css3d, closeProj, prevProj, nextProj, stepBack, hint, loading } =
    refs;
  const transitionMode = options.transition ?? false;

  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";

  // A hidden or not-yet-laid-out window can report 0x0 (see onResize).
  const initW = window.innerWidth > 0 ? window.innerWidth : 1280;
  const initH = window.innerHeight > 0 ? window.innerHeight : 720;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(initW, initH);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const CreateRoomEnvironment = RoomEnvironment as unknown as new (
    renderer?: THREE.WebGLRenderer,
  ) => THREE.Scene;
  scene.environment = pmrem.fromScene(
    new CreateRoomEnvironment(renderer),
    0.04,
  ).texture;
  scene.fog = new THREE.Fog(0x040406, 5, 16);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({
      color: 0x08080a,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.03,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  const spot = new THREE.SpotLight(0xffffff, 220, 25, 0.42, 0.8, 2);
  spot.position.set(0.4, 6.5, 1.6);
  spot.target.position.set(0, 1.01, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.radius = 14;
  spot.shadow.blurSamples = 24;
  spot.shadow.bias = -0.0002;
  scene.add(spot, spot.target);

  scene.add(new THREE.HemisphereLight(0x8a8a94, 0x2a2a30, 0.35));

  const wheelFill = new THREE.PointLight(0xffffff, 6, 2.8);
  wheelFill.position.set(0, 0.68, 0.25);
  scene.add(wheelFill);

  let layout = getShotLayout(initW, initH);

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(initW, initH);
  css3d.appendChild(cssRenderer.domElement);
  const sceneCSS = new THREE.Scene();

  const surf = document.createElement("div");
  surf.style.cssText = `width:${layout.ifw}px;height:${layout.ifh}px;background:#e8e8ea;overflow:hidden;`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "width:100%;height:100%;border:0;display:none;opacity:0;background:#fff;";
  surf.appendChild(iframe);
  const cssObj = new CSS3DObject(surf);

  const screenTop = () =>
    new THREE.Vector3(
      layout.screenPos.x,
      layout.screenPos.y + layout.screenH / 2,
      layout.screenPos.z,
    );
  const screenHalfH = () => layout.screenH / 2;
  const rollerRadius = 0.052;
  const screenHang = rollerRadius + 0.012;

  const screenRig = new THREE.Group();
  screenRig.position.copy(screenTop());
  scene.add(screenRig);

  const rollerMat = new THREE.MeshStandardMaterial({
    color: 0x222226,
    roughness: 0.32,
    metalness: 0.58,
    envMapIntensity: 0.35,
  });
  const rollerSpin = new THREE.Group();
  screenRig.add(rollerSpin);

  const roller = new THREE.Mesh(
    new THREE.CylinderGeometry(
      rollerRadius,
      rollerRadius,
      layout.screenW + 0.12,
      36,
    ),
    rollerMat,
  );
  roller.rotation.z = Math.PI / 2;
  rollerSpin.add(roller);

  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x161618,
    roughness: 0.36,
    metalness: 0.38,
    envMapIntensity: 0.28,
  });
  const caseH = 0.1;
  const caseD = 0.085;
  const housing = new THREE.Mesh(
    buildHousingGeometry(layout.screenW + 0.26),
    housingMat,
  );
  housing.position.set(0, caseH / 2 + 0.012, -caseD / 2 + 0.018);
  screenRig.add(housing);

  const bottomBarMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    roughness: 0.26,
    metalness: 0.62,
    envMapIntensity: 0.32,
  });
  const bottomBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, layout.screenW + 0.05, 24),
    bottomBarMat,
  );
  bottomBar.rotation.z = Math.PI / 2;
  bottomBar.position.set(0, -layout.screenH + 0.02, 0.012);

  const screenContent = new THREE.Group();
  screenContent.position.y = -screenHang;
  screenRig.add(screenContent);

  const screenSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.screenW, layout.screenH),
    new THREE.MeshStandardMaterial({
      color: 0xe4e4e8,
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.08,
    }),
  );
  screenSurface.position.set(0, -screenHalfH(), 0);
  screenContent.add(screenSurface);

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.screenW + 0.14, layout.screenH + 0.14),
    new THREE.MeshBasicMaterial({ color: 0x1b1b1f }),
  );
  frame.position.set(0, -screenHalfH(), -0.008);
  screenContent.add(frame);

  const occluder = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.screenW, layout.screenH),
    new THREE.MeshBasicMaterial({ colorWrite: false }),
  );
  occluder.position.set(0, -screenHalfH(), 0);
  occluder.renderOrder = -5;
  screenContent.add(occluder);
  screenContent.add(bottomBar);

  const screenCSSRig = new THREE.Group();
  screenCSSRig.position.copy(screenTop());
  sceneCSS.add(screenCSSRig);

  const screenCSSContent = new THREE.Group();
  screenCSSContent.position.y = -screenHang;
  screenCSSRig.add(screenCSSContent);

  cssObj.position.set(0, -screenHalfH(), 0);
  cssObj.scale.setScalar(layout.screenW / layout.ifw);
  screenCSSContent.add(cssObj);

  let screenRoll = 0;
  const SCREEN_ROLL_LERP = 0.07;
  screenContent.scale.y = 0.001;
  screenCSSContent.scale.y = 0.001;
  bottomBar.visible = false;

  const projBox = new THREE.Group();
  const projMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0d,
    roughness: 0.5,
    metalness: 0.35,
    envMapIntensity: 0.25,
  });

  let pg: THREE.BufferGeometry = new THREE.ExtrudeGeometry(roundedRect(0.5, 0.4, 0.09), {
    depth: 0.13,
    curveSegments: 20,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.024,
    bevelSegments: 6,
  });
  pg = mergeVertices(pg, 1e-4);
  pg.computeVertexNormals();
  pg.rotateX(-Math.PI / 2);
  const pbody = new THREE.Mesh(pg, projMat);
  pbody.position.y = -0.065;

  const pring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.09, 0.055, 32),
    new THREE.MeshStandardMaterial({
      color: 0x08080a,
      roughness: 0.35,
      metalness: 0.6,
      envMapIntensity: 0.3,
    }),
  );
  pring.rotation.x = Math.PI / 2;
  pring.position.set(-0.09, 0, 0.21);

  const pglass = new THREE.Mesh(
    new THREE.CircleGeometry(0.062, 32),
    new THREE.MeshStandardMaterial({
      color: 0x05060a,
      roughness: 0.12,
      metalness: 0.8,
      envMapIntensity: 0.4,
    }),
  );
  pglass.position.set(-0.09, 0, 0.239);

  const pglow = new THREE.Mesh(
    new THREE.CircleGeometry(0.05, 24),
    new THREE.MeshBasicMaterial({
      color: 0xcfe0ff,
      transparent: true,
      opacity: 0,
    }),
  );
  pglow.position.set(-0.09, 0, 0.243);

  projBox.add(pbody, pring, pglass, pglow);

  // Float/aim wrapper — animate this the same way as the iPod pivot
  const projAnchor = new THREE.Group();
  const projHomePos = new THREE.Vector3();
  const projHomeQuat = new THREE.Quaternion();
  const _projOrient = new THREE.Object3D();
  const _projSpinEuler = new THREE.Euler();
  const _projSpinQuat = new THREE.Quaternion();

  function syncProjHome() {
    projHomePos.copy(projAnchorPosition(layout.lens));
    _projOrient.position.copy(projHomePos);
    _projOrient.lookAt(layout.screenPos);
    projHomeQuat.copy(_projOrient.quaternion);
  }

  syncProjHome();
  projBox.position.set(0, 0, 0);
  projBox.quaternion.identity();
  projAnchor.add(projBox);
  projAnchor.position.copy(projHomePos);
  projAnchor.quaternion.copy(projHomeQuat);
  scene.add(projAnchor);

  const beam = new THREE.Group();
  rebuildProjectorBeam(beam, layout.lens, layout.screenPos);
  beam.visible = false;
  scene.add(beam);

  const spotBeam = new THREE.Group();
  {
    const from = spot.position.clone();
    const dir = spot.target.position.clone().sub(from).normalize();
    const len = from.y / -dir.y;
    const to = from.clone().add(dir.clone().multiplyScalar(len));
    for (const [rBot, op] of [
      [1.9, 0.03],
      [1.3, 0.036],
      [0.75, 0.042],
    ] as const) {
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, rBot, len, 48, 1, true),
        beamMaterial(op),
      );
      cone.userData.baseOp = op;
      spotBeam.add(cone);
    }
    spotBeam.position.copy(from).add(to).multiplyScalar(0.5);
    spotBeam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      from.clone().sub(to).normalize(),
    );
  }
  scene.add(spotBeam);

  const CENTER_Y = 1.0125;
  const HOVER = 0.1;
  const NEAR = {
    pos: new THREE.Vector3(0.4, 1.3, 3.8),
    tgt: new THREE.Vector3(0, CENTER_Y + HOVER, 0),
  };
  const FAR = {
    pos: new THREE.Vector3(0.2, 1.3, 11.5),
    tgt: new THREE.Vector3(0, CENTER_Y + HOVER, 0),
  };
  const CIN = {
    pos: layout.cin.pos.clone(),
    tgt: layout.cin.tgt.clone(),
  };
  let CIN_OFF = { ...layout.cinOff };

  function syncCinFromLayout() {
    CIN.pos.copy(layout.cin.pos);
    CIN.tgt.copy(layout.cin.tgt);
    CIN_OFF = { ...layout.cinOff };
  }

  function applyScreenLayout(next: ShotLayout) {
    layout = next;
    syncCinFromLayout();

    const top = screenTop();
    const halfH = screenHalfH();

    screenRig.position.copy(top);
    screenCSSRig.position.copy(top);

    roller.geometry.dispose();
    roller.geometry = new THREE.CylinderGeometry(
      rollerRadius,
      rollerRadius,
      layout.screenW + 0.12,
      36,
    );

    housing.geometry.dispose();
    housing.geometry = buildHousingGeometry(layout.screenW + 0.26);

    bottomBar.geometry.dispose();
    bottomBar.geometry = new THREE.CylinderGeometry(
      0.02,
      0.02,
      layout.screenW + 0.05,
      24,
    );
    bottomBar.position.set(0, -layout.screenH + 0.02, 0.012);

    setPlaneGeometry(screenSurface, layout.screenW, layout.screenH);
    screenSurface.position.set(0, -halfH, 0);
    setPlaneGeometry(frame, layout.screenW + 0.14, layout.screenH + 0.14);
    frame.position.set(0, -halfH, -0.008);
    setPlaneGeometry(occluder, layout.screenW, layout.screenH);
    occluder.position.set(0, -halfH, 0);

    surf.style.width = `${layout.ifw}px`;
    surf.style.height = `${layout.ifh}px`;
    cssObj.position.set(0, -halfH, 0);
    cssObj.scale.setScalar(layout.screenW / layout.ifw);

    rebuildProjectorBeam(beam, layout.lens, layout.screenPos);

    syncProjHome();
  }

  let mode: "far" | "transit" | "near" = "far";

  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    50,
  );
  camera.position.copy(FAR.pos);
  camera.lookAt(FAR.tgt);

  const CW = 320;
  const CH = 240;
  const INSET = 9;
  const cnv = document.createElement("canvas");
  cnv.width = CW;
  cnv.height = CH;
  const ctx = cnv.getContext("2d")!;
  const screenTex = new THREE.CanvasTexture(cnv);
  screenTex.magFilter = THREE.NearestFilter;
  screenTex.minFilter = THREE.NearestFilter;
  ctx.imageSmoothingEnabled = false;
  screenTex.colorSpace = THREE.SRGBColorSpace;

  const LCD_BG = "#c9d2bd";
  const LCD_FG = "#0d120c";
  let view: "menu" | "project" = "menu";
  let sel = 0;
  let openIdx = 0;
  let projecting = false;
  let iframeFade = 1;
  let iframeFadeTarget = 1;
  let pendingIframeUrl: string | null = null;

  const SPOT_BRIGHT = 220;
  const SPOT_PROJ = 110;
  const IFRAME_PROJ_START = 0.35;
  const SCREEN_DOWN_THRESHOLD = 0.92;
  const SCREEN_UP_THRESHOLD = 0.08;
  const SCREEN_RETRACTED_THRESHOLD = 0.02;
  const CIN_READY_THRESHOLD = 0.97;
  const PROJECTOR_OFF_THRESHOLD = 0.03;
  const PROJECTOR_ON_LERP = 0.07;
  const OUTRO_PROJ_LERP = 0.14;
  const OUTRO_ROLL_LERP = 0.13;
  const OUTRO_CIN_LERP = 0.09;
  const OUTRO_PULLBACK_MS = 900;
  const APPROACH_DUR = 1800;
  const IPOD_BOOT_FLASH_IN = 0.14;
  const IPOD_BOOT_FLASH_PEAK = 0.28;
  const IPOD_BOOT_FLASH_OUT = 0.42;
  const IPOD_BOOT_MENU_IN = 0.5;
  const IPOD_SHUT_MS = 520;
  const IPOD_SHUT_MENU_OUT = 0.36;
  const IPOD_SHUT_LINE_END = 0.92;

  type IpodLcdPhase = "off" | "booting" | "on" | "shutting";
  let ipodLcd: IpodLcdPhase = "off";
  let ipodBootT = 0;
  let ipodBootStart = 0;
  let ipodShutT = 0;
  let ipodShutStart = 0;
  let introGlareT = 0;

  const smoothstep = (t: number) => {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  };

  function applyProjectionVisuals(
    cinVal: number,
    rollVal: number,
    projOnVal: number,
  ) {
    const rollReady = smoothstep(rollVal);
    const v = smoothstep(projOnVal) * rollReady;
    const beamOn = v > 0.004;
    beam.visible = beamOn;
    beam.children.forEach((c) => {
      const mesh = c as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.ShaderMaterial
      >;
      mesh.material.uniforms.uOp.value = mesh.userData.baseOp * v;
    });

    pglow.material.opacity = 0.9 * v;
    spot.intensity = SPOT_BRIGHT + (SPOT_PROJ - SPOT_BRIGHT) * v;

    spotBeam.children.forEach((c) => {
      const mesh = c as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.ShaderMaterial
      >;
      mesh.material.uniforms.uOp.value =
        mesh.userData.baseOp * (1 - v * 0.55);
    });

    iframeFade += (iframeFadeTarget - iframeFade) * 0.18;
    if (pendingIframeUrl && iframeFade < 0.06) {
      iframe.src = pendingIframeUrl;
      pendingIframeUrl = null;
      iframeFadeTarget = 1;
      iframeFade = 0;
    }

    const iframeT =
      projOnVal <= IFRAME_PROJ_START
        ? 0
        : smoothstep(
            (projOnVal - IFRAME_PROJ_START) / (1 - IFRAME_PROJ_START),
          );
    const iframeOp = iframeT * iframeFade;

    if (iframeOp > 0.008) {
      iframe.style.display = "block";
      iframe.style.opacity = String(iframeOp);
      surf.style.background = iframeOp > 0.3 ? "#ffffff" : "#e8e8ea";
      css3d.style.zIndex = "5";
      screenSurface.visible = false;
      frame.visible = false;
    } else {
      iframe.style.display = "none";
      iframe.style.opacity = "0";
      surf.style.background = "#e8e8ea";
      css3d.style.zIndex = "0";
      screenSurface.visible = rollReady > 0.05;
      frame.visible = rollReady > 0.05;
    }

    if (v > 0.82) {
      app.style.pointerEvents = "none";
      css3d.style.pointerEvents = "auto";
      closeProj.style.display = "block";
      closeProj.style.opacity = String(smoothstep((v - 0.82) / 0.18));
      stepBack.style.display = "none";
      const showMobileNav = isMobileViewport();
      const navOp = String(smoothstep((v - 0.82) / 0.18));
      prevProj.style.display = showMobileNav ? "flex" : "none";
      nextProj.style.display = showMobileNav ? "flex" : "none";
      prevProj.style.opacity = navOp;
      nextProj.style.opacity = navOp;
    } else if (cinVal < 0.01 && !projecting) {
      app.style.pointerEvents = "";
      css3d.style.pointerEvents = "none";
      closeProj.style.display = "none";
      closeProj.style.opacity = "0";
      prevProj.style.display = "none";
      nextProj.style.display = "none";
      prevProj.style.opacity = "0";
      nextProj.style.opacity = "0";
      if (mode === "near" && !stepBackPull && !outroActive) {
        stepBack.style.display = "block";
      }
    } else {
      app.style.pointerEvents = "none";
      css3d.style.pointerEvents = "none";
      closeProj.style.display = "none";
      prevProj.style.display = "none";
      nextProj.style.display = "none";
      stepBack.style.display = "none";
    }
  }

  function updateScreenRoll(rollTarget: number, lerp = SCREEN_ROLL_LERP) {
    screenRoll += (rollTarget - screenRoll) * lerp;
    if (rollTarget <= 0 && screenRoll < 0.002) screenRoll = 0;
    if (rollTarget >= 1 && screenRoll > 0.96) screenRoll = 1;

    const rollE = Math.max(0.001, smoothstep(screenRoll));
    screenContent.scale.y = rollE;
    screenCSSContent.scale.y = rollE;
    bottomBar.visible = rollE > 0.08;
  }

  function queueIframeSwap(url: string) {
    if (iframe.src === url) return;
    pendingIframeUrl = url;
    iframeFadeTarget = 0;
  }

  function wrapText(text: string, maxW: number) {
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawIpodIntroGlare(iw: number, ih: number, t: number) {
    const strength = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 0.45;
    if (strength < 0.02) return;

    const y = 10 + t * (ih - 20);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const bloom = ctx.createRadialGradient(
      iw * 0.5,
      y,
      4,
      iw * 0.5,
      y,
      Math.min(iw, ih) * 0.55,
    );
    bloom.addColorStop(0, `rgba(230, 236, 248, ${0.35 * strength})`);
    bloom.addColorStop(0.55, `rgba(200, 212, 235, ${0.1 * strength})`);
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, iw, ih);

    const angle = 0.55 + t * 0.35;
    const streakLen = Math.hypot(iw, ih);
    const sx = iw * 0.5 - Math.cos(angle) * streakLen * 0.5;
    const sy = y - Math.sin(angle) * streakLen * 0.5;
    const ex = iw * 0.5 + Math.cos(angle) * streakLen * 0.5;
    const ey = y + Math.sin(angle) * streakLen * 0.5;
    const streak = ctx.createLinearGradient(sx, sy, ex, ey);
    streak.addColorStop(0, "rgba(0, 0, 0, 0)");
    streak.addColorStop(0.42, `rgba(255, 255, 255, ${0.06 * strength})`);
    streak.addColorStop(0.5, `rgba(255, 255, 255, ${0.2 * strength})`);
    streak.addColorStop(0.58, `rgba(255, 255, 255, ${0.06 * strength})`);
    streak.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = streak;
    ctx.fillRect(0, 0, iw, ih);

    ctx.restore();
  }

  function drawIpodOff() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#17171a";
    ctx.fillRect(0, 0, CW, CH);
    ctx.translate(INSET, INSET);
    const IW = CW - 2 * INSET;
    const IH = CH - 2 * INSET;
    ctx.fillStyle = "#070907";
    ctx.fillRect(0, 0, IW, IH);
    if (introGlareT > 0 && introGlareT < 1) {
      drawIpodIntroGlare(IW, IH, introGlareT);
    }
    screenTex.needsUpdate = true;
  }

  function drawIpodBoot(t: number) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#17171a";
    ctx.fillRect(0, 0, CW, CH);
    ctx.translate(INSET, INSET);
    const IW = CW - 2 * INSET;
    const IH = CH - 2 * INSET;

    if (t >= IPOD_BOOT_MENU_IN) {
      drawScreenContent(
        smoothstep((t - IPOD_BOOT_MENU_IN) / (1 - IPOD_BOOT_MENU_IN)),
      );
      return;
    }

    let flash = 0;
    if (t >= IPOD_BOOT_FLASH_IN && t < IPOD_BOOT_FLASH_PEAK) {
      flash = smoothstep(
        (t - IPOD_BOOT_FLASH_IN) / (IPOD_BOOT_FLASH_PEAK - IPOD_BOOT_FLASH_IN),
      );
    } else if (t >= IPOD_BOOT_FLASH_PEAK && t < IPOD_BOOT_FLASH_OUT) {
      flash =
        1 -
        smoothstep(
          (t - IPOD_BOOT_FLASH_PEAK) /
            (IPOD_BOOT_FLASH_OUT - IPOD_BOOT_FLASH_PEAK),
        );
    }

    const bgG = 210 + Math.round(flash * 45);
    ctx.fillStyle = `rgb(${bgG - 6}, ${bgG}, ${bgG - 18})`;
    ctx.fillRect(0, 0, IW, IH);

    let splashOp = 0;
    if (t < IPOD_BOOT_FLASH_IN) {
      splashOp = smoothstep(t / IPOD_BOOT_FLASH_IN);
    } else if (t < IPOD_BOOT_FLASH_OUT) {
      splashOp =
        t < IPOD_BOOT_FLASH_PEAK
          ? 1
          : 1 -
            smoothstep(
              (t - IPOD_BOOT_FLASH_PEAK) /
                (IPOD_BOOT_FLASH_OUT - IPOD_BOOT_FLASH_PEAK),
            );
    }

    ctx.save();
    ctx.globalAlpha = splashOp;
    ctx.fillStyle = LCD_FG;
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SLVR", IW / 2, IH / 2);
    ctx.restore();
    screenTex.needsUpdate = true;
  }

  /** Reverse of boot: menu fades, SLVR blip, then CRT-style line collapse to black. */
  function drawIpodShut(t: number) {
    if (t < IPOD_SHUT_MENU_OUT) {
      drawScreenContent(1 - smoothstep(t / IPOD_SHUT_MENU_OUT));
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#17171a";
    ctx.fillRect(0, 0, CW, CH);
    ctx.translate(INSET, INSET);
    const IW = CW - 2 * INSET;
    const IH = CH - 2 * INSET;

    const u = smoothstep(
      (t - IPOD_SHUT_MENU_OUT) / (1 - IPOD_SHUT_MENU_OUT),
    );
    const lineT = Math.min(1, u / IPOD_SHUT_LINE_END);
    const lineE = 1 - smoothstep(lineT);
    const lineH = Math.max(0.8, IH * lineE * lineE);
    const brightness = lineE;

    const g = Math.round(7 + brightness * 208);
    ctx.fillStyle = `rgb(${Math.max(7, g - 6)}, ${Math.max(9, g)}, ${Math.max(7, g - 18)})`;
    ctx.fillRect(0, (IH - lineH) / 2, IW, lineH);

    if (u < 0.42) {
      ctx.save();
      ctx.globalAlpha = 1 - smoothstep(u / 0.42);
      ctx.fillStyle = LCD_FG;
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SLVR", IW / 2, IH / 2);
      ctx.restore();
    }

    if (u >= IPOD_SHUT_LINE_END) {
      const tip = smoothstep((u - IPOD_SHUT_LINE_END) / (1 - IPOD_SHUT_LINE_END));
      ctx.fillStyle = `rgba(210, 220, 200, ${0.35 * (1 - tip)})`;
      ctx.fillRect(IW / 2 - 1.5, IH / 2 - 1.5, 3, 3);
    }

    screenTex.needsUpdate = true;
  }

  function drawBluetoothIcon(x: number, y: number) {
    const pixels = getBluetoothPixels();
    ctx.fillStyle = LCD_FG;
    for (let r = 0; r < pixels.length; r++) {
      for (let c = 0; c < pixels[r].length; c++) {
        if (pixels[r][c] === "1") {
          ctx.fillRect(x + c, y + r, 1, 1);
        }
      }
    }
  }

  function drawLcdStatusIcons(iw: number) {
    ctx.strokeStyle = LCD_FG;
    ctx.fillStyle = LCD_FG;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";

    const barY = 8;
    const barH = 12;

    // Wi‑Fi (left)
    const wy = barY + barH;
    const wMid = 10;
    ctx.fillRect(wMid - 1, wy - 2, 2, 2);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const r = 3.5 + i * 3.5;
      ctx.arc(wMid, wy, r, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
    }

    // Bluetooth (left, after Wi‑Fi)
    drawBluetoothIcon(19, barY - 1);

    // Battery (right)
    ctx.strokeRect(iw - 32, 6, 22, 12);
    ctx.fillRect(iw - 9, 9, 3, 6);
    ctx.fillRect(iw - 30, barY, 14, barH - 2);
  }

  function drawScreenContent(menuFade = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#17171a";
    ctx.fillRect(0, 0, CW, CH);
    ctx.translate(INSET, INSET);
    const IW = CW - 2 * INSET;
    const IH = CH - 2 * INSET;

    ctx.fillStyle = LCD_BG;
    ctx.fillRect(0, 0, IW, IH);
    ctx.save();
    ctx.globalAlpha = menuFade;
    ctx.fillStyle = LCD_FG;
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.fillText(
      view === "menu" ? "SLVR's iPod" : PROJECTS[openIdx].title.slice(0, 18),
      IW / 2,
      18,
    );
    drawLcdStatusIcons(IW);
    ctx.fillRect(0, 26, IW, 2);

    ctx.textAlign = "left";
    if (view === "menu") {
      ctx.font = 'bold 14px "Courier New", monospace';
      PROJECTS.forEach((p, i) => {
        const y = 33 + i * 25;
        if (i === sel) {
          ctx.fillRect(3, y, IW - 6, 23);
          ctx.fillStyle = LCD_BG;
        }
        ctx.fillText(p.title.slice(0, 28), 10, y + 16);
        ctx.textAlign = "right";
        ctx.fillText(">", IW - 12, y + 16);
        ctx.textAlign = "left";
        ctx.fillStyle = LCD_FG;
      });
    } else {
      const p = PROJECTS[openIdx];
      ctx.font = 'bold 13px "Courier New", monospace';
      if (p.year) ctx.fillText(p.year, 10, 46);
      ctx.font = '13px "Courier New", monospace';
      let y = p.year ? 66 : 48;
      for (const line of wrapText(p.desc, IW - 22).slice(0, 6)) {
        ctx.fillText(line, 10, y);
        y += 18;
      }
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = "center";
      if (projecting) {
        ctx.fillText("▸ AirPlaying to projector", IW / 2, IH - 22);
        ctx.fillText("MENU = stop", IW / 2, IH - 6);
      } else if (/^https?:\/\/wa\.me\//i.test(p.url)) {
        ctx.fillText("PLAY = WhatsApp", IW / 2, IH - 22);
        ctx.fillText("MENU = back", IW / 2, IH - 6);
      } else if (p.url.startsWith("mailto:")) {
        ctx.fillText("PLAY = email us", IW / 2, IH - 22);
        ctx.fillText("MENU = back", IW / 2, IH - 6);
      } else {
        ctx.fillText("PLAY = open site", IW / 2, IH - 22);
        ctx.fillText("MENU = back", IW / 2, IH - 6);
      }
    }
    ctx.restore();
    screenTex.needsUpdate = true;
  }

  function drawScreen() {
    if (ipodLcd === "off") {
      drawIpodOff();
      return;
    }
    if (ipodLcd === "booting") {
      drawIpodBoot(ipodBootT);
      return;
    }
    if (ipodLcd === "shutting") {
      drawIpodShut(ipodShutT);
      return;
    }
    drawScreenContent();
  }

  let actx: AudioContext | null = null;
  function ensureAudio() {
    actx =
      actx ||
      new (window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    if (actx.state === "suspended") void actx.resume();
    return actx;
  }

  function tick() {
    try {
      const ctx = ensureAudio();
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      o.frequency.value = 1800;
      gn.gain.value = 0.035;
      o.connect(gn);
      gn.connect(ctx.destination);
      o.start();
      gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);
      o.stop(ctx.currentTime + 0.035);
    } catch {
      /* audio optional */
    }
  }

  /** Apple lock / phone-close style click — synthesized (no copyrighted asset). */
  function playPhoneCloseSound() {
    try {
      const ctx = ensureAudio();
      const t0 = ctx.currentTime;

      const noiseLen = Math.floor(ctx.sampleRate * 0.045);
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        noiseData[i] =
          (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.14));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 2400;
      noiseFilter.Q.value = 1.1;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.09, t0);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + 0.05);

      const tone = (
        freq: number,
        start: number,
        dur: number,
        vol: number,
      ) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(freq, t0 + start);
        o.frequency.exponentialRampToValueAtTime(
          freq * 0.7,
          t0 + start + dur,
        );
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0 + start);
        o.stop(t0 + start + dur + 0.02);
      };
      tone(1480, 0.008, 0.07, 0.05);
      tone(1020, 0.052, 0.095, 0.04);
    } catch {
      /* audio optional */
    }
  }

  const canProject = (p: Project) =>
    /^https?:/.test(p.url) && !/^https?:\/\/wa\.me\//i.test(p.url);

  /** Locked while projecting so iOS URL-bar resize can't reflow the iframe mid-scroll. */
  let frozenViewAspect: number | null = null;
  let lastLayoutW =
    window.innerWidth > 0 ? window.innerWidth : 1280;

  function startProjection() {
    const p = PROJECTS[openIdx];
    if (!canProject(p)) return;
    if (iframe.src !== p.url) iframe.src = p.url;
    projecting = true;
    const h = Math.max(1, window.innerHeight);
    const w = Math.max(1, window.innerWidth);
    frozenViewAspect = w / h;
    lastLayoutW = w;
    iframeFade = 1;
    iframeFadeTarget = 1;
    pendingIframeUrl = null;
    hint.innerHTML =
      "&larr; &rarr; switch project &nbsp;·&nbsp; esc to stop";
    drawScreen();
  }

  function stopProjection() {
    projecting = false;
    frozenViewAspect = null;
    pendingIframeUrl = null;
    iframeFade = 1;
    iframeFadeTarget = 1;
    hint.innerHTML =
      "spin the wheel &nbsp;·&nbsp; center to select &nbsp;·&nbsp; menu to go back";
    drawScreen();
    // Re-sync framing now that the iframe is gone
    requestAnimationFrame(() => onResize());
  }

  function move(dir: number) {
    if (view === "menu") {
      sel = (sel + dir + PROJECTS.length) % PROJECTS.length;
    } else {
      openIdx = (openIdx + dir + PROJECTS.length) % PROJECTS.length;
      if (projecting) {
        if (canProject(PROJECTS[openIdx])) {
          queueIframeSwap(PROJECTS[openIdx].url);
        } else stopProjection();
      }
    }
    tick();
    drawScreen();
  }

  function centerPress() {
    if (view === "menu") {
      openIdx = sel;
      view = "project";
      startProjection();
    }
    tick();
    drawScreen();
    pushButton();
  }

  function menuPress() {
    if (view === "project") {
      view = "menu";
      sel = openIdx;
      if (projecting) stopProjection();
    }
    tick();
    drawScreen();
  }

  function playPress() {
    tick();
    const p = PROJECTS[view === "project" ? openIdx : sel];
    if (p.url) window.open(p.url, "_blank");
  }

  const pivot = new THREE.Group();
  pivot.position.set(0, CENTER_Y + HOVER, 0);
  scene.add(pivot);
  const group = new THREE.Group();
  group.position.set(0, -CENTER_Y, 0);
  pivot.add(group);

  const bodyBuild = buildIpodBodyGroup(group, DEFAULT_IPOD_BODY_PARAMS);
  let wheelMesh = bodyBuild.wheelMesh;
  let buttonMesh = bodyBuild.buttonMesh;
  let buttonBaseZ = bodyBuild.buttonBaseZ;
  const wheelParts = bodyBuild.wheelParts;

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.w, SCREEN.h),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
  );
  plane.position.set(SCREEN.cx, SCREEN.cy, SCREEN.z);
  group.add(plane);

  drawScreen();
  if (loading) {
    loading.classList.add("hidden");
    window.setTimeout(() => loading.remove(), 500);
  }
  if (transitionMode) {
    hint.style.opacity = "0";
  }

  function pushButton() {
    if (!buttonMesh) return;
    const mat = buttonMesh.material as THREE.MeshStandardMaterial;
    const baseColor = (mat.userData.baseColor as number) ?? 0xedeef1;
    mat.color.setHex(0xe5e7eb);
    buttonMesh.position.z = buttonBaseZ - 0.003;
    window.setTimeout(() => {
      if (buttonMesh) {
        buttonMesh.position.z = buttonBaseZ;
        mat.color.setHex(baseColor);
      }
    }, 110);
  }

  let transit: {
    t0: number;
    dur: number;
    p0: THREE.Vector3;
    t0v: THREE.Vector3;
  } | null = null;

  let stepBackPull: {
    t0: number;
    dur: number;
    p0: THREE.Vector3;
    tgt0: THREE.Vector3;
  } | null = null;

  function approach() {
    if (stepBackPull) return;
    transit = {
      t0: performance.now(),
      dur: APPROACH_DUR,
      p0: camera.position.clone(),
      t0v: lastLook.clone(),
    };
    mode = "transit";
    ipodLcd = "booting";
    ipodBootStart = performance.now();
    ipodBootT = 0;
    drawScreen();
    hint.style.opacity = "0";
    stepBack.style.display = "none";
  }

  function arriveNear() {
    mode = "near";
    camera.position.copy(NEAR.pos);
    camera.lookAt(NEAR.tgt);
    if (ipodLcd === "booting") {
      ipodLcd = "on";
      drawScreen();
    }
    hint.innerHTML =
      "spin the wheel &nbsp;·&nbsp; center to select &nbsp;·&nbsp; menu to go back";
    hint.style.opacity = "1";
    stepBack.style.display = "block";
  }

  function startStepBack() {
    if (outroActive || stepBackPull) return;
    if (mode !== "near" && mode !== "transit") return;
    if (projecting) {
      if (view === "project") {
        view = "menu";
        sel = openIdx;
      }
      stopProjection();
    }
    transit = null;
    stepBack.style.display = "none";
    hint.style.opacity = "0";
    playPhoneCloseSound();
    ipodLcd = "shutting";
    ipodShutStart = performance.now();
    ipodShutT = 0;
    drawScreen();
    stepBackPull = {
      t0: performance.now(),
      dur: OUTRO_PULLBACK_MS,
      p0: camera.position.clone(),
      tgt0: lastLook.clone(),
    };
  }

  const easeInOut = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();

  function pickIpod(e: PointerEvent) {
    ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(group.children, true)[0] || null;
  }

  function pick(e: PointerEvent) {
    ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const targets = [...wheelParts, buttonMesh].filter(Boolean) as THREE.Object3D[];
    return ray.intersectObjects(targets, false)[0] || null;
  }

  function wheelAngle(hit: THREE.Intersection) {
    const p = group.worldToLocal(hit.point.clone());
    return Math.atan2(
      p.y - DEFAULT_IPOD_BODY_PARAMS.wheelY,
      p.x - DEFAULT_IPOD_BODY_PARAMS.wheelX,
    );
  }

  let scrub: { lastAngle: number; total: number; acc: number } | null = null;
  let lastInteract = performance.now();

  const onPointerMove = (e: PointerEvent) => {
    if (mode !== "near") {
      document.body.style.cursor =
        mode === "far" && pickIpod(e) ? "pointer" : "default";
      return;
    }
    if (scrub && wheelMesh) {
      const hit = pick(e);
      if (hit && wheelParts.includes(hit.object)) {
        let a = wheelAngle(hit);
        let d = a - scrub.lastAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        scrub.total += d;
        scrub.acc += d;
        const STEP = THREE.MathUtils.degToRad(16);
        while (scrub.acc <= -STEP) {
          move(+1);
          scrub.acc += STEP;
        }
        while (scrub.acc >= STEP) {
          move(-1);
          scrub.acc -= STEP;
        }
        scrub.lastAngle = a;
      }
      return;
    }
    document.body.style.cursor = pick(e) ? "pointer" : "default";
  };

  const onPointerDown = (e: PointerEvent) => {
    lastInteract = performance.now();
    if (mode === "far") {
      if (pickIpod(e)) approach();
      return;
    }
    if (mode !== "near") return;
    const hit = pick(e);
    if (hit && wheelParts.includes(hit.object)) {
      scrub = { lastAngle: wheelAngle(hit), total: 0, acc: 0 };
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    lastInteract = performance.now();
    if (mode !== "near") return;
    if (scrub) {
      const dragged = Math.abs(scrub.total) > THREE.MathUtils.degToRad(9);
      if (!dragged) {
        const hit = pick(e);
        if (hit && wheelParts.includes(hit.object)) {
          const a = THREE.MathUtils.radToDeg(wheelAngle(hit));
          if (a > 45 && a < 135) menuPress();
          else if (a < -45 && a > -135) playPress();
          else if (a >= -45 && a <= 45) move(+1);
          else move(-1);
        }
      }
      scrub = null;
      return;
    }
    const hit = pick(e);
    if (hit && hit.object === buttonMesh) centerPress();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    lastInteract = performance.now();
    if (mode === "far" && e.key === "Enter") {
      approach();
      return;
    }
    if (mode !== "near") return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") move(+1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(-1);
    else if (e.key === "Enter") centerPress();
    else if (e.key === "Escape" || e.key === "Backspace") menuPress();
  };

  const onCloseProj = () => menuPress();
  const onPrevProj = () => {
    lastInteract = performance.now();
    move(-1);
  };
  const onNextProj = () => {
    lastInteract = performance.now();
    move(+1);
  };
  const onStepBack = () => {
    lastInteract = performance.now();
    startStepBack();
  };

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  closeProj.addEventListener("click", onCloseProj);
  prevProj.addEventListener("click", onPrevProj);
  nextProj.addEventListener("click", onNextProj);
  stepBack.addEventListener("click", onStepBack);

  const clock = new THREE.Clock();
  let cin = 0;
  let projOn = 0;
  let rafId = 0;
  let intro = transitionMode ? 0 : 1;
  let firstFrameCalled = false;
  let introDoneFired = false;
  let outroActive = false;
  let outroResolve: (() => void) | null = null;
  let outroPhase: "retract" | "pullback" | "fly" | null = null;
  let outroPull:
    | { t0: number; dur: number; p0: THREE.Vector3; tgt0: THREE.Vector3 }
    | null = null;
  let outroSafety: ReturnType<typeof setTimeout> | null = null;
  const lastLook = FAR.tgt.clone();

  const finishOutro = () => {
    outroActive = false;
    outroPhase = null;
    outroPull = null;
    if (outroSafety !== null) {
      clearTimeout(outroSafety);
      outroSafety = null;
    }
    const done = outroResolve;
    outroResolve = null;
    done?.();
  };
  const INTRO_DROP = 5.75;
  const INTRO_ROT_Y = Math.PI;
  const INTRO_ROT_X = -0.72;
  const INTRO_DURATION = 1.85;
  const OUTRO_SAFETY_MS =
    OUTRO_PULLBACK_MS + INTRO_DURATION * 1000 + 5000;

  // Scale/float the projector with the same intro/outro motion as the iPod
  if (transitionMode) {
    projAnchor.scale.setScalar(0.72);
    projBox.visible = false;
    projAnchor.position.copy(projHomePos);
    projAnchor.position.y += INTRO_DROP;
    _projSpinEuler.set(INTRO_ROT_X, INTRO_ROT_Y, 0.12);
    _projSpinQuat.setFromEuler(_projSpinEuler);
    projAnchor.quaternion.copy(_projSpinQuat).multiply(projHomeQuat);
    pivot.scale.setScalar(0.84);
    pivot.rotation.y = INTRO_ROT_Y;
    pivot.rotation.x = INTRO_ROT_X;
  }

  const animate = () => {
    rafId = requestAnimationFrame(animate);
    const delta = Math.min(0.05, clock.getDelta());
    const t = clock.getElapsedTime();

    if (outroActive && outroPhase === "fly") {
      intro = Math.max(0, intro - delta / INTRO_DURATION);
    } else if (!outroActive && transitionMode && intro < 1) {
      intro = Math.min(1, intro + delta / INTRO_DURATION);
    }
    const introE = easeInOut(intro);
    const spinE = easeInOut(Math.min(1, intro / 0.82));

    if (transitionMode && (intro < 1 || (outroActive && outroPhase === "fly"))) {
      introGlareT = introE;
      if (ipodLcd === "off") drawScreen();
    } else {
      introGlareT = 0;
    }

    if (transitionMode) {
      const sharedScale = 0.84 + introE * 0.16;
      // Projector keeps a slightly deeper start scale so it reads as heavier gear
      projAnchor.scale.setScalar(0.72 + introE * 0.28);
      projBox.visible = introE > 0.28;
      pivot.scale.setScalar(sharedScale);
    } else {
      pivot.scale.setScalar(1);
      projAnchor.scale.setScalar(1);
    }

    const screenDown = screenRoll >= SCREEN_DOWN_THRESHOLD;
    const screenUp = screenRoll <= SCREEN_UP_THRESHOLD;
    const phoneReady = cin >= CIN_READY_THRESHOLD;

    const projOnTarget =
      projecting && phoneReady && screenDown ? 1 : 0;
    const projLerp =
      outroActive && outroPhase === "retract" ? OUTRO_PROJ_LERP : PROJECTOR_ON_LERP;
    projOn += (projOnTarget - projOn) * projLerp;
    if (projOnTarget <= 0 && projOn < 0.01) projOn = 0;

    if (projecting) {
      cin += (1 - cin) * 0.035;
      if (cin > 0.985) cin = 1;
    } else if (screenUp) {
      const cinLerp =
        outroActive && outroPhase === "retract" ? OUTRO_CIN_LERP : 0.035;
      cin += (0 - cin) * cinLerp;
      if (cin < 0.015) cin = 0;
    }

    let rollTarget = 0;
    if (projecting) {
      rollTarget = phoneReady ? 1 : 0;
    } else if (projOn > PROJECTOR_OFF_THRESHOLD) {
      rollTarget = 1;
    }
    const rollLerp =
      outroActive && outroPhase === "retract" ? OUTRO_ROLL_LERP : SCREEN_ROLL_LERP;
    updateScreenRoll(rollTarget, rollLerp);

    if (ipodLcd === "booting") {
      ipodBootT = Math.min(
        1,
        (performance.now() - ipodBootStart) / APPROACH_DUR,
      );
      drawScreen();
      if (ipodBootT >= 1) {
        ipodLcd = "on";
        drawScreen();
      }
    } else if (ipodLcd === "shutting") {
      ipodShutT = Math.min(
        1,
        (performance.now() - ipodShutStart) / IPOD_SHUT_MS,
      );
      drawScreen();
      if (ipodShutT >= 1) {
        ipodLcd = "off";
        drawScreen();
      }
    }

    applyProjectionVisuals(cin, screenRoll, projOn);

    if (outroActive && outroPhase === "retract") {
      const screenRetracted = screenRoll <= SCREEN_RETRACTED_THRESHOLD;
      const retracted =
        !projecting &&
        projOn < 0.02 &&
        screenRetracted &&
        cin < 0.02;
      if (retracted) {
        if (mode === "near" || mode === "transit") {
          transit = null;
          outroPhase = "pullback";
          outroPull = {
            t0: performance.now(),
            dur: OUTRO_PULLBACK_MS,
            p0: camera.position.clone(),
            tgt0: lastLook.clone(),
          };
        } else if (transitionMode) {
          outroPhase = "fly";
        } else {
          finishOutro();
        }
      }
    }

    const panning =
      (projecting && cin > 0.015 && cin < 0.985) ||
      (!projecting && cin > 0.015 && cin < 0.985 && screenUp);
    pivot.position.x = CIN_OFF.x * cin;
    const introLift = transitionMode ? (1 - introE) * INTRO_DROP : 0;
    const bob = panning ? 0 : Math.sin(t * 1.1) * 0.022;
    pivot.position.y =
      CENTER_Y + HOVER + CIN_OFF.y * cin + bob + introLift;

    // Projector shares the iPod float in/out path (lift + spin + bob)
    projAnchor.position.copy(projHomePos);
    projAnchor.position.y += bob + introLift;

    const introAnimating =
      transitionMode && (intro < 1 || outroActive);
    if (introAnimating) {
      const spin = 1 - spinE;
      pivot.rotation.y = INTRO_ROT_Y * spin;
      pivot.rotation.x = INTRO_ROT_X * spin;
      pivot.rotation.z = 0.12 * spin;
      if (spin > 0.001) {
        _projSpinEuler.set(
          INTRO_ROT_X * spin,
          INTRO_ROT_Y * spin,
          0.12 * spin,
        );
        _projSpinQuat.setFromEuler(_projSpinEuler);
        projAnchor.quaternion.copy(_projSpinQuat).multiply(projHomeQuat);
      } else {
        projAnchor.quaternion.copy(projHomeQuat);
      }
    } else if (panning) {
      pivot.rotation.x += (0 - pivot.rotation.x) * 0.05;
      pivot.rotation.y += (0 - pivot.rotation.y) * 0.05;
      pivot.rotation.z += (0 - pivot.rotation.z) * 0.05;
      projAnchor.quaternion.copy(projHomeQuat);
    } else {
      pivot.rotation.x += (0 - pivot.rotation.x) * 0.04;
      const idle = performance.now() - lastInteract > 3000;
      pivot.rotation.y +=
        ((idle ? Math.sin(t * 0.35) * 0.3 : 0) - pivot.rotation.y) * 0.02;
      pivot.rotation.z +=
        ((idle ? Math.sin(t * 0.28 + 1.2) * 0.06 : 0) - pivot.rotation.z) * 0.02;
      // Keep projector aimed at the screen while it shares the bob
      projAnchor.quaternion.copy(projHomeQuat);
    }

    if (outroActive && outroPhase === "pullback" && outroPull) {
      const k = Math.min(
        1,
        (performance.now() - outroPull.t0) / outroPull.dur,
      );
      const ev = easeInOut(k);
      camera.position.lerpVectors(outroPull.p0, FAR.pos, ev);
      lastLook.lerpVectors(outroPull.tgt0, FAR.tgt, ev);
      camera.lookAt(lastLook);
      if (k >= 1) {
        outroPull = null;
        mode = "far";
        if (transitionMode) outroPhase = "fly";
        else finishOutro();
      }
    } else if (stepBackPull) {
      const k = Math.min(
        1,
        (performance.now() - stepBackPull.t0) / stepBackPull.dur,
      );
      const ev = easeInOut(k);
      camera.position.lerpVectors(stepBackPull.p0, FAR.pos, ev);
      lastLook.lerpVectors(stepBackPull.tgt0, FAR.tgt, ev);
      camera.lookAt(lastLook);
      if (k >= 1) {
        stepBackPull = null;
        mode = "far";
        camera.position.copy(FAR.pos);
        lastLook.copy(FAR.tgt);
        camera.lookAt(lastLook);
        if (ipodLcd === "shutting" || ipodLcd === "on" || ipodLcd === "booting") {
          ipodLcd = "off";
          ipodShutT = 1;
        }
        view = "menu";
        drawScreen();
        hint.innerHTML = "Click the iPod to explore";
        hint.style.opacity = "1";
        stepBack.style.display = "none";
      }
    } else if (outroActive && outroPhase === "fly") {
      mode = "far";
      camera.position.lerp(FAR.pos, 0.1);
      lastLook.copy(FAR.tgt);
      camera.lookAt(lastLook);
    } else if (mode === "transit" && transit) {
      const k = Math.min(1, (performance.now() - transit.t0) / transit.dur);
      const ev = easeInOut(k);
      camera.position.lerpVectors(transit.p0, NEAR.pos, ev);
      lastLook.lerpVectors(transit.t0v, NEAR.tgt, ev);
      camera.lookAt(lastLook);
      if (k >= 1) {
        transit = null;
        arriveNear();
      }
    } else if (mode === "far") {
      lastLook.copy(FAR.tgt);
      camera.lookAt(lastLook);
    } else if (mode === "near") {
      camera.position.lerpVectors(NEAR.pos, CIN.pos, cin);
      lastLook.lerpVectors(NEAR.tgt, CIN.tgt, cin);
      camera.lookAt(lastLook);
    }

    renderer.render(scene, camera);
    cssRenderer.render(sceneCSS, camera);

    if (!firstFrameCalled) {
      firstFrameCalled = true;
      options.onFirstFrame?.();
    }
    if (transitionMode && intro >= 1 && !introDoneFired && !outroActive) {
      introDoneFired = true;
      hint.style.opacity = "1";
      options.onIntroComplete?.();
    }

    if (outroActive && outroPhase === "fly" && intro <= 0) {
      finishOutro();
    }
  };
  animate();

  const onResize = (e?: Event) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Hidden or collapsing windows report 0x0; keep the last good state.
    if (w <= 0 || h <= 0) return;

    renderer.setSize(w, h);
    cssRenderer.setSize(w, h);

    const orientationEvent = e?.type === "orientationchange";
    const widthChanged = Math.abs(w - lastLayoutW) > 8;
    // Height-only changes are almost always mobile browser chrome show/hide.
    const freezeProjectionLayout =
      projecting && frozenViewAspect !== null && !orientationEvent && !widthChanged;

    if (freezeProjectionLayout) {
      camera.aspect = frozenViewAspect;
      camera.updateProjectionMatrix();
      return;
    }

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    lastLayoutW = w;
    if (projecting) {
      frozenViewAspect = w / h;
    }

    const next = getShotLayout(w, h);
    if (layoutNeedsUpdate(layout, next)) {
      applyScreenLayout(next);
    }
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  const dispose = () => {
    cancelAnimationFrame(rafId);
    if (outroSafety !== null) {
      clearTimeout(outroSafety);
      outroSafety = null;
    }
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    closeProj.removeEventListener("click", onCloseProj);
    prevProj.removeEventListener("click", onPrevProj);
    nextProj.removeEventListener("click", onNextProj);
    stepBack.removeEventListener("click", onStepBack);
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    renderer.dispose();
    pmrem.dispose();
    if (app.contains(renderer.domElement)) {
      app.removeChild(renderer.domElement);
    }
    if (css3d.contains(cssRenderer.domElement)) {
      css3d.removeChild(cssRenderer.domElement);
    }
  };

  const startOutro = () =>
    new Promise<void>((resolve) => {
      if (outroActive) {
        const prev = outroResolve;
        outroResolve = () => {
          prev?.();
          resolve();
        };
        return;
      }
      hint.style.opacity = "0";
      closeProj.style.display = "none";
      prevProj.style.display = "none";
      nextProj.style.display = "none";
      stepBack.style.display = "none";
      stepBackPull = null;
      if (projecting) stopProjection();
      outroResolve = resolve;
      outroActive = true;
      outroPhase = "retract";
      // Guarantee the exit always completes even if frames stall
      // (e.g. a throttled/backgrounded tab pausing requestAnimationFrame).
      outroSafety = setTimeout(finishOutro, OUTRO_SAFETY_MS);
    });

  return { dispose, startOutro };
}
