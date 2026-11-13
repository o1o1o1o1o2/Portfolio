export const heroQuips = {
  ru: ['Мы перезвоним.', 'Не подходите.', 'Созвон отменяется.', 'У нас тут семья.',
    'Спасибо, следующий!', 'Вилка не сошлась.', 'Оффер не согласован.', 'Недостаточно опыта.'],
  en: ['We’ll call.', 'Not a fit.', 'Call cancelled.', 'We’re a family.',
    'Next candidate!', 'Salary mismatch.', 'Offer declined.', 'Not enough experience.'],
} as const;
export const quipConfig = { duration: 1.8, cooldown: 7, killsBetween: 7 } as const;

export class QuipCycle {
  private readonly order = heroQuips.ru.map((_, index) => index);
  private nextIndex = this.order.length;
  private previous = -1;

  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  next() {
    if (this.nextIndex === this.order.length) {
      const order = this.order;
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (order.length > 1 && order[0] === this.previous) {
        const j = 1 + Math.floor(this.random() * (order.length - 1));
        [order[0], order[j]] = [order[j], order[0]];
      }
      this.nextIndex = 0;
    }
    return this.previous = this.order[this.nextIndex++];
  }
}
