import config from './hero-walk.json' with { type: 'json' };

export const heroAnimation = config;

export function heroAnimationFrame(direction: number, elapsedMs: number, moving: boolean) {
  const view = config.directions[direction];
  const track = config.tracks[view.row];
  let column = track.idleFrame;
  if (moving) {
    const cycleMs = track.frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
    let time = (Math.max(0, elapsedMs) * Math.max(0, config.playbackSpeed)) % cycleMs;
    column = 0;
    while (column < config.framesPerDirection - 1 && time >= track.frameDurationsMs[column]) {
      time -= track.frameDurationsMs[column++];
    }
  }
  return { frame: view.row * config.framesPerDirection + column, flipX: view.flipX };
}
