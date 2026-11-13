import type Phaser from 'phaser';

export const AREA_TEXTURE_RADIUS = 108;
/** Bake the decorative work once. All live effects share one texture and pooled images. */
export function makeAreaTextures(scene: Phaser.Scene) {
  const texture = scene.textures.createCanvas('area-vfx', 1024, 256)!;
  const c = texture.getContext();
  const ring = (radius: number, color: string, width: number, dash: number[] = []) => {
    c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash);
    c.beginPath(); c.arc(128, 128, radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  };
  for (let frame = 0; frame < 4; frame++) {
    c.save(); c.translate(frame * 256, 0);
    if (frame < 3) {
      const color = frame === 0 ? '#62d5c5' : frame === 1 ? '#ed83b7' : '#b48aff';
      const glow = c.createRadialGradient(128, 128, 72, 128, 128, 118);
      glow.addColorStop(0, 'transparent'); glow.addColorStop(.7, color + '20'); glow.addColorStop(1, 'transparent');
      c.fillStyle = glow; c.fillRect(0, 0, 256, 256);
      if (frame === 0) {
        c.fillStyle = '#62d5c50d';
        c.beginPath(); c.arc(128, 128, 108, 0, Math.PI * 2); c.fill();
        ring(97, '#62d5c51a', 1);
        for (let i = 0; i < 4; i++) {
          c.strokeStyle = '#bdfff232'; c.lineWidth = 3;
          c.beginPath(); c.arc(128, 128, 108, i * Math.PI / 2, i * Math.PI / 2 + .42); c.stroke();
        }
        for (let i = 0; i < 4; i++) {
          c.save(); c.translate(128, 128); c.rotate(i * Math.PI / 2);
          c.fillStyle = '#d7fff02f'; c.fillRect(102, -1, 12, 2); c.restore();
        }
      } else if (frame === 1) {
        c.save(); c.beginPath(); c.arc(128, 128, 93, 0, Math.PI * 2); c.clip();
        c.strokeStyle = '#ed83b720'; c.lineWidth = 1;
        for (let q = -256; q < 512; q += 16) {
          c.beginPath(); c.moveTo(q, 0); c.lineTo(q + 256, 256); c.stroke();
        }
        c.restore();
        ring(108, '#ed83b7bd', 2, [12, 4, 2, 4]); ring(99, '#ed83b74d', 1);
        for (let i = 0; i < 6; i++) {
          c.save(); c.translate(128, 128); c.rotate(i * Math.PI / 3);
          c.fillStyle = '#ffe0ac'; c.fillRect(104, -3, 8, 6); c.restore();
        }
      } else {
        for (let i = 0; i < 12; i++) {
          c.strokeStyle = i % 3 ? '#b48affb3' : '#ffa8d0d9'; c.lineWidth = i % 3 ? 2 : 4;
          c.beginPath(); c.arc(128 + (i % 3 - 1) * 2, 128, 105 + (i % 2) * 3,
            i * Math.PI / 6, i * Math.PI / 6 + .33); c.stroke();
        }
      }
    } else {
      c.translate(128, 128); c.rotate(-.14);
      c.strokeStyle = '#f08abb80'; c.lineWidth = 3; c.strokeRect(-59, -21, 118, 42);
      c.fillStyle = '#f5aad080'; c.font = 'bold 23px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('ОТКАЗ', 0, 1);
    }
    c.restore();
    texture.add(['aura', 'zone', 'impact', 'label'][frame], 0, frame * 256, 0, 256, 256);
  }
  texture.refresh();
}
