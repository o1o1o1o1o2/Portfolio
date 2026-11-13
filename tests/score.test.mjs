import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../src/survivors/run.ts';
import { enemies, BOSS_TIME, STEP, dropKind } from '../src/survivors/config.ts';

test('every enemy awards its score exactly once, including the final boss', () => {
  const run = new Run(() => .5); run.start();
  let expected = 0;
  for (let kind = 0; kind < enemies.length; kind++) {
    const index = run.spawn(kind, run.x + 100, run.y);
    run.enemies.life[index] = 0;
    run.collectKills();
    expected += enemies[kind].score;
    assert.equal(run.score, expected);
    run.collectKills();
    assert.equal(run.score, expected);
  }
  assert.equal(run.score, 1530);
});

test('enemies cleared for the boss encounter do not award unearned points', () => {
  const run = new Run(() => .5); run.start();
  run.spawn(0, run.x + 200, run.y);
  run.spawn(4, run.x + 250, run.y);
  run.ticks = BOSS_TIME / STEP - 1;
  for (let i = 0; i <= 48; i++) run.step(0, 0);
  assert.ok(run.bossSpawned);
  assert.equal(run.score, 0);
});

test('earned score survives losing and a new run starts at zero', () => {
  const run = new Run(() => .5); run.start();
  const i = run.spawn(0, run.x + 100, run.y); run.enemies.life[i] = 0;
  run.collectKills(); run.mood = 0; run.step(0, 0);
  assert.equal(run.phase, 'lost');
  assert.equal(run.score, 10);
  assert.equal(new Run().score, 0);
});

test('crystals award points once on arrival, independently from XP and attraction', () => {
  const run = new Run(() => .5); run.start();
  for (const [kind, points, xp] of [[dropKind.xp, 10, 1], [dropKind.goldXp, 100, 5], [dropKind.redXp, 1000, 100]]) {
    const score = run.score;
    const index = run.drops.add(kind, run.x + 200, run.y, xp);
    run.drops.timer[index] = 1;
    run.collectDrops();
    assert.equal(run.score, score, 'no points until the flying crystal arrives');
    run.drops.position[index * 2] = run.x;
    run.drops.position[index * 2 + 1] = run.y;
    run.collectDrops();
    assert.equal(run.score, score + points);
    run.collectDrops();
    assert.equal(run.score, score + points, 'no duplicate award');
  }
  assert.equal(run.score, 1110);
});
