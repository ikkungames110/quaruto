import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 木目をキャンバスで手続き的に描く (横方向にタイル可能)
export function woodTexture({ base, grain, seed = 1, rings = 46, size = 512 }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 大きな色ムラ
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(${grain},${0.03 + r() * 0.05})`;
    ctx.lineWidth = 20 + r() * 50;
    const y = r() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (r() - 0.5) * 30);
    ctx.stroke();
  }
  // 年輪
  for (let i = 0; i < rings; i++) {
    const y0 = r() * size, a1 = 2 + r() * 7, a2 = 1 + r() * 3;
    const k1 = 1 + Math.floor(r() * 2), k2 = 2 + Math.floor(r() * 3);
    const p1 = r() * 6.28, p2 = r() * 6.28;
    ctx.strokeStyle = `rgba(${grain},${0.06 + r() * 0.2})`;
    ctx.lineWidth = 0.5 + r() * 2.2;
    for (const off of [-size, 0, size]) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 6) {
        const y = y0 + off + a1 * Math.sin((6.283 * k1 * x) / size + p1) + a2 * Math.sin((6.283 * k2 * x) / size + p2);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  // 細かい繊維
  for (let i = 0; i < 1400; i++) {
    const x = r() * size, y = r() * size, len = 20 + r() * 140;
    ctx.strokeStyle = r() < 0.5 ? `rgba(${grain},${0.04 + r() * 0.07})` : `rgba(255,240,215,${0.02 + r() * 0.05})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (r() - 0.5) * 3);
    ctx.stroke();
  }
  // 微細ノイズ
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 12;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export const WOODS = {
  maple: () => woodTexture({ base: '#e9cf9f', grain: '150,98,45', seed: 11 }),
  walnut: () => woodTexture({ base: '#5c3a22', grain: '20,8,2', seed: 23, rings: 60 }),
  oak: () => woodTexture({ base: '#b98650', grain: '85,48,20', seed: 37 }),
  cherry: () => woodTexture({ base: '#8a4b2c', grain: '45,18,8', seed: 41 }),
  table: () => woodTexture({ base: '#3b2616', grain: '10,4,0', seed: 53, rings: 70 }),
};
