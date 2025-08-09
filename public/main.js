// Dynamic dependency loader with CDN fallbacks
let THREE, PointerLockControls, Stats, GUI, Sky, Octree, Capsule;
async function loadDeps() {
  async function tryImport(candidates) {
    let lastErr;
    for (const url of candidates) {
      try { return await import(url); } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  THREE = (await tryImport([
    'https://unpkg.com/three@0.164.1/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js',
  ])).default ? (await tryImport([
    'https://unpkg.com/three@0.164.1/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js',
  ])).default : await tryImport([
    'https://unpkg.com/three@0.164.1/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js',
  ]);
  // normalize THREE when import returns namespace
  if (!THREE.Scene) { THREE = (await import('https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js')).default || THREE; }

  PointerLockControls = (await tryImport([
    'https://unpkg.com/three@0.164.1/examples/jsm/controls/PointerLockControls.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/PointerLockControls.js',
  ])).PointerLockControls;

  Stats = (await tryImport([
    'https://unpkg.com/three@0.164.1/examples/jsm/libs/stats.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/libs/stats.module.js',
  ])).default;

  // lil-gui: prefer standalone
  const guiMod = await tryImport([
    'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm',
    'https://unpkg.com/three@0.164.1/examples/jsm/libs/lil-gui.module.min.js',
  ]);
  GUI = guiMod.GUI || guiMod.default || guiMod;

  Sky = (await tryImport([
    'https://unpkg.com/three@0.164.1/examples/jsm/objects/Sky.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/objects/Sky.js',
  ])).Sky;

  Octree = (await tryImport([
    'https://unpkg.com/three@0.164.1/examples/jsm/math/Octree.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/math/Octree.js',
  ])).Octree;

  Capsule = (await tryImport([
    'https://unpkg.com/three@0.164.1/examples/jsm/math/Capsule.js',
    'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/math/Capsule.js',
  ])).Capsule;
}

await loadDeps();

// ------------------------------------------------------------
// Global state
// ------------------------------------------------------------
let renderer, scene, camera, stats, gui;
let controls;
let worldOctree;
let playerCollider;
let playerVelocity = new THREE.Vector3();
let playerOnFloor = false;
let canJump = true;
let sprint = false;
let minimapEnabled = true;
let hudEnabled = true;
let guiEnabled = true;

const params = {
  dayNightSpeed: 0.04,
  sunElevation: 0.4, // 0..1
  sunAzimuth: 0.15, // 0..1
  timeScale: 1.0,
  trafficDensity: 1.0,
  pedestrianDensity: 0.6,
  toggleShadows: true,
  resetPlayer: resetPlayerPosition,
};

// City generation params
const city = {
  seed: 1337,
  numBlocksPerSide: 8,
  blockSize: 60,
  roadWidth: 10,
  sidewalkWidth: 4,
  buildingMinFloors: 3,
  buildingMaxFloors: 18,
  buildingGap: 2,
  streetLightSpacing: 18,
  carSpawnRate: 0.7, // scaled by trafficDensity
  pedestrianSpawnRate: 0.4, // scaled by pedestrianDensity
};

// Runtime containers
const vehicles = [];
const pedestrians = [];
const intersections = []; // traffic signal controllers
const roadGraph = { nodes: [], edges: [] };

// Reusable vectors
const tempVector = new THREE.Vector3();
const tempVector2 = new THREE.Vector3();
const tempBox3 = new THREE.Box3();

// Timekeeping
let prevTime = performance.now() / 1000;
let simTime = 0;

// Cameras
let minimapCamera;

// Sky / lighting
let sky, sun;
let ambientLight, dirLight;

// UI elements
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('startButton');

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
init();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // Minimap overlay (border only; rendering uses viewport)
  const minimapOverlay = document.createElement('div');
  minimapOverlay.id = 'minimapOverlay';
  document.body.appendChild(minimapOverlay);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101216);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

  // Controls with pointer lock
  controls = new PointerLockControls(camera, document.body);
  controls.pointerSpeed = 0.3;

  startButton.addEventListener('click', () => {
    try {
      controls.lock();
    } catch (e) {
      console.warn('PointerLock lock failed, starting anyway', e);
    }
    overlay.classList.add('hidden');
  });

  controls.addEventListener('lock', () => {
    overlay.classList.add('hidden');
  });
  controls.addEventListener('unlock', () => {
    overlay.classList.remove('hidden');
  });

  // Stats
  stats = new Stats();
  stats.dom.id = 'stats';
  document.body.appendChild(stats.dom);

  // GUI
  gui = new GUI({ title: 'City Settings' });
  gui.add(params, 'dayNightSpeed', 0.0, 0.5, 0.01);
  gui.add(params, 'timeScale', 0.1, 2.0, 0.05);
  gui.add(params, 'trafficDensity', 0.0, 2.0, 0.05);
  gui.add(params, 'pedestrianDensity', 0.0, 2.0, 0.05);
  gui.add(params, 'toggleShadows').onChange((v) => (renderer.shadowMap.enabled = v));
  gui.add(params, 'resetPlayer');
  gui.hide(); // toggle with G

  setupLightsAndSky();
  setupWorldAndCity();
  setupPlayer();
  setupMinimap();
  setupInput();

  window.addEventListener('resize', onWindowResize);

  // Start loop
  animate();
}

