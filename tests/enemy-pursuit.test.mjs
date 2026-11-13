import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../src/survivors/run.ts';
import { Pool } from '../src/survivors/pool.ts';
import { officeLevel } from '../src/survivors/office-level.ts';

test('enemies pursue diagonally with both axes rather than grid waypoints', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  const x = run.x + 120, y = run.y + 80;
  const slot = run.spawn(2, x, y);
  run.step(0, 0);
  const dx = run.enemies.position[slot * 2] - x;
  const dy = run.enemies.position[slot * 2 + 1] - y;
  assert.ok(dx < 0 && dy < 0);
  assert.ok(Math.abs(dx / dy - 1.5) < .01);
});

test('visual facing reverses when the hero crosses sides, and stationary enemies keep it', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  const slot = run.spawn(2, run.x - 100, run.y);
  run.step(0, 0); assert.equal(run.enemies.facingLeft[slot], 0);
  run.x -= 200;
  run.step(0, 0); assert.equal(run.enemies.facingLeft[slot], 1);
  run.enemies.a[slot] = 0;
  run.step(0, 0); assert.equal(run.enemies.facingLeft[slot], 1);
});

test('envelopes damage enemies equally while facing left or right', () => {
  for (const side of [-1, 1]) {
    const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[0] = 1;
    const slot = run.spawn(2, run.x + 140 * side, run.y + 50);
    for (let i = 0; i < 45; i++) run.step(0, 0);
    assert.ok(run.enemies.life[slot] < 100, `missed enemy on side ${side}`);
  }
});

test('packed enemy facing survives growth and swap removal and resets on reuse', () => {
  const pool = new Pool(1, true);
  pool.add(0, 0, 0); pool.add(0, 1, 1); pool.facingLeft[1] = 1;
  pool.add(0, 2, 2); pool.facingLeft[2] = 1;
  pool.remove(0); assert.equal(pool.facingLeft[0], 1);
  pool.remove(1); pool.add(0, 3, 3); assert.equal(pool.facingLeft[1], 0);
});

test('an enemy blocked by a wall rests without alternating its facing', () => {
  const pit = officeLevel.ground.at(-1);
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  run.x = pit.x + 80; run.y = pit.y;
  const slot = run.spawn(2, pit.x - 43, pit.y);
  let restingX = 0, restingY = 0, facing = 0;
  for (let i = 0; i < 120; i++) {
    run.x = pit.x + 80 + Math.sin(i) * .1;
    run.step(0, 0);
    if (i === 30) {
      restingX = run.enemies.position[slot * 2]; restingY = run.enemies.position[slot * 2 + 1];
      facing = run.enemies.facingLeft[slot];
    }
    if (i > 30) {
      assert.equal(run.enemies.position[slot * 2], restingX);
      assert.equal(run.enemies.position[slot * 2 + 1], restingY);
      assert.equal(run.enemies.facingLeft[slot], facing);
    }
  }
});
