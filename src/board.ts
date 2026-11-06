import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { EMPTY_MANIFEST, type AssetManifest } from "./assets.ts";
import { COLS, ROWS, TERRAIN, type Phase, type Tile, type Unit } from "./game.ts";
import { modelForUnit, modelUrl, SCENERY, TERRAIN_MODELS } from "./models.ts";

const TILE = 1.15;
const SURFACE = 0.08;

const COLOR = {
  clear: 0xcfc8ba,
  table: 0xc4bdae,
  tile: 0xb7b1a4,
  brush: 0x6e8f68,
  stone: 0x8a847c,
  amber: 0xc4843c,
  host: 0x8f3d32,
  move: 0xe6c27a,
  path: 0xf4e2a8,
  attack: 0xa33b32,
  select: 0xf7f1e4,
  hover: 0x2a2622,
  barTrack: 0x2a2622,
};

export interface BoardView {
  units: Unit[];
  selectedId: string | null;
  phase: Phase;
  moveKeys: Set<string>;
  attackIds: Set<string>;
  path: readonly Tile[];
  hover: Tile | null;
}

interface LoadedModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

interface ActorView {
  id: string;
  group: THREE.Group;
  body: THREE.Group;
  bar: THREE.Group;
  fill: THREE.Mesh;
  mixer: THREE.AnimationMixer | null;
  display: THREE.Vector3;
  target: THREE.Vector3;
  placed: boolean;
}

interface CellMesh {
  col: number;
  row: number;
  anchor: THREE.Group;
  mark: THREE.Mesh;
}

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const modelCache = new Map<string, Promise<LoadedModel | null>>();
const textureCache = new Map<string, Promise<THREE.Texture | null>>();

function loadModel(file: string): Promise<LoadedModel | null> {
  const url = modelUrl(file);
  const cached = modelCache.get(url);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null;
    const buffer = await response.arrayBuffer();
    return await new Promise<LoadedModel | null>((resolve) => {
      loader.parse(
        buffer,
        "",
        (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
        () => resolve(null),
      );
    });
  })();
  modelCache.set(url, pending);
  return pending;
}

function loadBillboard(file: string): Promise<THREE.Texture | null> {
  const url = modelUrl(file);
  const cached = textureCache.get(url);
  if (cached) return cached;
  const pending = new Promise<THREE.Texture | null>((resolve) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
  textureCache.set(url, pending);
  return pending;
}

function fitSprite(texture: THREE.Texture, maxWidth: number, maxHeight: number): THREE.Sprite {
  const image = texture.image as { width: number; height: number };
  const aspect = image.width / Math.max(image.height, 1);
  let height = maxHeight;
  let width = height * aspect;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / Math.max(aspect, 1e-4);
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.28,
    depthWrite: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 2;
  return sprite;
}

function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function tileToWorld(col: number, row: number): THREE.Vector3 {
  const originX = ((COLS - 1) * TILE) / 2;
  const originZ = ((ROWS - 1) * TILE) / 2;
  return new THREE.Vector3(col * TILE - originX, 0, row * TILE - originZ);
}

function cellOf(object: THREE.Object3D | null): Tile | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const cell = current.userData.cell as Tile | undefined;
    if (cell) return cell;
    current = current.parent;
  }
  return null;
}

function standLongAxisUp(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest < size.y * 1.8) return;
  if (size.x >= size.z) object.rotation.z = Math.PI / 2;
  else object.rotation.x = -Math.PI / 2;
}

function frameModel(root: THREE.Object3D, footprint: number, maxHeight: number) {
  root.position.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(footprint / Math.max(size.x, size.z, 1e-4), maxHeight / Math.max(size.y, 1e-4));
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  const center = fitted.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= fitted.min.y;
}

function paintShadows(root: THREE.Object3D, cast: boolean) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
  });
}

function shapeFor(role: string): "square" | "diamond" | "round" {
  if (role === "Warden" || role === "Brute") return "square";
  if (role === "Scout" || role === "Skirmisher") return "round";
  return "diamond";
}

export interface BoardMetrics {
  actors: number;
  drawCalls: number;
  triangles: number;
  frameMs: number;
}