function setupLightsAndSky() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.24);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 2.6);
  dirLight.position.set(100, 200, 80);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 1200;
  dirLight.shadow.camera.left = -500;
  dirLight.shadow.camera.right = 500;
  dirLight.shadow.camera.top = 500;
  dirLight.shadow.camera.bottom = -500;
  scene.add(dirLight);

  // Sky
  sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  sun = new THREE.Vector3();

  updateSunUniforms(0.25, 0.15); // initial
}

function updateSunUniforms(elevation01, azimuth01) {
  // elevation 0..1 => [0, 90] deg; azimuth 0..1 => [0, 360]
  const phi = THREE.MathUtils.degToRad(90 - elevation01 * 90);
  const theta = THREE.MathUtils.degToRad(azimuth01 * 360);

  sun.setFromSphericalCoords(1, phi, theta);

  sky.material.uniforms['sunPosition'].value.copy(sun);

  dirLight.position.copy(sun).multiplyScalar(400);
  dirLight.intensity = THREE.MathUtils.lerp(0.3, 3.0, Math.max(0, Math.sin(elevation01 * Math.PI)));
  ambientLight.intensity = THREE.MathUtils.lerp(0.1, 0.35, Math.max(0, Math.sin(elevation01 * Math.PI)));

  // Slight warm/cool shift across day
  const warm = new THREE.Color(0xfff1d6);
  const cool = new THREE.Color(0xaecbff);
  const dayMix = Math.max(0, Math.sin(elevation01 * Math.PI));
  dirLight.color.copy(warm).lerp(cool, 1 - dayMix);
}

function setupWorldAndCity() {
  worldOctree = new Octree();

  // Ground plane (base)
  const groundGeo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 1.0, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'Ground';
  ground.userData.solid = true;
  scene.add(ground);

  // City grid
  const { nodes, edges } = buildCityGrid();
  roadGraph.nodes = nodes;
  roadGraph.edges = edges;

  // Add roads meshes and sidewalks and buildings
  const cityGroup = new THREE.Group();
  cityGroup.name = 'City';
  scene.add(cityGroup);

  buildRoadMeshes(cityGroup, nodes, edges);
  buildSidewalks(cityGroup, nodes, edges);
  buildBuildings(cityGroup);
  addStreetLights(cityGroup);

  // Build collision octree from solid obstacles (buildings, street light poles)
  const collisionGroup = new THREE.Group();
  collisionGroup.name = 'CollisionGroup';

  cityGroup.traverse((obj) => {
    if (obj.isMesh) {
      if (obj.userData.solid) {
        collisionGroup.add(obj.clone());
      }
    }
  });
  // include ground in collisions too
  const groundClone = scene.getObjectByName('Ground').clone();
  collisionGroup.add(groundClone);

  worldOctree.fromGraphNode(collisionGroup);

  // Spawn some vehicles and pedestrians
  spawnInitialTraffic();
  spawnInitialPedestrians();
}

