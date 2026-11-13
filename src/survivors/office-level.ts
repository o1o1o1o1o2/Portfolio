import map from './assets/office-level.json' with { type: 'json' };
import definitions from './assets/office-props.json' with { type: 'json' };
import { compileOfficeInstances, compileOfficeColliders } from './office-prefabs.ts';

const size = map.cellSize;
const ground = compileOfficeInstances(map.ground, definitions, size);
const pitTiles = ground.flatMap(pit => {
  const shape = definitions[pit.type as keyof typeof definitions].collisionCells.normal;
  const left = Math.min(...shape.map(cell => cell[0]));
  const right = Math.max(...shape.map(cell => cell[0]));
  const top = Math.min(...shape.map(cell => cell[1]));
  const bottom = Math.max(...shape.map(cell => cell[1]));
  return shape.map(([x, y]) => {
    const edge = x === left || x === right;
    const name = y === top ? (edge ? 'top-left' : 'top') :
      y === bottom ? (edge ? 'bottom-left' : 'bottom') : edge ? 'side-left' : 'centre';
    const bleedLeft = x > left ? .5 : 0, bleedRight = x < right ? .5 : 0;
    const bleedTop = y > top ? .5 : 0, bleedBottom = y < bottom ? .5 : 0;
    return { frame: `pit-${name}`,
      x: pit.x + (x + .5) * size + (bleedRight - bleedLeft) / 2,
      y: pit.y + (y + .5) * size + (bleedBottom - bleedTop) / 2,
      width: size + bleedLeft + bleedRight, height: size + bleedTop + bleedBottom, flipX: x === right };
  });
});
const data = {
  ...map, width: map.width * size, height: map.height * size,
  spawn: { x: map.spawn.x * size, y: map.spawn.y * size },
  rooms: map.rooms.map(room => ({ ...room, x: room.x * size, y: room.y * size, w: room.w * size, h: room.h * size })),
  groups: map.groups.map(group => ({ ...group, x: group.x * size + 16, y: group.y * size + 16 })),
  props: compileOfficeInstances(map.props, definitions, size),
  walls: compileOfficeInstances(map.walls, definitions, size),
  ground, pitTiles,
  colliders: compileOfficeColliders([...map.props, ...map.walls, ...map.ground], definitions, size),
};
export const officeMap = map;
export const officePropDefinitions = definitions;
export const officeLevel = data;
const CELL = data.navigationGrid, COLS = data.width / CELL, ROWS = data.height / CELL;

/** Static cell collision. Connectivity is used only to reject inaccessible spawn points. */
export class OfficeNavigation {
  private readonly buckets: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  private readonly blocked = new Uint8Array(COLS * ROWS);
  private readonly distance = new Int16Array(COLS * ROWS);
  private readonly queue = new Int32Array(COLS * ROWS);
  private target = -1;
  resultX = 0;
  resultY = 0;
  private edgeX = 0;
  private edgeY = 0;