export function createBoard(parent: HTMLElement, manifest: AssetManifest = EMPTY_MANIFEST) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(COLOR.clear);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 80);
  camera.position.set(11, 10, 11);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xf3efe4, 0x7d7568, 0.9));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.45);
  sun.position.set(7, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const table = new THREE.Mesh(
    new THREE.CircleGeometry(16, 48),
    new THREE.MeshStandardMaterial({ color: COLOR.table, roughness: 1 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.04;
  table.receiveShadow = true;
  scene.add(table);

  const tileMaterial = new THREE.MeshStandardMaterial({ color: COLOR.tile, roughness: 0.92 });
  const brushMaterial = new THREE.MeshStandardMaterial({ color: COLOR.brush, roughness: 0.82 });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.78 });
  const moveMaterial = new THREE.MeshBasicMaterial({
    color: COLOR.move,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const pathMaterial = new THREE.MeshBasicMaterial({
    color: COLOR.path,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const attackMaterial = new THREE.MeshBasicMaterial({
    color: COLOR.attack,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
  });
  const selectMaterial = new THREE.MeshBasicMaterial({
    color: COLOR.select,
    side: THREE.DoubleSide,
  });
  const hoverMaterial = new THREE.MeshBasicMaterial({
    color: COLOR.hover,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.45,
  });

  const clickables: THREE.Object3D[] = [];
  const cells = new Map<string, CellMesh>();

  function addCell(col: number, row: number, object: THREE.Object3D) {
    const anchor = new THREE.Group();
    const world = tileToWorld(col, row);
    anchor.position.set(world.x, 0, world.z);
    anchor.userData.cell = { col, row };
    object.userData.cell = { col, row };
    anchor.add(object);
    scene.add(anchor);
    clickables.push(anchor);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), moveMaterial);
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.11;
    mark.visible = false;
    mark.raycast = () => undefined;
    anchor.add(mark);
    cells.set(tileKey(col, row), { col, row, anchor, mark });
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const terrain = TERRAIN[row][col];
      if (terrain === "stone") {
        const stone = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.62, 0.96), stoneMaterial);
        stone.position.y = 0.31;
        stone.castShadow = true;
        stone.receiveShadow = true;
        addCell(col, row, stone);
      } else if (terrain === "brush") {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.02, SURFACE, 1.02), tileMaterial);
        base.position.y = SURFACE / 2;
        base.receiveShadow = true;
        group.add(base);
        for (const [x, z] of [
          [-0.2, 0.04],
          [0.16, 0.14],
          [0.02, -0.18],
        ] as const) {
          const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 6), brushMaterial);
          tuft.position.set(x, 0.2, z);
          tuft.castShadow = true;
          group.add(tuft);
        }
        group.userData.cell = { col, row };
        addCell(col, row, group);
      } else {
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1.02, SURFACE, 1.02), tileMaterial);
        tile.position.y = SURFACE / 2;
        tile.receiveShadow = true;
        addCell(col, row, tile);
      }
    }
  }

  void loadModel(TERRAIN_MODELS.tile.file).then((loaded) => loaded && swapTerrain("plain", loaded, 1, 0.35));
  void loadModel(TERRAIN_MODELS.brush.file).then((loaded) => loaded && swapTerrain("brush", loaded, 1, 0.45));
  void loadModel(TERRAIN_MODELS.stone.file).then((loaded) => loaded && swapTerrain("stone", loaded, 0.96, 1.1));

  const reserveRadiusX = 7.15;
  const reserveRadiusZ = 6.4;
  SCENERY.forEach((piece, index) => {
    const angle = (index / SCENERY.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * reserveRadiusX;
    const z = Math.sin(angle) * reserveRadiusZ;
    const footprint = piece.kind === "prop" ? 0.62 : 0.78;
    const height = piece.kind === "prop" ? 0.85 : 1.05;
    void loadModel(piece.file).then((loaded) => {
      if (!loaded) return;
      const pivot = new THREE.Group();
      const yaw = new THREE.Group();
      const model = cloneSkinned(loaded.scene);
      if (piece.kind === "prop") standLongAxisUp(model);
      else if (piece.rotation) model.rotation.set(piece.rotation[0], piece.rotation[1], piece.rotation[2]);
      yaw.rotation.y = Math.PI / 5;
      yaw.add(model);
      pivot.add(yaw);
      frameModel(pivot, footprint, height);
      paintShadows(pivot, true);
      pivot.position.x += x;
      pivot.position.z += z;
      pivot.position.y += SURFACE;
      scene.add(pivot);
    });
  });

  function swapTerrain(kind: "plain" | "brush" | "stone", loaded: LoadedModel, footprint: number, height: number) {
    for (const cell of cells.values()) {
      if (TERRAIN[cell.row][cell.col] !== kind) continue;
      const stand = cell.anchor.children.find((child) => child !== cell.mark);
      if (stand) cell.anchor.remove(stand);
      const model = cloneSkinned(loaded.scene);
      frameModel(model, footprint, height);
      paintShadows(model, kind === "stone");
      model.userData.cell = { col: cell.col, row: cell.row };
      cell.anchor.add(model);
    }
  }

  const rings = new THREE.Group();
  scene.add(rings);
  const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 40), selectMaterial);
  selectRing.rotation.x = -Math.PI / 2;
  selectRing.visible = false;
  selectRing.raycast = () => undefined;
  rings.add(selectRing);
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.55, 40), hoverMaterial);
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.visible = false;
  hoverRing.raycast = () => undefined;
  rings.add(hoverRing);
  const attackRings: THREE.Mesh[] = [];
  function ensureAttackRing(index: number): THREE.Mesh {
    const existing = attackRings[index];
    if (existing) return existing;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), attackMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.raycast = () => undefined;
    rings.add(ring);
    attackRings.push(ring);
    return ring;
  }
  const pathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: COLOR.path }),
  );
  pathLine.frustumCulled = false;
  pathLine.raycast = () => undefined;
  rings.add(pathLine);

  const actors = new Map<string, ActorView>();
  const clock = new THREE.Clock();
  let frame = 0;
  const frameSamples: number[] = [];
  let frameMs = 0;
  let onFrame: ((metrics: BoardMetrics) => void) | null = null;

  function metrics(): BoardMetrics {
    return {
      actors: actors.size,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frameMs,
    };
  }

  function standIn(unit: Unit): THREE.Object3D {
    const color = unit.side === "player" ? COLOR.amber : COLOR.host;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04 });
    const shape = shapeFor(unit.role);
    const mesh =
      shape === "square"
        ? new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.4), material)
        : shape === "round"
          ? new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), material)
          : new THREE.Mesh(new THREE.OctahedronGeometry(0.3), material);
    mesh.castShadow = true;
    mesh.position.y = shape === "square" ? 0.31 : shape === "round" ? 0.24 : 0.32;
    return mesh;
  }

  function ensureActor(unit: Unit): ActorView {
    const existing = actors.get(unit.id);
    if (existing) return existing;
    const group = new THREE.Group();
    group.userData.cell = { col: unit.col, row: unit.row };
    const body = new THREE.Group();
    body.add(standIn(unit));
    group.add(body);
    const bar = new THREE.Group();
    bar.position.y = 0.95;
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.07),
      new THREE.MeshBasicMaterial({ color: COLOR.barTrack }),
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.07),
      new THREE.MeshBasicMaterial({ color: unit.side === "player" ? COLOR.amber : COLOR.host }),
    );
    fill.position.z = 0.01;
    bar.add(track, fill);
    group.add(bar);
    scene.add(group);
    clickables.push(group);
    const world = tileToWorld(unit.col, unit.row);
    world.y = SURFACE;
    const view: ActorView = {
      id: unit.id,
      group,
      body,
      bar,
      fill,
      mixer: null,
      display: world.clone(),
      target: world.clone(),
      placed: false,
    };
    group.position.copy(world);
    actors.set(unit.id, view);
    const slot = modelForUnit(unit, manifest);
    if (slot?.file.endsWith(".png")) {
      void loadBillboard(slot.file).then((texture) => {
        if (!texture || !actors.has(unit.id)) return;
        const sprite = fitSprite(texture, 0.94, 1.38);
        body.clear();
        body.add(sprite);
        bar.position.y = Math.max(0.9, sprite.scale.y + 0.16);
      });
    } else if (slot) {
      void loadModel(slot.file).then((loaded) => {
        if (!loaded || !actors.has(unit.id)) return;
        const model = cloneSkinned(loaded.scene);
        if (slot.rotation) model.rotation.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
        const fitted = new THREE.Group();
        fitted.add(model);
        frameModel(fitted, 0.72, 1.2);
        paintShadows(fitted, true);
        fitted.userData.cell = { col: unit.col, row: unit.row };
        const pivot = new THREE.Group();
        pivot.add(fitted);
        pivot.rotation.y = (unit.side === "player" ? Math.PI : 0) + (slot.yaw ?? 0);
        body.clear();
        body.add(pivot);
        if (loaded.animations[0]) {
          view.mixer = new THREE.AnimationMixer(model);
          view.mixer.clipAction(loaded.animations[0]).play();
        }
        model.updateMatrixWorld(true);
        const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
        bar.position.y = Math.max(0.9, height + 0.18);
      });
    }
    return view;
  }

  function resize() {
    const width = Math.max(parent.clientWidth, 1);
    const height = Math.max(parent.clientHeight, 1);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfH = 5.7;
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function project(col: number, row: number): { x: number; y: number } {
    const world = tileToWorld(col, row);
    world.y = 0.45;
    camera.updateMatrixWorld();
    const projected = world.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
    };
  }

  function pick(event: PointerEvent): Tile | null {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    camera.updateMatrixWorld();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables, true);
    for (const hit of hits) {
      const cell = cellOf(hit.object);
      if (cell) return cell;
    }
    return null;
  }

  function placeRing(ring: THREE.Object3D, col: number, row: number, y: number) {
    const world = tileToWorld(col, row);
    ring.position.set(world.x, y, world.z);
    ring.visible = true;
  }

  function sync(view: BoardView) {
    const alive = new Set<string>();
    for (const unit of view.units) {
      if (unit.hp <= 0) continue;
      alive.add(unit.id);
      const actor = ensureActor(unit);
      actor.group.userData.cell = { col: unit.col, row: unit.row };
      const world = tileToWorld(unit.col, unit.row);
      world.y = SURFACE;
      actor.target.copy(world);
      if (!actor.placed) {
        actor.display.copy(world);
        actor.group.position.copy(world);
        actor.placed = true;
      }
      const ratio = Math.max(0, unit.hp / unit.maxHp);
      actor.fill.scale.x = Math.max(ratio, 0.001);
      actor.fill.position.x = -0.23 * (1 - ratio);
      const spent =
        unit.acted &&
        ((view.phase === "player" && unit.side === "player") || (view.phase === "enemy" && unit.side === "enemy"));
      actor.body.scale.setScalar(spent ? 0.94 : 1);
    }
    for (const [id, actor] of actors) {
      if (alive.has(id)) continue;
      scene.remove(actor.group);
      const index = clickables.indexOf(actor.group);
      if (index >= 0) clickables.splice(index, 1);
      actors.delete(id);
    }

    const pathKeys = new Set(view.path.slice(1).map((tile) => tileKey(tile.col, tile.row)));
    for (const [code, cell] of cells) {
      const onPath = pathKeys.has(code);
      const movable = view.moveKeys.has(code);
      cell.mark.visible = onPath || movable;
      cell.mark.material = onPath ? pathMaterial : moveMaterial;
    }

    const selected = view.units.find((unit) => unit.id === view.selectedId && unit.hp > 0);
    if (selected) placeRing(selectRing, selected.col, selected.row, 0.12);
    else selectRing.visible = false;

    if (view.hover) placeRing(hoverRing, view.hover.col, view.hover.row, 0.13);
    else hoverRing.visible = false;

    const targets = view.units.filter((unit) => unit.hp > 0 && view.attackIds.has(unit.id));
    const ringCount = Math.max(attackRings.length, targets.length);
    for (let index = 0; index < ringCount; index++) {
      const ring = ensureAttackRing(index);
      const target = targets[index];
      if (!target) {
        ring.visible = false;
        continue;
      }
      placeRing(ring, target.col, target.row, 0.14);
    }

    if (view.path.length > 1) {
      const points = view.path.map((tile) => {
        const world = tileToWorld(tile.col, tile.row);
        return new THREE.Vector3(world.x, 0.16, world.z);
      });
      pathLine.geometry.dispose();
      pathLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
      pathLine.visible = true;
    } else {
      pathLine.visible = false;
    }
  }

  function animate() {
    frame = requestAnimationFrame(animate);
    const started = performance.now();
    const dt = Math.min(clock.getDelta(), 0.05);
    const blend = 1 - Math.exp(-dt * 10);
    for (const actor of actors.values()) {
      actor.display.lerp(actor.target, blend);
      actor.group.position.copy(actor.display);
      actor.bar.quaternion.copy(camera.quaternion);
      actor.mixer?.update(dt);
    }
    renderer.render(scene, camera);
    const sample = performance.now() - started;
    frameSamples.push(sample);
    if (frameSamples.length > 30) frameSamples.shift();
    frameMs = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
    onFrame?.(metrics());
  }

  resize();
  const observer = new ResizeObserver(() => resize());
  observer.observe(parent);
  animate();

  return {
    element: renderer.domElement,
    pick,
    project,
    resize,
    sync,
    metrics,
    setProbe(listener: ((metrics: BoardMetrics) => void) | null) {
      onFrame = listener;
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      parent.removeChild(renderer.domElement);
    },
  };
}
