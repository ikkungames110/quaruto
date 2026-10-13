import { createScene } from './scene.js';
import { newGame, selectPiece, placePiece } from './game.js';
import { playClack } from './audio.js';
import { hostRoom, joinRoom, normalizeCode } from './net.js';

const $ = (id) => document.getElementById(id);
const scene = createScene($('gl'));

// ---- 状態
let mode = 'menu';           // 'menu' | 'online' | 'local'
let net = null;
let me = 0;                  // オンライン時の自分のプレイヤー番号 (ホスト=0, ゲスト=1)
let state = newGame(0);
let firstPlayer = 0;
let undoInfo = null;         // 直前に自分が置いた駒を戻すための情報 { state, player }
let rematch = { me: false, them: false };
let resultTimer = null;

// ---- 画面切り替え
const panels = ['p-title', 'p-host', 'p-join', 'p-result', 'p-error'];
function showPanel(id) {
  $('menu').hidden = !id;
  for (const p of panels) $(p).hidden = p !== id;
}
function showMenu() {
  clearTimeout(resultTimer);
  net?.close(); net = null;
  mode = 'menu';
  $('hud').hidden = true;
  state = demoState();
  undoInfo = null;
  sync(); scene.setInput({ pick: false, place: false });
  scene.setAutoRotate(true);
  showPanel('p-title');
}
function demoState() {
  const s = newGame(0);
  const ids = [...Array(16).keys()].sort(() => Math.random() - 0.5);
  const cells = [...Array(16).keys()].sort(() => Math.random() - 0.5).slice(0, 6);
  cells.forEach((c, i) => (s.board[c] = ids[i]));
  s.hand = ids[6]; s.phase = 'place';
  return s;
}
function showError(title, sub) {
  net?.close(); net = null;
  clearTimeout(resultTimer);
  $('error-title').textContent = title;
  $('error-sub').textContent = sub;
  showPanel('p-error');
}

// ---- 対局
function startGame(first) {
  clearTimeout(resultTimer);
  firstPlayer = first;
  state = newGame(first);
  undoInfo = null;
  rematch = { me: false, them: false };
  $('btn-again').disabled = false;
  $('btn-again').textContent = 'もう一度あそぶ';
  scene.setAutoRotate(false);
  sync();
  showPanel(null);
  $('hud').hidden = false;
  render();
}

const sync = () => scene.setState(state, mode !== 'online' || state.turn === me);
const actor = () => (mode === 'local' ? state.turn : me);
const myTurn = () => state.phase !== 'over' && (mode === 'local' || state.turn === me);
const who = (p) => (mode === 'local' ? `プレイヤー${p + 1}` : p === me ? 'あなた' : '相手');

function apply(player, action, remote = false) {
  const prev = state;
  const next = action.t === 'select' ? selectPiece(state, player, action.piece) : placePiece(state, player, action.cell);
  if (!next) return false;
  state = next;
  undoInfo = action.t === 'place' && state.phase === 'select' ? { state: prev, player } : null;
  playClack(action.t === 'place' ? 1 : 0.6, remote ? 450 : 0);
  sync();
  render();
  if (state.phase === 'over') resultTimer = setTimeout(showResult, 2200);
  return true;
}

function undo(player) {
  if (!undoInfo || undoInfo.player !== player || state.turn !== player || state.phase !== 'select') return false;
  state = undoInfo.state;
  undoInfo = null;
  sync();
  render();
  return true;
}

function send(action) {
  const player = actor();
  if (!apply(player, action)) return;
  if (mode === 'online') net.send(action);
}

function render() {
  const mine = myTurn();
  const s = $('status');
  s.classList.toggle('mine', mine);
  let text;
  if (state.phase === 'over') text = state.winner === 2 ? '引き分け' : mode === 'local' ? `${who(state.winner)}の勝ち！` : state.winner === me ? 'あなたの勝ち！' : '相手の勝ち';
  else if (mode === 'local') text = state.phase === 'select'
    ? `${who(state.turn)}：渡す駒を相手の台へドラッグしてください`
    : `${who(state.turn)}：渡された駒をドラッグして盤に置いてください`;
  else if (state.phase === 'select') text = mine ? '駒を相手の台へドラッグして渡してください' : '相手が駒を選んでいます…';
  else text = mine ? '渡された駒をドラッグして盤に置いてください' : '相手が置く場所を考えています…';
  s.textContent = text;

  scene.setInput({ pick: mine && state.phase === 'select', place: mine && state.phase === 'place' });
  
  $('btn-undo').disabled = !(undoInfo && undoInfo.player === actor() && state.turn === actor() && state.phase === 'select');
  $('btn-confirm').hidden = state.phase !== 'over';
}

function showResult() {
  if (state.phase !== 'over') return;
  const draw = state.winner === 2;
  let title, sub;
  if (draw) { title = '引き分け'; sub = '全てのマスが埋まりました。いい勝負でした。'; }
  else if (mode === 'local') { title = `${who(state.winner)}の勝ち！`; sub = '共通の特徴がそろいました。'; }
  else if (state.winner === me) { title = 'あなたの勝ち！'; sub = '共通の特徴がそろいました。'; }
  else { title = '相手の勝ち'; sub = '相手の列がそろいました。次は負けません。'; }
  $('result-title').textContent = title;
  $('result-sub').textContent = sub;
  showPanel('p-result');
}

