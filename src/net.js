import Peer from 'peerjs';

// PeerJS (WebRTC) による 1 対 1 通信。シグナリングのみ PeerJS 公開ブローカーを使い、
// 対局中のデータは端末同士で直接やり取りされる。
const PREFIX = 'quaruto-game-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];
if (import.meta.env.VITE_TURN_URL) {
  iceServers.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USER,
    credential: import.meta.env.VITE_TURN_PASS,
  });
}
const peerOptions = { config: { iceServers } };

export const normalizeCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

function wrap(peer, conn, ev) {
  let closed = false;
  const fire = (name, ...a) => { if (!closed) ev[name]?.(...a); };
  conn.on('open', () => fire('onOpen'));
  conn.on('data', (d) => { if (d && typeof d === 'object') fire('onMessage', d); });
  const end = () => { if (!closed) { fire('onClose'); closed = true; } };
  conn.on('close', end);
  conn.on('error', () => fire('onError', 'connection'));
  return {
    send: (m) => { if (conn.open) conn.send(m); },
    close: () => { closed = true; try { conn.close(); } catch {} peer.destroy(); },
  };
}

// ホスト: 部屋コードを発行して待ち受ける
export function hostRoom(ev) {
  let peer, link = null, destroyed = false, tries = 0;
  const start = () => {
    const code = randomCode();
    peer = new Peer(PREFIX + code, peerOptions);
    peer.on('open', () => ev.onCode(code));
    peer.on('connection', (conn) => {
      if (link) { conn.on('open', () => conn.close()); return; }
      link = wrap(peer, conn, ev);
    });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); start(); return; }
      if (!destroyed) ev.onError(e.type);
    });
    peer.on('disconnected', () => { if (!destroyed && !peer.destroyed) peer.reconnect(); });
  };
  start();
  return {
    send: (m) => link?.send(m),
    close: () => { destroyed = true; link?.close(); peer?.destroy(); },
  };
}

// ゲスト: コードで参加
export function joinRoom(code, ev) {
  const peer = new Peer(peerOptions);
  let link = null, destroyed = false;
  const timer = setTimeout(() => { if (!link && !destroyed) ev.onError('timeout'); }, 20000);
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, { reliable: true });
    link = wrap(peer, conn, { ...ev, onOpen: () => { clearTimeout(timer); ev.onOpen(); } });
  });
  peer.on('error', (e) => { clearTimeout(timer); if (!destroyed) ev.onError(e.type); });
  return {
    send: (m) => link?.send(m),
    close: () => { destroyed = true; clearTimeout(timer); peer.destroy(); },
  };
}
