import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OfficeNavigation, officeLevel, officeMap, officePropDefinitions } from '../src/survivors/office-level.ts';
import { compileOfficeInstances, compileOfficeColliders } from '../src/survivors/office-prefabs.ts';

test('office atlas packs high-resolution props without changing their world dimensions', () => {
  const atlas = JSON.parse(readFileSync(new URL('../src/survivors/assets/office-atlas.json', import.meta.url)));
  const png = readFileSync(new URL('../src/survivors/assets/office-atlas.png', import.meta.url));
  assert.deepEqual(atlas.meta.size, { w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
  assert.equal(Object.keys(atlas.frames).filter(name => name.startsWith('wall-')).length, 8);
  const frames = Object.entries(atlas.frames);
  for (const [index, [name, { frame }]] of frames.entries()) {
    assert.ok(frame.w <= 256 && frame.h <= 256);
    assert.ok(frame.x + frame.w <= atlas.meta.size.w && frame.y + frame.h <= atlas.meta.size.h);
    for (const [, { frame: other }] of frames.slice(0, index)) {
      assert.ok(frame.x + frame.w <= other.x || other.x + other.w <= frame.x ||
        frame.y + frame.h <= other.y || other.y + other.h <= frame.y);
    }
  }
  for (const item of officeLevel.props) {
    const entry = atlas.frames[item.frame];
    assert.deepEqual([entry.frame.w / 2, entry.frame.h / 2], [entry.worldSize.w, entry.worldSize.h]);
  }
  for (const item of [...officeLevel.walls, ...officeLevel.props, ...officeLevel.pitTiles]) assert.ok(atlas.frames[item.frame]);
  assert.equal(officeLevel.floorGrid, 32);
  assert.equal(officeLevel.navigationGrid, 32);
  assert.ok(Number.isInteger(officeLevel.floorSeed));
  for (const collider of officeLevel.colliders) {
    if (collider.polygon) continue;
    if (collider.w === 16) {
      assert.equal(collider.x % 32, 8);
      assert.equal(collider.y % 32, 16);
      assert.equal(collider.h, 16);
      continue;
    }
    assert.equal(collider.x % 32, 0); assert.equal(collider.y % 32, 0);
    assert.equal(collider.w, 32); assert.ok(collider.h === 32 || collider.h === 16);
  }
  assert.equal(officeLevel.id, 'liminal-office-01');
  for (const group of [officeLevel.walls, officeLevel.props, officeLevel.ground, officeLevel.colliders]) {
    assert.equal(new Set(group.map(item => item.id)).size, group.length);
  }
});

test('the hero can reach the cell edge behind a chair but cannot walk through its base', () => {
  const chair = officeLevel.props.find(prop => prop.frame === 'chair-back' && !prop.group);
  const nav = new OfficeNavigation();
  assert.equal(nav.clear(chair.x, chair.y - 16, 10), true);
  assert.equal(nav.clear(chair.x, chair.y + 8, 10), false);
});

test('wall bases occupy cell centres and right vertical bevels match mirrored corners', () => {
  for (const wall of officeLevel.walls) {
    assert.equal(wall.x % 32, 16); assert.equal(wall.y % 32, 16);
    if (!['wall-vertical', 'wall-vertical-joint', 'wall-end-bottom'].includes(wall.frame)) continue;
    const room = officeLevel.rooms.find(room => room.id === wall.room);
    assert.equal(wall.flipX, wall.x > room.x + room.w / 2);
  }
});

test('cooler groups use four inward-facing chair views with mirrored pairs', () => {
  assert.ok(officeLevel.groups.length >= 2);
  for (const group of officeLevel.groups) {
    const parts = officeLevel.props.filter(prop => prop.group === group.id);
    assert.equal(parts.length, 5);
    const chairs = parts.filter(prop => prop.frame.startsWith('chair-'));
    assert.equal(chairs.filter(prop => prop.frame === 'chair-front').length, 2);
    assert.equal(chairs.filter(prop => prop.frame === 'chair-back').length, 2);
    for (const chair of chairs) {
      assert.equal(chair.frame, chair.y < group.y ? 'chair-front' : 'chair-back');
      assert.equal(chair.flipX, chair.x < group.x);
    }
  }
});

test('pit blocks entry and permits sliding along its edge', () => {
  const nav = new OfficeNavigation();
  const hole = officeLevel.ground.at(-1);
  assert.equal(nav.clear(hole.x, hole.y, 10), false);
  const x = hole.x - 42, y = hole.y;
  assert.equal(nav.clear(x, y, 10), true);
  nav.move(x, y, x + 5, y + 5, 10);
  assert.equal(nav.resultX, x);
  assert.equal(nav.resultY, y + 5);
});

test('pit tiles overlap internally while keeping the outer footprint on its grid boundary', () => {
  let offset = 0;
  for (const pit of officeLevel.ground) {
    const shape = officePropDefinitions[pit.type].collisionCells.normal;
    const tiles = officeLevel.pitTiles.slice(offset, offset + shape.length);
    offset += shape.length;
    const left = Math.min(...shape.map(([x]) => x)), right = Math.max(...shape.map(([x]) => x));
    const top = Math.min(...shape.map(([, y]) => y)), bottom = Math.max(...shape.map(([, y]) => y));
    assert.equal(Math.min(...tiles.map(t => t.x - t.width / 2)), pit.x + left * 32);
    assert.equal(Math.max(...tiles.map(t => t.x + t.width / 2)), pit.x + (right + 1) * 32);
    assert.equal(Math.min(...tiles.map(t => t.y - t.height / 2)), pit.y + top * 32);
    assert.equal(Math.max(...tiles.map(t => t.y + t.height / 2)), pit.y + (bottom + 1) * 32);
    shape.forEach(([x, y], index) => {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const neighbor = shape.findIndex(([nx, ny]) => nx === x + dx && ny === y + dy);
        if (neighbor < 0) continue;
        const a = tiles[index], b = tiles[neighbor];
        const overlap = dx ? a.x + a.width / 2 - (b.x - b.width / 2) :
          a.y + a.height / 2 - (b.y - b.height / 2);
        assert.equal(overlap, 1);
      }
    });
  }
});

test('both overhanging desk-tip cells stay walkable, including mirrored desks', () => {
  const nav = new OfficeNavigation();
  for (const desk of officeLevel.props.filter(prop => prop.frame === 'desk-tilted-submerged')) {
    const own = officeLevel.colliders.filter(cell => cell.owners.includes(desk.id));
    assert.ok(own.length > 0);
    for (const side of [-1, 1]) {
      const tipCellX = desk.x + side * 64;
      assert.equal(own.some(cell => cell.x <= tipCellX && tipCellX < cell.x + cell.w), false);
      for (const cell of own) {
        const y = cell.y + 16;
        // No invisible footprint extends past either end of the image.
        const others = officeLevel.colliders.some(other => !other.owners.includes(desk.id) &&
          tipCellX >= other.x - 10 && tipCellX < other.x + other.w + 10 && y >= other.y - 10 && y < other.y + other.h + 10);
        if (!others) assert.equal(nav.clear(tipCellX, y, 10), true);
      }
    }
  }
});

test('vending machines fit exactly two floor cells with an anchor between their centres', () => {
  for (const prop of officeLevel.props.filter(prop => prop.frame === 'vending-machine')) {
    assert.equal(prop.x % 32, 0);
    const cells = officeLevel.colliders.filter(cell => cell.owners.includes(prop.id));
    assert.equal(cells.length, 2);
    assert.deepEqual(cells.map(cell => cell.x).sort((a,b) => a-b), [prop.x - 32, prop.x]);
    assert.equal(new Set(cells.map(cell => cell.y)).size, 1);
  }
});

test('marked footprints follow their polygon and mirror with the sprite', () => {
  const nav = new OfficeNavigation();
  for (const [type, vertices] of [['partition-diagonal', 4], ['table-through-partition', 14], ['desk-tilted-submerged', 5]]) {
    const [normal, mirrored] = compileOfficeColliders([
      { id: 'normal', type, x: 10, y: 10 },
      { id: 'mirror', type, x: 10, y: 10, flipX: true },
    ], officePropDefinitions, 32);
    assert.equal(normal.polygon.length, vertices);
    const anchor = 320 + officePropDefinitions[type].anchorOffset.x;
    for (let i = 0; i < vertices; i++) {
      assert.equal(normal.polygon[i][0] + mirrored.polygon[i][0], anchor * 2);
      assert.equal(normal.polygon[i][1], mirrored.polygon[i][1]);
    }
  }
  const wall = officeLevel.colliders.find(c => c.polygon?.length === 4);
  assert.equal(nav.clear(wall.x + wall.w / 2, wall.y + wall.h / 2, 1), false);
  assert.equal(nav.clear(wall.x + wall.w - 2, wall.y + 2, 1), true);
});

test('cabinet and conference prop images fit their cell-aligned placement rectangles', () => {
  const atlas = JSON.parse(readFileSync(new URL('../src/survivors/assets/office-atlas.json', import.meta.url)));
  for (const prop of officeLevel.props) {
    const anchor = officePropDefinitions[prop.frame].placement;
    if (!anchor) continue;
    const source = atlas.frames[prop.frame].worldSize;
    const f = { w: source.w * prop.scale, h: source.h * prop.scale };
    if (prop.frame === 'door') {
      const edge = prop.x + f.w / 2 - anchor.rightEdgeOffsetX;
      assert.ok(Math.abs(edge / 32 - Math.round(edge / 32)) < .00001);
    } else assert.equal(prop.x % 32, 0);
    assert.equal(prop.y % 32, 0);
    assert.ok(f.w <= anchor.visualCellsWide * 32);
    assert.ok(f.h <= anchor.visualCellsHigh * 32);
    if (prop.frame === 'table-through-partition') assert.equal((prop.x - f.w / 2) % 32, 0);
  }
});

test('saved map instances only use integer grid coordinates and shared prefab settings', () => {
  assert.equal(officeMap.coordinateSpace, 'cells');
  for (const item of [...officeMap.props, ...officeMap.walls, ...officeMap.ground]) {
    assert.ok(Number.isInteger(item.x) && Number.isInteger(item.y));
    assert.ok(officePropDefinitions[item.type]);
    assert.equal('offsetX' in item || 'offsetY' in item || 'anchorOffset' in item, false);
  }
  assert.equal('colliders' in officeMap, false);
});

test('changing a shared door offset updates all copies without modifying the map', () => {
  const before = JSON.stringify(officeMap.props);
  const defs = structuredClone(officePropDefinitions);
  defs.door.anchorOffset.x -= 8;
  const compiled = compileOfficeInstances(officeMap.props, defs, officeMap.cellSize);
  for (let i = 0; i < compiled.length; i++) {
    assert.equal(compiled[i].x, officeLevel.props[i].x - (compiled[i].type === 'door' ? 8 : 0));
  }
  assert.equal(JSON.stringify(officeMap.props), before);
});

test('collision cells come from the shared prefab at its grid anchor', () => {
  const door = officeMap.props.find(prop => prop.type === 'door');
  const cells = compileOfficeColliders([door], officePropDefinitions, officeMap.cellSize);
  const moved = compileOfficeColliders([{ ...door, x: door.x + 3, y: door.y - 2 }], officePropDefinitions, officeMap.cellSize);
  assert.equal(cells.length, moved.length);
  for (let i = 0; i < cells.length; i++) {
    assert.equal(moved[i].x, cells[i].x + 96);
    assert.equal(moved[i].y, cells[i].y - 64);
  }
});

test('player motion retains the requested free axis along a blocked cell', () => {
  const nav = new OfficeNavigation(), pit = officeLevel.ground.at(-1);
  const x = pit.x - 42, y = pit.y;
  nav.move(x, y, x + 2, y + 1, 10);
  assert.equal(nav.resultX, x); assert.equal(nav.resultY, y + 1);
  nav.move(x, y, x + 2, y - 1, 10);
  assert.equal(nav.resultX, x); assert.equal(nav.resultY, y - 1);
});

test('player glides around a rounded cell corner when both axis probes are blocked', () => {
  const nav = new OfficeNavigation(), pit = officeLevel.ground.at(-1);
  const cornerX = pit.x - 32, cornerY = pit.y - 32;
  const x = cornerX - 6, y = cornerY - 8;
  assert.equal(nav.clear(x, y, 10), true);
  nav.move(x, y, x + 2, y + .2, 10);
  assert.equal(nav.clear(nav.resultX, nav.resultY, 10), true);
  assert.ok(nav.resultX !== x || nav.resultY !== y);
});

test('closed room interior is excluded from spawning while the central arena remains reachable', () => {
  const nav = new OfficeNavigation(); nav.update(3072, 2304);
  assert.equal(nav.reachable(3072, 2304), true);
  for (const room of officeLevel.rooms.filter(room => room.closed)) {
      for (let y = room.y + 32; y < room.y + room.h - 32; y += 16) {
        for (let x = room.x + 32; x < room.x + room.w - 32; x += 16) {
          for (const radius of [12, 14, 23, 33]) assert.equal(nav.reachable(x, y, radius), false);
        }
      }
  }
});

test('direct pursuit stops at walls instead of finding a route around them', () => {
  const nav = new OfficeNavigation(); nav.update(3072, 2304);
  const room = officeLevel.rooms.find(room => !room.closed);
  let x = room.x + room.w / 2, y = room.y + room.h / 2;
  for (let cy = room.y + 80; cy < room.y + room.h - 80; cy += 16) {
    for (let cx = room.x + 80; cx < room.x + room.w - 80; cx += 16) {
      if (nav.reachable(cx, cy, 10)) { x = cx; y = cy; }
    }
  }
  assert.equal(nav.reachable(x, y, 10), true);
  const start = Math.hypot(x - 3072, y - 2304);
  for (let i = 0; i < 4000; i++) {
    const length = Math.hypot(3072 - x, 2304 - y);
    nav.move(x, y, x + (3072 - x) / length * 2, y + (2304 - y) / length * 2, 10);
    x = nav.resultX; y = nav.resultY;
    assert.equal(nav.clear(x, y, 10), true);
  }
  assert.ok(Math.hypot(x - 3072, y - 2304) <= start);
});

test('local steering slides toward the hero but never invents a backward detour', () => {
  const nav = new OfficeNavigation();
  const pit = officeLevel.ground.at(-1);
  let x = pit.x - 42, y = pit.y;
  nav.pursue(x, y, x + 2, y, 10);
  assert.equal(nav.resultX, x);
  assert.equal(nav.resultY, y);
  nav.pursue(x, y, x + 2, y + 1, 10);
  assert.equal(nav.resultX, x);
  assert.equal(nav.resultY, y + 1); // Preserve the original tangential speed.
  const sx = officeLevel.spawn.x, sy = officeLevel.spawn.y;
  nav.pursue(sx, sy, sx + 1.2, sy + .8, 10);
  assert.equal(nav.resultX, sx + 1.2);
  assert.equal(nav.resultY, sy + .8);
});

test('saved layout uses fewer balanced landmarks and persistent mirrored props', () => {
  assert.equal(officeLevel.rooms.length, 11);
  assert.ok(new Set(officeLevel.rooms.map(room => room.x)).size > 9);
  assert.ok(new Set(officeLevel.rooms.map(room => room.y)).size > 9);
  assert.equal(officeLevel.props.filter(prop => prop.id.startsWith('props-v3')).length, 75);
  assert.ok(officeLevel.props.filter(prop => prop.room === null).length > 40);
  const mirrored = officeLevel.props.filter(prop => prop.flipX).length;
  assert.ok(mirrored > 20 && mirrored < 55);
});
