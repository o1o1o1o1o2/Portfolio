/** Dense slots let each loop visit only active records. No object per entity. */
export class Pool {
  count = 0;
  capacity: number;
  /** Packed 2D vectors: slot i occupies indices 2*i and 2*i+1. */
  position: Float32Array;
  previousPosition: Float32Array;
  a: Float32Array;
  b: Float32Array;
  life: Float32Array;
  timer: Float32Array;
  kind: Uint8Array;
  facingLeft: Uint8Array;
  visualPhase: Float32Array;
  orbitHitUntil: Float32Array;
  knockbackX: Float32Array;
  knockbackY: Float32Array;
  id: Uint32Array;
  hitHistory: Uint32Array;
  private sequence = 0;
  private readonly growable: boolean;
  private columns: readonly (Float32Array | Uint8Array | Uint32Array)[];

  constructor(capacity: number, growable = false) {
    this.growable = growable;
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 2);
    this.previousPosition = new Float32Array(capacity * 2);
    this.a = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.timer = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.facingLeft = new Uint8Array(capacity);
    this.visualPhase = new Float32Array(capacity);
    this.orbitHitUntil = new Float32Array(capacity);
    this.knockbackX = new Float32Array(capacity);
    this.knockbackY = new Float32Array(capacity);
    this.id = new Uint32Array(capacity);
    this.hitHistory = new Uint32Array(capacity * 6);
    this.columns = [this.a, this.b, this.life, this.timer, this.kind, this.facingLeft, this.visualPhase, this.orbitHitUntil, this.id, this.knockbackX, this.knockbackY];
  }

  add(kind: number, x: number, y: number, a = 0, b = 0, life = 0, timer = 0) {
    if (this.count === this.capacity) {
      if (!this.growable) return -1;
      this.grow();
    }
    const i = this.count++;
    this.kind[i] = kind;
    this.facingLeft[i] = 0;
    this.id[i] = this.sequence + 1;
    this.hitHistory.fill(0, i * 6, i * 6 + 6);
    this.visualPhase[i] = (this.sequence++ * 2.39996323) % (Math.PI * 2);
    this.orbitHitUntil[i] = 0;
    this.knockbackX[i] = this.knockbackY[i] = 0;
    const offset = i * 2;
    this.previousPosition[offset] = this.position[offset] = x;
    this.previousPosition[offset + 1] = this.position[offset + 1] = y;
    this.a[i] = a;
    this.b[i] = b;
    this.life[i] = life;
    this.timer[i] = timer;
    return i;
  }

  private grow() {
    const capacity = Math.max(1, this.capacity * 2);
    const floats = (old: Float32Array, length: number) => {
      const next = new Float32Array(length); next.set(old); return next;
    };
    this.position = floats(this.position, capacity * 2);
    this.previousPosition = floats(this.previousPosition, capacity * 2);
    this.a = floats(this.a, capacity); this.b = floats(this.b, capacity);
    this.life = floats(this.life, capacity); this.timer = floats(this.timer, capacity);
    this.visualPhase = floats(this.visualPhase, capacity);
    this.orbitHitUntil = floats(this.orbitHitUntil, capacity);
    this.knockbackX = floats(this.knockbackX, capacity);
    this.knockbackY = floats(this.knockbackY, capacity);
    const kinds = new Uint8Array(capacity); kinds.set(this.kind); this.kind = kinds;
    const facing = new Uint8Array(capacity); facing.set(this.facingLeft); this.facingLeft = facing;
    const ids = new Uint32Array(capacity); ids.set(this.id); this.id = ids;
    const history = new Uint32Array(capacity * 6); history.set(this.hitHistory); this.hitHistory = history;
    this.columns = [this.a, this.b, this.life, this.timer, this.kind, this.facingLeft, this.visualPhase, this.orbitHitUntil, this.id, this.knockbackX, this.knockbackY];
    this.capacity = capacity;
  }

  remove(i: number) {
    const last = --this.count;
    if (i === last) return;
    const offset = i * 2;
    const source = last * 2;
    this.position[offset] = this.position[source];
    this.position[offset + 1] = this.position[source + 1];
    this.previousPosition[offset] = this.previousPosition[source];
    this.previousPosition[offset + 1] = this.previousPosition[source + 1];
    for (const column of this.columns) column[i] = column[last];
    this.hitHistory.copyWithin(i * 6, last * 6, last * 6 + 6);
  }
}
