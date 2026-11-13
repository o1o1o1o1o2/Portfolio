import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('interface dictionaries have identical keys and nonempty values',()=>{
 const ui=JSON.parse(readFileSync('src/i18n/ui.json','utf8'));
 assert.deepEqual(Object.keys(ui.ru),Object.keys(ui.en));
 for(const locale of ['ru','en'])for(const value of Object.values(ui[locale]))assert.ok(value.trim());
});
test('motion locales share design, link to each other, retain original project and article content',()=>{
 for(const [locale,other] of [['ru','en'],['en','ru']]){
  const html=readFileSync(`dist/${locale}/index.html`,'utf8');
  assert.ok(html.includes(`<html lang="${locale}"`));
  assert.ok(html.includes(`/Portfolio/${other}/`));
  assert.ok(html.includes('Техники рендеринга воксельного мира'));
  assert.ok(html.includes('https://habr.com/ru/articles/1064472/'));
  assert.ok(html.includes('data-survivor-launcher'));
  if(locale==='en'){assert.ok(html.includes('HR Survivors'));assert.ok(html.includes('Read on Habr (in Russian)'));}
 }
});
