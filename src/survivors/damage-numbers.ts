export const DAMAGE_NUMBER_TICKS = 42;
const CAPACITY = 256;

/** Chronological ring of fixed world positions. Rise and fade are derived when drawn. */
export class DamageNumbers {
  readonly position = new Float32Array(CAPACITY * 2);
  readonly amount = new Uint16Array(CAPACITY);
  readonly born = new Uint32Array(CAPACITY);
  readonly onHero = new Uint8Array(CAPACITY);
  head = 0;
  count = 0;

  slot(offset: number) { return (this.head + offset) % CAPACITY; }

  add(x: number, y: number, amount: number, tick: number, onHero = false) {
    if (this.count === CAPACITY) this.removeOldest();
    const slot = this.slot(this.count++);
    this.position[slot * 2] = x;
    this.position[slot * 2 + 1] = y;
    this.amount[slot] = amount;
    this.born[slot] = tick;
    this.onHero[slot] = Number(onHero);
  }

  expire(tick: number) {
    while (this.count && tick - this.born[this.head] >= DAMAGE_NUMBER_TICKS) this.removeOldest();
  }

  private removeOldest() {
    this.head = this.slot(1);
    this.count--;
  }
}