function buildCityGrid() {
  const nodes = [];
  const edges = [];
  const N = city.numBlocksPerSide;
  const B = city.blockSize;
  const RW = city.roadWidth;
  const half = ((N * (B + RW)) + RW) / 2; // from -half..+half

  // Generate grid intersections
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const x = -half + ix * (B + RW);
      const z = -half + iz * (B + RW);
      nodes.push({ id: nodes.length, x, z });
    }
  }

  const nodeIndex = (ix, iz) => iz * (N + 1) + ix;

  // Edges horizontally and vertically
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = nodeIndex(ix, iz);
      const b = nodeIndex(ix + 1, iz);
      edges.push({ a, b, dir: 'x' });
    }
  }
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const a = nodeIndex(ix, iz);
      const b = nodeIndex(ix, iz + 1);
      edges.push({ a, b, dir: 'z' });
    }
  }

  // Create traffic signal controllers per intersection
  intersections.length = 0;
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const id = nodeIndex(ix, iz);
      intersections.push({ id, phase: Math.random() * 8, cycle: 12 + Math.random() * 8 }); // seconds
    }
  }

  return { nodes, edges };
}

function buildRoadMeshes(group, nodes, edges) {
  const RW = city.roadWidth;
  const matRoad = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.95, metalness: 0.05 });
  const matLane = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Build quads for each edge
  const roadLayer = new THREE.Group();
  roadLayer.name = 'Roads';
  group.add(roadLayer);

  edges.forEach((e) => {
    const a = nodes[e.a];
    const b = nodes[e.b];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);

    const geo = new THREE.PlaneGeometry(len, RW, 1, 1);
    const mesh = new THREE.Mesh(geo, matRoad);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((a.x + b.x) / 2, 0.001, (a.z + b.z) / 2);

    const angle = Math.atan2(dz, dx);
    mesh.rotation.z = 0;
    mesh.rotation.y = 0;
    mesh.rotateY(angle);
    mesh.receiveShadow = true;
    roadLayer.add(mesh);

    // Center lane marker
    const laneGeo = new THREE.PlaneGeometry(len, 0.2, 1, 1);
    const laneMesh = new THREE.Mesh(laneGeo, matLane);
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.position.copy(mesh.position);
    laneMesh.rotateY(angle);
    laneMesh.position.y = 0.002;
    laneMesh.renderOrder = 1;
    roadLayer.add(laneMesh);
  });

  // Intersections squares
  const matIntersection = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.95, metalness: 0.05 });
  nodes.forEach((n) => {
    const geo = new THREE.PlaneGeometry(city.roadWidth + 0.1, city.roadWidth + 0.1);
    const mesh = new THREE.Mesh(geo, matIntersection);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(n.x, 0.003, n.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}

function buildSidewalks(group, nodes, edges) {
  const RW = city.roadWidth;
  const SW = city.sidewalkWidth;

  // Build sidewalks around each block as frames
  const matSidewalk = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 1.0, metalness: 0.0 });

  const N = city.numBlocksPerSide;
  const B = city.blockSize;
  const half = ((N * (B + RW)) + RW) / 2;

  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const x0 = -half + ix * (B + RW) + RW / 2;
      const z0 = -half + iz * (B + RW) + RW / 2;
      const cx = x0 + B / 2;
      const cz = z0 + B / 2;

      // Rectangle frame: outer dims B+2*SW, thickness SW
      // Top and bottom slabs
      const topGeo = new THREE.BoxGeometry(B + 2 * SW, 0.3, SW);
      const botGeo = new THREE.BoxGeometry(B + 2 * SW, 0.3, SW);
      const leftGeo = new THREE.BoxGeometry(SW, 0.3, B + 2 * SW);
      const rightGeo = new THREE.BoxGeometry(SW, 0.3, B + 2 * SW);

      const top = new THREE.Mesh(topGeo, matSidewalk);
      top.position.set(cx, 0.15, z0 - SW / 2);
      const bottom = new THREE.Mesh(botGeo, matSidewalk);
      bottom.position.set(cx, 0.15, z0 + B + SW / 2);
      const left = new THREE.Mesh(leftGeo, matSidewalk);
      left.position.set(x0 - SW / 2, 0.15, cz);
      const right = new THREE.Mesh(rightGeo, matSidewalk);
      right.position.set(x0 + B + SW / 2, 0.15, cz);

      [top, bottom, left, right].forEach((m) => {
        m.castShadow = false;
        m.receiveShadow = true;
        group.add(m);
      });
    }
  }
}

