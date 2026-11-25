"use strict";

// Sound and HUD both consume the event returned by hit().
class TrainingTarget {
  static shieldCapacity = 60;
  static healthCapacity = 100;
  static stackWindowMs = 650;

  constructor() {
    this.shield = TrainingTarget.shieldCapacity;
    this.health = TrainingTarget.healthCapacity;
    this.stack = 0;
    this.lastHitAt = -Infinity;
  }

  hit(damage, nowMs) {
    if (this.health === 0 || !Number.isFinite(damage) || damage <= 0 || !Number.isFinite(nowMs)) return null;

    const shieldDamage = Math.min(this.shield, damage);
    const healthDamage = Math.min(this.health, damage - shieldDamage);
    this.shield -= shieldDamage;
    this.health -= healthDamage;
    const amount = shieldDamage + healthDamage;
    const shieldBroken = shieldDamage > 0 && this.shield === 0;

    let kind = "body";
    if (this.health === 0) kind = "down";
    else if (shieldBroken) kind = "break";
    else if (shieldDamage > 0) kind = "shield";

    if (nowMs - this.lastHitAt >= TrainingTarget.stackWindowMs) this.stack = 0;
    this.stack += amount;
    this.lastHitAt = nowMs;
    return { kind, amount, shieldDamage, healthDamage, shieldBroken, stack: this.stack };
  }
}
