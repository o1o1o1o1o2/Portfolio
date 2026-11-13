import {
  PAID_LEAVE_MOOD_GAIN, UPGRADE_INVULNERABILITY_SECONDS,
  BOSS_TIME, FINAL_BOSS_KIND, STEP, VIEW_WIDTH, VIEW_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT,
  MAX_DROPS, MAX_ENEMIES, MAX_SHOTS, PLAYER_SPEED,
  dropKind, crystalScore, enemies, healingPickups, upgrades, waves, bonusConfig, orbitConfig,
  bossConfig, deathEffectConfig, MINI_BOSS_KIND, INCOMING_DAMAGE_MULTIPLIER, crystalXp,
  PLAYER_SPEED_PER_LEVEL, heroCollision, heroProjectileBodyLength, projectileSizeMultiplier, enemyBulletSizeMultiplier, AREA_RADIUS_MULTIPLIER,
  folderConfig,
  knockbackConfig, pickupRange, fallingStamp, enemyFire, attackEffects, zoneConfig, areaDamage, auraConfig, auraRadius, auraHitInterval, victoryConfig, envelopeConfig,
} from './config.ts';
import { EnemyGrid } from './grid.ts';
import { CrowdSeparation } from './crowd.ts';
import { Pool } from './pool.ts';
import { quipConfig, QuipCycle } from './hero-quips.ts';
import { DamageNumbers } from './damage-numbers.ts';
import { BossAttackSystem } from './boss.ts';
import { OfficeNavigation, officeLevel } from './office-level.ts';
import { heroAnimation } from './hero-animation.ts';
import enemySprites from './enemy-sprites.json' with { type: 'json' };

export type RunPhase = 'intro' | 'running' | 'paused' | 'upgrade' | 'won' | 'lost';
const TAU = Math.PI * 2;
// The movement anchor is at her feet. Leave room for the sprite above it.
const HERO_TOP_MARGIN = Math.ceil(heroAnimation.displaySize * heroAnimation.originY) + 4;
const BOSS_ARENA_MARGIN = 24;
const enemySpawnClearance = enemySprites.types.map(type => {
  const height = enemySprites.baseHeight * type.sizeMultiplier;
  return { aboveFeet: height + 12, halfWidth: height * type.width / type.height / 2 + 8 };
});
const limit = (value: number, max: number) => Math.max(24, Math.min(max - 24, value));
const isExperience = (kind: number): kind is typeof dropKind.xp | typeof dropKind.goldXp | typeof dropKind.redXp =>
  kind === dropKind.xp || kind === dropKind.goldXp || kind === dropKind.redXp;

export class Run {
  readonly enemies = new Pool(MAX_ENEMIES, true);
  readonly shots = new Pool(MAX_SHOTS);
  readonly drops = new Pool(MAX_DROPS, true);
  readonly damageNumbers = new DamageNumbers();
  readonly deaths = new Pool(deathEffectConfig.capacity);
  readonly boss = new BossAttackSystem();
  readonly navigation = new OfficeNavigation();
  private readonly crowd: CrowdSeparation | undefined;
  private readonly bossShoot = (x: number, y: number, vx: number, vy: number) => {
    this.shots.add(4, x, y, vx, vy, bossConfig.ringLife);
  };
  readonly levels = new Uint8Array(upgrades.length);
  readonly choices = new Uint8Array(3);
  choiceCount = 0;
  viewWidth = VIEW_WIDTH;
  viewHeight = VIEW_HEIGHT;
  private readonly grid = new EnemyGrid((x, y, amount) => this.damageNumbers.add(x, y, amount, this.ticks));
  private readonly cooldown = new Float32Array(6);
  private readonly candidates = new Uint8Array(upgrades.length);
  phase: RunPhase = 'intro';
  ticks = 0;
  x = officeLevel.spawn.x;
  y = officeLevel.spawn.y;
  previousX = this.x;
  previousY = this.y;
  heroDirection = 0;
  heroMovingTicks = 0;
  mood = 100;
  maxMood = 100;
  invulnerable = 0;
  xp = 0;
  level = 1;
  kills = 0;
  score = 0;
  bossSpawned = false;
  bossSpawnTick = -1;
  private arena?: { x: number; y: number; openedAt: number };
  get obstacleAlpha() { return this.arena ? Math.max(0, 1 - (this.time - this.arena.openedAt) / .5) : 1; }
  get arenaWallAlpha() { return this.arena ? Math.max(0, Math.min(1, (this.time - this.arena.openedAt - .5) / .3)) : 0; }
  bossDefeated = false;
  victoryRemaining = 0;
  victoryX = 0;
  victoryY = 0;
  bossWindup = 0;
  bonusFlash = 0;
  zoneX = 0;
  zoneY = 0;
  zoneLife = 0;
  private areaPointX = 0;
  private areaPointY = 0;
  stampCount = 0;
  quip = -1;
  private readonly quipCycle = new QuipCycle();
  quipUntil = 0;
  private nextQuipAt = 0;
  readonly stampPositions = new Float32Array(10);
  readonly stampImpactTicks = new Float64Array(5);
  private stampReadyTick: number | undefined;
  private stampDamage = 0;
  orbitCount = 0;
  readonly orbitX = new Float32Array(8);
  readonly orbitY = new Float32Array(8);
  readonly previousOrbitX = new Float32Array(8);
  readonly previousOrbitY = new Float32Array(8);
  private pickupIn = 18;
  private bonusIn: number = bonusConfig.firstSpawn;
  private nextBonus = dropKind.bomb as number;
  private bonusKillsPending = false;
  private zoneHitIn = 0;
  private pendingLevels = 0;
  private readonly random: () => number;
  private readonly bossTest: boolean;

