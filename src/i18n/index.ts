import dictionaries from './ui.json';
export type Locale = 'ru' | 'en';
export function translator(locale: Locale) { return (key: keyof typeof dictionaries.ru) => dictionaries[locale][key]; }
