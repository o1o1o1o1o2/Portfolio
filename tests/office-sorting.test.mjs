import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { officeDepthProfiles, officeSupportY } from '../src/survivors/office-sorting.ts';
import { officeLevel, officePropDefinitions } from '../src/survivors/office-level.ts';

test('depth strips cover each source exactly, without duplicate or missing pixels', () => {
  const atlas = JSON.parse(readFileSync(new URL('../src/survivors/assets/office-atlas.json', import.meta.url)));
  for (const [name, p] of Object.entries(officeDepthProfiles)) {
    const scale = officePropDefinitions[name].scale ?? 1;
    const {w, h} = atlas.frames[name].worldSize;
    const halfCell = officeLevel.floorGrid / 2;
    let end = 0;
    for (const strip of p.slices) {
      assert.equal(strip.x, end);
      assert.ok(strip.width * scale <= halfCell + .5);
      if (end + strip.width < w) assert.ok(Math.abs(strip.width * scale - halfCell) <= .5);
      assert.equal(strip.anchorOffsetX, (strip.x - w / 2) * scale);
      assert.ok(strip.supportOffsetY > -h * scale && strip.supportOffsetY <= 0);
      end += strip.width;
    }
    assert.equal(end, w);
  }
});

test('table sides sort ahead of the hero independently from the central partition', () => {
  const p = officeDepthProfiles['table-through-partition'];
  const left = p.slices[0];
  const centre = p.slices[6];
  const leftSupport = officeSupportY(100, left.supportOffsetY);
  const centreSupport = officeSupportY(100, centre.supportOffsetY);
  assert.ok(leftSupport + 12 < centreSupport);
  const adjacentTableSupport = officeSupportY(100, p.slices[7].supportOffsetY);
  assert.ok(adjacentTableSupport + 12 < centreSupport);
});

test('vending machine uses one baked support point for its entire sprite', () => {
  const prop = officeLevel.props.find(p => p.frame === 'vending-machine');
  assert.equal(prop.depthProfile, null);
  assert.equal(officeSupportY(prop.y, prop.supportOffsetY), prop.y - 3);
});
