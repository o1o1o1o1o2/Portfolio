import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../src/survivors/run.ts';
import { PLAYER_SPEED, STEP, orbitConfig, enemies, zoneConfig, fallingStamp, areaDamage, auraConfig, auraRadius } from '../src/survivors/config.ts';
import { EnemyGrid } from '../src/survivors/grid.ts';
import { Pool } from '../src/survivors/pool.ts';
import { CrowdSeparation, crowdRadii } from '../src/survivors/crowd.ts';
import { officeLevel } from '../src/survivors/office-level.ts';

test('ground zones replace random pit and sealed-room points with reachable visible tiles', () => {
  const pits = new Set(officeLevel.ground.map(pit => pit.id));
  const targets = [
    ...officeLevel.rooms.filter(room => room.closed).map(room => [room.x + room.w / 2, room.y + room.h / 2]),
    ...officeLevel.colliders.filter(cell => cell.owners.some(id => pits.has(id)))
      .map(cell => [cell.x + cell.w / 2, cell.y + cell.h / 2]),
  ];
  assert.ok(targets.length > 9);
  for (const [x, y] of targets) {
    const run = new Run(() => .5); run.start(); run.levels.fill(0);
    run.levels[3] = 1;
    run.x = Math.max(200, Math.min(officeLevel.width - 200, x - 80));
    run.y = Math.max(200, Math.min(officeLevel.height - 200, y));
    assert.equal(run.navigation.reachable(x, y), false);
    const margin = run.zoneMaxRadius;
    const values = [(x - run.cameraX - margin) / (run.viewWidth - margin * 2),
      (y - run.cameraY - margin) / (run.viewHeight - margin * 2)];
    assert.ok(values.every(n => n >= 0 && n <= 1));
    let index = 0; run.random = () => values[index++ % 2];
    run.placeZone();
    assert.ok(run.zoneLife > 0);
    assert.ok(run.navigation.reachable(run.zoneX, run.zoneY));
  }
});

test('area attacks still fire at a random point if no reachable tile exists in the viewport', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  run.levels[3] = 1;
  run.navigation.reachable = () => false;
  run.attack();
  assert.ok(run.zoneLife > 0);
});

test('ground zone upgrades duration and damage but keeps one fixed larger radius', () => {
  const run = new Run(() => .5);
  run.levels[3] = 1;
  const baseDuration = run.zoneDuration, radius = run.zoneMaxRadius;
  assert.ok(radius > fallingStamp.radius);
  run.levels[3] = 5;
  assert.equal(run.zoneMaxRadius, radius);
  assert.equal(run.zoneDuration, baseDuration + zoneConfig.durationPerLevel * 4);
});

test('area weapons add twenty percent of base damage per level, with aura radius matching combat', () => {
  for (let level = 1; level <= 5; level++) {
    const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[2] = level;
    const target = run.spawn(2, run.x + 35, run.y);
    run.enemies.a[target] = 0;
    run.step(0, 0);
    assert.ok(Math.abs(enemies[2].hp - run.enemies.life[target] - areaDamage(auraConfig.damage, level)) < 1e-4);
    assert.equal(areaDamage(fallingStamp.damage, level), 25 + (level - 1) * 5);
    assert.ok(auraRadius(level) >= auraConfig.radius);
  }
});

