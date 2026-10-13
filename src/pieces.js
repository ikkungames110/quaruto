import * as THREE from 'three';
import { TALL, DARK, ROUND, HOLLOW } from './game.js';

export const SQUARE_W = 0.88;
export const ROUND_R = 0.46;
export const H_TALL = 1.7;
export const H_SHORT = 0.95;
const HOLE_R = 0.27;
const HOLE_D = 0.32;
const BEVEL = 0.04;

function roundedRect(w, r) {
  const h = w / 2, s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h); s.absarc(h - r, -h + r, r, -Math.PI / 2, 0);
  s.lineTo(h, h - r); s.absarc(h - r, h - r, r, 0, Math.PI / 2);
  s.lineTo(-h + r, h); s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(-h, -h + r); s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

// 押し出し形状 (z方向) を Y 上向きに変換し、底面を y=0 に合わせる
function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - 2 * bevel, 0.001),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3,
    curveSegments: 32,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  // UV をワールド寸法ベースにして木目が均一に見えるようにする
  return g;
}

function roundGeometry(h, hollow) {
  const R = ROUND_R, b = BEVEL;
  const pts = [[0, 0], [R - b, 0], [R, b], [R, h - b], [R - b, h]];
  if (hollow) {
    pts.push([HOLE_R + b, h], [HOLE_R, h - b], [HOLE_R, h - HOLE_D], [0, h - HOLE_D]);
  } else {
    pts.push([0, h]);
  }
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 56);
}

export function buildPiece(id, material) {
  const tall = !!(id & TALL), round = !!(id & ROUND), hollow = !!(id & HOLLOW);
  const h = tall ? H_TALL : H_SHORT;
  const group = new THREE.Group();
  const add = (geo) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  if (round) {
    add(roundGeometry(h, hollow));
  } else if (!hollow) {
    add(extrude(roundedRect(SQUARE_W - 2 * BEVEL, 0.07 - BEVEL * 0.5), h, BEVEL));
  } else {
    // 下半分は面取りなしの角柱、上のリング部だけ面取り (継ぎ目の溝を避ける)
    const floorY = h - HOLE_D;
    const lower = extrude(roundedRect(SQUARE_W, 0.07 + BEVEL * 0.5), floorY, 0);
    add(lower);
    const ring = roundedRect(SQUARE_W - 2 * BEVEL, 0.07 - BEVEL * 0.5);
    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE_R + BEVEL, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    const g = extrude(ring, HOLE_D + BEVEL, BEVEL);
    g.translate(0, floorY - BEVEL, 0);
    add(g);
  }
  group.userData.height = h;
  group.userData.dark = !!(id & DARK);
  return group;
}