scene.onTray((id) => {
  if (myTurn() && state.phase === 'select') send({ t: 'select', piece: id });
});
scene.onCell((cell) => {
  if (myTurn() && state.phase === 'place' && state.board[cell] === -1) send({ t: 'place', cell });
});
$('btn-confirm').onclick = showResult;
$('btn-undo').onclick = () => {
  if (undo(actor()) && mode === 'online') net.send({ t: 'undo' });
};

// ---- オンライン
function onlineEvents(extra) {
  return {
    onMessage(m) {
      if (m.t === 'start' && mode === 'online' && me === 1 && (m.first === 0 || m.first === 1)) startGame(m.first);
      else if ((m.t === 'select' || m.t === 'place') && mode === 'online') apply(1 - me, m, true);
      else if (m.t === 'undo' && mode === 'online') undo(1 - me);
      else if (m.t === 'rematch' && mode === 'online') {
        rematch.them = true;
        if ($('p-result').hidden === false) $('result-sub').textContent = '相手がもう一度あそびたがっています。';
        maybeRestart();
      }
    },
    onClose() {
      if (mode === 'online') showError('接続が切れました', '相手との通信が終了しました。');
    },
    onError(type) {
      const map = {
        'peer-unavailable': ['部屋が見つかりません', 'コードをもう一度確認してください。'],
        timeout: ['つながりませんでした', 'ネットワーク環境により接続できない場合があります。Wi-Fi を切り替えて再度お試しください。'],
        network: ['ネットワークエラー', '接続サーバーに到達できません。通信環境を確認してください。'],
      };
      const [t, s] = map[type] || ['接続エラー', `通信に失敗しました (${type})`];
      showError(t, s);
    },
    ...extra,
  };
}

function maybeRestart() {
  if (mode === 'online' && me === 0 && rematch.me && rematch.them) {
    const first = 1 - firstPlayer;
    net.send({ t: 'start', first });
    startGame(first);
  }
}

$('btn-create').onclick = () => {
  mode = 'online'; me = 0;
  $('room-code').textContent = '·····';
  $('room-link').value = '';
  $('host-note').textContent = '部屋を準備中…';
  $('host-note').classList.remove('err');
  showPanel('p-host');
  net = hostRoom(onlineEvents({
    onCode(code) {
      const url = new URL(location.href);
      url.search = `?room=${code}`; url.hash = '';
      $('room-code').textContent = code;
      $('room-link').value = url.toString();
      $('host-note').textContent = '相手の参加をまっています…';
    },
    onOpen() {
      const first = Math.random() < 0.5 ? 0 : 1;
      net.send({ t: 'start', first });
      startGame(first);
    },
  }));
};

$('btn-share').onclick = async () => {
  const url = $('room-link').value;
  if (!url) return;
  const text = `Quarto で対戦しよう！ コード: ${$('room-code').textContent}`;
  try {
    if (navigator.share) await navigator.share({ title: 'QUARTO', text, url });
    else { await navigator.clipboard.writeText(url); $('host-note').textContent = 'リンクをコピーしました'; }
  } catch {
    $('room-link').select();
    $('host-note').textContent = 'リンクを長押ししてコピーしてください';
  }
};

function joinWith(code) {
  code = normalizeCode(code);
  const note = $('join-note');
  if (code.length !== 5) { note.textContent = '5文字のコードを入力してください'; note.classList.add('err'); return; }
  mode = 'online'; me = 1;
  note.classList.remove('err');
  note.textContent = '接続中…';
  net?.close();
  net = joinRoom(code, onlineEvents({ onOpen() { note.textContent = '接続しました。開始をまっています…'; } }));
}
$('btn-join').onclick = () => { $('join-note').textContent = ''; showPanel('p-join'); $('join-code').focus(); };
$('btn-join-go').onclick = () => joinWith($('join-code').value);
$('join-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinWith(e.target.value); });

$('btn-local').onclick = () => { mode = 'local'; startGame(Math.random() < 0.5 ? 0 : 1); };

$('btn-again').onclick = () => {
  if (mode === 'local') return startGame(1 - firstPlayer);
  rematch.me = true;
  net.send({ t: 'rematch' });
  $('btn-again').disabled = true;
  $('btn-again').textContent = '相手の返事をまっています…';
  maybeRestart();
};
$('btn-look').onclick = () => showPanel(null);

// ---- 共通ボタン
document.querySelectorAll('.back').forEach((b) => (b.onclick = showMenu));
$('btn-menu').onclick = showMenu;
$('btn-error-ok').onclick = showMenu;
$('btn-quit').onclick = () => { if (state.phase === 'over' || confirm('対局を終了してメニューに戻りますか？')) showMenu(); };
const openRules = () => ($('rules').hidden = false);
$('btn-help').onclick = openRules;
$('btn-rules').onclick = openRules;
$('btn-rules-close').onclick = () => ($('rules').hidden = true);

// ---- 起動
showMenu();
const room = new URLSearchParams(location.search).get('room');
if (room) {
  $('join-code').value = normalizeCode(room);
  showPanel('p-join');
  history.replaceState(null, '', location.pathname);
}
