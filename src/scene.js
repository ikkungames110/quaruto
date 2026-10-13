import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WOODS } from './wood.js';
import { buildPiece } from './pieces.js';
import { DARK } from './game.js';

const CELL = 1.5;
const BOARD_FLOOR = 0.25;      // 盤の穴の底
const TRAY_TOP = 0.28;
const MY_POS = new THREE.Vector3(0, 0.3, 5.0);      // 自分の駒置き場 (盤の下)
const OPP_POS = new THREE.Vector3(0, 0.3, -5.0);    // 相手の駒置き場 (盤の向こう側)
const GIVE_ZONE_Z = 4.3;                            // これより上 (盤の最下部あたり) で離すと相手に渡す
const SLOT_GAP = 1.3;                               // 残りの駒の間隔 (取りやすいよう広め)
const TRAY_Z = 7.0;                                 // 残りの駒 1列目の z
const TRAVEL_Y = 2.9;
const DRAG_Y = 1.4;

export const cellPos = (i) => new THREE.Vector3(((i % 4) - 1.5) * CELL, BOARD_FLOOR, (Math.floor(i / 4) - 1.5) * CELL);
// 残りの駒は盤の下に 6・6・4 個の3列
export const slotPos = (id) => {
  const row = Math.floor(id / 6), n = row < 2 ? 6 : 4;
  return new THREE.Vector3(((id % 6) - (n - 1) / 2) * SLOT_GAP, TRAY_TOP, TRAY_Z + row * SLOT_GAP);
};

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
  const target = new THREE.Vector3(0, 0.3, 2.2);
  const deg = THREE.MathUtils.degToRad;
  const GAME_POLAR = deg(30), GAME_AZ = 0;
  // ドラッグで動かせる範囲 (かなり狭め)
  const POLAR_MIN = deg(18), POLAR_MAX = deg(42), AZ_LIMIT = deg(20);
  const view = { polar: GAME_POLAR, az: GAME_AZ, dist: 30, auto: false, userPolar: GAME_POLAR, userAz: GAME_AZ };

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
  const tray = new THREE.Mesh(new THREE.BoxGeometry(6 * SLOT_GAP + 0.2, TRAY_TOP, 3 * SLOT_GAP + 0.2), trayMat);
  tray.position.set(0, TRAY_TOP / 2, TRAY_Z + SLOT_GAP);
  tray.castShadow = tray.receiveShadow = true;
  scene.add(tray);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1a0d05, transparent: true, opacity: 0.35 });
  for (let id = 0; id < 16; id++) {
    const m = new THREE.Mesh(trayRing, ringMat);
    const p = slotPos(id);
    m.position.set(p.x, TRAY_TOP + 0.003, p.z);
    scene.add(m);
  }
  // 駒置き場 (自分: 下 / 相手: 右上)
  const stationMat = woodMat(tex.oak, [0.6, 0.3]);
  for (const pos of [MY_POS, OPP_POS]) {
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, pos.y, 56), stationMat);
    pedestal.position.set(pos.x, pos.y / 2, pos.z);
    pedestal.castShadow = pedestal.receiveShadow = true;
    scene.add(pedestal);
  }

  // 離したときの置き先を縁取る白い枠
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const cellDisc = new THREE.Mesh(new THREE.RingGeometry(0.69, 0.79, 64).rotateX(-Math.PI / 2), whiteMat);
  cellDisc.visible = false;
  scene.add(cellDisc);
  const stationDisc = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.78, 64).rotateX(-Math.PI / 2), whiteMat);
  stationDisc.position.set(OPP_POS.x, OPP_POS.y + 0.01, OPP_POS.z);
  stationDisc.visible = false;
  scene.add(stationDisc);

  // ---- 机に書かれた案内文 (盤の上側、盤と同じ向き)
  const TEXT_W = 5.6, TEXT_H = 1.5;
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 1400; textCanvas.height = 375;
  const textTex = new THREE.CanvasTexture(textCanvas);
  textTex.colorSpace = THREE.SRGBColorSpace;
  textTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const textMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(TEXT_W, TEXT_H).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: textTex, transparent: true, roughness: 0.8, depthWrite: false, emissive: 0xffffff, emissiveMap: textTex, emissiveIntensity: 0.35 }),
  );
  textMesh.position.set(0, 0.005, -6.7);
  textMesh.receiveShadow = true;
  scene.add(textMesh);
  function drawText(title = '', sub = '') {
    const c = textCanvas.getContext('2d'), W = textCanvas.width, H = textCanvas.height;
    const font = getComputedStyle(document.body).fontFamily;
    c.clearRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f6ecd6';
    c.shadowColor = '#0008'; c.shadowBlur = 6;
    const fit = (text, size, y, weight) => {
      c.font = `${weight} ${size}px ${font}`;
      const w = c.measureText(text).width;
      if (w > W * 0.96) c.font = `${weight} ${Math.floor(size * W * 0.96 / w)}px ${font}`;
      c.fillText(text, W / 2, y);
    };
    if (sub) { fit(title, 130, H * 0.3, 800); fit(sub, 100, H * 0.75, 600); }
    else fit(title, 150, H / 2, 800);
    textTex.needsUpdate = true;
  }

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
  let state = null, handMine = true, hoverCell = -1, overZone = false, drag = null;
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
      else if (state.hand === id) { loc = handMine ? 'hand-me' : 'hand-opp'; pos = (handMine ? MY_POS : OPP_POS).clone(); }
      else { loc = 'tray'; pos = slotPos(id); }

      if (loc !== u.loc) {
        const from = u.pos.clone();
        if (u.loc === 'dropped') u.path = [pos];   // ドラッグで離した駒は持ち上げずにそのまま移動
        else u.path = [new THREE.Vector3(from.x, TRAVEL_Y, from.z), new THREE.Vector3(pos.x, TRAVEL_Y, pos.z), pos];
        u.loc = loc;
      } else if (u.path.length) {
        u.path[u.path.length - 1] = pos;
      } else {
        u.path = [pos];
      }
    }
    cellDisc.visible = hoverCell >= 0;
    if (hoverCell >= 0) cellDisc.position.set(cellPos(hoverCell).x, BOARD_FLOOR + 0.2, cellPos(hoverCell).z);
    stationDisc.visible = overZone;
    for (let i = 0; i < 16; i++) {
      cellRingMat[i].userData = { base: input.place && state.board[i] === -1 ? 0.28 : 0 };
    }
  }

  // ---- 入力 (駒のドラッグで操作)
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

  // 駒以外の場所をドラッグすると視点を回す
  let orbit = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (drag || orbit || !state || !e.isPrimary) return;
    ndc.set(((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth) * 2 - 1, -((e.clientY - canvas.getBoundingClientRect().top) / canvas.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(pieceRoots, true)) {
      let o = h.object;
      while (o && o.userData.id === undefined) o = o.parent;
      if (!o) continue;
      const mode = o.userData.loc === 'tray' && input.pick ? 'give' : o.userData.loc === 'hand-me' && input.place ? 'place' : null;
      if (!mode) break;
      drag = { piece: o, mode, id: e.pointerId, from: o.userData.pos.clone() };
      canvas.setPointerCapture(e.pointerId);
      o.userData.path = [];
      o.userData.target = o.userData.pos.clone().setY(DRAG_Y);
      return;
    }
    if (view.auto) return;
    orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }, true);
  canvas.addEventListener('pointermove', (e) => {
    if (orbit && e.pointerId === orbit.id) {
      const s = 2.4 / (canvas.clientHeight || window.innerHeight);
      view.userAz = THREE.MathUtils.clamp(view.userAz - (e.clientX - orbit.x) * s, GAME_AZ - AZ_LIMIT, GAME_AZ + AZ_LIMIT);
      view.userPolar = THREE.MathUtils.clamp(view.userPolar - (e.clientY - orbit.y) * s, POLAR_MIN, POLAR_MAX);
      orbit.x = e.clientX; orbit.y = e.clientY;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = aim(e);
    if (!p) return;
    drag.piece.userData.target.set(p.x, DRAG_Y, p.z);
    const c = drag.mode === 'place' ? cellAt(p) : -1;
    const z = inGiveZone(p);
    if (c !== hoverCell || z !== overZone) { hoverCell = c; overZone = z; refresh(); }
  });
  // 相手に渡す判定は広く (盤の最下部から上すべて)。タップだけで渡さないよう少し動かしたときだけ有効
  const inGiveZone = (p) => drag.mode === 'give' && p.z < GIVE_ZONE_Z && Math.hypot(p.x - drag.from.x, p.z - drag.from.z) > 0.8;

  function endDrag(e, cancel) {
    if (orbit && e.pointerId === orbit.id) { orbit = null; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const { piece, mode } = drag;
    const p = cancel ? null : aim(e);
    const give = p && inGiveZone(p);
    drag = null;
    hoverCell = -1;
    overZone = false;
    piece.userData.target = null;
    piece.userData.loc = 'dropped';   // refresh で元の位置への移動 (または新しい位置) を再計算させる
    if (p && mode === 'place') { const c = cellAt(p); if (c >= 0) handlers.cell(c); }
    else if (give) handlers.tray(piece.userData.id);
    refresh();
  }
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---- サイズ / カメラ位置
  const tmp = new THREE.Vector3();
  function placeCamera() {
    tmp.setFromSphericalCoords(view.dist, view.polar, view.az);
    camera.position.copy(target).add(tmp);
    camera.lookAt(target);
  }
  function fitCamera() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.dist = Math.max(17.2 / (2 * tanV), 10.6 / (2 * tanV * camera.aspect));
    placeCamera();
  }
  new ResizeObserver(fitCamera).observe(canvas);
  fitCamera();

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
      g.position.copy(u.pos);
      const glow = u === drag?.piece
        ? 0.22 + Math.sin(t * 5) * 0.08
        : win.has(u.id) ? 0.6 + Math.sin(t * 3) * 0.15 : 0;
      u.mat.emissiveIntensity += (glow - u.mat.emissiveIntensity) * 0.2;
    }
    for (const m of cellRingMat) {
      const d = m.userData || { base: 0 };
      m.opacity += (d.base - m.opacity) * 0.2;
    }
    const wantPolar = view.auto ? deg(48) : view.userPolar;
    const wantAz = view.auto ? t * 0.15 : view.userAz;
    view.polar += (wantPolar - view.polar) * 0.05;
    view.az = view.auto ? wantAz : view.az + (wantAz - view.az) * 0.05;
    placeCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();

  return {
    setState(s, mine = true) { state = s; handMine = mine; refresh(); },
    setInput(i) { input = i; refresh(); },
    onTray(fn) { handlers.tray = fn; },
    onCell(fn) { handlers.cell = fn; },
    setText(title, sub) { drawText(title, sub); },
    setAutoRotate(on) {
      view.auto = on;
      view.userPolar = GAME_POLAR; view.userAz = GAME_AZ;
      if (!on) view.az = Math.atan2(Math.sin(view.az), Math.cos(view.az));
    },
  };
}
