import assert from 'node:assert/strict';
import test from 'node:test';
import { Run } from '../src/survivors/run.ts';
import { BossAttackSystem } from '../src/survivors/boss.ts';
import { STEP, FINAL_BOSS_KIND, MINI_BOSS_KIND, enemies, dropKind,
  bonusConfig, bossConfig, orbitConfig, deathEffectConfig } from '../src/survivors/config.ts';

function quietRun() {
  const run = new Run(() => .5);
  run.start(); run.levels.fill(0); run.invulnerable = 999;
  return run;
}

test('boss arena stays inside the world at its edge and keeps the hero and boss in view', () => {
  const run = quietRun();
  run.x = 6100;
  run.y = 4550;
  run.ticks = 300 / STEP - 1;
  run.navigation.move = () => assert.fail('arena must bypass obstacle collision');
  run.drops.add(dropKind.goldXp, 5900, 4500);
  run.drops.add(dropKind.coffee, 5900, 4400);
  const pickups = run.drops.position.slice(0, 4);
  run.step(0, 0);
  assert.equal(run.bossSpawned, false);
  const left = run.cameraX, top = run.cameraY;
  assert.equal(left + run.viewWidth, 6144);
  assert.equal(top + run.viewHeight, 4608);
  assert.equal(run.obstacleAlpha, 1);
  for (let i = 0; i < 30; i++) run.step(-1, -1);
  assert.equal(run.bossSpawned, false);
  assert.equal(run.obstacleAlpha, 0);
  assert.deepEqual([run.x, run.y], [6100, 4550]);
  for (let i = 0; i < 18; i++) run.step(-1, -1);
  assert.equal(run.bossSpawned, true);
  assert.deepEqual(run.drops.position.slice(0, 4), pickups);
  for (let i = 0; i < 100; i++) run.step(-1, -1);
  assert.equal(run.obstacleAlpha, 0);
  assert.equal(run.cameraX, left);
  assert.equal(run.cameraY, top);
  assert.ok(run.x > left && run.x < left + run.viewWidth);
  assert.ok(run.y > top && run.y < top + run.viewHeight);
  assert.ok(run.enemies.position[0] > left && run.enemies.position[0] < left + run.viewWidth);
  assert.ok(run.enemies.position[1] > top && run.enemies.position[1] < top + run.viewHeight);
});

test('generated pickups spawn beyond the viewport, including near world corners', () => {
  for (const position of [24, 3000, 6100]) {
    const run = new Run(() => .5);
    run.x = position; run.y = Math.min(position, 4580); run.start();
    for (let i = 0; i < 46 / STEP; i++) run.step(0, 0);
    let pickups = 0;
    for (let i = 0; i < run.drops.count; i++) {
      if (![dropKind.coffee, dropKind.meme, dropKind.bomb, dropKind.magnet].includes(run.drops.kind[i])) continue;
      pickups++;
      const x = run.drops.position[i * 2], y = run.drops.position[i * 2 + 1];
      assert.ok(x < run.cameraX || x > run.cameraX + run.viewWidth ||
        y < run.cameraY || y > run.cameraY + run.viewHeight);
      assert.ok(x >= 24 && x <= 6120 && y >= 24 && y <= 4584);
    }
    assert.ok(pickups >= 3);
  }
});

test('enemy spawn distance scales with the width of the game viewport', () => {
  for (const width of [640, 1000]) {
    const run = quietRun();
    run.viewWidth = width;
    const slot = run.spawnOutside(0);
    assert.ok(slot >= 0);
    const x = run.enemies.position[slot * 2], y = run.enemies.position[slot * 2 + 1];
    assert.ok(Math.abs(Math.hypot(x - run.x, y - run.y) - width * .75) < .001);
  }
});

