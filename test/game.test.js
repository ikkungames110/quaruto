import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, selectPiece, placePiece, findWinningLine, available } from '../src/game.js';

const play = (s, moves) => moves.reduce((st, [kind, who, v]) => {
  const n = kind === 's' ? selectPiece(st, who, v) : placePiece(st, who, v);
  assert.ok(n, `invalid move ${kind} ${who} ${v}`);
  return n;
}, s);

test('turn order and validation', () => {
  let s = newGame(0);
  assert.equal(selectPiece(s, 1, 3), null);
  s = selectPiece(s, 0, 3);
  assert.equal(s.phase, 'place');
  assert.equal(s.turn, 1);
  assert.equal(placePiece(s, 0, 0), null);
  assert.equal(selectPiece(s, 1, 4), null);
  s = placePiece(s, 1, 0);
  assert.equal(s.phase, 'select');
  assert.equal(s.turn, 1);
  assert.equal(selectPiece(s, 1, 3), null); // 既に使用済み
  assert.equal(available(s).length, 15);
});

test('win by shared attribute (row)', () => {
  // 0,2,4,6 は bit0(低い)を共有、全て淡い色…ではなく bit0=0 が共通
  let s = newGame(0);
  s = play(s, [['s', 0, 0], ['p', 1, 0], ['s', 1, 2], ['p', 0, 1], ['s', 0, 4], ['p', 1, 2], ['s', 1, 6]]);
  assert.equal(s.phase, 'place');
  s = placePiece(s, 0, 3);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
  assert.deepEqual(s.line, [0, 1, 2, 3]);
});

test('shared absent attribute also wins; mixed does not', () => {
  const b = Array(16).fill(-1);
  [0b0111, 0b0101, 0b0011, 0b1001].forEach((p, i) => (b[i] = p)); // 全員 bit0=1
  assert.deepEqual(findWinningLine(b), [0, 1, 2, 3]);
  [0b0110, 0b0101, 0b0011, 0b1001].forEach((p, i) => (b[i] = p));
  assert.equal(findWinningLine(b), null);
  [0b0110, 0b0100, 0b0010, 0b1000].forEach((p, i) => (b[i] = p)); // 全員 bit0=0
  assert.deepEqual(findWinningLine(b), [0, 1, 2, 3]);
});

test('diagonal and draw', () => {
  const b = Array(16).fill(-1);
  [0, 2, 4, 6].forEach((p, i) => (b[[0, 5, 10, 15][i]] = p));
  assert.deepEqual(findWinningLine(b), [0, 5, 10, 15]);
});
