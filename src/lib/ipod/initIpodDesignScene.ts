import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  buildIpodBodyGroup,
  DEFAULT_IPOD_BODY_PARAMS,
  getScreenLayout,
  type IpodBodyParams,
} from "@/lib/ipod/ipodBody";

export type IpodDesignSceneHandle = {
  dispose: () => void;
  rebuild: (params: IpodBodyParams) => void;
};

export function initIpodDesignScene(
  container: HTMLElement,
  initialParams: IpodBodyParams = DEFAULT_IPOD_BODY_PARAMS,
): IpodDesignSceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setClearColor(0x101014, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101014);
  scene.fog = new THREE.Fog(0x101014, 6, 14);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const CreateRoomEnvironment = RoomEnvironment as unknown as new (
    renderer?: THREE.WebGLRenderer,
  ) => THREE.Scene;
  scene.environment = pmrem.fromScene(
    new CreateRoomEnvironment(renderer),
    0.04,
  ).texture;

  const camera = new THREE.PerspectiveCamera(
    38,
    container.clientWidth / container.clientHeight,
    0.01,
    30,
  );
  camera.position.set(0.35, 1.35, 1.55);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 1.01, 0);
  controls.update();

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
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

  const spot = new THREE.SpotLight(0xffffff, 220, 20, 0.42, 0.8, 2);
  spot.position.set(0.5, 6.2, 1.4);
  spot.target.position.set(0, 1.01, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.radius = 12;
  scene.add(spot, spot.target);
  scene.add(new THREE.HemisphereLight(0x8a8a94, 0x2a2a30, 0.35));

  const wheelFill = new THREE.PointLight(0xffffff, 6, 2.8);
  wheelFill.position.set(0, 0.68, 0.25);
  scene.add(wheelFill);

  const CENTER_Y = initialParams.bodyH / 2;
  const pivot = new THREE.Group();
  pivot.position.set(0, CENTER_Y + 0.1, 0);
  scene.add(pivot);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.set(0, -CENTER_Y, 0);
  pivot.add(bodyGroup);

  let bodyBuild = buildIpodBodyGroup(bodyGroup, initialParams);
  let screenMesh: THREE.Mesh | null = null;

  function syncPivot(params: IpodBodyParams) {
    const centerY = params.bodyH / 2;
    pivot.position.y = centerY + 0.1;
    bodyGroup.position.y = -centerY;
    controls.target.set(0, centerY + 0.1, 0);
  }

  function addScreen(params: IpodBodyParams) {
    const screen = getScreenLayout(params);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc9d2bd,
      transparent: true,
      opacity: 0.92,
    });
    screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screen.w, screen.h),
      mat,
    );
    screenMesh.position.set(screen.cx, screen.cy, screen.z);
    bodyGroup.add(screenMesh);
  }

  addScreen(initialParams);

  let raf = 0;
  function animate() {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  function rebuild(params: IpodBodyParams) {
    bodyBuild.dispose();
    if (screenMesh) {
      bodyGroup.remove(screenMesh);
      screenMesh.geometry.dispose();
      (screenMesh.material as THREE.Material).dispose();
      screenMesh = null;
    }
    syncPivot(params);
    bodyBuild = buildIpodBodyGroup(bodyGroup, params);
    addScreen(params);
  }

  return {
    rebuild,
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      bodyBuild.dispose();
      if (screenMesh) {
        screenMesh.geometry.dispose();
        (screenMesh.material as THREE.Material).dispose();
      }
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