test('each stamp level launches that many impacts and applies its scaled damage', () => {
  for (let level = 1; level <= 5; level++) {
    let seed = 7;
    const run = new Run(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
    run.start(); run.levels.fill(0); run.levels[5] = level;
    run.spawnWave = () => {};
    const target = run.spawn(2, run.x + 100, run.y);
    run.enemies.a[target] = 0;
    const hits = [];
    run.grid.hit = (...args) => { hits.push(args); return false; };
    const waitTicks = Math.round(fallingStamp.waitTime / STEP);
    for (let tick = 0; tick < waitTicks; tick++) run.step(0, 0);
    assert.equal(run.stampCount, 0);
    run.step(0, 0);
    assert.equal(run.stampCount, level);
    const launchTick = run.ticks;
    for (const impactTick of run.stampImpactTicks.subarray(0, level)) {
      assert.ok(impactTick >= launchTick + 30 && impactTick <= launchTick + 60);
    }
    if (level > 1) assert.ok(new Set(run.stampImpactTicks.subarray(0, level)).size > 1);
    for (let tick = 0; tick < 60; tick++) run.step(0, 0);
    assert.equal(hits.length, level);
    for (const args of hits) assert.equal(args[4], areaDamage(fallingStamp.damage, level));
    const nextLaunch = launchTick + Math.round((fallingStamp.waitTime + fallingStamp.fallTime) / STEP);
    while (run.ticks < nextLaunch - 1) run.step(0, 0);
    assert.equal(run.stampCount, 0);
    run.step(0, 0);
    assert.equal(run.stampCount, level);
  }
});

test('ninja fires five evenly spaced shots with two red and three blue in random order', () => {
  const orders = new Set();
  for (const random of [() => .1, () => .8]) {
    const run = new Run(random); run.start(); run.levels.fill(0);
    const i = run.spawn(6, run.x + 150, run.y);
    run.enemies.timer[i] = 0;
    run.step(0, 0);
    assert.equal(run.shots.count, 5);
    const kinds = Array.from(run.shots.kind.slice(0, 5));
    assert.equal(kinds.filter(kind => kind === 2).length, 2);
    assert.equal(kinds.filter(kind => kind === 1).length, 3);
    orders.add(kinds.join(','));
    const angles = Array.from({length:5}, (_, shot) => Math.atan2(
      run.shots.b[shot], run.shots.a[shot]));
    for (let shot = 1; shot < 5; shot++) {
      const delta = (angles[shot] - angles[shot - 1] + Math.PI * 2) % (Math.PI * 2);
      assert.ok(Math.abs(delta - Math.PI / 12) < 1e-5);
    }
  }
  assert.equal(orders.size, 2);
});

test('falling stamps use empty ground without enemies and keep impact circles apart', () => {
  let seed = 123;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const run = new Run(random); run.start(); run.levels.fill(0); run.levels[5] = 5;
  run.spawnWave = () => {};
  run.step(0, 0);
  run.ticks += Math.round(fallingStamp.waitTime / STEP) - 1;
  run.step(0, 0);
  assert.ok(run.stampCount > 0);
  for (let i = 0; i < run.stampCount; i++) {
    const x = run.stampPositions[i * 2], y = run.stampPositions[i * 2 + 1];
    assert.ok(x >= run.cameraX && x <= run.cameraX + run.viewWidth);
    assert.ok(y >= run.cameraY && y <= run.cameraY + run.viewHeight);
    for (let j = 0; j < i; j++) {
      assert.ok(Math.hypot(x - run.stampPositions[j * 2], y - run.stampPositions[j * 2 + 1]) >= fallingStamp.radius * 2);
    }
  }
});

test('nearby enemies do not receive overlapping stamps in the same volley', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[5] = 5;
  run.spawnWave = () => {};
  const first = run.spawn(2, run.x + 35, run.y);
  const second = run.spawn(2, run.x + 45, run.y);
  run.enemies.a[first] = run.enemies.a[second] = 0;
  run.step(0, 0);
  run.ticks += Math.round(fallingStamp.waitTime / STEP) - 1;
  run.step(0, 0);
  let targeted = 0;
  for (let i = 0; i < run.stampCount; i++) {
    for (const enemy of [first, second]) {
      if (Math.hypot(run.stampPositions[i * 2] - run.enemies.position[enemy * 2],
        run.stampPositions[i * 2 + 1] - run.enemies.position[enemy * 2 + 1]) < 1) targeted++;
    }
  }
  assert.equal(targeted, 1);
});