  constructor(random: () => number = Math.random, bossTest = false, separateEnemies = true) {
    this.random = random;
    this.bossTest = bossTest;
    this.crowd = separateEnemies ? new CrowdSeparation() : undefined;
    this.levels[0] = 1;
    this.navigation.update(this.x, this.y);
  }

  get time() { return this.ticks * STEP; }
  get xpRequired() { return this.level * 5; }
  get zoneDuration() { return zoneConfig.duration + Math.max(0, this.levels[3] - 1) * zoneConfig.durationPerLevel; }
  get zoneMaxRadius() { return zoneConfig.radius; }
  get zoneRadius() {
    if (this.zoneLife <= 0) return 0;
    const progress = Math.min(1, (this.zoneDuration - this.zoneLife) / zoneConfig.growTime);
    const shrink = Math.min(1, this.zoneLife / zoneConfig.shrinkTime);
    return this.zoneMaxRadius * (1 - (1 - progress) ** 3) * shrink * shrink * (3 - 2 * shrink);
  }
  get bossHealth() {
    if (!this.bossSpawned || this.bossDefeated) return 0;
    for (let i = 0; i < this.enemies.count; i++) {
      if (this.enemies.kind[i] === FINAL_BOSS_KIND) return this.enemies.life[i];
    }
    return 0;
  }
  get cameraX() { return this.cameraLeft(this.x); }
  get cameraY() { return this.cameraTop(this.y); }
  get encounterRadius() { return this.viewWidth * .5 * 1.5; }
  cameraLeft(x: number) { return Math.max(0, Math.min(WORLD_WIDTH - this.viewWidth, (this.arena?.x ?? x) - this.viewWidth / 2)); }
  cameraTop(y: number) { return Math.max(0, Math.min(WORLD_HEIGHT - this.viewHeight, (this.arena?.y ?? y) - this.viewHeight / 2)); }

  start() {
    if (this.phase === 'intro' && this.bossTest) {
      this.ticks = Math.round((BOSS_TIME - 30) / STEP);
      this.level = 17;
      this.pendingLevels = 17;
      this.offer();
      return;
    }
    if (this.phase === 'intro' || this.phase === 'paused') this.phase = 'running';
  }
  pause() { if (this.phase === 'running') this.phase = 'paused'; }

  choose(index: number) {
    if (this.phase !== 'upgrade' || !Number.isInteger(index) || index < 0 || index >= this.choiceCount) return;
    const id = this.choices[index];
    this.levels[id]++;
    this.invulnerable = Math.max(this.invulnerable, UPGRADE_INVULNERABILITY_SECONDS);
    if (id === 8) { this.maxMood += PAID_LEAVE_MOOD_GAIN; this.mood += PAID_LEAVE_MOOD_GAIN; }
    this.pendingLevels--;
    this.offer();
  }

  spawn(kind: number, x: number, y: number) {
    const type = enemies[kind];
    const firstShot = kind === FINAL_BOSS_KIND ? bossConfig.aimedVolleyEvery : type.fire ? enemyFire.firstShot : 0;
    return this.enemies.add(kind, x, y, type.speed, type.radius, type.hp, firstShot);
  }

