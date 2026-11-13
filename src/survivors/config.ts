export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const WORLD_WIDTH = 6144;
export const WORLD_HEIGHT = 4608;
export const STEP = 1 / 60;
export const RUN_SECONDS = 300;
export const BOSS_TIME = RUN_SECONDS;
export const FINAL_BOSS_KIND = 5;
export const MINI_BOSS_KIND = 6;
export const MAX_ENEMIES = 1200; // Initial allocation only; enemy storage grows without a gameplay cap.
export const MAX_SHOTS = 1024;
export const MAX_DROPS = 4096;
export const PLAYER_SPEED = 155;
export const PAID_LEAVE_MOOD_GAIN = 15;
export const PLAYER_SPEED_PER_LEVEL = PLAYER_SPEED * .25;
export const INCOMING_DAMAGE_MULTIPLIER = 2;
export const envelopeConfig = { initialCooldown: .924, cooldownReductionPerLevel: .108 } as const;
const SPEED_SCALE = 172 / 40; // Enemy balance must not change when player speed is tuned.
export const heroCollision = { radiusX: 10, radiusY: 6, enemyDepth: .55 } as const;
export const projectileSizeMultiplier = 1.25;
export const enemyBulletSizeMultiplier = .5;
export const heroProjectileBodyLength = 26;
export const AREA_RADIUS_MULTIPLIER = 1.2;
export const pickupRange = { base: 50, perLevel: 17 * 1.5 } as const;
// Additive +20% of base per level, following the Canvas Survivors weapon curve.
export const AREA_DAMAGE_PER_LEVEL = .2;
export function areaDamage(base: number, level: number) {
  return level > 0 ? base * (1 + (level - 1) * AREA_DAMAGE_PER_LEVEL) : 0;
}
export const auraConfig = { damage: 6, radius: 63 * AREA_RADIUS_MULTIPLIER,
  radiusPerLevel: 6 * AREA_RADIUS_MULTIPLIER, hitEvery: .55, attackRatePerLevel: .15 } as const;
export function auraHitInterval(level: number) {
  return auraConfig.hitEvery / (1 + auraConfig.attackRatePerLevel) ** Math.max(0, level - 1);
}
export function auraRadius(level: number) {
  return level > 0 ? auraConfig.radius + (level - 1) * auraConfig.radiusPerLevel : 0;
}
export const fallingStamp = { waitTime: 4.5, fallTime: .5, maxDelay: .5, fallHeight: 192, impactTime: .32, radius: 60 * AREA_RADIUS_MULTIPLIER,
  damage: 25 } as const;
export const attackEffects = {
  envelope: { knockback: true }, folder: { knockback: true }, orbit: { knockback: true },
  aura: { knockback: false }, zone: { knockback: false }, stamp: { knockback: true },
} as const;
export const zoneConfig = {
  radius: 58 * AREA_RADIUS_MULTIPLIER * 1.2, duration: 4, cooldown: 5.6,
  growTime: .24, shrinkTime: .45, hitEvery: .35, durationPerLevel: .5, damage: 7,
} as const;
export const victoryConfig = { seconds: 2, deathSeconds: .7, titleAfter: .85 } as const;
export const enemyFire = { firstShot: .35, blueSpeed: 143.5, redSpeed: 170.8, blueDamage: 7, redDamage: 12 } as const;
export const knockbackConfig = { speed: 240, recovery: 1100, miniBossMultiplier: .2 } as const;

// Movement ratios, HP and XP follow the CC0 Godot reference:
// https://github.com/brannotaylor/SurvivorsClone_Complete/tree/main/Enemy
export const enemies = [
  { hp: 10, speed: 16 * SPEED_SCALE, radius: 12, damage: 7, fire: 0, xp: 1, score: 10, color: 0xffedce },
  { hp: 20, speed: 17.6 * SPEED_SCALE, radius: 13, damage: 9, fire: 0, xp: 1, score: 20, color: 0x74abff },
  { hp: 100, speed: 16 * SPEED_SCALE, radius: 15, damage: 13, fire: 0, xp: 5, score: 40, color: 0x9a61e8 },
  { hp: 100, speed: 16 * SPEED_SCALE, radius: 13, damage: 8, fire: 2, xp: 5, score: 60, color: 0xffc65d },
  { hp: 100, speed: 16 * SPEED_SCALE, radius: 14, damage: 12, fire: 2.5, xp: 5, score: 100, color: 0xf98077 },
  { hp: 13000, speed: 40 * SPEED_SCALE, radius: 33, damage: 20, fire: 0, xp: 0, score: 1000, color: 0xff9bc3 },
  { hp: 630, speed: 20 * SPEED_SCALE, radius: 23, damage: 15, fire: 2.4, xp: 100, score: 300, color: 0xe34c65 },
] as const;

