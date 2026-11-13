import { WORLD_WIDTH, WORLD_HEIGHT, MAX_ENEMIES, FINAL_BOSS_KIND, MINI_BOSS_KIND, enemies, knockbackConfig } from './config.ts';
import type { Pool } from './pool.ts';
import enemySprites from './enemy-sprites.json' with { type: 'json' };

const CELL = 64;
const COLS = Math.ceil(WORLD_WIDTH / CELL);
const ROWS = Math.ceil(WORLD_HEIGHT / CELL);
const projectileBodyLengths = enemySprites.types.map(type => enemySprites.baseHeight * type.sizeMultiplier * .65);
const maxProjectileBodyLength = Math.max(...projectileBodyLengths);
const maxEnemyRadius = Math.max(...enemies.map(enemy => enemy.radius));

/** Linked lists stored in arrays. Indices remain stable until end-of-step compaction. */
export class EnemyGrid {
  private readonly heads = new Int32Array(COLS * ROWS);
  private readonly occupied = new Int32Array(COLS * ROWS);
  private occupiedCount = 0;
  private next = new Int32Array(MAX_ENEMIES);

  private readonly onHit: (x: number, y: number, amount: number) => void;

  constructor(onHit: (x: number, y: number, amount: number) => void) {
    this.onHit = onHit;
    this.heads.fill(-1);
  }

  clear() {
    for (let i = 0; i < this.occupiedCount; i++) this.heads[this.occupied[i]] = -1;
    this.occupiedCount = 0;
  }

  insert(i: number, x: number, y: number) {
    if (i >= this.next.length) {
      const next = new Int32Array(Math.max(i + 1, this.next.length * 2));
      next.set(this.next); this.next = next;
    }
    const cell = this.row(y) * COLS + this.col(x);
    if (this.heads[cell] === -1) this.occupied[this.occupiedCount++] = cell;
    this.next[i] = this.heads[cell];
    this.heads[cell] = i;
  }

  private col(x: number) { return Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))); }
  private row(y: number) { return Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))); }

  nearest(pool: Pool, x: number, y: number, range: number,
    minX = 0, minY = 0, maxX = WORLD_WIDTH, maxY = WORLD_HEIGHT) {
    let result = -1;
    let best = range * range;
    const left = this.col(Math.max(minX, x - range)), right = this.col(Math.min(maxX, x + range));
    for (let row = this.row(Math.max(minY, y - range)), end = this.row(Math.min(maxY, y + range)); row <= end; row++) {
      for (let col = left; col <= right; col++) {
        for (let i = this.heads[row * COLS + col]; i >= 0; i = this.next[i]) {
          if (pool.life[i] <= 0) continue;
          const px = pool.position[i * 2], py = pool.position[i * 2 + 1];
          if (px < minX || px > maxX || py < minY || py > maxY) continue;
          const dx = px - x, dy = py - y;
          const distance = dx * dx + dy * dy;
          if (distance < best) { best = distance; result = i; }
        }
      }
    }
    return result;
  }

  hit(pool: Pool, x: number, y: number, radius: number, damage: number, area: boolean,
    knockback = true, tick = 0, repeatDelay = 0, history?: Uint32Array, historyOffset = 0, historyCount = 0,
    projectile = false) {
    let found = false;
    const padding = radius + maxEnemyRadius;
    const left = this.col(x - padding), right = this.col(x + padding);
    const lastRow = this.row(y + padding + (projectile ? maxProjectileBodyLength : 0));
    for (let row = this.row(y - padding); row <= lastRow; row++) {
      for (let col = left; col <= right; col++) {
        for (let i = this.heads[row * COLS + col]; i >= 0; i = this.next[i]) {
          if (pool.life[i] <= 0) continue;
          if (repeatDelay && pool.orbitHitUntil[i] > tick) continue;
          let alreadyHit = false;
          if (history) for (let j = 0; j < historyCount; j++) {
            if (history[historyOffset + j] === pool.id[i]) { alreadyHit = true; break; }
          }
          if (alreadyHit) continue;
          const dx = pool.position[i * 2] - x, dy = pool.position[i * 2 + 1] - y;
          const reach = radius + pool.b[i];
          // Projectiles can hit the body above the ground anchor.
          const bodyDistanceY = projectile && dy > 0 ? Math.max(0, dy - projectileBodyLengths[pool.kind[i]]) : dy;
          if (dx * dx + bodyDistanceY * bodyDistanceY > reach * reach) continue;
          pool.life[i] -= damage;
          if (knockback && pool.life[i] > 0 && pool.kind[i] !== FINAL_BOSS_KIND) {
            const length = Math.hypot(dx, dy);
            const speed = knockbackConfig.speed * (pool.kind[i] === MINI_BOSS_KIND ?
              knockbackConfig.miniBossMultiplier : 1);
            // Replace the impulse instead of stacking it without a limit.
            pool.knockbackX[i] = (length ? dx / length : 1) * speed;
            pool.knockbackY[i] = (length ? dy / length : 0) * speed;
          }
          if (history) history[historyOffset + historyCount] = pool.id[i];
          if (repeatDelay) pool.orbitHitUntil[i] = tick + repeatDelay;
          this.onHit(pool.position[i * 2], pool.position[i * 2 + 1] - pool.b[i] - 10, damage);
          found = true;
          if (!area) return true;
        }
      }
    }
    return found;
  }
}