  step(inputX: number, inputY: number) {
    if (this.phase !== 'running') return;
    this.previousX = this.x;
    this.previousY = this.y;
    this.ticks++;
    this.damageNumbers.expire(this.ticks);
    for (let i = this.deaths.count - 1; i >= 0; i--) {
      this.deaths.life[i] -= STEP;
      if (this.deaths.life[i] <= 0) this.deaths.remove(i);
    }
    if (this.victoryRemaining > 0) {
      this.heroMovingTicks = 0;
      this.victoryRemaining = Math.max(0, this.victoryRemaining - STEP);
      if (!this.victoryRemaining) this.phase = 'won';
      return;
    }
    if (!this.arena && !this.bossSpawned && this.time >= BOSS_TIME) this.openBossArena();
    if (this.arena && !this.bossSpawned) {
      this.heroMovingTicks = 0;
      if (this.time - this.arena.openedAt >= .8 - 1e-9) this.spawnBoss();
      return;
    }
    const magnitude = Math.hypot(inputX, inputY);
    if (this.arena) {
      const speed = (PLAYER_SPEED + this.levels[6] * PLAYER_SPEED_PER_LEVEL) * STEP / Math.max(1, magnitude);
      this.x = this.arenaX(this.x + inputX * speed, 24);
      this.y = this.arenaY(this.y + inputY * speed, HERO_TOP_MARGIN);
    } else if (magnitude > 0) {
      const speed = (PLAYER_SPEED + this.levels[6] * PLAYER_SPEED_PER_LEVEL) * STEP / Math.max(1, magnitude);
      this.navigation.move(this.x, this.y, limit(this.x + inputX * speed, WORLD_WIDTH),
        Math.max(HERO_TOP_MARGIN, limit(this.y + inputY * speed, WORLD_HEIGHT)), heroCollision.radiusX);
      this.x = this.navigation.resultX;
      this.y = Math.max(HERO_TOP_MARGIN, this.navigation.resultY);
    }
    const dx = this.x - this.previousX;
    const dy = this.y - this.previousY;
    if (magnitude > 0) {
      // Atlas rows start at south and proceed through southeast and east.
      this.heroDirection = (Math.round(Math.atan2(inputX, inputY) / (TAU / 8)) + 8) % 8;
    }
    if (dx || dy) {
      this.heroMovingTicks++;
    } else {
      this.heroMovingTicks = 0;
    }
    this.invulnerable = Math.max(0, this.invulnerable - STEP);
    this.bonusFlash = Math.max(0, this.bonusFlash - STEP);
    this.spawnWave();
    this.moveEnemies();
    if (this.stampCount) {
      let active = false;
      for (let i = 0; i < this.stampCount; i++) {
        const age = this.ticks - this.stampImpactTicks[i];
        if (age === 0) {
          this.grid.hit(this.enemies, this.stampPositions[i * 2], this.stampPositions[i * 2 + 1],
            fallingStamp.radius, this.stampDamage, true, attackEffects.stamp.knockback);
        }
        if (age * STEP <= fallingStamp.impactTime + STEP) active = true;
      }
      if (!active) this.stampCount = 0;
    }
    this.attack();
    this.moveShots();
    this.collectKills();
    this.collectDrops();
    if (this.bonusKillsPending) { this.collectKills(); this.bonusKillsPending = false; }
    if (this.mood <= 0) this.phase = 'lost';
    else if (this.bossDefeated) {
      this.victoryRemaining = victoryConfig.seconds;
      this.shots.count = 0; this.zoneLife = 0; this.stampCount = 0;
      this.pendingLevels = 0;
    }
    else if (this.pendingLevels && !this.hasFlyingDrops()) this.offer();
  }

  private hasFlyingDrops() {
    for (let i = 0; i < this.drops.count; i++) {
      if (this.drops.timer[i]) return true;
    }
    return false;
  }

  private offer() {
    let count = 0;
    for (let i = 0; i < upgrades.length; i++) {
      if (this.levels[i] < upgrades[i].max) this.candidates[count++] = i;
    }
    this.choiceCount = Math.min(this.choices.length, count);
    if (!this.pendingLevels || !count) {
      // Convert levels into mood only when every upgrade is exhausted.
      this.mood = Math.min(this.maxMood, this.mood + this.pendingLevels * 8);
      this.pendingLevels = 0;
      this.phase = 'running';
      return;
    }
    this.choices.fill(255);
    for (let i = 0; i < this.choiceCount; i++) {
      const pick = i + Math.floor(this.random() * (count - i));
      const id = this.candidates[pick];
      this.candidates[pick] = this.candidates[i];
      this.candidates[i] = id;
      this.choices[i] = id;
    }
    this.phase = 'upgrade';
  }

  private spawnOutside(kind: number) {
    const left = this.cameraX, top = this.cameraY;
    const right = left + this.viewWidth, bottom = top + this.viewHeight;
    const { aboveFeet, halfWidth } = enemySpawnClearance[kind];
    const radius = this.encounterRadius;
    const heading = this.random() * TAU;
    for (let i = 0; i < 16; i++) {
      const angle = heading + i * TAU / 16;
      const x = this.x + Math.cos(angle) * radius;
      const y = this.y + Math.sin(angle) * radius;
      if (x < 24 || x > WORLD_WIDTH - 24 || y < 24 || y > WORLD_HEIGHT - 24) continue;
      if (x + halfWidth >= left && x - halfWidth <= right && y >= top && y - aboveFeet <= bottom) continue;
      if (this.navigation.reachable(x, y, enemies[kind].radius)) return this.spawn(kind, x, y);
    }
    return -1;
  }

  private spawnWave() {
    if (!this.arena && this.ticks % (1 / STEP) === 0) {
      const second = this.time;
      for (const wave of waves) {
        const activeSeconds = second - Math.max(1, wave.start);
        if (activeSeconds < 0 || second > wave.end || activeSeconds % wave.every !== 0) continue;
        for (let i = 0; i < wave.count; i++) {
          const index = (activeSeconds / wave.every * wave.count + i) % wave.kinds.length;
          this.spawnOutside(wave.kinds[index]);
        }
      }
    }
    this.pickupIn -= STEP;
    if (this.pickupIn <= 0) {
      this.pickupIn = 18;
      this.spawnPickupOutside(this.random() < .65 ? dropKind.coffee : dropKind.meme);
    }
    this.bonusIn -= STEP;
    if (this.bonusIn <= 0) {
      this.bonusIn = bonusConfig.spawnEvery;
      this.spawnPickupOutside(this.nextBonus);
      this.nextBonus = this.nextBonus === dropKind.bomb ? dropKind.magnet : dropKind.bomb;
    }
  }

