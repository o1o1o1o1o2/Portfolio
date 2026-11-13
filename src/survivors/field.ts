import Phaser from 'phaser';
import { heroAnimation, heroAnimationFrame } from './hero-animation.ts';
import { enemies, FINAL_BOSS_KIND, pickupPresentation, STEP, VIEW_HEIGHT, VIEW_WIDTH, WORLD_HEIGHT, WORLD_WIDTH,
  bonusConfig, bossConfig, deathEffectConfig, dropKind, orbitConfig, fallingStamp, auraRadius, victoryConfig, projectileSizeMultiplier, enemyBulletSizeMultiplier, folderConfig } from './config.ts';
import type { Pool } from './pool.ts';
import type { Run } from './run.ts';
import { DAMAGE_NUMBER_TICKS } from './damage-numbers.ts';
import enemySprites from './enemy-sprites.json';
import projectileSprites from './projectile-sprites.json';
import gameAtlas from './assets/game-atlas.json';
import enemyDissolve from './enemy-dissolve.json';
import { officeLevel } from './office-level.ts';
import { officeDepthProfiles, officeSupportY } from './office-sorting.ts';
import officeAtlas from './assets/office-atlas.json';
import { makeAreaTextures, AREA_TEXTURE_RADIUS } from './area-vfx';
import { heroQuips } from './hero-quips';
import type { Locale } from './text';

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const OFFICE_PROP_SCALE = .5;
const enemyRenderScales = enemySprites.types.map(type => enemySprites.baseHeight * type.sizeMultiplier / type.height);
const dissolveRenderScales = enemySprites.types.map((type, kind) =>
  enemySprites.baseHeight * type.sizeMultiplier / enemyDissolve[kind].height);
const BOSS_RENDER_MARGIN = 180;
const BOSS_ENTRANCE_SECONDS = .48;
const officeRenderProfiles = Object.fromEntries(Object.entries(officeDepthProfiles).map(([name, profile]) =>
  [name, { ...profile, slices: profile.slices.map(slice => ({ ...slice, frame: `${name}-strip-${slice.x}` })) }]));
const officePropRenderItems = officeLevel.props.map(item => {
  const scale = OFFICE_PROP_SCALE * item.scale;
  const scaleX = item.flipX ? -scale : scale;
  const x = item.x + item.drawOffset.x, y = item.y + item.drawOffset.y;
  const profile = item.depthProfile ? officeRenderProfiles[item.depthProfile] : undefined;
  const depth = (offset: number) => 4 + officeSupportY(item.y, offset) / WORLD_HEIGHT;
  const parts = profile ? profile.slices.map(slice => ({
    x: x + (item.flipX ? -slice.anchorOffsetX : slice.anchorOffsetX),
    frame: slice.frame, originX: 0, originY: 1, depth: depth(slice.supportOffsetY),
  })) : [{ x, frame: item.frame, originX: item.origin.x, originY: item.origin.y, depth: depth(item.supportOffsetY) }];
  return { x: item.x, y: item.y, drawY: y, scale, scaleX, parts };
});
// One pixel per connected edge gives a two-pixel overlap without expanding exposed ends.
const wallLocations = new Set(officeLevel.walls.map(wall => `${wall.x}:${wall.y}`));
const wallRenderItems = officeLevel.walls.map(wall => {
  const step = officeLevel.floorGrid * 2;
  // Extend straight tiles along their run. Corners keep both bands aligned
  // with the neighbouring tiles by retaining their original size.
  const horizontal = wall.type.startsWith('wall-horizontal');
  const vertical = wall.type.startsWith('wall-vertical');
  const left = horizontal && wallLocations.has(`${wall.x - step}:${wall.y}`) ? 1 : 0;
  const right = horizontal && wallLocations.has(`${wall.x + step}:${wall.y}`) ? 1 : 0;
  const top = vertical && wallLocations.has(`${wall.x}:${wall.y - step}`) ? 1 : 0;
  const bottom = vertical && wallLocations.has(`${wall.x}:${wall.y + step}`) ? 1 : 0;
  const frame = officeAtlas.frames[wall.frame as keyof typeof officeAtlas.frames].frame;
  return { ...wall, depth: 4 + officeSupportY(wall.y, wall.supportOffsetY) / WORLD_HEIGHT,
    renderScaleX: (frame.w + left + right) / frame.w,
    renderScaleY: (frame.h + top + bottom) / frame.h,
    bleedX: (right - left) / 2, bleedY: -top };
});

