// Quarto のルール (純粋ロジック)
// 駒は 4bit: bit0=高い bit1=濃色 bit2=丸 bit3=穴あり
export const TALL = 1, DARK = 2, ROUND = 4, HOLLOW = 8;

export const LINES = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
];

export function describePiece(id) {
  return [
    id & TALL ? '高い' : '低い',
    id & DARK ? '濃い色' : '淡い色',
    id & ROUND ? '丸' : '四角',
    id & HOLLOW ? '穴あり' : '穴なし',
  ];
}

// phase: 'select'(turn のプレイヤーが相手に渡す駒を選ぶ) | 'place'(turn のプレイヤーが渡された駒を置く) | 'over'
// winner: -1 未決 / 0,1 勝者 / 2 引き分け
export function newGame(first = 0) {
  return { board: Array(16).fill(-1), hand: -1, phase: 'select', turn: first, winner: -1, line: null };
}

export function available(state) {
  return Array.from({ length: 16 }, (_, i) => i).filter(
    (i) => i !== state.hand && !state.board.includes(i),
  );
}

const isInt = (n, max) => Number.isInteger(n) && n >= 0 && n < max;

export function selectPiece(state, player, piece) {
  if (state.phase !== 'select' || state.turn !== player || !isInt(piece, 16)) return null;
  if (!available(state).includes(piece)) return null;
  return { ...state, board: state.board.slice(), hand: piece, phase: 'place', turn: 1 - player };
}

export function findWinningLine(board) {
  for (const line of LINES) {
    const ps = line.map((c) => board[c]);
    if (ps.some((p) => p < 0)) continue;
    const and = ps.reduce((a, b) => a & b, 15);
    const nor = ps.reduce((a, b) => a & ~b & 15, 15);
    if (and || nor) return line;
  }
  return null;
}

export function placePiece(state, player, cell) {
  if (state.phase !== 'place' || state.turn !== player || !isInt(cell, 16)) return null;
  if (state.board[cell] !== -1) return null;
  const board = state.board.slice();
  board[cell] = state.hand;
  const next = { ...state, board, hand: -1 };
  const line = findWinningLine(board);
  if (line) return { ...next, phase: 'over', winner: player, line };
  if (!board.includes(-1)) return { ...next, phase: 'over', winner: 2 };
  return { ...next, phase: 'select' };
}
