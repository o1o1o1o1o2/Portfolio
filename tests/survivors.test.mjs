import assert from 'node:assert/strict';
import test from 'node:test';
import { Run } from '../src/survivors/run.ts';
import { BOSS_TIME, FINAL_BOSS_KIND, MINI_BOSS_KIND, RUN_SECONDS, STEP, dropKind, upgrades, waves,
  enemies, bossConfig, INCOMING_DAMAGE_MULTIPLIER } from '../src/survivors/config.ts';

test('final incoming damage multiplier applies to contact, projectiles and boss lasers', () => {
  const contact = new Run(() => .5); contact.start();
  contact.spawn(0, contact.x + 2, contact.y); contact.step(0, 0);
  assert.equal(contact.mood, 100 - enemies[0].damage * INCOMING_DAMAGE_MULTIPLIER);
  const mood = contact.mood; contact.step(0, 0); assert.equal(contact.mood, mood);
  for (const [kind, damage] of [[1, 14], [2, 24]]) {
    const bullet = new Run(() => .5); bullet.start();
    bullet.shots.add(kind, bullet.x, bullet.y, 0, 0, 1); bullet.step(0, 0);
    assert.equal(bullet.mood, 100 - damage);
  }
  const laser = new Run(() => .5); laser.start();
  laser.spawn(FINAL_BOSS_KIND, laser.x + 150, laser.y);
  laser.boss.phase = 'attack'; laser.boss.attack = 'laser'; laser.boss.remaining = 1; laser.boss.angle = Math.PI;
  laser.step(0, 0);
  assert.equal(laser.mood, 100 - bossConfig.laserDamage * INCOMING_DAMAGE_MULTIPLIER);
});

test('enemy introductions follow the spread-out schedule and finish before four minutes', () => {
  for (const [kind, second] of [[1, 30], [2, 70], [3, 130], [4, 180], [MINI_BOSS_KIND, 210]]) {
    assert.equal(Math.min(...waves.filter(wave => wave.kinds.includes(kind)).map(wave => wave.start)), second);
  }
  for (const kind of [0, 1, 2, 3, 4, MINI_BOSS_KIND]) {
    assert.ok(Math.min(...waves.filter(wave => wave.kinds.includes(kind)).map(wave => wave.start)) <= 240);
  }
  assert.equal(BOSS_TIME, 300);
});

test('meme and coffee restore percentages of maximum mood and never exceed it', () => {
  for (const [kind, fraction] of [[dropKind.meme, .15], [dropKind.coffee, .25]]) {
    const run = new Run(() => .5);
    run.start();
    run.maxMood = 200;
    run.mood = 50;
    run.drops.add(kind, run.x, run.y);
    run.step(0, 0);
    assert.equal(run.mood, 50 + 200 * fraction);
    run.mood = 199;
    run.drops.add(kind, run.x, run.y);
    run.step(0, 0);
    assert.equal(run.mood, 200);
  }
});

test('boss rehearsal freezes the clock through seventeen choices, then runs the final waves', () => {
  const run = new Run(() => .5, true);
  run.start();
  assert.equal(run.level, 17);
  assert.equal(run.time, 270);
  for (let i = 0; i < 17; i++) {
    assert.equal(run.phase, 'upgrade');
    run.step(1, 1);
    assert.equal(run.time, 270);
    run.choose(0);
  }
  assert.equal(run.phase, 'running');
  run.invulnerable = 999;
  for (let i = 0; i < 10 / STEP; i++) run.step(0, 0);
  assert.ok(run.enemies.count > 0);
  assert.equal(run.bossSpawned, false);
  while (run.time < 301) {
    if (run.phase === 'upgrade') run.choose(0);
    else run.step(0, 0);
  }
  assert.equal(run.bossSpawned, true);
  assert.equal(run.enemies.count, 1);
});

test('automatic weapons fire while standing and a pause freezes simulation', () => {
  const run = new Run(() => .5);
  run.start();
  run.spawn(0, run.x + 100, run.y);
  run.step(0, 0);
  assert.ok(run.shots.kind.subarray(0, run.shots.count).includes(0));
  assert.equal(run.orbitCount, 0);
  run.pause();
  const ticks = run.ticks;
  const shot = run.shots.position[0];
  run.step(1, 0);
  assert.equal(run.ticks, ticks);
  assert.equal(run.shots.position[0], shot);
});