test('hits push ordinary enemies away, barely push mini-bosses and leave the final boss immune', () => {
  const pool = new Pool(3, true); const grid = new EnemyGrid(() => {}); grid.clear();
  for (const kind of [2, 6, 5]) {
    const slot = pool.add(kind, 100, 100, 0, 12, 100);
    grid.insert(slot, 100, 100);
  }
  grid.hit(pool, 90, 100, 20, 1, true);
  assert.equal(pool.knockbackX[0], 240);
  assert.equal(pool.knockbackX[1], 48);
  assert.equal(pool.knockbackX[2], 0);
  grid.hit(pool, 90, 100, 20, 1, true);
  assert.equal(pool.knockbackX[0], 240);
  pool.remove(2); pool.remove(1); pool.remove(0);
  pool.add(0, 0, 0);
  assert.equal(pool.knockbackX[0], 0);
});

test('knockback moves a surviving enemy backwards and then expires', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  const i = run.spawn(2, run.x + 150, run.y);
  run.enemies.knockbackX[i] = 240;
  const x = run.enemies.position[i * 2]; run.step(0, 0);
  assert.ok(run.enemies.position[i * 2] > x);
  for (let tick = 0; tick < 20; tick++) run.step(0, 0);
  assert.equal(run.enemies.knockbackX[i], 0);
});

test('the hero aura damages enemies without applying knockback', () => {
  const run = new Run(() => .5);
  run.start(); run.levels.fill(0); run.levels[2] = 1;
  const enemy = run.spawn(2, run.x + 40, run.y);
  run.step(0, 0);
  assert.ok(run.enemies.life[enemy] < enemies[2].hp);
  assert.equal(run.enemies.knockbackX[enemy], 0);
  assert.equal(run.enemies.knockbackY[enemy], 0);
});

test('floor zones emerge without falling, hold their radius, and shrink at the end', () => {
  const positions = [];
  for (const random of [() => .5, () => .55]) {
    const run = new Run(random);
    run.start(); run.levels.fill(0); run.levels[3] = 1;
    run.step(0, 0);
    assert.ok(run.zoneLife > 0);
    assert.equal(run.zoneRadius, 0);
    assert.ok(run.navigation.reachable(run.zoneX, run.zoneY));
    assert.ok(run.zoneX >= run.cameraX && run.zoneX <= run.cameraX + run.viewWidth);
    assert.ok(run.zoneY >= run.cameraY && run.zoneY <= run.cameraY + run.viewHeight);
    positions.push([run.zoneX, run.zoneY]);
    const enemy = run.spawn(2, run.zoneX + zoneConfig.radius / 2, run.zoneY);
    run.enemies.a[enemy] = 0;
    assert.equal(run.zoneRadius, 0);
    for (let tick = 0; tick < 30; tick++) run.step(0, 0);
    assert.equal(run.zoneRadius, zoneConfig.radius);
    assert.ok(run.enemies.life[enemy] < enemies[2].hp);
    assert.equal(run.enemies.knockbackX[enemy], 0);
    assert.equal(run.enemies.knockbackY[enemy], 0);
    run.zoneLife = zoneConfig.shrinkTime / 2;
    assert.ok(Math.abs(run.zoneRadius - zoneConfig.radius / 2) < 1e-6);
    run.zoneLife = 0;
    assert.equal(run.zoneRadius, 0);
  }
  assert.notDeepEqual(positions[0], positions[1]);
});

test('each envelope level adds one projectile', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[0] = level;
    run.spawn(2, run.x + 300, run.y); run.step(0, 0);
    assert.equal(run.shots.count, level);
  }
});