function buildBuildings(group) {
  const N = city.numBlocksPerSide;
  const B = city.blockSize;
  const RW = city.roadWidth;
  const SW = city.sidewalkWidth;
  const gap = city.buildingGap;

  const half = ((N * (B + RW)) + RW) / 2;

  const buildingMatPool = [];
  const palette = [0x607d8b, 0x546e7a, 0x455a64, 0x37474f, 0x78909c, 0x90a4ae];
  for (let c of palette) {
    buildingMatPool.push(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.2 }));
  }

  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const blockGroup = new THREE.Group();
      blockGroup.name = `Block_${ix}_${iz}`;
      group.add(blockGroup);

      const x0 = -half + ix * (B + RW) + RW / 2 + SW;
      const z0 = -half + iz * (B + RW) + RW / 2 + SW;
      const innerSize = B - 2 * SW;

      // Subdivide block into grid of building lots (3x3-ish)
      const lotsX = 3 + ((ix + iz) % 2);
      const lotsZ = 3 + ((ix * 7 + iz * 5) % 2);
      const lotW = innerSize / lotsX;
      const lotD = innerSize / lotsZ;

      for (let lz = 0; lz < lotsZ; lz++) {
        for (let lx = 0; lx < lotsX; lx++) {
          const px = x0 + lx * lotW + gap * 0.5 + Math.random() * 0.5;
          const pz = z0 + lz * lotD + gap * 0.5 + Math.random() * 0.5;
          const w = Math.max(6, lotW - gap - Math.random() * 2);
          const d = Math.max(6, lotD - gap - Math.random() * 2);
          const floors = city.buildingMinFloors + Math.floor(Math.random() * (city.buildingMaxFloors - city.buildingMinFloors + 1));
          const h = floors * (2.8 + Math.random() * 0.4);

          const geo = new THREE.BoxGeometry(w, h, d);
          const mat = buildingMatPool[(ix * 3 + iz + lx + lz) % buildingMatPool.length];
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(px + w / 2, h / 2, pz + d / 2);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.solid = true; // for collision
          blockGroup.add(mesh);

          // Simple emissive windows at night: attach an emissive child box inside
          const emissive = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.98, h * 0.98, d * 0.98),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x111111, roughness: 1, metalness: 0 })
          );
          emissive.visible = false;
          emissive.position.set(0, 0, 0);
          mesh.add(emissive);
          mesh.userData.nightGlow = emissive;
        }
      }
    }
  }
}

function addStreetLights(group) {
  const N = city.numBlocksPerSide;
  const B = city.blockSize;
  const RW = city.roadWidth;
  const SW = city.sidewalkWidth;
  const half = ((N * (B + RW)) + RW) / 2;

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.6, metalness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });

  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const cx = -half + ix * (B + RW);
      const cz = -half + iz * (B + RW);
      // place four poles at each corner outward from intersection
      const offsets = [
        new THREE.Vector3(+RW / 2 + SW / 2, 0, +RW / 2 + SW / 2),
        new THREE.Vector3(-RW / 2 - SW / 2, 0, +RW / 2 + SW / 2),
        new THREE.Vector3(+RW / 2 + SW / 2, 0, -RW / 2 - SW / 2),
        new THREE.Vector3(-RW / 2 - SW / 2, 0, -RW / 2 - SW / 2),
      ];

      for (const off of offsets) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 6, 8), poleMat);
        pole.position.set(cx + off.x, 3, cz + off.z);
        pole.castShadow = true;
        pole.receiveShadow = true;
        pole.userData.solid = true; // collide with poles

        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2), poleMat);
        arm.position.set(0, 2.4, off.z > 0 ? -1 : 1);
        pole.add(arm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), headMat);
        head.position.set(0, 0, off.z > 0 ? -1 : 1);
        arm.add(head);

        const spot = new THREE.SpotLight(0xfff5e1, 0.0, 16, Math.PI / 3, 0.4, 1.2);
        spot.position.set(0, 0, 0);
        spot.target.position.set(0, -4, off.z > 0 ? -3 : 3);
        spot.castShadow = true;
        head.add(spot);
        head.add(spot.target);

        group.add(pole);
        // store for day-night adjustments
        pole.userData.lamp = spot;
      }
    }
  }
}

