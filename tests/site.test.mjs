import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

for (const lang of ['ru', 'en']) {
  test(`${lang}: localized page, anchors and subdirectory assets are valid`, () => {
    const html = readFileSync(`dist/${lang}/index.html`, 'utf8');
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(match[1]), `Missing anchor: ${match[1]}`);
    for (const match of html.matchAll(/(?:src|href)="\/Portfolio\/([^"?#]+)"/g)) {
      const path = match[1];
      assert.ok(existsSync(`dist/${path}`), `Missing local asset or route: ${path}`);
    }
    assert.match(html, /HomeAlone/);
    assert.match(html, /Thesia/);
    assert.match(html, /1064472/);
    assert.doesNotMatch(html, /Резепов|Алексеев|Rezepov|Alekseev|danilka13|9654655666/);
    assert.doesNotMatch(html, /phaser|<iframe/);
  });
}

test('all editorial content has both translations', () => {
  const content = JSON.parse(readFileSync('src/content/portfolio.json', 'utf8'));
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if ('ru' in value || 'en' in value) {
      assert.equal(typeof value.ru, 'string');
      assert.equal(typeof value.en, 'string');
    }
    Object.values(value).forEach(walk);
  };
  walk(content);
});
