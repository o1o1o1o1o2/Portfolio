import { FINAL_BOSS_KIND, MAX_ENEMIES, WORLD_HEIGHT, WORLD_WIDTH } from './config.ts';
import { officeLevel } from './office-level.ts';
import type { Pool } from './pool.ts';
import enemySprites from './enemy-sprites.json' with { type: 'json' };

const CELL = officeLevel.floorGrid * 3;
const STRIDE = Math.ceil(WORLD_WIDTH / CELL) + 2;
const SIZE = STRIDE * (Math.ceil(WORLD_HEIGHT / CELL) + 2);
const DEPTH = 1.5;
const PAIR_LIMIT = 16;
const MAX_CORRECTION = 3;
// The boss can span three columns and two rows with its wider footprint.
const ENTRY_SHIFT = 3;
const ENTRIES_PER_ENEMY = 1 << ENTRY_SHIFT;
export const crowdRadii = enemySprites.types.map(type =>
  enemySprites.baseHeight * type.sizeMultiplier * type.width / type.height * .4);

/** Spatial subdivision: put each footprint in every cell its bounds touch. */
export class CrowdSeparation {
  private readonly heads = new Int32Array(SIZE);
  private readonly occupied = new Int32Array(SIZE);
  private occupiedCount = 0;
  private next = new Int32Array(MAX_ENEMIES * ENTRIES_PER_ENEMY);
  private firstCol = new Int32Array(MAX_ENEMIES);
  private firstRow = new Int32Array(MAX_ENEMIES);
  private correction = new Float32Array(MAX_ENEMIES * 2);

  constructor() {
    this.heads.fill(-1);
  }

  solve(pool: Pool) {
    if (this.firstCol.length < pool.capacity) {
      this.next = new Int32Array(pool.capacity * ENTRIES_PER_ENEMY);
      this.firstCol = new Int32Array(pool.capacity);
      this.firstRow = new Int32Array(pool.capacity);
      this.correction = new Float32Array(pool.capacity * 2);
    }
    for (let i = 0; i < this.occupiedCount; i++) this.heads[this.occupied[i]] = -1;
    this.occupiedCount = 0;
    this.correction.fill(0, 0, pool.count * 2);
    let occupiedCount = 0;
    for (let i = 0; i < pool.count; i++) {
      const x = pool.position[i * 2], y = pool.position[i * 2 + 1];
      const radius = crowdRadii[pool.kind[i]];
      const left = this.firstCol[i] = 1 + Math.floor((x - radius) / CELL);
      const top = this.firstRow[i] = 1 + Math.floor((y - radius / DEPTH) / CELL);
      const right = 1 + Math.floor((x + radius) / CELL);
      const bottom = 1 + Math.floor((y + radius / DEPTH) / CELL);
      let entry = i << ENTRY_SHIFT;
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++, entry++) {
          const cell = row * STRIDE + col;
          const head = this.heads[cell];
          if (head === -1) this.occupied[occupiedCount++] = cell;
          this.next[entry] = head;
          this.heads[cell] = entry;
        }
      }
    }

    this.occupiedCount = occupiedCount;
    for (let k = 0; k < occupiedCount; k++) {
      const cell = this.occupied[k], row = Math.floor(cell / STRIDE), col = cell % STRIDE;
      for (let entry = this.heads[cell]; entry >= 0; entry = this.next[entry]) {
        const i = entry >>> ENTRY_SHIFT;
        let remaining = PAIR_LIMIT;
        for (let other = this.next[entry]; other >= 0 && remaining > 0; other = this.next[other], remaining--) {
          const j = other >>> ENTRY_SHIFT;
          // The top-left shared cell owns the pair, even if both footprints cross an edge.
          if (col !== Math.max(this.firstCol[i], this.firstCol[j]) ||
            row !== Math.max(this.firstRow[i], this.firstRow[j])) continue;
          this.contact(pool, i, j);
        }
      }
    }
  }

  private contact(pool: Pool, i: number, j: number) {
    const a = i * 2, b = j * 2;
    const dx = pool.position[a] - pool.position[b];
    const dy = (pool.position[a + 1] - pool.position[b + 1]) * DEPTH;
    const reach = crowdRadii[pool.kind[i]] + crowdRadii[pool.kind[j]];
    const squared = dx * dx + dy * dy;
    if (squared >= reach * reach) return;
    const distance = Math.sqrt(squared);
    const nx = distance > .001 ? dx / distance : Math.cos(pool.visualPhase[i]);
    const ny = distance > .001 ? dy / distance : Math.sin(pool.visualPhase[i]);
    const previousGap = (pool.previousPosition[a] - pool.previousPosition[b]) * nx +
      (pool.previousPosition[a + 1] - pool.previousPosition[b + 1]) * DEPTH * ny;
    const approachA = (pool.previousPosition[a] - pool.position[a]) * nx +
      (pool.previousPosition[a + 1] - pool.position[a + 1]) * DEPTH * ny;
    const approachB = Math.max(0, previousGap - distance - approachA);
    const inwardA = Math.max(0, approachA);
    const total = inwardA + approachB;
    // New contacts stop the approaching body. Existing overlaps push both apart.
    const share = pool.kind[i] === FINAL_BOSS_KIND ? 0 : pool.kind[j] === FINAL_BOSS_KIND ? 1 :
      previousGap >= reach - .001 && total > .001 ? inwardA / total : .5;
    const overlap = Math.min(MAX_CORRECTION, reach - distance);
    this.correction[a] += nx * overlap * share;
    this.correction[a + 1] += ny * overlap * share / DEPTH;
    this.correction[b] -= nx * overlap * (1 - share);
    this.correction[b + 1] -= ny * overlap * (1 - share) / DEPTH;
  }

  offset(index: number) {
    return Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, this.correction[index]));
  }
}
