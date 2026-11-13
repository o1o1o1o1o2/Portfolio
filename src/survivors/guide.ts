import { atlasSprite as sprite } from './atlas-sprite';
import { moodIcon } from './ui-icons';
import enemySprites from './enemy-sprites.json';
import projectiles from './projectile-sprites.json';
import { FINAL_BOSS_KIND, MINI_BOSS_KIND, INCOMING_DAMAGE_MULTIPLIER, crystalXp, dropKind,
  enemies, enemyFire, bossConfig, healingPickups } from './config';
import type { Locale } from './text';

const labels = {
  ru: {
    goal: 'Закрой вакансию. Сохрани настроение.',
    rules: 'Продержись 5 минут и победи босса. Оружие атакует само. Собирай опыт, выбирай улучшения и береги настроение.',
    controls: 'WASD / стрелки — движение · мышь / палец — удерживай и веди · Esc — пауза · «Выйти» — закончить забег.',
    enemies: 'Кандидаты', pickups: 'Находки в офисе',
    hp: 'Здоровье', contact: 'Урон при касании', shot: 'Урон снаряда',
    ring: 'Заряд', laser: 'Лазер', dash: 'Рывок', hitNote: 'Итоговый урон за попадание. Защита после удара — 0,6 с.',
    names: ['Автооткликатор', 'Созвон на 5 минут', 'Срочный созвон', 'Джуниор 10 лет опыта',
      'Сеньор-помидор', 'Идеальный кандидат', 'Фулстек-ниндзя'],
    blue: 'Опыт', gold: 'Опыт', red: 'Опыт', xp: 'опыта',
    coffee: 'Кофе', meme: 'Мем',
    bomb: 'Массовый отказ', bombText: 'Обычных врагов на экране уничтожает. Боссам —',
    bossHp: 'от их максимального здоровья.',
    magnet: 'Сбор резюме', magnetText: 'Притягивает кристаллы опыта со всей карты.',
  },
  en: {
    goal: 'Fill the vacancy. Keep your mood.',
    rules: 'Survive 5 minutes and defeat the boss. Weapons attack automatically. Collect XP, choose upgrades, and protect your mood.',
    controls: 'WASD / arrows — move · hold and drag with a mouse / finger — move · Esc — pause · Exit — end the run.',
    enemies: 'Candidates', pickups: 'Office finds',
    hp: 'Health', contact: 'Contact damage', shot: 'Projectile damage',
    ring: 'Orb', laser: 'Laser', dash: 'Dash', hitNote: 'Final damage per hit. Protection after a hit lasts 0.6 s.',
    names: ['Auto-applicant', 'Five-minute call', 'Urgent call', 'Junior, 10 years’ experience',
      'Signor Tomato', 'Ideal Candidate', 'Fullstack ninja'],
    blue: 'XP', gold: 'XP', red: 'XP', xp: 'XP',
    coffee: 'Coffee', meme: 'Meme',
    bomb: 'Mass rejection', bombText: 'Defeats ordinary enemies on screen. Deals',
    bossHp: 'of maximum health to the boss and mini-bosses.',
    magnet: 'Résumé collector', magnetText: 'Attracts experience crystals across the map.',
  },
} as const;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