  private arenaX(x: number, padding: number) {
    const margin = Math.min(padding, this.viewWidth / 2);
    const left = this.cameraX;
    return Math.max(left + margin, Math.min(left + this.viewWidth - margin, x));
  }

  private arenaY(y: number, aboveFeet: number) {
    const top = this.cameraY;
    const bottomMargin = Math.min(24, this.viewHeight / 2);
    return Math.max(top + Math.min(aboveFeet, this.viewHeight - bottomMargin),
      Math.min(top + this.viewHeight - bottomMargin, y));
  }

  private openBossArena() {
    for (let i = 0; i < this.enemies.count; i++) this.queueDeath(i);
    this.enemies.count = 0;
    this.shots.count = 0;
    this.stampCount = 0;
    this.arena = { x: this.x, y: this.y, openedAt: this.time };
  }

  private spawnBoss() {
    const left = this.cameraX, top = this.cameraY;
    const x = left + this.viewWidth * (this.x < left + this.viewWidth / 2 ? .78 : .22);
    const y = top + this.viewHeight * (this.y < top + this.viewHeight / 2 ? .78 : .22);
    const { halfWidth, aboveFeet } = enemySpawnClearance[FINAL_BOSS_KIND];
    this.bossSpawned = this.spawn(FINAL_BOSS_KIND, this.arenaX(x, halfWidth), this.arenaY(y, aboveFeet)) >= 0;
    if (this.bossSpawned) this.bossSpawnTick = this.ticks;
  }

  private spawnPickupOutside(kind: number) {
    if (this.arena) {
      this.pickAreaPoint(40);
      return this.drops.add(kind, this.areaPointX, this.areaPointY);
    }
    const left = this.cameraX, top = this.cameraY;
    const right = left + this.viewWidth, bottom = top + this.viewHeight;
    const firstSide = Math.floor(this.random() * 4);
    const gap = bonusConfig.spawnGapMin + this.random() * (bonusConfig.spawnGapMax - bonusConfig.spawnGapMin);
    for (let i = 0; i < 4; i++) {
      const side = (firstSide + i) % 4;
      const x = side === 0 ? left - gap : side === 1 ? right + gap :
        left + this.random() * this.viewWidth;
      const y = side === 2 ? top - gap : side === 3 ? bottom + gap :
        top + this.random() * this.viewHeight;
      if (x < 24 || x > WORLD_WIDTH - 24 || y < 24 || y > WORLD_HEIGHT - 24) continue;
      if (!this.navigation.reachable(x, y)) continue;
      return this.drops.add(kind, x, y);
    }
    return -1; // Never fall back to spawning inside the viewport.
  }

  private damage(amount: number) {
    if (this.invulnerable > 0) return;
    amount *= INCOMING_DAMAGE_MULTIPLIER;
    this.damageNumbers.add(this.x, this.y - 33, Math.min(this.mood, amount), this.ticks, true);
    this.mood = Math.max(0, this.mood - amount);
    this.invulnerable = .6;
  }