function spawnInitialTraffic() {
  // Spawn cars on random edges
  const targetCarCount = Math.floor(roadGraph.edges.length * 0.15 * params.trafficDensity);
  for (let i = 0; i < targetCarCount; i++) {
    const car = createCar();
    if (car) vehicles.push(car);
  }
}

function createCar() {
  const e = roadGraph.edges[Math.floor(Math.random() * roadGraph.edges.length)];
  if (!e) return null;
  const a = roadGraph.nodes[e.a];
  const b = roadGraph.nodes[e.b];

  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));

  // Place within lane offset (two lanes per road)
  const laneOffset = (Math.random() < 0.5 ? -1 : 1) * (city.roadWidth * 0.25);

  const carGeom = new THREE.BoxGeometry(2, 1, 4);
  const carMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.6, 0.5), metalness: 0.7, roughness: 0.4 });
  const body = new THREE.Mesh(carGeom, carMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.set(a.x + right.x * laneOffset, 0.5, a.z + right.z * laneOffset);

  // Headlights
  const headlightL = new THREE.SpotLight(0xffffff, 0.0, 20, Math.PI / 6, 0.4, 1.2);
  const headlightR = headlightL.clone();
  headlightL.position.set(0.6, 0.4, -2);
  headlightR.position.set(-0.6, 0.4, -2);
  [headlightL, headlightR].forEach((s) => {
    s.castShadow = true;
    s.target.position.set(0, 0, -8);
    body.add(s);
    body.add(s.target);
  });

  scene.add(body);

  const speedMax = 10 + Math.random() * 8;

  return {
    mesh: body,
    edge: e,
    progress: 0, // 0..1 along edge
    dir,
    right,
    laneOffset,
    speed: 0,
    speedMax,
    accel: 8,
    decel: 12,
    waitTimer: 0,
  };
}

function spawnInitialPedestrians() {
  const targetCount = Math.floor(roadGraph.nodes.length * 0.2 * params.pedestrianDensity);
  for (let i = 0; i < targetCount; i++) {
    const ped = createPedestrian();
    if (ped) pedestrians.push(ped);
  }
}

function createPedestrian() {
  const node = roadGraph.nodes[Math.floor(Math.random() * roadGraph.nodes.length)];
  if (!node) return null;

  const color = new THREE.Color().setHSL(Math.random(), 0.5, 0.6);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 6, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  body.position.set(node.x + (Math.random() - 0.5) * city.sidewalkWidth * 2, 0.9, node.z + (Math.random() - 0.5) * city.sidewalkWidth * 2);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  const targetNode = pickNeighboringNode(node);
  return {
    mesh: body,
    from: node,
    to: targetNode,
    t: Math.random(),
    speed: 1.2 + Math.random() * 0.6,
    waitTimer: 0,
  };
}

function pickNeighboringNode(node) {
  const candidates = roadGraph.edges
    .filter((e) => e.a === node.id || e.b === node.id)
    .map((e) => (e.a === node.id ? e.b : e.a));
  if (candidates.length === 0) return node;
  const id = candidates[Math.floor(Math.random() * candidates.length)];
  return roadGraph.nodes[id];
}

function setupPlayer() {
  playerCollider = new Capsule(new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0, 2.6, 0), 0.35);
  resetPlayerPosition();
}

