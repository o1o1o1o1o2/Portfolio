import { atlasSprite } from './atlas-sprite';
import upgradeSprites from './upgrade-sprites.json';
import { upgrades, orbitConfig, areaDamage, auraConfig, auraRadius, auraHitInterval, fallingStamp, zoneConfig,
  pickupRange, PLAYER_SPEED, PLAYER_SPEED_PER_LEVEL, PAID_LEAVE_MOOD_GAIN } from './config';
import type { Locale } from './text';

const countSymbol = '⊕';
const damageSymbol = '⚔';

function metricIcon(symbol: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'survivor-card-metric-icon' +
    (symbol === damageSymbol ? ' survivor-card-metric-damage' : ''));
  svg.setAttribute('aria-hidden', 'true');
  const shapes: Record<string, string[]> = {
    [countSymbol]: ['M12 1.5a10.5 10.5 0 1 0 0 21a10.5 10.5 0 1 0 0-21', 'M12 7v10M7 12h10'],
    [damageSymbol]: ['M9 15L18 3l3-1-1 5-11 10', 'M5 12l7 7M7 16l-4 4 1 1 4-4'],
    '◯': ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10'],
    '◷': ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M12 5v7h6'],
    '☺': ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M8 9h.01M16 9h.01M7 14q5 6 10 0'],
    '»': ['M4 5l7 7-7 7M13 5l7 7-7 7'],
  };
  for (const [index, d] of shapes[symbol].entries()) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', symbol === countSymbol ? (index ? '1.6' : '1.2') : '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function icon(id: number, proceduralSprites: Record<string, string>) {
  if (id === 0) {
    const image = document.createElement('img');
    image.src = proceduralSprites['shot-0'] || '';
    image.alt = '';
    return image;
  }
  return atlasSprite(upgradeSprites[id]!, 90);
}

/** Values in the document footer use the same balance functions as combat. */
export function upgradeMetrics(id: number, level: number, locale: Locale, maxMood: number) {
  const ru = locale === 'ru';
  const l = Math.max(1, level);
  const format = (n: number) => n.toLocaleString(ru ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 });
  const damage = ru ? 'Урон' : 'Damage', radius = ru ? 'Радиус' : 'Radius';
  const result: [string, string, string][] = [];
  const add = (symbol: string, label: string, n: number) => result.push([symbol, label, format(level ? n : 0)]);
  switch (id) {
    case 0: add(countSymbol, ru ? 'Писем за залп' : 'Letters per volley', l); add(damageSymbol, damage, 11 + l * 4); break;
    case 1: add(countSymbol, ru ? 'Печатей на орбите' : 'Orbiting stamps', orbitConfig.counts[Math.min(level, 3)]); break;
    case 2:
      add('◯', radius, auraRadius(l));
      add(damageSymbol, damage, areaDamage(auraConfig.damage, l));
      result.push(['◷', ru ? 'Интервал между ударами, с' : 'Hit interval, s',
        level ? auraHitInterval(l).toLocaleString(ru ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 }) : '0']);
      break;
    case 3:
      add('◷', ru ? 'Длительность, с' : 'Duration, s', zoneConfig.duration + (l - 1) * zoneConfig.durationPerLevel);
      add(damageSymbol, damage, areaDamage(zoneConfig.damage, l)); break;
    case 4: add(countSymbol, ru ? 'Папок за бросок' : 'Folders per throw', l); break;
    case 5: add(countSymbol, ru ? 'Ударов за залп' : 'Strikes per volley', l); add(damageSymbol, damage, areaDamage(fallingStamp.damage, l)); break;
    case 6: result.push(['»', ru ? 'Скорость' : 'Speed', format(PLAYER_SPEED + level * PLAYER_SPEED_PER_LEVEL)]); break;
    case 7: result.push(['◯', ru ? 'Радиус сбора' : 'Pickup radius', format(pickupRange.base + level * pickupRange.perLevel)]); break;
    case 8: result.push(['☺', ru ? 'Запас настроения' : 'Max mood', format(maxMood)]); break;
    case 9: result.push([countSymbol, ru ? 'Целей одним письмом' : 'Targets per letter', String(1 + level)]); break;
  }
  return result;
}

export function createUpgradeCard(id: number, level: number, index: number, locale: Locale, maxMood: number, choose: () => void,
  proceduralSprites: Record<string, string> = {}) {
  const ru = locale === 'ru';
  const [name, detail] = upgrades[id][locale];
  const card = node('button', 'survivor-card');
  card.type = 'button';
  card.append(node('span', 'survivor-card-tab', ru ? 'ЛИЧНОЕ ДЕЛО / HR' : 'PERSONNEL FILE / HR'));
  const top = node('span', 'survivor-card-top');
  top.append(node('span', '', `${ru ? '№' : 'NO.'} ${String(index + 1).padStart(2, '0')} / ${ru ? 'ПРИКАЗ' : 'ORDER'}`),
    node('span', 'survivor-card-level', `LV. ${level} → ${level + 1}`));
  const art = node('span', 'survivor-card-art');
  art.append(icon(id, proceduralSprites));
  const metrics = node('span', 'survivor-card-metrics');
  const before = upgradeMetrics(id, level, locale, maxMood);
  const after = upgradeMetrics(id, level + 1, locale, maxMood + PAID_LEAVE_MOOD_GAIN);
  after.forEach(([symbol, label, value], i) => {
    const change = `${before[i][2]}→${value}`;
    const metric = node('span', 'survivor-card-metric');
    metric.append(metricIcon(symbol));
    metric.title = label;
    const amount = node('b', '', change);
    amount.setAttribute('aria-label', `${label}: ${change}`);
    metric.append(amount);
    metrics.append(metric);
  });
  card.append(top, art, node('span', 'survivor-card-seal', ru ? 'СОГЛАСОВАНО' : 'APPROVED'),
    node('strong', 'survivor-card-name', name), node('span', 'survivor-card-detail', detail), metrics);
  card.addEventListener('click', choose);
  return card;
}
