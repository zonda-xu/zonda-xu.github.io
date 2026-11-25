"use strict";

// Painted facets and collision share the same outline and transformations.
const crystalOutline = [[.08,-1.12],[.54,-.69],[.69,-.20],[.38,.58],[-.05,1.04],[-.44,.53],[-.67,-.13],[-.44,-.70]];
const crystalRidges = [[-.16,-.45],[.26,-.42],[.30,.23],[-.16,.40],[-.34,.04]];
const crystalFaces = [
  [0,1,9], [0,9,8], [0,8,7], [7,8,12,6], [6,12,11,5], [5,11,4],
  [4,11,10], [4,10,3], [3,10,2], [2,10,9,1], [8,9,10,12], [12,10,11]
];

function insideCrystal(x, y) {
  let inside = false;
  for (let i = 0, j = crystalOutline.length - 1; i < crystalOutline.length; j = i++) {
    const [ax, ay] = crystalOutline[i], [bx, by] = crystalOutline[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry, start = 0, end = Math.PI * 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, start, end);
  ctx.stroke();
}

class TargetScene {
  constructor(canvas, target) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.reset(target);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, bounds.width);
    this.h = Math.max(1, bounds.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(this.canvas.width / this.w, 0, 0, this.canvas.height / this.h, 0, 0);
    this.cx = this.w * .50;
    this.cy = this.h * .49;
    this.size = Math.min(this.w * .215, this.h * .30);
    this.paint(performance.now());
  }

  reset(target) {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.target = target;
    this.hit = null;
    this.miss = null;
    this.brokenAt = -Infinity;
    this.downedAt = -Infinity;
    if (this.w) this.paint(performance.now());
  }

  get scale() { return this.size * (this.target.shield > 0 ? 1 : .77); }

  contains(point) {
    return this.target.health > 0 &&
      insideCrystal((point.x - this.cx) / this.scale, (point.y - this.cy) / this.scale);
  }

  impact(event, point, now) {
    if (event) {
      this.hit = { event, u: point.x / this.w, v: point.y / this.h, at: now };
      if (event.shieldBroken) this.brokenAt = now;
      if (event.kind === "down") this.downedAt = now;
    } else {
      this.miss = { u: point.x / this.w, v: point.y / this.h, at: now };
    }
    this.paint(now);
    if (!this.frame) this.animate();
  }

  animate() {
    this.frame = requestAnimationFrame(now => {
      this.frame = 0;
      this.paint(now);
      const hitAge = this.hit ? now - this.hit.at : Infinity;
      const missAge = this.miss ? now - this.miss.at : Infinity;
      if (hitAge < TrainingTarget.stackWindowMs || missAge < 130 || now - this.brokenAt < 440) this.animate();
    });
  }

  drawRoom() {
    const c = this.ctx, w = this.w, h = this.h;
    c.fillStyle = "#101b1b";
    c.fillRect(0, 0, w, h);
    const atmosphere = c.createRadialGradient(this.cx, h * .43, 0, this.cx, h * .46, Math.max(w * .52, h * .66));
    atmosphere.addColorStop(0, "#243e39");
    atmosphere.addColorStop(.52, "#182b28");
    atmosphere.addColorStop(1, "#101a1b");
    c.fillStyle = atmosphere;
    c.fillRect(0, 0, w, h);
    // Perspective floor with a vanishing point behind the crystal.
    const horizon = h * .61;
    c.lineWidth = 1;
    c.strokeStyle = "rgba(121,178,151,.13)";
    c.beginPath();
    for (let i = -15; i <= 15; i++) {
      c.moveTo(this.cx + i * w * .021, horizon);
      c.lineTo(this.cx + i * w * .16, h);
    }
    for (const depth of [0,.04,.10,.19,.33,.54,.82,1]) {
      const y = horizon + depth * (h - horizon);
      c.moveTo(0, y); c.lineTo(w, y);
    }
    c.stroke();
    c.strokeStyle = "rgba(151,193,169,.14)";
    c.setLineDash([2, 7]);
    c.beginPath();
    c.moveTo(0, this.cy); c.lineTo(w, this.cy);
    c.moveTo(this.cx, 0); c.lineTo(this.cx, horizon);
    c.stroke();
    c.setLineDash([]);
    for (const side of [0, 1]) {
      for (let i = 0; i < 19; i++) {
        const x = side ? w - 8 : 8, y = h * .22 + i * h * .029;
        c.fillStyle = i % 3 === 0 ? "#53675e" : "#35483f";
        c.fillRect(x, y, i % 3 === 0 ? (side ? -7 : 7) : (side ? -3 : 3), 1);
      }
    }
  }

  drawPlatform() {
    const c = this.ctx, s = this.size, y = this.h * .855;
    c.save();
    c.translate(this.cx, y);
    c.scale(1, .20);
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, s * 1.60);
    glow.addColorStop(0, "rgba(108,235,186,.27)");
    glow.addColorStop(.60, "rgba(76,169,141,.07)");
    glow.addColorStop(1, "rgba(46,120,102,0)");
    c.fillStyle = glow;
    c.fillRect(-1.6*s, -1.6*s, 3.2*s, 3.2*s);
    c.restore();
    for (const [r, color] of [[1.23,"#3e5f53"],[1.08,"#304c41"],[.85,"#46675a"]]) {
      c.strokeStyle = color;
      ellipse(c, this.cx, y, s*r, s*r*.19);
    }
    c.strokeStyle = "#7cbda1";
    for (const a of [.24, 1.88, 3.43, 5.02]) ellipse(c, this.cx, y, 1.23*s, .234*s, a, a+.33);
  }

  drawCrystal(now) {
    const c = this.ctx, hasShield = this.target.shield > 0, down = this.target.health === 0;
    const coords = [...crystalOutline, ...crystalRidges];
    c.save();
    c.translate(this.cx, this.cy);
    const age = this.hit ? now - this.hit.at : Infinity;
    const recoil = this.reduced.matches ? 0 : Math.exp(-age / 46) * Math.sin(Math.min(age, 500) / 15) * 2.5;
    c.translate(recoil, 0);
    c.scale(this.scale, this.scale);
    if (down) c.globalAlpha = .21 + .52 * Math.exp(-(now - this.downedAt) / 65);
    const shades = hasShield
      ? ["#91cdb8","#467e72","#5f9b88","#3b796f","#2e6159","#518a75","#4f8975","#6ca78c","#488776","#7cb9a2","#4e8879","#386956"]
      : ["#ddad8e","#98644f","#b58265","#8c5e4d","#68453b","#ae745b","#a76c51","#c08c6a","#91664f","#c59575","#9e7055","#805840"];
    const edge = hasShield ? "#b3f6dc" : "#ffdbb4";
    c.lineWidth = .006;
    for (let i = 0; i < crystalFaces.length; i++) {
      polygon(c, crystalFaces[i].map(j => coords[j]));
      c.fillStyle = shades[i]; c.fill();
      c.strokeStyle = hasShield ? "#80b9a0" : "#c09a7c"; c.stroke();
    }
    // A suspended inner prism visible through the refracting outer facets.
    const inner = [[.07,-.69],[.27,-.19],[.12,.26],[-.07,.55],[-.30,.05],[-.22,-.26]];
    const core = c.createLinearGradient(-.26,-.20,.28,.19);
    core.addColorStop(0, hasShield ? "#acdaca" : "#ffd4b0");
    core.addColorStop(.37, hasShield ? "#609f8c" : "#c99065");
    core.addColorStop(.46, hasShield ? "#d2ffec" : "#fff1c8");
    core.addColorStop(.62, hasShield ? "#a4e3c5" : "#f3c18a");
    core.addColorStop(1, hasShield ? "#538d79" : "#9d7158");
    polygon(c, inner); c.fillStyle = core; c.fill(); c.strokeStyle = edge; c.stroke();
    c.beginPath(); c.moveTo(.07,-.69); c.lineTo(-.09,-.04); c.lineTo(-.07,.55); c.stroke();
    c.globalAlpha *= .58;
    polygon(c, [coords[0],coords[8],coords[12],coords[4]]);
    c.fillStyle = hasShield ? "#97d1be" : "#eeae88"; c.fill();
    c.globalAlpha *= .82;
    c.lineWidth = .011; c.strokeStyle = edge;
    polygon(c, crystalOutline); c.stroke();
    c.beginPath(); c.moveTo(...coords[7]); c.lineTo(...coords[0]); c.lineTo(...coords[9]); c.stroke();
    if (age < 95) {
      c.globalAlpha = (1-age/95)*.49; c.fillStyle = "#f5fff8";
      polygon(c, crystalOutline); c.fill();
    }
    c.restore();
  }

  drawFeedback(now) {
    const c = this.ctx, s = this.size;
    const fracture = (now - this.brokenAt) / 440;
    if (fracture >= 0 && fracture < 1) {
      c.save();
      c.globalAlpha = 1 - fracture;
      c.strokeStyle = ImpactSound.cues.break.color;
      const travel = this.reduced.matches ? 0 : fracture;
      for (let i = 0; i < 12; i++) {
        const a = i * 2.40, r = s * (.72 + travel * (i%3 + 2) * .31);
        const x = this.cx + Math.cos(a)*r, y = this.cy + Math.sin(a)*r;
        polygon(c, [[x,y], [x+Math.cos(a+.45)*8,y+Math.sin(a+.45)*8], [x+Math.sin(a)*4,y-Math.cos(a)*4]]);
        c.stroke();
      }
      c.restore();
    }
    if (this.miss && now - this.miss.at < 120) {
      c.fillStyle = "#8d9992";
      c.fillRect(this.miss.u*this.w-1, this.miss.v*this.h-1, 2, 2);
    }
    if (!this.hit) return;
    const { event, at, u, v } = this.hit, age = now - at, life = TrainingTarget.stackWindowMs;
    if (age >= life) return;
    c.save();
    c.globalAlpha = Math.min(1, (life-age)/160);
    c.fillStyle = c.strokeStyle = ImpactSound.cues[event.kind].color;
    c.textAlign = "left";
    c.font = "bold " + Math.round(s*.30) + "px ui-monospace, monospace";
    const x = this.cx + s * .76, y = this.cy - s*.42;
    c.lineWidth = 3; c.strokeStyle = "#12211b";
    c.strokeText(String(event.stack), x, y); c.fillText(String(event.stack), x, y);
    c.font = "12px system-ui, sans-serif"; c.fillText(ImpactSound.cues[event.kind].label, x, y+17);
    if (age < 170) {
      c.translate(u*this.w, v*this.h);
      c.lineWidth = 2; c.strokeStyle = "#f3fff8";
      const inner = 5, outer = event.kind === "down" ? 15 : 11;
      c.beginPath();
      for (const dx of [-1,1]) for (const dy of [-1,1]) {
        c.moveTo(dx*inner,dy*inner); c.lineTo(dx*outer,dy*outer);
      }
      c.stroke();
    }
    c.restore();
  }

  paint(now) {
    this.drawRoom();
    this.drawPlatform();
    this.drawCrystal(now);
    this.drawFeedback(now);
  }
}
