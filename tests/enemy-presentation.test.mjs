import assert from 'node:assert/strict';
import test from 'node:test';
import visuals from '../src/survivors/enemy-sprites.json' with { type: 'json' };
import { FINAL_BOSS_KIND, MINI_BOSS_KIND, enemies } from '../src/survivors/config.ts';
import { Pool } from '../src/survivors/pool.ts';
import { EnemyGrid } from '../src/survivors/grid.ts';

test('enemy storage and spatial index grow beyond their initial allocation without losing records', () => {
  const pool = new Pool(2, true);
  for (let i = 0; i < 2401; i++) assert.equal(pool.add(0, 100, 100, 0, 12, 10), i);
  assert.equal(pool.count, 2401);
  assert.ok(pool.capacity >= 2401);
  const grid = new EnemyGrid(() => {}); grid.clear();
  for (let i = 0; i < pool.count; i++) grid.insert(i, 100, 100);
  grid.hit(pool, 100, 100, 5, 1, true);
  for (let i = 0; i < pool.count; i++) assert.equal(pool.life[i], 9);
});

test('enemy appearance follows assigned numbers without changing boss gameplay kinds', () => {
  assert.equal(visuals.types.length, enemies.length);
  assert.deepEqual(visuals.types.map(type => type.number), [1, 2, 3, 4, 5, 7, 6]);
  assert.equal(visuals.types[MINI_BOSS_KIND].name, 'hooded-ninja');
  assert.equal(visuals.types[MINI_BOSS_KIND].sizeMultiplier, 1.25);
  assert.equal(visuals.types[FINAL_BOSS_KIND].name, 'boss');
  assert.equal(visuals.types[FINAL_BOSS_KIND].sizeMultiplier, 3);
});

test('packed-slot compaction keeps the surviving enemy animation phase', () => {
  const pool = new Pool(3);
  pool.add(0, 10, 10);
  pool.add(1, 20, 20);
  pool.add(2, 30, 30);
  const phase = pool.visualPhase[2];
  pool.remove(0);
  assert.equal(pool.count, 2);
  assert.equal(pool.kind[0], 2);
  assert.equal(pool.visualPhase[0], phase);
  pool.add(3, 40, 40);
  assert.notEqual(pool.visualPhase[2], phase);
});