class Images {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private previouslyUsed = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly depth: number,
    private readonly worldLayer?: Phaser.GameObjects.Layer) {}

  begin() { this.previouslyUsed = this.used; this.used = 0; }
  draw(key: string, x: number, y: number, rotation = 0, scale = 1, alpha = 1,
    frame?: string, scaleY = scale, originY = .5, originX = .5, tint = 0xffffff, flash = false, depth = this.depth) {
    let image = this.images[this.used];
    if (!image) {
      image = this.scene.add.image(x, y, key).setDepth(this.depth);
      this.images.push(image);
    }
    const displayList = this.worldLayer && depth >= 4 && depth < 5 ? this.worldLayer : this.scene.children;
    if (image.displayList !== displayList) {
      image.removeFromDisplayList();
      displayList.add(image);
    }
    this.used++;
    if (image.texture.key !== key || (frame !== undefined && image.frame.name !== frame)) image.setTexture(key, frame);
    if (image.originX !== originX || image.originY !== originY) image.setOrigin(originX, originY);
    image.setPosition(x, y).setRotation(rotation).setScale(scale, scaleY).setAlpha(alpha).setVisible(true);
    // Phaser queues a scene-wide sort even when an unchanged depth is assigned.
    if (image.depth !== depth) image.setDepth(depth);
    if (image.tint !== tint) image.setTint(tint);
    const tintMode = flash ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY;
    if (image.tintMode !== tintMode) image.setTintMode(tintMode);
  }

  end() {
    for (let i = this.used; i < this.previouslyUsed; i++) this.images[i].setVisible(false);
  }
}

function makeTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const save = (name: string, w: number, h: number) => {
    g.generateTexture(name, w, h);
    g.clear();
  };
  g.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
  save('health-pixel', 1, 1);

  // Bake seeded variation once. Rendering remains one repeating TileSprite.
  const officeSize = 1024;
  let floorSeed = officeLevel.floorSeed >>> 0;
  const randomFloor = () => { floorSeed = (Math.imul(floorSeed, 1664525) + 1013904223) >>> 0; return floorSeed / 4294967296; };
  g.fillStyle(0x24243f).fillRect(0, 0, officeSize, officeSize);
  for (let row = 0; row < 32; row++) for (let col = 0; col < 32; col++) {
    const x = col * 32, y = row * 32;
    const tone = Math.floor(randomFloor() * 9) - 4;
    const color = ((49 + tone) << 16) | ((47 + tone) << 8) | (73 + tone);
    g.fillStyle(color).fillRect(x + 1, y + 1, 31, 31);
    for (let by = 0; by < 32; by += 8) for (let bx = 0; bx < 32; bx += 8) {
      const grain = Math.floor(randomFloor() * 3) - 1;
      if (!grain) continue;
      const shade = tone + grain;
      const blockColor = ((49 + shade) << 16) | ((47 + shade) << 8) | (73 + shade);
      const insetX = bx === 0 ? 1 : 0, insetY = by === 0 ? 1 : 0;
      g.fillStyle(blockColor).fillRect(x + bx + insetX, y + by + insetY, 8 - insetX, 8 - insetY);
    }
    g.lineStyle(1, 0x484568, .25).lineBetween(x + 2, y + 1, x + 30, y + 1);
  }
  save('floor', officeSize, officeSize);

  const glow = scene.textures.createCanvas('stamp-glow', 96, 48);
  if (glow) {
    const context = glow.context;
    // Peak at the actual sign border, fading outward rather than toward its centre.
    // Bake once; all orbiting signs share this texture.
    const pixels = context.createImageData(96, 48);
    const halfWidth = projectileSprites.rejection.displayWidth / orbitConfig.glowWidth * 48;
    const halfHeight = halfWidth * projectileSprites.rejection.height / projectileSprites.rejection.width;
    const fadeDistance = (24 - halfHeight) * .82;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 96; x++) {
      const dx = Math.abs(x - 47.5) - halfWidth;
      const dy = Math.abs(y - 23.5) - halfHeight;
      const distance = Math.hypot(Math.max(0, dx), Math.max(0, dy)) + Math.min(0, Math.max(dx, dy));
      const t = Math.max(0, 1 - Math.max(0, distance) / fadeDistance);
      // Fade quickly near the sign and reach zero with a flat slope.
      const alpha = t * t * t;
      const offset = (y * 96 + x) * 4;
      pixels.data[offset] = 255; pixels.data[offset + 1] = 65; pixels.data[offset + 2] = 105;
      pixels.data[offset + 3] = Math.round(255 * alpha);
    }
    context.putImageData(pixels, 0, 0); glow.refresh();
  }
  g.fillStyle(0xff276b, .2).fillCircle(12, 12, 12);
  g.fillStyle(0xff446e).fillCircle(12, 12, 8);
  g.fillStyle(0xffd6df).fillCircle(10, 10, 4);
  save('boss-orb', 24, 24);

  g.fillStyle(0x43b8ff, .12).fillRoundedRect(2, 1, 44, 24, 9);
  g.fillStyle(0x4abbff, .325).fillTriangle(1, 13, 26, 5, 26, 21);
  g.fillStyle(0xdefaff).fillRoundedRect(21, 5, 22, 16, 3);
  g.lineStyle(2, 0x3899e6).lineBetween(22, 7, 32, 14).lineBetween(32, 14, 42, 7);
  save('shot-0', 48, 26);

  g.fillStyle(0xffd26e).fillRoundedRect(2, 5, 27, 19, 3).fillRect(4, 3, 12, 6);
  g.lineStyle(2, 0xb26f48).lineBetween(7, 13, 24, 13).lineBetween(7, 18, 22, 18);
  save('shot-3', 32, 28);

  g.fillStyle(0x63cfff, .18).fillCircle(10, 10, 10);
  g.fillStyle(0x7ce6ff).fillTriangle(10, 2, 3, 10, 17, 10).fillTriangle(3, 10, 10, 18, 17, 10);
  save('drop-0', 20, 20);
  g.fillStyle(0xffba32, .25).fillCircle(18, 18, 18);
  g.fillStyle(0xc98c1f).fillRect(6, 9, 24, 16)
    .fillTriangle(18, 2, 6, 9, 30, 9).fillTriangle(6, 25, 30, 25, 18, 34);
  g.fillStyle(0xffc43c).fillTriangle(18, 2, 6, 9, 18, 26).fillTriangle(18, 2, 18, 26, 30, 9);
  g.fillStyle(0xfff8c0).fillTriangle(18, 5, 10, 10, 18, 18);
  save('drop-3', 36, 36);
  g.fillStyle(0xff3653, .28).fillCircle(18, 18, 18);
  g.fillStyle(0xc91f45).fillRect(6, 9, 24, 16)
    .fillTriangle(18, 2, 6, 9, 30, 9).fillTriangle(6, 25, 30, 25, 18, 34);
  g.fillStyle(0xff536b).fillTriangle(18, 2, 6, 9, 18, 26).fillTriangle(18, 2, 18, 26, 30, 9);
  g.fillStyle(0xffa7a8).fillTriangle(18, 5, 10, 10, 18, 18);
  save('drop-4', 36, 36);
  g.destroy();
}