test('several pickups can queue several levels, each with three unique available choices', () => {
  const run = new Run(() => .5);
  run.start();
  for (let i = 0; i < 6; i++) run.drops.add(dropKind.goldXp, run.x, run.y);
  run.step(0, 0);
  assert.equal(run.level, 3);
  for (let i = 0; i < 2; i++) {
    assert.equal(run.phase, 'upgrade');
    assert.equal(new Set(run.choices).size, 3);
    for (const choice of run.choices) assert.ok(run.levels[choice] < upgrades[choice].max);
    const ticks = run.ticks;
    run.step(1, 0);
    assert.equal(run.ticks, ticks);
    run.choose(0);
  }
  assert.equal(run.phase, 'running');
});

test('remaining upgrades are still offered when fewer than three are available', () => {
  const run = new Run(() => .5);
  run.start();
  upgrades.forEach((upgrade, id) => { run.levels[id] = upgrade.max; });
  run.levels[6]--;
  run.drops.add(dropKind.goldXp, run.x, run.y);
  run.drops.add(dropKind.goldXp, run.x, run.y);
  run.step(0, 0);
  assert.equal(run.phase, 'upgrade');
  assert.equal(run.choiceCount, 1);
  assert.equal(run.choices[0], 6);
  run.choose(1);
  assert.equal(run.phase, 'upgrade');
  run.choose(0);
  assert.equal(run.levels[6], upgrades[6].max);
  assert.equal(run.phase, 'running');
});

test('resource storage grows instead of dropping rewards when its initial allocation is full', () => {
  const run = new Run(() => .5);
  const capacity = run.drops.capacity;
  for (let i = 0; i <= capacity; i++) assert.ok(run.drops.add(0, run.x, run.y, 1) >= 0);
  assert.equal(run.drops.count, capacity + 1);
  for (let i = 0; i < run.drops.count; i++) assert.equal(run.drops.a[i], 1);
});

test('late mini-bosses drop red XP and the final boss ends the run without a drop', () => {
  const run = new Run(() => .5);
  run.start();
  for (const second of [210, 240]) {
    run.ticks = second / STEP - 1;
    run.step(0, 0);
    const mini = run.enemies.kind.subarray(0, run.enemies.count).indexOf(MINI_BOSS_KIND);
    assert.ok(mini >= 0);
    assert.equal(run.bossSpawned, false);
    run.enemies.life[mini] = 0;
    run.step(0, 0);
    assert.equal(run.drops.kind[run.drops.count - 1], dropKind.redXp);
    assert.equal(run.drops.a[run.drops.count - 1], 100);
    assert.equal(run.phase, 'running');
  }
  run.ticks = BOSS_TIME / STEP - 1;
  for (let i = 0; i <= 48; i++) run.step(0, 0);
  assert.equal(run.bossSpawned, true);
  const boss = run.enemies.kind.subarray(0, run.enemies.count).indexOf(FINAL_BOSS_KIND);
  assert.ok(boss >= 0);
  assert.equal(run.phase, 'running');
  const drops = run.drops.count;
  run.enemies.position[boss * 2] = run.x + 100;
  run.enemies.position[boss * 2 + 1] = run.y;
  run.enemies.life[boss] = 0;
  run.step(0, 0);
  assert.equal(run.phase, 'running');
  assert.ok(run.victoryRemaining > 0);
  assert.ok(run.deaths.count > 0);
  const position = [run.x, run.y];
  while (run.victoryRemaining > 0) run.step(1, 1);
  assert.equal(run.phase, 'won');
  assert.deepEqual([run.x, run.y], position);
  assert.equal(run.drops.count, drops);
});

test('heavy enemies drop a gold gem worth 3 XP', () => {
  const run = new Run(() => .5);
  run.start();
  const heavy = run.spawn(2, run.x + 30, run.y);
  run.enemies.life[heavy] = 0;
  run.step(0, 0);
  assert.equal(run.drops.kind[0], dropKind.goldXp);
  assert.equal(run.drops.a[0], 5);
  for (let i = 0; i < 10; i++) run.step(0, 0);
  assert.equal(run.xp, 3);
  assert.equal(run.level, 1);
});

test('a complete scripted run resolves combat and upgrades without getting stuck', () => {
  let seed = 1;
  const run = new Run(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const priority = [0, 5, 2, 4, 3, 1, 6, 7, 8];
  run.start();
  for (let i = 0; i < 360 / STEP; i++) {
    if (run.phase === 'upgrade') {
      const choices = Array.from(run.choices);
      run.choose(choices.indexOf(priority.find(id => choices.includes(id))));
    } else if (run.phase === 'running') {
      const angle = run.time * .35;
      const moving = run.time % 12 > 3;
      run.step(moving ? Math.cos(angle) : 0, moving ? Math.sin(angle) : 0);
    } else break;
  }
  assert.ok(run.phase === 'lost' || run.phase === 'won');
  if (run.phase === 'lost') assert.equal(run.mood, 0);
  else assert.equal(run.bossDefeated, true);
  assert.ok(run.level > 1);
});
