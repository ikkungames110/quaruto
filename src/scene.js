import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WOODS } from './wood.js';
import { buildPiece } from './pieces.js';
import { DARK } from './game.js';

const CELL = 1.5;
const BOARD_FLOOR = 0.25;      // 盤の穴の底
const TRAY_TOP = 0.28;
const HAND_POS = new THREE.Vector3(0, 0.3, -5.1);
const TRAVEL_Y = 2.9;
const DRAG_Y = 1.4;

export const cellPos = (i) => new THREE.Vector3(((i % 4) - 1.5) * CELL, BOARD_FLOOR, (Math.floor(i / 4) - 1.5) * CELL);
export const slotPos = (id) => new THREE.Vector3(((id >> 1) - 3.5) * 0.97, TRAY_TOP, id & 1 ? 5.3 : 6.9);

function woodMat(tex, repeat, extra = {}) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(...repeat);
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, ...extra });
}

// 円形のくぼみ付きの板
function dimpledSlab({ w, d, holes, baseH, plateH, baseMat, plateMat, radius = 0.12 }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, baseH, d + 0.25), baseMat);
  base.position.y = baseH / 2;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  const s = new THREE.Shape();
  const hw = w / 2, hd = d / 2;
  s.moveTo(-hw + radius, -hd);
  s.lineTo(hw - radius, -hd); s.absarc(hw - radius, -hd + radius, radius, -Math.PI / 2, 0);
  s.lineTo(hw, hd - radius); s.absarc(hw - radius, hd - radius, radius, 0, Math.PI / 2);
  s.lineTo(-hw + radius, hd); s.absarc(-hw + radius, hd - radius, radius, Math.PI / 2, Math.PI);
  s.lineTo(-hw, -hd + radius); s.absarc(-hw + radius, -hd + radius, radius, Math.PI, Math.PI * 1.5);
  for (const h of holes) {
    const p = new THREE.Path();
    p.absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: plateH - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40 });
  geo.rotateX(-Math.PI / 2);
  const plate = new THREE.Mesh(geo, plateMat);
  plate.position.y = baseH + 0.02;
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d120a);
  scene.fog = new THREE.Fog(0x1d120a, 28, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 120);
  const target = new THREE.Vector3(0, 0.4, 0.9);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = THREE.MathUtils.degToRad(18);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(76);
  controls.minAzimuthAngle = THREE.MathUtils.degToRad(-70);
  controls.maxAzimuthAngle = THREE.MathUtils.degToRad(70);
  controls.autoRotateSpeed = 0.5;

  // ---- ライト
  scene.add(new THREE.HemisphereLight(0xfff0dd, 0x3a2412, 0.55));
  const key = new THREE.DirectionalLight(0xffe9c8, 2.6);
  key.position.set(-7, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 13, bottom: -9, near: 4, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc88a, 0.8);
  rim.position.set(8, 6, -10);
  scene.add(rim);

  // ---- 素材
  const tex = Object.fromEntries(Object.entries(WOODS).map(([k, f]) => [k, f()]));
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    woodMat(tex.table, [9, 9], { roughness: 0.7, clearcoat: 0.1 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // ---- 盤
  const holes = Array.from({ length: 16 }, (_, i) => ({ x: cellPos(i).x, z: cellPos(i).z, r: 0.68 }));
  const board = dimpledSlab({
    w: 7.0, d: 7.0, holes, baseH: BOARD_FLOOR, plateH: 0.16,
    baseMat: woodMat(tex.cherry, [0.18, 0.18]),
    plateMat: woodMat(tex.oak, [0.16, 0.16]),
    radius: 0.2,
  });
  scene.add(board);

  // ---- 駒置き (トレイ)
  const trayRing = new THREE.RingGeometry(0.5, 0.56, 48).rotateX(-Math.PI / 2);
  const trayMat = woodMat(tex.cherry, [0.2, 0.2]);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(8.4, TRAY_TOP, 3.5), trayMat);
  tray.position.set(0, TRAY_TOP / 2, 6.1);
  tray.castShadow = tray.receiveShadow = true;
  scene.add(tray);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1a0d05, transparent: true, opacity: 0.35 });
  for (let id = 0; id < 16; id++) {
    const m = new THREE.Mesh(trayRing, ringMat);
    const p = slotPos(id);
    m.position.set(p.x, TRAY_TOP + 0.003, p.z);
    scene.add(m);
  }
  // 「渡された駒」の台
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.86, HAND_POS.y, 56),
    woodMat(tex.oak, [0.6, 0.3]),
  );
  pedestal.position.set(HAND_POS.x, HAND_POS.y / 2, HAND_POS.z);
  pedestal.castShadow = pedestal.receiveShadow = true;
  scene.add(pedestal);

  // ---- マスのリング / ヒットテスト用
  const cellRingMat = Array.from({ length: 16 }, () => new THREE.MeshBasicMaterial({ color: 0xf2b84b, transparent: true, opacity: 0, depthWrite: false }));
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const cellHits = [];
  for (let i = 0; i < 16; i++) {
    const p = cellPos(i);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 56).rotateX(-Math.PI / 2), cellRingMat[i]);
    ring.position.set(p.x, BOARD_FLOOR + 0.004, p.z);
    scene.add(ring);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 24), hitMat);
    hit.position.set(p.x, 0.4, p.z);
    hit.userData.cell = i;
    scene.add(hit);
    cellHits.push(hit);
  }

  // ---- 駒
  const baseMats = {
    light: woodMat(tex.maple, [1.6, 1], { roughness: 0.45, clearcoat: 0.35 }),
    dark: woodMat(tex.walnut, [1.6, 1], { roughness: 0.45, clearcoat: 0.35 }),
  };
  const pieces = [];
  const pieceRoots = [];
  for (let id = 0; id < 16; id++) {
    const mat = baseMats[id & DARK ? 'dark' : 'light'].clone();
    mat.emissive = new THREE.Color(0xffb347);
    mat.emissiveIntensity = 0;
    const g = buildPiece(id, mat);
    // 押し出し形状は UV が寸法ベースなので少し繰り返しを抑える
    g.userData = { ...g.userData, id, mat, loc: 'tray', path: [], pos: slotPos(id).clone(), pulse: 0 };
    g.position.copy(g.userData.pos);
    scene.add(g);
    pieces.push(g);
    pieceRoots.push(g);
  }

  // ---- 状態
  let state = null, hoverCell = -1, drag = null;
  let input = { pick: false, place: false };
  let handlers = { tray: () => {}, cell: () => {} };

  function refresh() {
    if (!state) return;
    for (const g of pieces) {
      const u = g.userData, id = u.id;
      const cell = state.board.indexOf(id);
      let loc, pos;
      if (drag && drag.piece === g) continue;
      if (cell >= 0) { loc = `cell${cell}`; pos = cellPos(cell); }
      else if (state.hand === id) { loc = 'hand'; pos = HAND_POS.clone(); }
      else { loc = 'tray'; pos = slotPos(id); }

      if (loc !== u.loc) {
        const from = u.pos.clone();
        if (loc === 'tray' && u.loc === 'tray') u.path = [pos];
        else u.path = [new THREE.Vector3(from.x, TRAVEL_Y, from.z), new THREE.Vector3(pos.x, TRAVEL_Y, pos.z), pos];
        u.loc = loc;
      } else if (u.path.length) {
        u.path[u.path.length - 1] = pos;
      } else {
        u.path = [pos];
      }
    }
    const win = new Set(state.line || []);
    for (let i = 0; i < 16; i++) {
      const empty = state.board[i] === -1;
      const m = cellRingMat[i];
      m.userData = {
        base: i === hoverCell || win.has(i) ? 1 : input.place && empty ? 0.28 : 0,
        pulse: win.has(i),
      };
    }
  }

  // ---- 入力 (駒のドラッグで操作。それ以外のドラッグは視点操作)
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y);
  const hit = new THREE.Vector3();
  function aim(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }
  const cellAt = (p) => {
    const cx = Math.floor(p.x / CELL + 2), cz = Math.floor(p.z / CELL + 2);
    if (cx < 0 || cx > 3 || cz < 0 || cz > 3) return -1;
    const c = cz * 4 + cx;
    return state.board[c] === -1 ? c : -1;
  };
  const overHand = (p) => Math.hypot(p.x - HAND_POS.x, p.z - HAND_POS.z) < 1.6;

  canvas.addEventListener('pointerdown', (e) => {
    if (drag || !state || !e.isPrimary) return;
    ndc.set(((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1, -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(pieceRoots, true)) {
      let o = h.object;
      while (o && o.userData.id === undefined) o = o.parent;
      if (!o) continue;
      const mode = o.userData.loc === 'tray' && input.pick ? 'give' : o.userData.loc === 'hand' && input.place ? 'place' : null;
      if (!mode) return;
      drag = { piece: o, mode, id: e.pointerId };
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      o.userData.path = [];
      o.userData.target = o.userData.pos.clone().setY(DRAG_Y);
      return;
    }
  }, true);
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = aim(e);
    if (!p) return;
    drag.piece.userData.target.set(p.x, DRAG_Y, p.z);
    const c = drag.mode === 'place' ? cellAt(p) : -1;
    if (c !== hoverCell) { hoverCell = c; refresh(); }
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const { piece, mode } = drag;
    const p = cancel ? null : aim(e);
    drag = null;
    controls.enabled = true;
    hoverCell = -1;
    piece.userData.target = null;
    piece.userData.loc = 'dropped';   // refresh で元の位置への移動 (または新しい位置) を再計算させる
    if (p && mode === 'place') { const c = cellAt(p); if (c >= 0) handlers.cell(c); }
    else if (p && overHand(p)) handlers.tray(piece.userData.id);
    refresh();
  }
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---- サイズ / カメラ位置
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });
  const tmp = new THREE.Vector3();
  function fitCamera(force) {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const need = Math.max(14.2 / (2 * tanV), 10.2 / (2 * tanV * camera.aspect));
    controls.minDistance = need * 0.55;
    controls.maxDistance = need * 1.3;
    if (force || !userMoved) {
      const polar = THREE.MathUtils.degToRad(46);
      const az = 0;
      tmp.setFromSphericalCoords(need, polar, az);
      camera.position.copy(target).add(tmp);
      controls.target.copy(target);
      controls.update();
    }
  }
  new ResizeObserver(() => fitCamera(false)).observe(canvas);
  fitCamera(true);

  // ---- ループ
  const clock = new THREE.Clock();
  const tv = new THREE.Vector3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 11);
    const win = new Set(state?.line ? state.line.map((c) => state.board[c]) : []);
    for (const g of pieces) {
      const u = g.userData;
      const wp = u.target || u.path[0];
      if (wp) {
        u.pos.lerp(wp, u.path.length > 1 ? k * 1.15 : k);
        if (!u.target && u.path.length > 1 && u.pos.distanceTo(wp) < 0.18) u.path.shift();
      }
      tv.copy(u.pos);
      if (win.has(u.id)) tv.y += 0.12 + Math.sin(t * 5 + u.id) * 0.08;
      g.position.copy(tv);
      const glow = u === drag?.piece
        ? 0.22 + Math.sin(t * 5) * 0.08
        : win.has(u.id) ? 0.35 + Math.sin(t * 6) * 0.2 : 0;
      u.mat.emissiveIntensity += (glow - u.mat.emissiveIntensity) * 0.2;
    }
    for (const m of cellRingMat) {
      const d = m.userData || { base: 0 };
      const want = d.base * (d.pulse ? 0.75 + Math.sin(t * 5) * 0.25 : 1);
      m.opacity += (want - m.opacity) * 0.2;
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();

  return {
    setState(s) { state = s; refresh(); },
    setInput(i) { input = i; refresh(); },
    onTray(fn) { handlers.tray = fn; },
    onCell(fn) { handlers.cell = fn; },
    setAutoRotate(on) {
      controls.autoRotate = on;
      if (on) {
        controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
      } else {
        controls.minAzimuthAngle = THREE.MathUtils.degToRad(-70); controls.maxAzimuthAngle = THREE.MathUtils.degToRad(70);
        userMoved = false;
        fitCamera(true);
      }
    },
    resetView() { userMoved = false; fitCamera(true); },
  };
}