export class Field {
  private readonly office: Images;
  private readonly tiles: Phaser.GameObjects.TileSprite;
  private readonly boundary: Phaser.GameObjects.Rectangle;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly health: Images;
  private readonly mobs: Images;
  private readonly dyingMobs: Images;
  private readonly bullets: Images;
  private readonly pickups: Images;
  private readonly stamps: Images;
  private readonly areas: Images;
  private readonly damageTexts: Phaser.GameObjects.BitmapText[] = [];
  private readonly damageScene: Phaser.Scene;
  private readonly damageFonts = ['damage-gold', 'damage-pink'];
  private readonly hero: Phaser.GameObjects.Image;
  private readonly speech: Phaser.GameObjects.Text;
  private readonly speechBubble: Phaser.GameObjects.Graphics;
  private readonly victoryFx: Phaser.GameObjects.Graphics;
  private readonly victoryTitle: Phaser.GameObjects.Text;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly enemyKeys = enemies.map((_, index) => 'enemy-' + index);
  private readonly shotKeys = ['shot-0', 'shot-1', 'shot-2', 'shot-3', 'boss-orb'];
  private readonly dropKeys = ['drop-0', 'drop-1', 'drop-2', 'drop-3', 'drop-4'];

  constructor(scene: Phaser.Scene, private readonly locale: Locale = 'ru') {
    makeTextures(scene);
    makeAreaTextures(scene);
    scene.textures.get('game-atlas').setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get('office-atlas').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const officeTexture = scene.textures.get('office-atlas');
    for (const [name, profile] of Object.entries(officeRenderProfiles)) {
      const source = officeAtlas.frames[name as keyof typeof officeAtlas.frames].frame;
      for (const slice of profile.slices) {
        const key = slice.frame;
        if (!officeTexture.has(key)) officeTexture.add(key, 0,
          source.x + slice.x / OFFICE_PROP_SCALE, source.y, slice.width / OFFICE_PROP_SCALE, source.h);
      }
    }
    const worldLayer = scene.add.layer().setDepth(4);
    this.office = new Images(scene, 4, worldLayer);
    this.tiles = scene.add.tileSprite(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 'floor').setOrigin(0);
    this.boundary = scene.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .setOrigin(0).setStrokeStyle(4, 0x7b699e, .75).setDepth(1);
    this.fx = scene.add.graphics().setDepth(2);
    this.areas = new Images(scene, 2);
    this.pickups = new Images(scene, 3);
    this.mobs = new Images(scene, 4, worldLayer);
    this.dyingMobs = new Images(scene, 4.5, worldLayer);
    this.hero = scene.add.image(0, 0, 'game-atlas', 'hero-walk-0').setDepth(5)
      .setOrigin(.5, heroAnimation.originY)
      .setDisplaySize(heroAnimation.displaySize, heroAnimation.displaySize);
    this.bullets = new Images(scene, 6);
    this.stamps = new Images(scene, 7);
    worldLayer.add(this.hero);
    this.health = new Images(scene, 8);
    this.damageScene = scene;
    this.speechBubble = scene.add.graphics().setDepth(10);
    this.speech = scene.add.text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '12px',
      fontStyle: 'bold', letterSpacing: .6, color: '#49304e', resolution: 2 })
      .setOrigin(0, .5).setDepth(10).setVisible(false);
    this.victoryFx = scene.add.graphics().setDepth(11);
    this.victoryTitle = scene.add.text(0, 0, locale === 'ru' ? 'ПОБЕДА!\nВакансия закрыта' : 'VICTORY!\nVacancy filled',
      { fontFamily: 'sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#ffe4b1',
        align: 'center', stroke: '#49304e', strokeThickness: 4, resolution: 2 })
      .setOrigin(.5).setDepth(12).setVisible(false);
    const digits = scene.textures.createCanvas('damage-digits', 180, 48)!;
    const ctx = digits.getContext();
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#241829';
    for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
      const color = ['#ffe6a3', '#ff8a9f'][rowIndex];
      const row = rowIndex * 24;
      for (let digit = 0; digit < 10; digit++) {
        ctx.fillStyle = color;
        ctx.strokeText(String(digit), digit * 18 + 9, row + 12);
        ctx.fillText(String(digit), digit * 18 + 9, row + 12);
      }
      const font = Phaser.GameObjects.RetroFont.Parse(scene, {
        image: 'damage-digits', width: 18, height: 24, chars: '0123456789',
        charsPerRow: 10, 'offset.x': 0, 'offset.y': row,
        'spacing.x': 0, 'spacing.y': 0, lineSpacing: 0,
      })!;
      for (const glyph of Object.values((font as unknown as { data: { chars: Record<string, { xAdvance: number }> } }).data.chars)) glyph.xAdvance = 10;
      scene.cache.bitmapFont.add(this.damageFonts[rowIndex], font);
    }
    digits.refresh();
  }

  draw(run: Run, progress: number) {
    const heroX = lerp(run.previousX, run.x, progress);
    const heroY = lerp(run.previousY, run.y, progress);
    let x = run.cameraLeft(heroX), y = run.cameraTop(heroY);
    const time = Math.max(0, run.time - STEP * (1 - progress));
    const entrance = run.bossSpawnTick >= 0 && !run.bossDefeated && !this.reducedMotion
      ? Math.max(0, time - run.bossSpawnTick * STEP) : Infinity;
    const entranceFlash = entrance < .09 || (entrance >= .16 && entrance < .23);
    if (entrance < BOSS_ENTRANCE_SECONDS) {
      const strength = 15 * (1 - entrance / BOSS_ENTRANCE_SECONDS) ** 2;
      x += Math.cos(entrance * 89) * strength;
      y += Math.sin(entrance * 113) * strength;
    }
    this.office.begin();
    const obstacleAlpha = run.obstacleAlpha;
    if (obstacleAlpha > 0) {
    for (const item of officeLevel.pitTiles) {
      const sx = item.x - x, sy = item.y - y;
      if (sx < -80 || sy < -80 || sx > run.viewWidth + 80 || sy > run.viewHeight + 80) continue;
      this.office.draw('office-atlas', sx, sy, 0, (item.flipX ? -1 : 1) * item.width / officeLevel.floorGrid,
        obstacleAlpha, item.frame, item.height / officeLevel.floorGrid, .5, .5, 0xffffff, false, 1.5);
    }
    for (const item of wallRenderItems) {
      const sx = item.x - x, sy = item.y - y;
      if (sx < -160 || sy < -160 || sx > run.viewWidth + 160 || sy > run.viewHeight + 160) continue;
      this.office.draw('office-atlas', sx + item.drawOffset.x + item.bleedX, sy + item.drawOffset.y + item.bleedY,
        0, (item.flipX ? -1 : 1) * item.renderScaleX,
        obstacleAlpha, item.frame, item.renderScaleY, item.origin.y, item.origin.x, 0xffffff, false, item.depth);
    }
    for (const item of officePropRenderItems) {
      const sx = item.x - x, sy = item.y - y;
      if (sx < -160 || sy < -160 || sx > run.viewWidth + 160 || sy > run.viewHeight + 160) continue;
      for (const part of item.parts) {
        this.office.draw('office-atlas', part.x - x, item.drawY - y, 0, item.scaleX,
          obstacleAlpha, part.frame, item.scale, part.originY, part.originX, 0xffffff, false, part.depth);
      }
    }
    }
    this.office.end();
    if (this.tiles.width !== run.viewWidth || this.tiles.height !== run.viewHeight) {
      this.tiles.setSize(run.viewWidth, run.viewHeight);
    }
    if (this.tiles.tilePositionX !== x) this.tiles.tilePositionX = x;
    if (this.tiles.tilePositionY !== y) this.tiles.tilePositionY = y;
    this.boundary.setPosition(-x, -y);
    const g = this.fx.clear();
    const wallAlpha = run.arenaWallAlpha;
    if (wallAlpha > 0) {
      g.lineStyle(6, 0x49385e, wallAlpha).strokeRect(3, 3, run.viewWidth - 6, run.viewHeight - 6);
      g.lineStyle(2, 0xa788bb, wallAlpha).strokeRect(5, 5, run.viewWidth - 10, run.viewHeight - 10);
    }
    this.health.begin();
    this.areas.begin();
    if (run.levels[2]) {
      const radius = auraRadius(run.levels[2]);
      this.areas.draw('area-vfx', heroX - x, heroY - y, time * .18,
        radius / AREA_TEXTURE_RADIUS, .75 + Math.sin(time * 2) * .1, 'aura');
    }
    if (run.zoneLife > 0) {
      const radius = run.zoneRadius;
      this.areas.draw('area-vfx', run.zoneX - x, run.zoneY - y, time * .07, radius / AREA_TEXTURE_RADIUS, 1, 'zone');
      this.areas.draw('area-vfx', run.zoneX - x, run.zoneY - y, 0, Math.min(.75, radius / AREA_TEXTURE_RADIUS), .8, 'label');
    }
    for (let stamp = 0; stamp < run.stampCount; stamp++) {
    const age = (run.ticks - run.stampImpactTicks[stamp] - (1 - progress)) * STEP;
    if (age < -fallingStamp.fallTime || age >= fallingStamp.impactTime) continue;
    const sx = run.stampPositions[stamp * 2] - x, sy = run.stampPositions[stamp * 2 + 1] - y;
    if (age < 0) {
      const t = 1 + age / fallingStamp.fallTime;
      const head = sy - fallingStamp.fallHeight * (1 - t * t);
      g.fillStyle(0xffc76e, .16).fillCircle(sx, sy, 8);
      this.areas.draw('area-vfx', sx, sy, -time * .1, fallingStamp.radius / AREA_TEXTURE_RADIUS, .35, 'impact');
      this.areas.draw('area-vfx', sx, sy, 0, .6, .55, 'label');
      g.fillStyle(0xffa65d, .5).fillRect(sx - 3, head - 24, 6, 24);
      g.fillStyle(0xffedc6).fillRoundedRect(sx - 4, head - 12, 8, 16, 2);
    } else {
      const alpha = 1 - age / fallingStamp.impactTime;
      const radius = fallingStamp.radius * (1 - alpha ** 4);
      this.areas.draw('area-vfx', sx, sy, time * .16, radius / AREA_TEXTURE_RADIUS, alpha, 'impact');
      this.areas.draw('area-vfx', sx, sy, 0, .75, Math.min(1, alpha * 2), 'label');
      g.lineStyle(2, 0xffb2da, alpha * .6).strokeCircle(sx, sy, radius);
      for (let particle = 0; particle < 10; particle++) {
        const angle = particle * 2.39996;
        const distance = radius * (.55 + (particle % 3) * .15);
        g.fillStyle(particle % 3 ? 0xbb8dff : 0xffb2da, alpha * .8)
          .fillRect(sx + Math.cos(angle) * distance, sy + Math.sin(angle) * distance, 3, 3);
      }
    }
    }
    this.areas.end();
    this.drawPool(run.drops, this.pickups, this.dropKeys, run, x, y, time, progress, 0);
    this.drawPool(run.enemies, this.mobs, this.enemyKeys, run, x, y, time, progress, 1, entranceFlash);
    this.drawDeaths(run, x, y, progress);
    this.drawPool(run.shots, this.bullets, this.shotKeys, run, x, y, time, progress, 2);
    const pose = heroAnimationFrame(run.heroDirection,
      Math.max(0, run.heroMovingTicks - 1 + progress) * STEP * 1000, run.heroMovingTicks > 0);
    this.hero.setPosition(heroX - x, heroY - y).setFlipX(pose.flipX);
    const heroFrame = 'hero-walk-' + pose.frame;
    if (this.hero.frame.name !== heroFrame) this.hero.setFrame(heroFrame);
    const heroDepth = 4 + heroY / WORLD_HEIGHT;
    if (this.hero.depth !== heroDepth) this.hero.setDepth(heroDepth);
    this.hero.setAlpha(run.invulnerable > 0 && Math.floor(run.time * 20) % 2 === 0 ? .45 : 1);
    this.drawHealth(heroX - x, heroY - y + 4, 36, run.mood / run.maxMood, 0x81e4a3);
    this.speechBubble.clear();
    const speaking = run.quip >= 0 && run.time < run.quipUntil;
    this.speech.setVisible(speaking);
    if (speaking) {
      const phrase = heroQuips[this.locale][run.quip];
      if (this.speech.text !== phrase) {
        this.speech.setText(phrase);
        // Text is rasterized separately from the pixel-art sprites.
        this.speech.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      const width = this.speech.width + 14, height = this.speech.height + 10;
      const left = Math.max(5, Math.min(run.viewWidth - width - 5, heroX - x + 14));
      const top = Math.max(5, heroY - y - 65);
      const alpha = Math.min(1, (run.quipUntil - run.time) / .2);
      this.speechBubble.fillStyle(0xffedcc, alpha).lineStyle(1, 0xb276a1, alpha)
        .fillRoundedRect(left, top, width, height, 5).strokeRoundedRect(left, top, width, height, 5)
        .fillTriangle(left + 8, top + height - 1, left + 15, top + height - 1, left + 8, top + height + 5);
      this.speech.setPosition(left + 7, top + height / 2).setAlpha(alpha);
    }
    this.drawDamage(run, x, y, progress);
    this.stamps.begin();
    for (let i = 0; i < run.orbitCount; i++) {
      const sx = lerp(run.previousOrbitX[i], run.orbitX[i], progress) - x;
      const sy = lerp(run.previousOrbitY[i], run.orbitY[i], progress) - y;
      const stamp = projectileSprites.rejection;
      this.stamps.draw('stamp-glow', sx, sy, 0, orbitConfig.glowWidth / 96, orbitConfig.glowOpacity);
      this.stamps.draw(stamp.texture, sx, sy, stamp.rotationDegrees * Math.PI / 180,
        stamp.displayWidth / stamp.width, orbitConfig.opacity, stamp.frame);
    }
    this.stamps.end();
    if (run.bossSpawned && !run.bossDefeated) {
      for (let i = 0; i < run.enemies.count; i++) {
        if (run.enemies.kind[i] === FINAL_BOSS_KIND) {
          const sx = lerp(run.enemies.previousPosition[i * 2], run.enemies.position[i * 2], progress) - x;
          const sy = lerp(run.enemies.previousPosition[i * 2 + 1], run.enemies.position[i * 2 + 1], progress) - y;
          if (run.bossWindup > 0) g.lineStyle(3, 0xff5574, .8).strokeCircle(sx, sy, 42);
          const boss = run.boss;
          if (boss.attack === 'laser' && (boss.lasersActive || boss.phase === 'windup')) {
            for (let ray = 0; ray < bossConfig.laserCount; ray++) {
              const angle = boss.angle + ray * Math.PI * 2 / bossConfig.laserCount;
              const ex = sx + Math.cos(angle) * bossConfig.laserLength;
              const ey = sy + Math.sin(angle) * bossConfig.laserLength;
              if (boss.lasersActive) {
                g.lineStyle(bossConfig.laserWidth * 2, 0xff2266, .2).lineBetween(sx, sy, ex, ey);
                g.lineStyle(bossConfig.laserWidth, 0xff497c, .8).lineBetween(sx, sy, ex, ey);
                g.lineStyle(2, 0xffecf1, .95).lineBetween(sx, sy, ex, ey);
              } else g.lineStyle(2, 0xff667f, .45).lineBetween(sx, sy, ex, ey);
            }
          } else if (boss.attack === 'dash' && boss.phase === 'windup') {
            const ux = Math.cos(boss.angle), uy = Math.sin(boss.angle);
            const distance = bossConfig.dashDistance;
            const tipX = sx + ux * distance, tipY = sy + uy * distance;
            const baseX = tipX - ux * 18, baseY = tipY - uy * 18;
            g.lineStyle(4, 0xff4967, .85).lineBetween(sx, sy, baseX, baseY);
            g.fillStyle(0xff4967, .85).fillTriangle(tipX, tipY,
              baseX - uy * 9, baseY + ux * 9, baseX + uy * 9, baseY - ux * 9);
          }
          break;
        }
      }
    }
    if (run.bonusFlash > 0) {
      const t = 1 - run.bonusFlash / bonusConfig.flashSeconds;
      g.fillStyle(0xff497c, (1 - t) * .12).fillRect(0, 0, run.viewWidth, run.viewHeight);
      g.lineStyle(5, 0xff9cbf, 1 - t).strokeCircle(heroX - x, heroY - y,
        t * run.encounterRadius);
    }
    this.health.end();
    const vfx = this.victoryFx.clear();
    const celebrating = run.victoryRemaining > 0;
    this.victoryTitle.setVisible(celebrating && run.victoryRemaining < victoryConfig.seconds - victoryConfig.titleAfter);
    if (celebrating) {
      const elapsed = victoryConfig.seconds - run.victoryRemaining;
      const burst = Math.min(1, elapsed / .65);
      if (!this.reducedMotion && elapsed < .5) {
        vfx.fillStyle(0xffe8ce, .14 * Math.sin(elapsed / .5 * Math.PI * 2) ** 2)
          .fillRect(0, 0, run.viewWidth, run.viewHeight);
      }
      vfx.lineStyle(3 * (1 - burst) + 1, 0xffb7dc, (1 - burst) * .8)
        .strokeCircle(run.victoryX - x, run.victoryY - y, 20 + burst * 140);
      const reveal = Math.min(1, Math.max(0, elapsed - victoryConfig.titleAfter) / .2);
      this.victoryTitle.setPosition(run.viewWidth / 2, run.viewHeight * .3).setAlpha(reveal);
    }
  }

  private drawDeaths(run: Run, cameraX: number, cameraY: number, progress: number) {
    this.dyingMobs.begin();
    const pool = run.deaths;
    for (let i = 0; i < pool.count; i++) {
      const kind = pool.kind[i];
      const x = pool.position[i * 2] - cameraX, y = pool.position[i * 2 + 1] - cameraY;
      const margin = kind === FINAL_BOSS_KIND ? BOSS_RENDER_MARGIN : 80;
      if (x < -margin || x > run.viewWidth + margin || y < -margin || y > run.viewHeight + margin) continue;
      const duration = kind === FINAL_BOSS_KIND ? victoryConfig.deathSeconds : deathEffectConfig.seconds;
      const t = Math.min(1, 1 - Math.max(0, pool.life[i] - progress * STEP) / duration);
      const type = enemySprites.types[kind];
      const dissolve = enemyDissolve[kind];
      const scale = dissolveRenderScales[kind];
      const frame = dissolve.frames[Math.min(dissolve.frames.length - 1, Math.floor(t * dissolve.frames.length))];
      this.dyingMobs.draw(type.texture, x, y, pool.b[i], scale,
        1, frame, scale, 1, .5, 0xffe2f0, t < .12);
      this.fx.fillStyle(0xffcfdd, (1 - t) * .7);
      for (let j = 0; j < 3; j++) {
        const angle = pool.visualPhase[i] + j * Math.PI * 2 / 3;
        this.fx.fillRect(x + Math.cos(angle) * t * 22, y - 20 + Math.sin(angle) * t * 18, 2, 2);
      }
    }
    this.dyingMobs.end();
  }

  private drawPool(pool: Pool, batch: Images, keys: string[], run: Run, x: number, y: number,
    time: number, progress: number, mode: number, entranceFlash = false) {
    batch.begin();
    for (let i = 0; i < pool.count; i++) {
      const kind = pool.kind[i];
      const sx = lerp(pool.previousPosition[i * 2], pool.position[i * 2], progress) - x;
      const sy = lerp(pool.previousPosition[i * 2 + 1], pool.position[i * 2 + 1], progress) - y;
      const bottomMargin = mode === 1 && kind === FINAL_BOSS_KIND ? BOSS_RENDER_MARGIN : 80;
      if (sx < -80 || sx > run.viewWidth + 80 || sy < -80 || sy > run.viewHeight + bottomMargin) continue;
      if (mode === 1) {
        const type = enemySprites.types[kind];
        const motion = enemySprites.animation;
        const moved = pool.position[i * 2] !== pool.previousPosition[i * 2] ||
          pool.position[i * 2 + 1] !== pool.previousPosition[i * 2 + 1];
        const wave = moved ? Math.sin(time * motion.frequency + pool.visualPhase[i]) : 0;
        const squash = wave * motion.squash;
        const scale = enemyRenderScales[kind];
        const boss = kind === FINAL_BOSS_KIND ? run.boss : undefined;
        const charge = boss?.windup ?? 0;
        const recoil = boss?.recoil ?? 0;
        // The boss artwork faces left by default; the other enemies face right.
        const mirror = Boolean(pool.facingLeft[i]) !== (kind === FINAL_BOSS_KIND);
        // One presentation pass over packed data: no per-enemy update, tween or timer.
        batch.draw(type.texture, sx, sy - Math.abs(wave) * motion.bob,
          wave * motion.rotation, scale * (1 + squash + charge * .12 + recoil * .15) * (mirror ? -1 : 1), 1, type.frame,
          scale * (1 - squash - charge * .15 + recoil * .08), 1, .5,
          charge > 0 && !(boss && entranceFlash) ? 0xff8888 : 0xffffff,
          !!boss && entranceFlash, 4 + (sy + y) / WORLD_HEIGHT);
        if (kind !== FINAL_BOSS_KIND) this.drawHealth(sx,
          sy - Math.abs(wave) * motion.bob - type.height * scale * (1 - squash) - 9, pool.b[i] * 2,
          pool.life[i] / enemies[kind].hp, 0xff647c);
      } else {
        const rotation = mode === 2 ? Math.atan2(pool.b[i], pool.a[i]) : 0;
        const pickupFrame = mode === 0 && pool.kind[i] === 1 ? 'concept-1-coffee-cat' :
          mode === 0 && pool.kind[i] === 2 ? 'concept-2-meme-pickup' :
          mode === 0 && pool.kind[i] === dropKind.bomb ? 'bonus-mass-rejection' :
          mode === 0 && pool.kind[i] === dropKind.magnet ? 'bonus-resume-collector' : undefined;
        const projectile = mode === 2 && pool.kind[i] === 1 ? projectileSprites.message :
          mode === 2 && pool.kind[i] === 2 ? projectileSprites.calendar : undefined;
        if (pickupFrame) {
          const frame = gameAtlas.frames[pickupFrame].frame;
          const special = pool.kind[i] === dropKind.bomb || pool.kind[i] === dropKind.magnet;
          const size = special ? bonusConfig.size * (1 + Math.sin(time * 4 + pool.visualPhase[i]) * .05) :
            pickupPresentation.healingSize;
          batch.draw('game-atlas', sx, sy, 0, size / Math.max(frame.w, frame.h), 1, pickupFrame);
        } else if (projectile) {
          const scale = projectile.displayWidth / projectile.width * projectileSizeMultiplier * enemyBulletSizeMultiplier;
          batch.draw(projectile.texture, sx, sy, rotation, scale, 1, projectile.frame, scale, .5, projectile.originX);
        } else {
          const scale = mode === 2 ? projectileSizeMultiplier * (kind === 0 ? .5 : kind === 3 ? folderConfig.sizeMultiplier : 1) :
            mode !== 0 ? 1 : kind === dropKind.xp ? .5 :
            kind === dropKind.goldXp || kind === dropKind.redXp ? .375 : 1;
          batch.draw(keys[pool.kind[i]], sx, sy, rotation, scale);
        }
      }
    }
    batch.end();
  }

  private drawHealth(x: number, y: number, width: number, ratio: number, color: number) {
    this.health.draw('health-pixel', x - width / 2, y, 0, width, .9,
      undefined, 5, 0, 0, 0x181323);
    this.health.draw('health-pixel', x - width / 2 + 1, y + 1, 0,
      (width - 2) * Math.max(0, Math.min(1, ratio)), 1, undefined, 3, 0, 0, color);
  }

  private drawDamage(run: Run, cameraX: number, cameraY: number, progress: number) {
    const numbers = run.damageNumbers;
    let used = 0;
    for (let offset = 0; offset < numbers.count; offset++) {
      const slot = numbers.slot(offset);
      const age = Math.max(0, run.ticks - numbers.born[slot] + progress - 1) / DAMAGE_NUMBER_TICKS;
      const x = numbers.position[slot * 2] - cameraX;
      const y = numbers.position[slot * 2 + 1] - cameraY - age * 36;
      if (x < -48 || x > run.viewWidth + 48 || y < -48 || y > run.viewHeight + 48) continue;
      const alpha = Math.min(1, (1 - age) * 2.5);
      const font = this.damageFonts[numbers.onHero[slot]];
      let text = this.damageTexts[used];
      if (!text) {
        text = this.damageScene.add.bitmapText(0, 0, font, '', 18).setOrigin(.5).setDepth(9);
        this.damageTexts.push(text);
      }
      if (text.font !== font) text.setFont(font, 18);
      const value = String(numbers.amount[slot]);
      if (text.text !== value) text.setText(value);
      text.setPosition(x, y).setAlpha(alpha).setVisible(true);
      used++;
    }
    for (let i = used; i < this.damageTexts.length; i++) this.damageTexts[i].setVisible(false);

  }
}