test('aimed weapons wait for a visible target and ignore closer off-screen enemies', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  run.levels[0] = 2; run.levels[4] = 1; run.viewWidth = 400; run.viewHeight = 160;
  run.spawnWave = () => {};
  const hidden = run.spawn(2, run.x, run.y - 110); run.enemies.a[hidden] = 0;
  run.step(0, 0);
  assert.equal(run.shots.count, 0);
  const visible = run.spawn(2, run.x + 170, run.y); run.enemies.a[visible] = 0;
  run.step(0, 0);
  assert.equal(run.shots.count, 3);
  for (let i = 0; i < run.shots.count; i++) {
    assert.ok(run.shots.a[i] > 0);
    assert.ok(Math.abs(run.shots.b[i]) < 40, 'aim right toward the visible enemy, not up toward the hidden one');
  }
});

test('choosing envelope upgrades changes every following volley while old shots finish their flight', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[0] = 1;
  run.spawnWave = () => {};
  const enemy = run.spawn(2, run.x + 240, run.y);
  run.enemies.a[enemy] = 0; run.enemies.life[enemy] = 10000;
  run.step(0, 0);
  assert.equal(run.shots.count, 1);
  for (const nextLevel of [2, 3]) {
    run.phase = 'upgrade'; run.pendingLevels = 1; run.choiceCount = 1; run.choices[0] = 0;
    run.choose(0);
    assert.equal(run.levels[0], nextLevel);
    assert.equal(run.phase, 'running');
    let volleys = 0;
    for (let tick = 0; tick < 200 && volleys < 3; tick++) {
      const headings = [];
      const add = run.shots.add;
      run.shots.add = function(kind, x, y, a, b, life, timer) {
        if (kind === 0) headings.push(Math.atan2(b, a));
        return add.call(this, kind, x, y, a, b, life, timer);
      };
      run.step(0, 0);
      run.shots.add = add;
      if (headings.length) {
        assert.equal(headings.length, nextLevel);
        assert.equal(new Set(headings).size, nextLevel);
        volleys++;
      }
    }
    assert.equal(volleys, 3);
  }
});

test('sneakers add twenty-five percent of base movement speed per level', () => {
  for (const level of [0, 1, 2]) {
    const run = new Run(() => .5); run.start(); run.levels[6] = level;
    const x = run.x; run.step(1, 0);
    assert.ok(Math.abs(run.x - x - PLAYER_SPEED * (1 + .25 * level) * STEP) < 1e-6);
  }
});

test('piercing envelope hits distinct enemies without damaging the same target twice', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[9] = 1;
  const a = run.spawn(2, run.x + 150, run.y);
  const b = run.spawn(2, run.x + 150, run.y);
  run.shots.add(0, run.x + 150, run.y, 0, 0, 1);
  run.step(0, 0); run.step(0, 0);
  assert.equal(run.enemies.life[a], enemies[2].hp - 11);
  assert.equal(run.enemies.life[b], enemies[2].hp - 11);
  assert.equal(run.shots.count, 0);
});

test('orbit checks contact each tick but throttles repeat hits on each enemy', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[1] = 1;
  const angle = STEP * orbitConfig.angularSpeed;
  const i = run.spawn(2, run.x + Math.cos(angle) * orbitConfig.radius,
    run.y + Math.sin(angle) * orbitConfig.radius);
  run.step(0, 0);
  assert.equal(run.enemies.life[i], enemies[2].hp - 6);
  run.step(0, 0);
  assert.equal(run.enemies.life[i], enemies[2].hp - 6);
});

test('contact at head height misses while contact at feet damages the hero', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  const i = run.spawn(0, run.x, run.y - 30); run.step(0, 0);
  assert.equal(run.mood, 100);
  run.enemies.position[i * 2 + 1] = run.y - 3; run.step(0, 0);
  assert.ok(run.mood < 100);
});

test('crowd separation breaks identical positions and respects the comparison toggle', () => {
  for (const enabled of [false, true]) {
    const run = new Run(() => .5, false, enabled);
    run.start();
    run.levels.fill(0);
    run.spawnWave = () => {};
    run.spawn(0, run.x + 55, run.y);
    run.spawn(0, run.x + 55, run.y);
    for (let tick = 0; tick < 20; tick++) run.step(0, 0);
    const [x1, y1, x2, y2] = run.enemies.position;
    const separation = Math.hypot(x1 - x2, y1 - y2);
    assert.ok(enabled ? separation > 10 : separation === 0);
  }
});