test('mass rejection kills enemies inside the spawn radius, including beyond the viewport', () => {
  const run = quietRun();
  run.spawn(0, run.x + 90, run.y);
  run.spawn(0, run.x + run.viewWidth * .65, run.y);
  run.spawn(0, run.x + run.encounterRadius + 24, run.y);
  run.spawn(FINAL_BOSS_KIND, run.x + 200, run.y);
  run.spawn(MINI_BOSS_KIND, run.x + 250, run.y);
  run.bossSpawned = true;
  run.drops.add(dropKind.bomb, run.x, run.y);
  run.step(0, 0);
  assert.equal(run.kills, 2);
  assert.equal(run.enemies.count, 3);
  assert.equal(run.deaths.count, 1); // Only the visible kill needs a death effect.
  for (const kind of [FINAL_BOSS_KIND, MINI_BOSS_KIND]) {
    const slot = run.enemies.kind.subarray(0, run.enemies.count).indexOf(kind);
    assert.equal(run.enemies.life[slot], enemies[kind].hp * (1 - bonusConfig.bossDamageFraction));
  }
  for (let i = 0; i < Math.ceil(deathEffectConfig.seconds / STEP) + 2; i++) run.step(0, 0);
  assert.equal(run.deaths.count, 0);
});

test('resume collector accelerates all three distant crystal types and leaves other bonuses in place', () => {
  const run = quietRun();
  run.mood = 50;
  run.drops.add(dropKind.xp, run.x + 1100, run.y, 1);
  run.drops.add(dropKind.goldXp, run.x + 1150, run.y, 1);
  run.drops.add(dropKind.redXp, run.x + 1200, run.y, 1);
  const other = [dropKind.coffee, dropKind.meme, dropKind.bomb, dropKind.magnet];
  for (const kind of other) run.drops.add(kind, run.x - 900, run.y);
  run.drops.add(dropKind.magnet, run.x, run.y);
  run.step(0, 0);
  assert.equal(run.xp, 0);
  assert.equal(run.drops.timer[0], 1);
  const initialSpeed = run.drops.b[0], initialX = run.drops.position[0];
  run.step(0, 0);
  assert.ok(run.drops.b[0] > initialSpeed);
  assert.ok(run.drops.position[0] < initialX);
  run.pause(); const pausedX = run.drops.position[0]; run.step(0, 0);
  assert.equal(run.drops.position[0], pausedX);
  run.start();
  for (let i = 0; i < 180 && run.drops.count > other.length; i++) run.step(0, 0);
  assert.deepEqual([...run.drops.kind.subarray(0, run.drops.count)].sort(), other);
  for (let i = 0; i < run.drops.count; i++) assert.equal(run.drops.position[i * 2], run.x - 900);
  assert.equal(run.level, 5);
  assert.equal(run.xp, 4);
  assert.equal(run.mood, 50);
});

test('orbit upgrades produce two, four and eight equally spaced stamps', () => {
  const run = quietRun();
  for (const level of [1, 2, 3]) {
    run.levels[1] = level;
    run.step(0, 0);
    const count = orbitConfig.counts[level];
    assert.equal(run.orbitCount, count);
    for (let i = 0; i < count; i++) {
      const dx = run.orbitX[i] - run.x, dy = run.orbitY[i] - run.y;
      assert.ok(Math.abs(Math.hypot(dx, dy) - orbitConfig.radius) < .001);
      const next = (i + 1) % count;
      const angle = Math.atan2(run.orbitY[next] - run.y, run.orbitX[next] - run.x) - Math.atan2(dy, dx);
      assert.ok(Math.abs((angle + Math.PI * 2) % (Math.PI * 2) - Math.PI * 2 / count) < .001);
    }
  }
});

test('boss ring contains equal-speed, equally spaced shots', () => {
  const boss = new BossAttackSystem(); const shots = [];
  boss.phase = 'windup'; boss.attack = 'ring'; boss.remaining = STEP;
  boss.step(0, 0, 100, 0, (x, y, vx, vy) => shots.push([vx, vy]));
  assert.equal(shots.length, bossConfig.ringCount);
  for (let i = 0; i < shots.length; i++) {
    const [vx, vy] = shots[i];
    assert.ok(Math.abs(Math.hypot(vx, vy) - bossConfig.ringSpeed) < 1e-8);
    assert.ok(Math.abs(vx - Math.cos(i * Math.PI * 2 / shots.length) * bossConfig.ringSpeed) < 1e-8);
  }
});

