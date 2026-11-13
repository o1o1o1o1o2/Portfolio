import assert from 'node:assert/strict';
import test from 'node:test';
import { heroAnimation, heroAnimationFrame } from '../src/survivors/hero-animation.ts';
import { Run } from '../src/survivors/run.ts';

test('diagonal input keeps the same animation direction while collision slides along either axis', () => {
  const run = new Run(() => .5);
  run.start();
  for (const [dx, dy] of [[1, 1], [1, 0], [0, 1], [0, 0]]) {
    run.navigation.move = (x, y) => {
      run.navigation.resultX = x + dx;
      run.navigation.resultY = y + dy;
    };
    run.step(1, 1);
    assert.equal(run.heroDirection, 1);
    assert.equal(run.heroMovingTicks > 0, Boolean(dx || dy));
  }
});

test('eight directions reuse five atlas rows and reflect only the missing east views', () => {
  assert.equal(heroAnimation.tracks.length, 5);
  assert.deepEqual(heroAnimation.directions.map(view => view.row), [0, 1, 2, 3, 4, 3, 2, 1]);
  assert.deepEqual(heroAnimation.directions.map(view => view.flipX),
    [false, true, true, true, false, false, false, false]);
});

test('playback follows GIF timing, wraps, and applies the configurable speed multiplier', () => {
  const duration = heroAnimation.tracks[0].frameDurationsMs[0];
  assert.equal(heroAnimationFrame(0, duration - 1, true).frame, 0);
  assert.equal(heroAnimationFrame(0, duration, true).frame, 1);
  assert.equal(heroAnimationFrame(0, duration * 8, true).frame, 0);
  const speed = heroAnimation.playbackSpeed;
  try {
    heroAnimation.playbackSpeed = 2;
    assert.equal(heroAnimationFrame(0, duration / 2, true).frame, 1);
  } finally {
    heroAnimation.playbackSpeed = speed;
  }
});

test('standing holds the configured contact pose, including for a mirrored direction', () => {
  assert.deepEqual(heroAnimationFrame(1, 5000, false), {
    frame: 8 + heroAnimation.tracks[1].idleFrame, flipX: true,
  });
});
