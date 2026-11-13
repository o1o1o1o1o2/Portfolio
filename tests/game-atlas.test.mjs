import assert from 'node:assert/strict';
import test from 'node:test';
import atlas from '../src/survivors/assets/game-atlas.json' with { type: 'json' };
import enemies from '../src/survivors/enemy-sprites.json' with { type: 'json' };
import projectiles from '../src/survivors/projectile-sprites.json' with { type: 'json' };
import hero from '../src/survivors/hero-walk.json' with { type: 'json' };
import upgradeSprites from '../src/survivors/upgrade-sprites.json' with { type: 'json' };
import { upgrades } from '../src/survivors/config.ts';

test('shared atlas contains every enemy, projectile and original hero frame', () => {
  assert.ok(atlas.frames['upgrade-sneakers']);
  assert.ok(atlas.frames['upgrade-sneakers'].frame.w <= 128);
  assert.ok(atlas.frames['bonus-mass-rejection']);
  assert.ok(atlas.frames['bonus-resume-collector']);
  for (const sprite of [...enemies.types, ...Object.values(projectiles)]) {
    assert.equal(sprite.texture, 'game-atlas');
    assert.ok(atlas.frames[sprite.frame], sprite.frame);
    const packed = atlas.frames[sprite.frame].frame;
    assert.deepEqual([sprite.x, sprite.y, sprite.width, sprite.height], [packed.x, packed.y, packed.w, packed.h]);
  }
  for (let i = 0; i < 40; i++) {
    const entry = atlas.frames['hero-walk-' + i];
    assert.deepEqual(entry.sourceSize, { w: hero.frameWidth, h: hero.frameHeight });
    assert.ok(entry.spriteSourceSize.x + entry.frame.w <= hero.frameWidth);
    assert.ok(entry.spriteSourceSize.y + entry.frame.h <= hero.frameHeight);
  }
  for (const { frame } of Object.values(atlas.frames)) {
    assert.ok(frame.w <= 128 && frame.h <= 128);
    assert.ok(frame.x >= 0 && frame.y >= 0);
    assert.ok(frame.x + frame.w <= atlas.meta.size.w);
    assert.ok(frame.y + frame.h <= atlas.meta.size.h);
  }
  assert.equal(projectiles.rejection.rotationDegrees, 0);
});

test('compact atlas fits 1280 square, has no overlapping frames and covers every upgrade', () => {
  assert.deepEqual(atlas.meta.size, { w: 1280, h: 1280 });
  assert.equal(upgradeSprites.length, upgrades.length);
  assert.equal(upgradeSprites[0], null); // Envelopes use the exact live procedural projectile texture.
  for (const name of upgradeSprites.slice(1)) assert.ok(atlas.frames[name], name);
  const frames = Object.values(atlas.frames).map(entry => entry.frame);
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    const a = frames[i], b = frames[j];
    assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
  }
});