function resetPlayerPosition() {
  // Put player near city center on a sidewalk
  const center = new THREE.Vector3(0, 0, 0);
  playerCollider.start.copy(new THREE.Vector3(center.x, 1.0, center.z));
  playerCollider.end.copy(new THREE.Vector3(center.x, 2.6, center.z));
  playerVelocity.set(0, 0, 0);
  camera.position.set(0, 1.7, 0);
}

function setupMinimap() {
  minimapCamera = new THREE.OrthographicCamera(-120, 120, 120, -120, 0.1, 1500);
  minimapCamera.up.set(0, 0, -1);
  minimapCamera.lookAt(new THREE.Vector3(0, 0, 0));
}

function setupInput() {
  const keyStates = {};

  document.addEventListener('keydown', (e) => {
    keyStates[e.code] = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprint = true;
    if (e.code === 'KeyH') toggleHUD();
    if (e.code === 'KeyM') minimapEnabled = !minimapEnabled;
    if (e.code === 'KeyG') toggleGUI();
  });
  document.addEventListener('keyup', (e) => {
    keyStates[e.code] = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprint = false;
  });

  function getForwardVector() {
    camera.getWorldDirection(tempVector);
    tempVector.y = 0;
    tempVector.normalize();
    return tempVector;
  }

  function getSideVector() {
    camera.getWorldDirection(tempVector);
    tempVector.y = 0;
    tempVector.normalize();
    tempVector.cross(camera.up);
    return tempVector;
  }

  function controlsUpdate(dt) {
    const speed = (playerOnFloor ? 8 : 2) * (sprint ? 1.8 : 1.0);

    if (keyStates['KeyW']) playerVelocity.add(getForwardVector().multiplyScalar(speed * dt));
    if (keyStates['KeyS']) playerVelocity.add(getForwardVector().multiplyScalar(-speed * dt));
    if (keyStates['KeyA']) playerVelocity.add(getSideVector().multiplyScalar(-speed * dt));
    if (keyStates['KeyD']) playerVelocity.add(getSideVector().multiplyScalar(speed * dt));

    if (playerOnFloor) {
      if (keyStates['Space'] && canJump) {
        playerVelocity.y = 6.5;
        canJump = false;
      }
    }

    // Friction
    if (playerOnFloor) {
      playerVelocity.x -= playerVelocity.x * 8.0 * dt;
      playerVelocity.z -= playerVelocity.z * 8.0 * dt;
    } else {
      playerVelocity.x -= playerVelocity.x * 1.0 * dt;
      playerVelocity.z -= playerVelocity.z * 1.0 * dt;
    }

    // Gravity
    playerVelocity.y -= 9.8 * dt;

    // Move the player
    const deltaPosition = playerVelocity.clone().multiplyScalar(dt);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    camera.position.copy(playerCollider.end);
    camera.position.y -= 0.9; // eye height
  }

  // Animation hook
  updatePlayer = controlsUpdate;
}

function toggleHUD() {
  hudEnabled = !hudEnabled;
  document.getElementById('ui').style.display = hudEnabled ? 'block' : 'none';
}

function toggleGUI() {
  guiEnabled = !guiEnabled;
  if (guiEnabled) gui.show(); else gui.hide();
}

function playerCollisions() {
  const result = worldOctree.capsuleIntersect(playerCollider);
  playerOnFloor = false;

  if (result) {
    playerOnFloor = result.normal.y > 0;

    if (!playerOnFloor) {
      playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
    }

    playerCollider.translate(result.normal.multiplyScalar(result.depth));
  }

  if (playerOnFloor) {
    playerVelocity.y = Math.max(0, playerVelocity.y);
    canJump = true;
  }
}