  private moveEnemies() {
    const p = this.enemies;
    const crowd = p.count > 1 ? this.crowd : undefined;
    this.bossWindup = 0;
    this.grid.clear();
    for (let i = 0; i < p.count; i++) {
      const offset = i * 2;
      const kind = p.kind[i], type = enemies[kind];
      const x = p.previousPosition[offset] = p.position[offset];
      const y = p.previousPosition[offset + 1] = p.position[offset + 1];
      const dx = this.x - x, dy = this.y - y;
      const distance = Math.hypot(dx, dy);
      const ux = distance ? dx / distance : 0, uy = distance ? dy / distance : 0;
      const stopRange = kind === 3 ? 160 : kind === 4 ? 205 : 8;
      let speed = distance > stopRange ? p.a[i] : distance < stopRange - 40 ? -p.a[i] * .45 : 0;
      if (type.fire && distance < 390) {
        p.timer[i] -= STEP;
        if (p.timer[i] <= 0) {
          if (kind === MINI_BOSS_KIND) {
            let redLeft = 2;
            const heading = Math.atan2(dy, dx);
            for (let shot = 0; shot < 5; shot++) {
              const red = this.random() < redLeft / (5 - shot);
              if (red) redLeft--;
              const angle = heading + (shot - 2) * Math.PI / 12;
              const velocity = red ? enemyFire.redSpeed : enemyFire.blueSpeed;
              this.shots.add(red ? 2 : 1, x, y, Math.cos(angle) * velocity, Math.sin(angle) * velocity, 4);
            }
          } else {
            const velocity = kind === 3 ? enemyFire.blueSpeed : enemyFire.redSpeed;
            this.shots.add(kind === 3 ? 1 : 2, x, y, ux * velocity, uy * velocity, 4);
          }
          p.timer[i] = type.fire;
        }
      }
      if (kind === FINAL_BOSS_KIND) {
        if (this.arena && this.bossSpawned) {
          p.timer[i] -= STEP;
          if (p.timer[i] <= 0) {
            const heading = Math.atan2(dy, dx);
            for (let shot = -1; shot <= 1; shot++) {
              const angle = heading + shot * bossConfig.aimedVolleySpread;
              this.bossShoot(x, y, Math.cos(angle) * bossConfig.ringSpeed, Math.sin(angle) * bossConfig.ringSpeed);
            }
            p.timer[i] += bossConfig.aimedVolleyEvery;
          }
        }
        this.boss.step(x, y, this.x, this.y, this.bossShoot, this.random);
        this.bossWindup = this.boss.windup;
        const nextX = x + this.boss.velocityX * STEP, nextY = y + this.boss.velocityY * STEP;
        if (this.arena && this.boss.dashing) {
          const edgeX = this.arenaX(nextX, BOSS_ARENA_MARGIN), edgeY = this.arenaY(nextY, BOSS_ARENA_MARGIN);
          this.boss.reflectDash(nextX !== edgeX, nextY !== edgeY);
          p.position[offset] = 2 * edgeX - nextX;
          p.position[offset + 1] = 2 * edgeY - nextY;
        } else {
          p.position[offset] = limit(nextX, WORLD_WIDTH);
          p.position[offset + 1] = limit(nextY, WORLD_HEIGHT);
        }
        if (this.boss.laserHits(this.x, this.y)) this.damage(bossConfig.laserDamage);
      } else {
        const knockback = Math.hypot(p.knockbackX[i], p.knockbackY[i]);
        const recovery = Math.max(0, knockback - knockbackConfig.recovery * STEP);
        const factor = knockback ? recovery / knockback : 0;
        p.knockbackX[i] *= factor; p.knockbackY[i] *= factor;
        const steering = knockback > 0 ? .25 : 1;
        const vx = ux * speed * steering + p.knockbackX[i];
        const vy = uy * speed * steering + p.knockbackY[i];
        p.position[offset] = limit(x + vx * STEP, WORLD_WIDTH);
        p.position[offset + 1] = limit(y + vy * STEP, WORLD_HEIGHT);
      }
      if (this.arena) {
        const { halfWidth, aboveFeet } = enemySpawnClearance[kind];
        p.position[offset] = this.arenaX(p.position[offset], kind === FINAL_BOSS_KIND ? BOSS_ARENA_MARGIN : halfWidth);
        p.position[offset + 1] = this.arenaY(p.position[offset + 1], kind === FINAL_BOSS_KIND ? BOSS_ARENA_MARGIN : aboveFeet);
      } else {
        const footprint = Math.min(22, type.radius * .7);
        if (kind !== FINAL_BOSS_KIND && !p.knockbackX[i] && !p.knockbackY[i]) {
          this.navigation.pursue(x, y, p.position[offset], p.position[offset + 1], footprint);
        } else {
          this.navigation.move(x, y, p.position[offset], p.position[offset + 1], footprint);
        }
        p.position[offset] = this.navigation.resultX; p.position[offset + 1] = this.navigation.resultY;
      }
      const horizontal = p.position[offset] - x;
      // Face the pursuit direction after meaningful movement; knockback and
      // tiny wall-contact corrections must not make the sprite flicker.
      if (kind === FINAL_BOSS_KIND && this.boss.dashing) {
        if (Math.abs(this.boss.velocityX) > .05) p.facingLeft[i] = this.boss.velocityX < 0 ? 1 : 0;
      } else if (kind === FINAL_BOSS_KIND || (Math.abs(horizontal) > .05 && !p.knockbackX[i] && !p.knockbackY[i])) {
        if (Math.abs(dx) > 4) p.facingLeft[i] = dx < 0 ? 1 : 0;
      }
      if (!crowd) this.grid.insert(i, p.position[offset], p.position[offset + 1]);
      const reachX = type.radius + heroCollision.radiusX;
      const reachY = type.radius * heroCollision.enemyDepth + heroCollision.radiusY;
      if ((dx / reachX) ** 2 + (dy / reachY) ** 2 < 1 ||
        (kind === FINAL_BOSS_KIND && ((this.x - p.position[offset]) / reachX) ** 2 +
          ((this.y - p.position[offset + 1]) / reachY) ** 2 < 1)) this.damage(type.damage);
    }
    if (crowd) {
      crowd.solve(p);
      for (let i = 0; i < p.count; i++) {
        const offset = i * 2;
        const x = p.position[offset], y = p.position[offset + 1];
        const dx = crowd.offset(offset), dy = crowd.offset(offset + 1);
        if (dx || dy) {
          this.navigation.move(x, y, limit(x + dx, WORLD_WIDTH), limit(y + dy, WORLD_HEIGHT),
            Math.min(22, enemies[p.kind[i]].radius * .7));
          p.position[offset] = this.navigation.resultX;
          p.position[offset + 1] = this.navigation.resultY;
        }
        this.grid.insert(i, p.position[offset], p.position[offset + 1]);
      }
    }
  }

