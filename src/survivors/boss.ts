import { bossConfig as config, heroCollision, STEP } from './config.ts';

const TAU = Math.PI * 2;
export type BossAttack = 'ring' | 'laser' | 'dash';
const ACTIONS: readonly BossAttack[] = ['ring', 'laser', 'ring', 'dash'];

/** One encounter controller; enemies still live in the packed simulation pool. */
export class BossAttackSystem {
  phase: 'recover' | 'windup' | 'attack' | 'recoil' = 'recover';
  attack: BossAttack = 'ring';
  remaining: number = config.recovery;
  x = 0;
  y = 0;
  angle = 0;
  velocityX = 0;
  velocityY = 0;
  private sequence = 0;
  private rings = 0;
  private laserDirection = 1;

  get windup() { return this.phase === 'windup' ? 1 - this.remaining / config.windup : 0; }
  get lasersActive() { return this.phase === 'attack' && this.attack === 'laser'; }
  get dashing() { return this.phase === 'attack' && this.attack === 'dash'; }
  reflectDash(horizontal: boolean, vertical: boolean) {
    if (horizontal) {
      this.angle = Math.PI - this.angle;
      this.velocityX = -this.velocityX;
    }
    if (vertical) {
      this.angle = -this.angle;
      this.velocityY = -this.velocityY;
    }
  }
  get recoil() { return this.phase === 'recoil' ? this.remaining / config.recoil : 0; }

  step(x: number, y: number, targetX: number, targetY: number,
    shoot: (x: number, y: number, vx: number, vy: number) => void, random = Math.random) {
    this.x = x; this.y = y;
    this.velocityX = this.velocityY = 0;
    this.remaining -= STEP;
    if (this.remaining <= 0) {
      if (this.phase === 'recover') {
        this.attack = ACTIONS[this.sequence++ % ACTIONS.length];
        if (this.attack === 'laser') this.laserDirection = random() < .5 ? -1 : 1;
        this.phase = 'windup'; this.remaining = config.windup;
        this.angle = Math.atan2(targetY - y, targetX - x);
      } else if (this.phase === 'windup') {
        if (this.attack === 'ring') {
          const offset = this.rings++ * Math.PI / config.ringCount;
          for (let i = 0; i < config.ringCount; i++) {
            const angle = offset + i * TAU / config.ringCount;
            shoot(x, y, Math.cos(angle) * config.ringSpeed, Math.sin(angle) * config.ringSpeed);
          }
          this.phase = 'recoil'; this.remaining = config.recoil;
        } else {
          this.phase = 'attack';
          this.remaining = this.attack === 'laser' ? config.laserSeconds : config.dashSeconds;
        }
      } else {
        const finishedDash = this.dashing;
        this.phase = 'recover'; this.remaining = config.recovery;
        if (finishedDash) return;
      }
    }
    if (this.phase === 'attack') {
      if (this.attack === 'laser') this.angle += this.laserDirection * config.laserAngularSpeed * STEP;
      else {
        const remaining = this.remaining / config.dashSeconds;
        const next = Math.max(0, remaining - STEP / config.dashSeconds);
        const speed = config.dashDistance * (remaining ** 2 - next ** 2) / STEP;
        this.velocityX = Math.cos(this.angle) * speed;
        this.velocityY = Math.sin(this.angle) * speed;
      }
    } else if (this.phase === 'recover') {
      const dx = targetX - x, dy = targetY - y, distance = Math.hypot(dx, dy);
      if (distance > 160) { this.velocityX = dx / distance * 58; this.velocityY = dy / distance * 58; }
    }
  }

  laserHits(x: number, y: number, radiusX = heroCollision.radiusX, radiusY = heroCollision.radiusY) {
    if (!this.lasersActive) return false;
    const dx = x - this.x, dy = y - this.y;
    for (let i = 0; i < config.laserCount; i++) {
      const angle = this.angle + i * TAU / config.laserCount;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const along = dx * ux + dy * uy;
      const radius = Math.hypot(radiusX * uy, radiusY * ux);
      if (along >= 0 && along <= config.laserLength &&
        Math.abs(dx * uy - dy * ux) <= config.laserWidth / 2 + radius) return true;
    }
    return false;
  }
}