let updatePlayer = () => {};

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now() / 1000;
  const dtRaw = Math.min(0.05, now - prevTime);
  prevTime = now;

  const dt = dtRaw * params.timeScale;
  simTime += dt;

  // Day-night cycle
  const daySpeed = params.dayNightSpeed;
  if (daySpeed > 0) {
    params.sunAzimuth = (params.sunAzimuth + dt * daySpeed * 0.02) % 1;
    params.sunElevation = (params.sunElevation + dt * daySpeed) % 1;
  }
  updateSunUniforms(params.sunElevation, params.sunAzimuth);
  updateNightLighting();

  // Update systems
  updateTraffic(dt);
  updatePedestrians(dt);
  updatePlayer(dt);

  // Update minimap camera placement above player
  if (minimapEnabled) {
    minimapCamera.position.set(camera.position.x, 300, camera.position.z);
    minimapCamera.lookAt(camera.position.x, 0, camera.position.z);
  }

  // Render main view
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);

  // Render minimap in corner
  if (minimapEnabled) {
    const w = 240, h = 180, pad = 12;
    renderer.setScissorTest(true);
    renderer.setScissor(window.innerWidth - w - pad, pad, w, h);
    renderer.setViewport(window.innerWidth - w - pad, pad, w, h);
    renderer.render(scene, minimapCamera);
    renderer.setScissorTest(false);
  }

  stats.update();
}

function updateNightLighting() {
  const dayMix = Math.max(0, Math.sin(params.sunElevation * Math.PI));
  const night = 1 - dayMix;

  // Enable street lamps and car headlights at night
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.lamp && obj.userData.lamp.isLight) {
      obj.userData.lamp.intensity = THREE.MathUtils.lerp(0.0, 1.5, night);
    }
    if (obj.userData && obj.userData.nightGlow) {
      obj.userData.nightGlow.visible = night > 0.2;
      if (obj.userData.nightGlow.material) obj.userData.nightGlow.material.emissiveIntensity = night * 1.4;
    }
    if (obj.isSpotLight && obj.parent && obj.parent.parent && obj.parent.parent.geometry && obj.parent.parent.geometry.type === 'BoxGeometry') {
      // rough heuristic: car headlights
      obj.intensity = THREE.MathUtils.lerp(0.0, 1.2, night);
    }
  });
}

