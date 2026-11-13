import test from 'node:test';
import assert from 'node:assert/strict';
import { heroQuips, quipConfig, QuipCycle } from '../src/survivors/hero-quips.ts';
import { Run } from '../src/survivors/run.ts';
import { STEP } from '../src/survivors/config.ts';

test('quip cycles shuffle all phrases and avoid repeats at the boundary', () => {
  const count = heroQuips.ru.length;
  assert.equal(count, heroQuips.en.length);
  let draws = 0;
  const deck = new QuipCycle(() => draws++ === count - 1 ? 0 : .999);
  const first = Array.from({ length: count }, () => deck.next());
  const second = Array.from({ length: count }, () => deck.next());
  assert.equal(new Set(first).size, count);
  assert.equal(new Set(second).size, count);
  assert.notEqual(first.at(-1), second[0]);
});

test('kill-triggered speech continues beyond several complete sets of phrases', () => {
  const run = new Run(() => .5); run.start();
  let previous = -1;
  const seen = new Set();
  for (let round = 0; round < heroQuips.ru.length * 3; round++) {
    run.ticks = Math.ceil(round * (quipConfig.cooldown + .1) / STEP);
    for (let i = 0; i < quipConfig.killsBetween; i++) {
      const index = run.spawn(0, run.x + 70, run.y);
      run.enemies.life[index] = 0;
    }
    run.collectKills();
    assert.notEqual(run.quip, previous);
    assert.ok(run.quip >= 0 && run.quip < heroQuips.ru.length);
    assert.ok(run.quipUntil > run.time);
    assert.ok(!seen.has(run.quip));
    seen.add(run.quip);
    if (seen.size === heroQuips.ru.length) seen.clear();
    previous = run.quip;
  }
});