// https://github.com/brannotaylor/SurvivorsClone_Complete/blob/main/World/world.tscn
// The reference's cyclops slot rotates through our heavy and ranged enemies.
// Introduce every non-final type by 4:00, then give the player one minute before the boss.
export const waves = [
  { start: 0, end: 29, every: 1, count: 1, kinds: [0] },
  { start: 30, end: 209, every: 1, count: 2, kinds: [0] },
  { start: 30, end: 209, every: 2, count: 1, kinds: [1] },
  { start: 70, end: 239, every: 4, count: 1, kinds: [2] },
  { start: 130, end: 239, every: 5, count: 1, kinds: [3] },
  { start: 180, end: 239, every: 5, count: 1, kinds: [4] },
  { start: 210, end: 239, every: 1, count: 2, kinds: [0, 1, 1, 1] },
  { start: 240, end: 269, every: 1, count: 1, kinds: [0, 1, 2, 3, 4, 1] },
  { start: 210, end: 210, every: 1, count: 1, kinds: [MINI_BOSS_KIND] },
  { start: 240, end: 240, every: 1, count: 1, kinds: [MINI_BOSS_KIND] },
  { start: 270, end: RUN_SECONDS - 1, every: 1, count: 4, kinds: [0, 1, 1, 2, 1, 3, 4, 1] },
] as const;

export const dropKind = { xp: 0, coffee: 1, meme: 2, goldXp: 3, redXp: 4, bomb: 5, magnet: 6 } as const;
export const crystalXp = { [dropKind.xp]: 1, [dropKind.goldXp]: 3, [dropKind.redXp]: 50 } as const;
export const crystalScore = { [dropKind.xp]: 10, [dropKind.goldXp]: 100, [dropKind.redXp]: 1000 } as const;
export const healingPickups = { coffee: .25, meme: .15 } as const;
export const pickupPresentation = { healingSize: 38 } as const;
export const bonusConfig = {
  invulnerabilitySeconds: 1,
  spawnGapMin: 100, spawnGapMax: 220,
  firstSpawn: 45, spawnEvery: 50, bossDamageFraction: .25, flashSeconds: .3,
  attractionStartSpeed: 400, attractionAcceleration: 1600, attractionMaxSpeed: 2600,
  attractionNearBoost: 700, size: 42,
} as const;
export const orbitConfig = { counts: [0, 2, 4, 8], radius: 84.96, angularSpeed: 2.4,
  opacity: .8, glowOpacity: .4165, glowWidth: 64 } as const;
export const deathEffectConfig = { capacity: 192, seconds: .2 } as const;
export const bossConfig = {
  recovery: 1.8, windup: .8, recoil: .22,
  ringCount: 24, ringSpeed: 225, ringLife: 7, ringDamage: 15,
  aimedVolleyEvery: 2, aimedVolleySpread: Math.PI / 12,
  laserCount: 3, laserSeconds: 4, laserAngularSpeed: .432,
  laserLength: 1100, laserWidth: 10, laserDamage: 15,
  dashDistance: 363, dashSeconds: 1.1,
} as const;

export const upgrades = [
  { max: 5, ru: ['Письма', 'Больше урона и выше частота писем'], en: ['Envelopes', 'More damage and faster envelopes'] },
  { max: 3, ru: ['ATS-фильтр', '2 → 4 → 8 печатей на орбите'], en: ['ATS filter', '2 → 4 → 8 orbiting rejection stamps'] },
  { max: 5, ru: ['Зарплата после собеседования', 'Аура вокруг HR. Растут радиус и урон, частота ударов +15% за уровень'], en: ['Salary after interview', 'An aura around HR. Radius and damage increase, with 15% more hits per second per level'] },
  { max: 5, ru: ['Групповое интервью', 'Длительная область на земле. Растут длительность и урон'], en: ['Group interview', 'A ground zone. Increases duration and damage'] },
  { max: 5, ru: ['Форма №7', '+1 папка за бросок. Папки пробивают врагов и возвращаются'], en: ['Form No. 7', '+1 folder per throw. Folders pierce enemies and return'] },
  { max: 5, ru: ['Срочное согласование', 'Больше падающих печатей. Каждая бьёт сильнее'], en: ['Urgent approval', 'More falling stamps. Each stamp hits harder'] },
  { max: 5, ru: ['Кроссовки', 'Быстрее движение'], en: ['Sneakers', 'Move faster'] },
  { max: 5, ru: ['ATS-поиск', 'Больше радиус сбора опыта'], en: ['ATS search', 'Larger pickup radius'] },
  { max: 5, ru: ['Оплачиваемый отпуск', 'Больше максимальное настроение'], en: ['Paid leave', 'Increase maximum mood'] },
  { max: 5, ru: ['Сквозной отказ', 'Конверт пробивает ещё одного врага'], en: ['Piercing rejection', 'Envelopes pierce one more enemy'] },
] as const;
export const folderConfig = { range: 320, outwardSpeed: 290, returnSpeed: 310, lifetime: 4, sizeMultiplier: .5 };
