// 木の駒を盤に置いたときの「コトッ」という音 (WebAudio で合成)
let ctx = null;
let noise = null;

function ensure() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 最初のタッチで音を有効化 (スマホのautoplay制限対策)
addEventListener('pointerdown', ensure, { passive: true });

export function playClack(volume = 1, delayMs = 0) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delayMs / 1000;
  const out = c.createGain();
  out.gain.value = 0.9 * volume;
  out.connect(c.destination);

  // 衝撃のノイズ (木が当たる瞬間)
  const n = c.createBufferSource();
  n.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.9;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.8, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(bp).connect(ng).connect(out);
  n.start(t);

  // 木の胴鳴り: 低めの減衰する共鳴を2つ
  for (const [f0, f1, len, g] of [[420, 300, 0.12, 0.7], [880, 640, 0.07, 0.35]]) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const og = c.createGain();
    og.gain.setValueAtTime(g, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + len + 0.02);
  }
}