  private attack() {
    for (let i = 0; i < this.cooldown.length; i++) this.cooldown[i] -= STEP;
    this.zoneLife = Math.max(0, this.zoneLife - STEP);
    if (this.levels[3] && this.cooldown[3] <= 0 && this.zoneLife <= 0) this.placeZone();
    const p = this.enemies;
    const target = (this.levels[0] && this.cooldown[0] <= 0) ||
      (this.levels[4] && this.cooldown[4] <= 0)
      ? this.grid.nearest(p, this.x, this.y, Math.hypot(this.viewWidth, this.viewHeight),
        this.cameraX, this.cameraY, this.cameraX + this.viewWidth, this.cameraY + this.viewHeight) : -1;
    if (target >= 0) {
      const dx = p.position[target * 2] - this.x, dy = p.position[target * 2 + 1] - this.y;
      const angle = Math.atan2(dy, dx);
      if (this.levels[0] && this.cooldown[0] <= 0) {
        this.cooldown[0] = envelopeConfig.initialCooldown - (this.levels[0] - 1) * envelopeConfig.cooldownReductionPerLevel;
        const count = Math.max(1, this.levels[0]);
        for (let i = 0; i < count; i++) {
          const heading = angle + (i - (count - 1) / 2) * .16;
          this.shots.add(0, this.x, this.y, Math.cos(heading) * 470, Math.sin(heading) * 470, 1.6);
        }
      }
      if (this.levels[4] && this.cooldown[4] <= 0) {
        const count = this.levels[4];
        for (let i = 0; i < count; i++) {
          const heading = angle + (i - (count - 1) / 2) * .24;
          this.shots.add(3, this.x, this.y, Math.cos(heading) * folderConfig.outwardSpeed,
            Math.sin(heading) * folderConfig.outwardSpeed, folderConfig.lifetime);
        }
        this.cooldown[4] = 2.35;
      }
    }
    if (this.levels[5]) {
      this.stampReadyTick ??= this.ticks + Math.round(fallingStamp.waitTime / STEP);
      if (this.ticks >= this.stampReadyTick) this.launchStamps();
    }
    const previousOrbitCount = this.orbitCount;
    this.orbitCount = orbitConfig.counts[Math.min(this.levels[1], 3)];
    for (let i = 0; i < this.orbitCount; i++) {
      const angle = this.time * orbitConfig.angularSpeed + TAU * i / this.orbitCount;
      this.previousOrbitX[i] = this.orbitX[i];
      this.previousOrbitY[i] = this.orbitY[i];
      this.orbitX[i] = this.x + Math.cos(angle) * orbitConfig.radius;
      this.orbitY[i] = this.y + Math.sin(angle) * orbitConfig.radius;
      if (previousOrbitCount !== this.orbitCount) {
        this.previousOrbitX[i] = this.orbitX[i];
        this.previousOrbitY[i] = this.orbitY[i];
      }
      this.grid.hit(p, this.orbitX[i], this.orbitY[i], 12 * AREA_RADIUS_MULTIPLIER,
        4 + this.levels[1] * 2, true, attackEffects.orbit.knockback, this.ticks, Math.round(.24 / STEP));
    }
    if (this.levels[2] && this.cooldown[2] <= 0) {
      this.cooldown[2] = auraHitInterval(this.levels[2]) + Math.max(-STEP, this.cooldown[2]);
      this.grid.hit(p, this.x, this.y, auraRadius(this.levels[2]),
        areaDamage(auraConfig.damage, this.levels[2]), true, attackEffects.aura.knockback);
    }
    this.zoneHitIn -= STEP;
    if (this.zoneLife > 0 && this.zoneHitIn <= 0) {
      this.zoneHitIn = zoneConfig.hitEvery;
      this.grid.hit(p, this.zoneX, this.zoneY, this.zoneRadius, areaDamage(zoneConfig.damage, this.levels[3]), true, attackEffects.zone.knockback);
    }
  }

  private launchStamps() {
    const p = this.enemies, count = this.levels[5];
    const left = this.cameraX, top = this.cameraY;
    const right = left + this.viewWidth, bottom = top + this.viewHeight;
    let selected = 0;
    const spacingSquared = (fallingStamp.radius * 2 + 2) ** 2;
    const separated = (x: number, y: number) => {
      for (let j = 0; j < selected; j++) {
        const dx = x - this.stampPositions[j * 2], dy = y - this.stampPositions[j * 2 + 1];
        if (dx * dx + dy * dy < spacingSquared) return false;
      }
      return true;
    };
    const offset = Math.floor(this.random() * p.count);
    for (let n = 0; n < p.count && selected < count; n++) {
      const i = (offset + n) % p.count;
      if (p.life[i] <= 0) continue;
      const x = p.position[i * 2], y = p.position[i * 2 + 1];
      if (x < left || x > right || y < top || y > bottom || !separated(x, y)) continue;
      this.stampPositions[selected * 2] = x;
      this.stampPositions[selected * 2 + 1] = y;
      selected++;
    }
    for (let attempt = 0; attempt < 64 && selected < count; attempt++) {
      this.pickAreaPoint(fallingStamp.radius);
      if (!separated(this.areaPointX, this.areaPointY)) continue;
      this.stampPositions[selected * 2] = this.areaPointX;
      this.stampPositions[selected * 2 + 1] = this.areaPointY;
      selected++;
    }
    this.stampCount = selected;
    const fallTicks = Math.round(fallingStamp.fallTime / STEP);
    const maxDelayTicks = Math.round(fallingStamp.maxDelay / STEP);
    for (let i = 0; i < selected; i++) {
      const delayTicks = Math.floor(this.random() * (maxDelayTicks + 1));
      this.stampImpactTicks[i] = this.ticks + delayTicks + fallTicks;
    }
    this.stampDamage = areaDamage(fallingStamp.damage, count);
    this.stampReadyTick = this.ticks + Math.round((fallingStamp.waitTime + fallingStamp.fallTime) / STEP);
  }