test('three rotating lasers deal damage only after warning and leave gaps', () => {
  const boss = new BossAttackSystem();
  boss.attack = 'laser'; boss.phase = 'windup'; boss.angle = 0;
  assert.equal(boss.laserHits(100, 0), false);
  boss.phase = 'attack'; boss.remaining = 1;
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    assert.equal(boss.laserHits(Math.cos(angle) * 150, Math.sin(angle) * 150), true);
  }
  assert.equal(boss.laserHits(150 * Math.cos(Math.PI / 3), 150 * Math.sin(Math.PI / 3)), false);
  boss.step(0, 0, 0, 200, () => {});
  assert.equal(boss.angle, bossConfig.laserAngularSpeed * STEP);
});

test('dash direction stays locked after the warning even if the player changes side', () => {
  const boss = new BossAttackSystem();
  boss.attack = 'dash'; boss.phase = 'windup'; boss.angle = 0; boss.remaining = STEP;
  boss.step(0, 0, -200, 0, () => {});
  assert.ok(boss.velocityX > 0);
  assert.equal(boss.velocityY, 0);
  let distance = boss.velocityX * STEP;
  const initialSpeed = boss.velocityX;
  for (let i = 1; i < Math.round(bossConfig.dashSeconds / STEP); i++) {
    boss.step(0, 0, -200, 0, () => {});
    distance += boss.velocityX * STEP;
  }
  assert.ok(boss.velocityX < initialSpeed / 10);
  assert.ok(Math.abs(distance - 363) < .001);
});

test('boss dash bounces from the arena corner and continues inward', () => {
  const run = quietRun();
  run.openBossArena();
  run.spawnBoss();
  const p = run.enemies.position;
  p[0] = run.cameraX + run.viewWidth - 25;
  p[1] = run.cameraY + run.viewHeight - 25;
  run.boss.phase = 'windup';
  run.boss.attack = 'dash';
  run.boss.remaining = STEP;
  run.boss.angle = Math.PI / 4;
  run.step(0, 0);
  assert.ok(Math.cos(run.boss.angle) < 0 && Math.sin(run.boss.angle) < 0);
  const [x, y] = p;
  run.step(0, 0);
  assert.ok(p[0] < x && p[1] < y);
});

test('boss dash can reach and damage the hero in the lower arena corner', () => {
  const run = quietRun();
  run.openBossArena();
  run.spawnBoss();
  run.invulnerable = 0;
  run.x = run.cameraX + run.viewWidth - 24;
  run.y = run.cameraY + run.viewHeight - 24;
  const p = run.enemies.position;
  p[0] = run.x - 100;
  p[1] = run.y - 100;
  run.boss.phase = 'windup';
  run.boss.attack = 'dash';
  run.boss.remaining = STEP;
  run.boss.angle = Math.PI / 4;
  for (let i = 0; i < 35; i++) run.step(0, 0);
  assert.equal(run.mood, 60);
});

test('magnet queues upgrades until all collected resources arrive', () => {
  const run = new Run(() => .5);
  run.start();
  run.drops.add(dropKind.redXp, run.x, run.y);
  run.drops.add(dropKind.redXp, run.x + 1100, run.y);
  run.drops.add(dropKind.magnet, run.x, run.y);
  run.step(0, 0);
  assert.ok(run.level > 1);
  assert.equal(run.phase, 'running');
  for (let i = 0; i < 180 && run.phase === 'running'; i++) run.step(0, 0);
  assert.equal(run.phase, 'upgrade');
  assert.equal(run.drops.count, 0);
  const earned = run.level - 1;
  let choices = 0;
  while (run.phase === 'upgrade' && choices < 50) { run.choose(0); choices++; }
  assert.equal(choices, earned);
  assert.equal(run.phase, 'running');
});