test('a pursuing enemy closes the gap and stops at a stationary enemy', () => {
  const run = new Run(() => .5);
  run.start();
  run.levels.fill(0);
  run.spawnWave = () => {};
  const front = run.spawn(0, run.x + 32, run.y);
  const back = run.spawn(0, run.x + 85, run.y);
  run.enemies.a[front] = 0;
  for (let tick = 0; tick < 120; tick++) run.step(0, 0);
  const gap = run.enemies.position[back * 2] - run.enemies.position[front * 2];
  const reach = crowdRadii[0] * 2;
  assert.ok(gap >= reach - .1 && gap < reach + 1, `gap: ${gap}`);
});

test('overlapping enemies across a cell boundary are resolved once', () => {
  const cell = officeLevel.floorGrid * 3;
  const pool = new Pool(2);
  const offset = crowdRadii[0] - 1;
  pool.add(0, cell - offset, cell, 0, 12, 10);
  pool.add(0, cell + offset, cell, 0, 12, 10);
  const crowd = new CrowdSeparation();
  crowd.solve(pool);
  assert.ok(Math.abs(crowd.offset(0) + 1) < .001);
  assert.ok(Math.abs(crowd.offset(2) - 1) < .001);
});

test('projectiles hit the visible body above the ground anchor on both sides', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0);
  run.spawnWave = () => {};
  const enemy = run.spawn(2, run.x + 100, run.y);
  run.enemies.a[enemy] = 0;
  run.shots.add(0, run.x + 100, run.y - 35, 0, 0, 1);
  run.shots.add(1, run.x + 14, run.y - 22, 0, 0, 1);
  run.step(0, 0);
  assert.ok(run.enemies.life[enemy] < enemies[2].hp);
  assert.ok(run.mood < 100);
  assert.equal(run.shots.count, 0);
});

test('final encounter clears other enemies and hostile projectiles without kill rewards', () => {
  const run = new Run(() => .5); run.start(); run.ticks = 300 / STEP - 1;
  run.spawn(0, run.x + 100, run.y); run.shots.add(1, run.x + 100, run.y, 0, 0, 4);
  for (let i = 0; i <= 48; i++) run.step(0, 0);
  assert.equal(run.enemies.count, 1);
  assert.equal(run.enemies.kind[0], 5);
  assert.equal(run.kills, 0);
  assert.equal(run.shots.kind.subarray(0, run.shots.count).includes(1), false);
});

test('folder keeps its launch heading after its target dies and returns only after full range', () => {
  const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[4] = 1;
  const origin = run.x;
  run.spawn(0, origin + 70, run.y);
  run.step(0, 0);
  assert.equal(run.shots.kind[0], 3);
  run.levels[4] = 0; // Observe this throw without launching another one.
  run.enemies.count = 0;
  for (let i = 0; i < 60; i++) run.step(0, 0);
  assert.ok(run.shots.position[0] > origin + 290);
  assert.ok(run.shots.a[0] > 0);
  for (let i = 0; i < 8; i++) run.step(0, 0);
  assert.ok(run.shots.a[0] < 0);
  for (let i = 0; i < 90; i++) run.step(0, 0);
  assert.equal(run.shots.count, 0);
});

test('each folder level adds one distinct outgoing folder', () => {
  for (let level = 1; level <= 5; level++) {
    const run = new Run(() => .5); run.start(); run.levels.fill(0); run.levels[4] = level;
    run.spawn(2, run.x + 200, run.y); run.step(0, 0);
    const headings=[];
    for(let i=0;i<run.shots.count;i++) if(run.shots.kind[i]===3) headings.push(Math.atan2(run.shots.b[i],run.shots.a[i]));
    assert.equal(headings.length,level);
    assert.equal(new Set(headings).size,level);
  }
});