  private polygonDistance(points: number[][], x: number, y: number) {
    let inside = false, nearest = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [ax, ay] = points[j], [bx, by] = points[i];
      const ex = bx - ax, ey = by - ay;
      if ((ay > y) !== (by > y) && x < ax + (y - ay) * ex / ey) inside = !inside;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
      const cx = ax + t * ex, cy = ay + t * ey;
      const distance = (x - cx) ** 2 + (y - cy) ** 2;
      if (distance < nearest) {
        nearest = distance;
        this.edgeX = cx;
        this.edgeY = cy;
      }
    }
    return inside ? 0 : nearest;
  }

  constructor() {
    for (let i = 0; i < data.colliders.length; i++) {
      const b = data.colliders[i];
      for (let y = Math.max(0, Math.floor((b.y - 24) / CELL)); y <= Math.min(ROWS - 1, Math.floor((b.y + b.h + 24) / CELL)); y++) {
        for (let x = Math.max(0, Math.floor((b.x - 24) / CELL)); x <= Math.min(COLS - 1, Math.floor((b.x + b.w + 24) / CELL)); x++) {
          this.buckets[y * COLS + x].push(i);
        }
      }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!this.clear(x * CELL + CELL / 2, y * CELL + CELL / 2, 1)) this.blocked[y * COLS + x] = 1;
    }
    this.distance.fill(-1);
  }

  clear(x: number, y: number, radius = 10) {
    const cell = this.cell(x, y);
    for (const index of this.buckets[cell]) {
      const b = data.colliders[index];
      const dx = x - Math.max(b.x, Math.min(b.x + b.w, x));
      const dy = y - Math.max(b.y, Math.min(b.y + b.h, y));
      if (dx * dx + dy * dy >= radius * radius) continue;
      if (!b.polygon || this.polygonDistance(b.polygon, x, y) < radius * radius) return false;
    }
    return true;
  }

  update(x: number, y: number) {
    const target = this.cell(x, y);
    if (target === this.target) return;
    this.target = target; this.distance.fill(-1);
    let head = 0, tail = 1;
    this.queue[0] = target; this.distance[target] = 0;
    while (head < tail) {
      const cell = this.queue[head++], col = cell % COLS;
      for (let direction = 0; direction < 4; direction++) {
        const next = direction === 0 ? (col > 0 ? cell - 1 : -1) : direction === 1 ?
          (col < COLS - 1 ? cell + 1 : -1) : direction === 2 ? cell - COLS : cell + COLS;
        if (next < 0 || next >= this.distance.length || this.blocked[next] || this.distance[next] >= 0) continue;
        this.distance[next] = this.distance[cell] + 1; this.queue[tail++] = next;
      }
    }
  }

  reachable(x: number, y: number, radius = 16) {
    return this.clear(x, y, radius) && this.distance[this.cell(x, y)] >= 0;
  }

  move(x: number, y: number, nextX: number, nextY: number, radius: number) {
    if (this.clear(nextX, nextY, radius)) { this.resultX = nextX; this.resultY = nextY; return; }
    this.resultX = this.clear(nextX, y, radius) ? nextX : x;
    this.resultY = this.clear(this.resultX, nextY, radius) ? nextY : y;
    if (this.resultX !== x || this.resultY !== y) return;
    // Near a cell corner both axis probes can fail. Project the requested
    // motion onto the contact tangent instead of freezing the character.
    const dx = nextX - x, dy = nextY - y;
    for (const index of this.buckets[this.cell(nextX, nextY)]) {
      const b = data.colliders[index];
      let cx = Math.max(b.x, Math.min(b.x + b.w, x));
      let cy = Math.max(b.y, Math.min(b.y + b.h, y));
      if (b.polygon) {
        if (this.polygonDistance(b.polygon, nextX, nextY) >= radius * radius) continue;
        this.polygonDistance(b.polygon, x, y);
        cx = this.edgeX;
        cy = this.edgeY;
      }
      const length = Math.hypot(x - cx, y - cy);
      if (length < .0001 || length > radius + Math.hypot(dx, dy) + .01) continue;
      const nx = (x - cx) / length, ny = (y - cy) / length;
      const into = dx * nx + dy * ny;
      if (into >= 0) continue;
      const sx = x + dx - nx * into, sy = y + dy - ny * into;
      if (this.clear(sx, sy, radius)) { this.resultX = sx; this.resultY = sy; return; }
    }
  }

  pursue(x: number, y: number, nextX: number, nextY: number, radius: number) {
    const dx = nextX - x, dy = nextY - y;
    this.move(x, y, nextX, nextY, radius);
    // Keep only the unblocked component: no acceleration along the wall and
    // no invented detour. Suppress subpixel wobble when practically stationary.
    const movedX = this.resultX - x, movedY = this.resultY - y;
    const progress = movedX * dx + movedY * dy;
    if (progress <= 0 || movedX * movedX + movedY * movedY < .0025) {
      this.resultX = x; this.resultY = y;
    }
  }

  private cell(x: number, y: number) {
    return Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))) * COLS +
      Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
  }
}
