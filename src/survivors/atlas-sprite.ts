import atlas from './assets/game-atlas.json';
import atlasUrl from './assets/game-atlas.png?url';

let sourceImage: HTMLImageElement | undefined;
/** Crop the actual atlas frame; neighbouring sprites must never enter the UI. */
export function atlasSprite(frameName: string, size: number) {
  const entry = atlas.frames[frameName as keyof typeof atlas.frames];
  const frame = entry.frame;
  const canvas = document.createElement('canvas');
  canvas.className = 'survivor-guide-sprite';
  canvas.width = entry.sourceSize.w;
  canvas.height = entry.sourceSize.h;
  canvas.style.width = `${size}px`;
  canvas.style.height = '100%';
  canvas.setAttribute('aria-hidden', 'true');
  if (!sourceImage) { sourceImage = new Image(); sourceImage.src = atlasUrl; }
  const image = sourceImage;
  const draw = () => canvas.getContext('2d')?.drawImage(image,
    frame.x, frame.y, frame.w, frame.h, entry.spriteSourceSize.x, entry.spriteSourceSize.y, frame.w, frame.h);
  if (image.complete && image.naturalWidth) draw();
  else image.addEventListener('load', draw, { once: true });
  return canvas;
}