/** Shared HTML content for the intro and pause screens; values come from game balance. */
export function createGameGuide(locale: Locale, proceduralSprites: Record<string, string> = {}) {
  const t = labels[locale];
  const number = (value: number) => value.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 });
  const damage = (value: number) => number(value * INCOMING_DAMAGE_MULTIPLIER);
  const guide = node('div', 'survivor-guide');
  const stat = (stats: HTMLElement, label: string, value: string, icon: Element) => {
    const row = node('div', '');
    row.title = `${label}: ${value}`;
    const term = node('dt', '');
    term.setAttribute('aria-label', label);
    icon.setAttribute('aria-hidden', 'true');
    term.append(icon);
    row.append(term, node('dd', '', value));
    stats.append(row);
  };
  const intro = node('section', 'survivor-guide-intro');
  const hero = node('div', 'survivor-guide-art');
  hero.append(sprite('hero-walk-0', 112));
  const introCopy = node('div', '');
  introCopy.append(node('h4', '', t.goal), node('p', '', t.rules));
  intro.append(hero, introCopy);
  guide.append(intro);
  const candidates = node('section', 'survivor-guide-section');
  candidates.dataset.guideSection = 'enemies';
  candidates.append(node('h4', '', t.enemies));
  const enemyCards = node('div', 'survivor-guide-enemies');
  const types = enemySprites.types.map((visual, kind) => ({ visual, kind })).sort((a, b) => a.visual.number - b.visual.number);
  for (const { visual, kind } of types) {
    const enemy = enemies[kind];
    const card = node('article', 'survivor-guide-enemy');
    const portrait = node('div', 'survivor-guide-enemy-visual');
    const art = node('div', 'survivor-guide-art');
    art.append(sprite(visual.frame, 256));
    const stats = node('dl', 'survivor-guide-stats');
    stat(stats, t.hp, number(enemy.hp), node('span', 'survivor-guide-heart', '♥'));
    stat(stats, t.contact, damage(enemy.damage), node('span', '', '✋'));
    if (enemy.fire) {
      if (kind === MINI_BOSS_KIND) {
        stat(stats, t.shot, damage(enemyFire.blueDamage), sprite(projectiles.message.frame, 32));
        stat(stats, t.shot, damage(enemyFire.redDamage), sprite(projectiles.calendar.frame, 32));
      } else {
      const projectile = kind === 3 ? projectiles.message : projectiles.calendar;
      const shotDamage = kind === 3 ? enemyFire.blueDamage : enemyFire.redDamage;
      stat(stats, t.shot, damage(shotDamage), sprite(projectile.frame, 32));
      }
    } else if (kind === FINAL_BOSS_KIND) {
      const orb = node('img', 'survivor-guide-procedural');
      orb.src = proceduralSprites['boss-orb'] || '';
      orb.alt = '';
      stat(stats, t.ring, damage(bossConfig.ringDamage),
        proceduralSprites['boss-orb'] ? orb : node('span', 'survivor-guide-orb'));
      stat(stats, t.laser, damage(bossConfig.laserDamage), node('span', 'survivor-guide-lasers'));
      stat(stats, t.dash, damage(enemy.damage), node('span', '', '➜'));
    }
    portrait.append(art, stats, node('h5', '', t.names[kind]));
    card.append(portrait);
    enemyCards.append(card);
  }
  candidates.append(enemyCards);
  guide.append(candidates);

  const pickups = node('section', 'survivor-guide-section');
  pickups.dataset.guideSection = 'pickups';
  pickups.append(node('h4', '', t.pickups));
  const pickupCards = node('div', 'survivor-guide-pickups');
  const pickup = (name: string, image: Element, value?: string, healing = false, effect?: 'bomb' | 'magnet') => {
    const card = node('article', 'survivor-guide-pickup');
    const portrait = node('div', 'survivor-guide-pickup-visual');
    const art = node('div', 'survivor-guide-art');
    art.append(image);
    if (image instanceof HTMLCanvasElement) art.classList.add('survivor-guide-pickup-icon');
    if (effect) {
      art.classList.add(`survivor-guide-effect-${effect}`);
      const vfx = node('div', 'survivor-guide-vfx');
      vfx.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < (effect === 'magnet' ? 6 : 2); i++) {
        const particle = node('i', effect === 'magnet'
          ? `survivor-guide-gem ${i === 4 ? 'survivor-guide-gem-gold' : ''}` : 'survivor-guide-blast');
        particle.style.setProperty('--particle', String(i));
        vfx.append(particle);
      }
      art.prepend(vfx);
    }
    portrait.append(art);
    if (value) {
      const badge = node('span', 'survivor-guide-pickup-value');
      if (healing) badge.append(moodIcon());
      badge.append(document.createTextNode(value));
      portrait.append(badge);
    }
    portrait.append(node('h5', '', name));
    card.append(portrait);
    pickupCards.append(card);
  };
  for (const [name, color, amount] of [
    [t.blue, 'blue', crystalXp[dropKind.xp]], [t.gold, 'gold', crystalXp[dropKind.goldXp]], [t.red, 'red', crystalXp[dropKind.redXp]],
  ] as const) {
    pickup(name, node('span', `survivor-guide-gem survivor-guide-gem-${color}`), `+${number(amount)}`);
  }
  pickup(t.meme, sprite('concept-2-meme-pickup', 96), `+${number(healingPickups.meme * 100)}%`, true);
  pickup(t.coffee, sprite('concept-1-coffee-cat', 96), `+${number(healingPickups.coffee * 100)}%`, true);
  pickup(t.bomb, sprite('bonus-mass-rejection', 96), undefined, false, 'bomb');
  pickup(t.magnet, sprite('bonus-resume-collector', 96), undefined, false, 'magnet');
  pickups.append(pickupCards);
  guide.append(pickups);

  return guide;
}