function updateTraffic(dt) {
  // Update traffic lights
  for (const inter of intersections) {
    inter.phase += dt;
    if (inter.phase > inter.cycle) inter.phase = 0;
  }

  // Cars movement
  for (const car of vehicles) {
    // Determine stopping if approaching intersection with red
    const a = roadGraph.nodes[car.edge.a];
    const b = roadGraph.nodes[car.edge.b];
    const edgeLen = Math.hypot(b.x - a.x, b.z - a.z);

    // Car world position based on progress
    const pos = new THREE.Vector3().lerpVectors(new THREE.Vector3(a.x, 0, a.z), new THREE.Vector3(b.x, 0, b.z), car.progress);
    const right = car.right;
    pos.addScaledVector(right, car.laneOffset);

    // Desired speed
    let desired = car.speedMax;

    // Intersection control near end
    const nearingEnd = edgeLen * (1 - car.progress) < 8;
    if (nearingEnd) {
      const inter = intersections[b.id];
      const greenForX = Math.sin((inter.phase / inter.cycle) * Math.PI * 2) > 0; // simple oscillator
      const dirIsX = car.edge.dir === 'x';
      const green = dirIsX ? greenForX : !greenForX;
      if (!green) desired = 0; // red light
    }

    // Simple collision avoidance: check nearest car ahead on same edge and lane
    let nearestAhead = Infinity;
    for (const other of vehicles) {
      if (other === car) continue;
      if (other.edge !== car.edge) continue;
      if (Math.abs(other.laneOffset - car.laneOffset) > 0.1) continue;
      if (other.progress > car.progress) {
        nearestAhead = Math.min(nearestAhead, (other.progress - car.progress) * edgeLen);
      }
    }
    if (nearestAhead < 8) desired = Math.min(desired, Math.max(0, car.speed - car.decel * dt));

    // Accel/decel
    if (car.speed < desired) car.speed = Math.min(desired, car.speed + car.accel * dt);
    else car.speed = Math.max(desired, car.speed - car.decel * dt);

    // Advance progress
    const dv = (car.speed / edgeLen) * dt;
    car.progress += dv;

    // Turn at end
    if (car.progress >= 1) {
      // choose a connected edge from b (avoid U-turn)
      const options = roadGraph.edges.filter((e) => e.a === b.id || e.b === b.id);
      const next = options[Math.floor(Math.random() * options.length)];
      if (next) {
        // if U-turn, pick again if possible
        if ((next.a === b.id && next.b === a.id) || (next.b === b.id && next.a === a.id)) {
          const alt = options.find((e) => e !== next);
          if (alt) car.edge = alt; else car.edge = next;
        } else {
          car.edge = next;
        }
      }
      const na = roadGraph.nodes[car.edge.a];
      const nb = roadGraph.nodes[car.edge.b];
      car.progress = 0;
      car.dir.set(nb.x - na.x, 0, nb.z - na.z).normalize();
      car.right.crossVectors(car.dir, new THREE.Vector3(0, 1, 0));
      // randomize lane on turn
      car.laneOffset = (Math.random() < 0.5 ? -1 : 1) * (city.roadWidth * 0.25);
    }

    // Update mesh transform
    const na = roadGraph.nodes[car.edge.a];
    const nb = roadGraph.nodes[car.edge.b];
    const newPos = new THREE.Vector3().lerpVectors(new THREE.Vector3(na.x, 0, na.z), new THREE.Vector3(nb.x, 0, nb.z), car.progress);
    newPos.addScaledVector(car.right, car.laneOffset);
    car.mesh.position.set(newPos.x, 0.5, newPos.z);

    // orientation: face forward along motion
    const forward = new THREE.Vector3(nb.x - na.x, 0, nb.z - na.z).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    car.mesh.quaternion.slerp(quat, 0.3);
  }

  // Dynamic spawning towards target density
  const target = Math.floor(roadGraph.edges.length * 0.15 * params.trafficDensity);
  if (vehicles.length < target && Math.random() < 0.2) {
    const car = createCar();
    if (car) vehicles.push(car);
  }
  if (vehicles.length > target && vehicles.length > 0 && Math.random() < 0.05) {
    const car = vehicles.pop();
    scene.remove(car.mesh);
  }
}

function updatePedestrians(dt) {
  for (const ped of pedestrians) {
    if (!ped.from || !ped.to) continue;
    // Move along segment from->to
    ped.t += (ped.speed * dt) / distance2D(ped.from, ped.to);
    if (ped.t >= 1) {
      ped.from = ped.to;
      ped.to = pickNeighboringNode(ped.from);
      ped.t = 0;
      // small wait at intersections to simulate signal
      ped.waitTimer = Math.random() * 1.0;
    }
    if (ped.waitTimer > 0) {
      ped.waitTimer -= dt;
    } else {
      const pos = lerpNode(ped.from, ped.to, ped.t);
      // offset to sidewalks
      const dir = new THREE.Vector3(ped.to.x - ped.from.x, 0, ped.to.z - ped.from.z).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
      const side = (Math.random() < 0.5 ? -1 : 1);
      pos.addScaledVector(right, side * (city.roadWidth / 2 + city.sidewalkWidth / 2));
      ped.mesh.position.set(pos.x, 0.9, pos.z);

      // face motion
      const forward = dir.clone();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
      ped.mesh.quaternion.slerp(quat, 0.2);
    }
  }

  // Density adjustments
  const target = Math.floor(roadGraph.nodes.length * 0.2 * params.pedestrianDensity);
  if (pedestrians.length < target && Math.random() < 0.2) {
    const ped = createPedestrian();
    if (ped) pedestrians.push(ped);
  }
  if (pedestrians.length > target && pedestrians.length > 0 && Math.random() < 0.05) {
    const ped = pedestrians.pop();
    scene.remove(ped.mesh);
  }
}

function distance2D(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function lerpNode(a, b, t) {
  return new THREE.Vector3(
    THREE.MathUtils.lerp(a.x, b.x, t),
    0,
    THREE.MathUtils.lerp(a.z, b.z, t)
  );
}