  private placeZone() {
    this.pickAreaPoint(this.zoneMaxRadius);
    this.zoneX = this.areaPointX; this.zoneY = this.areaPointY;
    this.zoneLife = this.zoneDuration; this.zoneHitIn = 0;
    this.cooldown[3] = zoneConfig.cooldown;
  }

  private pickAreaPoint(margin: number) {
    const left = this.cameraX + margin, top = this.cameraY + margin;
    const width = Math.max(0, this.viewWidth - margin * 2);
    const height = Math.max(0, this.viewHeight - margin * 2);
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = left + this.random() * width, y = top + this.random() * height;
      if (!attempt) { this.areaPointX = x; this.areaPointY = y; }
      if (!this.arena && !this.navigation.reachable(x, y)) continue;
      this.areaPointX = x; this.areaPointY = y;
      return;
    }
    const cell = officeLevel.floorGrid;
    for (let y = Math.ceil(this.cameraY / cell) * cell + cell / 2; y < this.cameraY + this.viewHeight; y += cell) {
      for (let x = Math.ceil(this.cameraX / cell) * cell + cell / 2; x < this.cameraX + this.viewWidth; x += cell) {
        if (!this.navigation.reachable(x, y)) continue;
        this.areaPointX = x; this.areaPointY = y;
        return;
      }
    }
    // No accessible tile: fire at the original random point instead of cancelling.
  }

  private moveShots() {
    const s = this.shots;
    for (let i = s.count - 1; i >= 0; i--) {
      s.life[i] -= STEP;
      if (s.life[i] <= 0) { s.remove(i); continue; }
      const kind = s.kind[i];
      if (kind === 3 && s.life[i] <= folderConfig.lifetime - folderConfig.range / folderConfig.outwardSpeed) {
        const dx = this.x - s.position[i * 2], dy = this.y - s.position[i * 2 + 1];
        const distance = Math.hypot(dx, dy);
        if (distance < 14) { s.remove(i); continue; }
        s.a[i] = dx / distance * folderConfig.returnSpeed; s.b[i] = dy / distance * folderConfig.returnSpeed;
      }
      const x = s.previousPosition[i * 2] = s.position[i * 2];
      const y = s.previousPosition[i * 2 + 1] = s.position[i * 2 + 1];
      s.position[i * 2] = x + s.a[i] * STEP;
      s.position[i * 2 + 1] = y + s.b[i] * STEP;
      if (kind === 0) {
        if (this.grid.hit(this.enemies, s.position[i * 2], s.position[i * 2 + 1], 6 * projectileSizeMultiplier,
          11 + this.levels[0] * 4, false, attackEffects.envelope.knockback, 0, 0, s.hitHistory, i * 6, s.timer[i], true)) {
          s.timer[i]++;
          if (s.timer[i] >= 1 + this.levels[9]) s.remove(i);
        }
      } else if (kind === 3) {
        s.timer[i] -= STEP;
        if (s.timer[i] <= 0 && this.grid.hit(this.enemies, s.position[i * 2], s.position[i * 2 + 1],
          13 * projectileSizeMultiplier * folderConfig.sizeMultiplier,
          9 + this.levels[4] * 4, true, attackEffects.folder.knockback, 0, 0, undefined, 0, 0, true)) s.timer[i] = .17;
      } else {
        const dx = s.position[i * 2] - this.x, dy = s.position[i * 2 + 1] - this.y;
        const shotScale = projectileSizeMultiplier * (kind === 4 ? 1 : enemyBulletSizeMultiplier);
        const radiusX = heroCollision.radiusX + shotScale * (kind === 1 ? 10 : kind === 4 ? 8 : 13);
        const radiusY = heroCollision.radiusY + shotScale * (kind === 1 ? 5 : kind === 4 ? 6 : 7);
        const bodyDistanceY = dy - Math.max(-heroProjectileBodyLength, Math.min(0, dy));
        if ((dx / radiusX) ** 2 + (bodyDistanceY / radiusY) ** 2 < 1) {
          this.damage(kind === 1 ? enemyFire.blueDamage : kind === 4 ? bossConfig.ringDamage : enemyFire.redDamage); s.remove(i);
        }
      }
    }
  }

  private collectKills() {
    const p = this.enemies;
    for (let i = p.count - 1; i >= 0; i--) {
      if (p.life[i] > 0) continue;
      const kind = p.kind[i];
      this.queueDeath(i);
      if (kind === FINAL_BOSS_KIND) {
        this.bossDefeated = true;
        this.victoryX = p.position[i * 2]; this.victoryY = p.position[i * 2 + 1];
      }
      this.kills++;
      this.score += enemies[kind].score;
      if (this.kills % quipConfig.killsBetween === 0 && this.time >= this.nextQuipAt &&
        p.position[i * 2] >= this.cameraX && p.position[i * 2] <= this.cameraX + this.viewWidth &&
        p.position[i * 2 + 1] >= this.cameraY && p.position[i * 2 + 1] <= this.cameraY + this.viewHeight) {
        // Cosmetic randomness must not consume the combat/spawn random stream.
        this.quip = this.quipCycle.next();
        this.quipUntil = this.time + quipConfig.duration;
        this.nextQuipAt = this.time + quipConfig.cooldown;
      }
      const xp = enemies[kind].xp;
      if (xp > 0) {
        const reward = xp >= 25 ? dropKind.redXp : xp >= 5 ? dropKind.goldXp : dropKind.xp;
        this.drops.add(reward, p.position[i * 2], p.position[i * 2 + 1], xp);
      }
      p.remove(i);
    }
  }

  private queueDeath(i: number) {
    const p = this.enemies;
    const x = p.position[i * 2], y = p.position[i * 2 + 1];
    if (x + p.b[i] >= this.cameraX && x - p.b[i] <= this.cameraX + this.viewWidth &&
      y + p.b[i] >= this.cameraY && y - p.b[i] <= this.cameraY + this.viewHeight) {
      this.deaths.add(p.kind[i], x, y, p.b[i], Math.sin(this.time * 9 + p.visualPhase[i]) * .075,
        p.kind[i] === FINAL_BOSS_KIND ? victoryConfig.deathSeconds : deathEffectConfig.seconds);
    }
  }

  private collectDrops() {
    const p = this.drops;
    const range = pickupRange.base + this.levels[7] * pickupRange.perLevel;
    for (let i = p.count - 1; i >= 0; i--) {
      const x = p.previousPosition[i * 2] = p.position[i * 2];
      const y = p.previousPosition[i * 2 + 1] = p.position[i * 2 + 1];
      const dx = this.x - x, dy = this.y - y;
      const distance = dx * dx + dy * dy;
      if (distance > range * range && !p.timer[i]) continue;
      if (distance > 14 * 14) {
        p.timer[i] = 1; // Once targeted, keep flying even if the player moves away.
        p.b[i] = Math.min(bonusConfig.attractionMaxSpeed,
          Math.max(p.b[i], bonusConfig.attractionStartSpeed) + bonusConfig.attractionAcceleration * STEP);
        const length = Math.sqrt(distance);
        const speed = Math.min(bonusConfig.attractionMaxSpeed,
          p.b[i] + bonusConfig.attractionNearBoost / (1 + length / 100));
        const step = Math.min(1, speed * STEP / length);
        p.position[i * 2] += dx * step; p.position[i * 2 + 1] += dy * step;
        continue;
      }
      const kind = p.kind[i];
      if (isExperience(kind)) {
        this.score += crystalScore[kind];
        this.xp += crystalXp[kind];
        while (this.xp >= this.xpRequired) {
          this.xp -= this.xpRequired;
          this.level++;
          this.pendingLevels++;
        }
      } else if (kind === dropKind.bomb) {
        this.detonateBonus();
      } else if (kind === dropKind.magnet) {
        for (let j = 0; j < p.count; j++) {
          if (!isExperience(p.kind[j])) continue;
          p.timer[j] = 1;
          p.b[j] = bonusConfig.attractionStartSpeed;
        }
      } else {
        const fraction = kind === dropKind.coffee ? healingPickups.coffee : healingPickups.meme;
        this.mood = Math.min(this.maxMood, this.mood + this.maxMood * fraction);
      }
      p.remove(i);
    }
  }

  private detonateBonus() {
    this.bonusKillsPending = true;
    this.bonusFlash = bonusConfig.flashSeconds;
    const p = this.enemies;
    // Spawn positions are stored as Float32, so allow for rounding on the circle.
    const reachSquared = (this.encounterRadius + .001) ** 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.position[i * 2], y = p.position[i * 2 + 1], radius = p.b[i];
      const dx = x - this.x, dy = y - this.y;
      if (dx * dx + dy * dy > reachSquared) continue;
      const kind = p.kind[i];
      const damage = kind === FINAL_BOSS_KIND || kind === MINI_BOSS_KIND ?
        enemies[kind].hp * bonusConfig.bossDamageFraction : Math.max(0, p.life[i]);
      p.life[i] -= damage;
      this.damageNumbers.add(x, y - radius, damage, this.ticks);
    }
  }
}
