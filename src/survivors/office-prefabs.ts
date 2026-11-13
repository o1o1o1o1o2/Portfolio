export interface PropDefinition {
  frame: string;
  scale?: number;
  supportOffsetY?: number;
  depthProfile?: string | null;
  anchorOffset: { x: number; y: number };
  drawOffset: { x: number; y: number };
  origin: { x: number; y: number };
  collisionCells: { normal: number[][]; mirrored: number[][] };
  collisionPolygon?: number[][];
}

interface OfficeCollider {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  owners: string[];
  polygon?: number[][];
}

export interface MapInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  flipX?: boolean;
  room?: string | null;
  group?: string;
}

/** Compile once at load; no per-instance pixel offsets belong in map data. */
export function compileOfficeInstances<T extends MapInstance>(instances: T[], definitions: Record<string, PropDefinition>, cellSize: number) {
  return instances.map(item => {
    const type = definitions[item.type];
    return { ...item, frame: type.frame, x: item.x * cellSize + type.anchorOffset.x,
      y: item.y * cellSize + type.anchorOffset.y, flipX: item.flipX ?? false,
      drawOffset: type.drawOffset, origin: type.origin, scale: type.scale ?? 1,
      supportOffsetY: type.supportOffsetY ?? 0, depthProfile: type.depthProfile ?? null };
  });
}

export function compileOfficeColliders(instances: MapInstance[], definitions: Record<string, PropDefinition>, cellSize: number) {
  const cells = new Map<string, OfficeCollider>();
  const polygons: OfficeCollider[] = [];
  for (const instance of instances) {
    const type = definitions[instance.type];
    if (type.collisionPolygon) {
      const { w, h } = atlas.frames[type.frame as keyof typeof atlas.frames].frame;
      const scale = (type.scale ?? 1) * .5;
      const x = instance.x * cellSize + type.anchorOffset.x + type.drawOffset.x;
      const y = instance.y * cellSize + type.anchorOffset.y + type.drawOffset.y;
      const polygon = type.collisionPolygon.map(([px, py]) =>
        [x + (px - w * type.origin.x) * scale * (instance.flipX ? -1 : 1), y + (py - h * type.origin.y) * scale]);
      const left = Math.min(...polygon.map(p => p[0])), top = Math.min(...polygon.map(p => p[1]));
      polygons.push({ id: `polygon-${instance.id}`, x: left, y: top,
        w: Math.max(...polygon.map(p => p[0])) - left, h: Math.max(...polygon.map(p => p[1])) - top,
        owners: [instance.id], polygon });
      continue;
    }
    const shape = type.collisionCells[instance.flipX ? 'mirrored' : 'normal'];
    // Optional width and height are measured in cells, including half cells.
    for (const [dx, dy, width = 1, height = 1] of shape) {
      const x = instance.x + dx, y = instance.y + dy, key = `${x}:${y}:${width}:${height}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { id: `cell-${x}-${y}-${width}-${height}`, x: x * cellSize, y: y * cellSize,
          w: width * cellSize, h: height * cellSize, owners: [] };
        cells.set(key, cell);
      }
      cell.owners.push(instance.id);
    }
  }
  return [...cells.values(), ...polygons];
}
import atlas from './assets/office-atlas.json' with { type: 'json' };

