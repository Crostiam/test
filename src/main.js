/* Fighthing Street — VS AI, Menu + ensured P2 health bar visibility
   - Click "Play" to start the round and enable AI behavior
   - P2 health bar is explicitly rendered and initialized
*/

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const UI = {
    p1Health: document.getElementById('p1-health'),
    p2Health: document.getElementById('p2-health'),
    p1Chip: document.getElementById('p1-chip'),
    p2Chip: document.getElementById('p2-chip'),
    timer: document.getElementById('timer'),
    messages: document.getElementById('messages'),
    aiDiff: document.getElementById('ai-diff'),
    menu: document.getElementById('menu'),
    btnPlay: document.getElementById('btn-play'),
  };

  const CONFIG = {
    WIDTH: canvas.width,
    HEIGHT: canvas.height,
    FLOOR_Y: canvas.height - 90,
    GRAVITY: 2400,
    GROUND_FRICTION: 1800,
    AIR_DRAG: 0.985,
    MAX_RUN_SPEED: 360,
    ACCEL: 2600,
    JUMP_SPEED: 900,
    HURTBOX: { w: 56, h: 110 },
    ROUND_TIME: 99,
    PUSHBOX: 0.5,
    HITSTOP_LIGHT: 0.06,
    HITSTOP_HEAVY: 0.10,
    CAM_SHAKE_LIGHT: 5,
    CAM_SHAKE_HEAVY: 10,
  };

  const COLORS = {
    stageLine: 'rgba(255,255,255,0.15)',
    hitbox: 'rgba(255,0,0,0.35)',
    hurtbox: 'rgba(255,255,255,0.12)',
    p1: '#33d6a6',
    p2: '#f7768e',
    shadow: 'rgba(0,0,0,0.35)',
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function randRange(a, b) { return a + Math.random() * (b - a); }

  class Sound {
    constructor() {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = AC ? new AC() : null;
      this.master = this.ctx ? this.ctx.createGain() : null;
      if (this.master) {
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
      }
      this.muted = false;
      this._noiseBuf = null;
      if (this.ctx) {
        const unlock = () => this.ctx.resume?.();
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('pointerdown', unlock, { once: true });
      }
    }
    setMuted(m) { this.muted = m; }
    get noiseBuffer() {
      if (!this.ctx) return null;
      if (this._noiseBuf) return this._noiseBuf;
      const len = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
      this._noiseBuf = buf;
      return buf;
    }
    playTone({ type='sine', freq=440, dur=0.2, attack=0.005, decay=0.12, gain=0.2, glideTo=null }) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + decay);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + decay + 0.02);
    }
    playNoise({ type='bandpass', freq=1000, q=0.7, dur=0.15, attack=0.005, decay=0.18, gain=0.25 }) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + decay);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + decay + 0.05);
    }
    whoosh(light=true) {
      this.playNoise({ type: 'bandpass', freq: light ? 900 : 650, q: 0.8, dur: light ? 0.09 : 0.14, gain: light ? 0.2 : 0.28 });
    }
    hit(light=true) {
      this.playNoise({ type: 'lowpass', freq: light ? 1000 : 700, q: 0.9, dur: 0.08, gain: light ? 0.24 : 0.32 });
      this.playTone({ type: 'sine', freq: light ? 220 : 160, dur: 0.05, attack: 0.001, decay: 0.1, gain: 0.25 });
    }
    jump() {
      this.playTone({ type: 'triangle', freq: 440, glideTo: 660, dur: 0.08, attack: 0.001, decay: 0.12, gain: 0.15 });
    }
    land() {
      this.playTone({ type: 'sine', freq: 120, dur: 0.05, attack: 0.001, decay: 0.15, gain: 0.3 });
    }
    ko() {
      this.playTone({ type: 'square', freq: 440, glideTo: 110, dur: 0.5, attack: 0.005, decay: 0.3, gain: 0.2 });
    }
    tick() {
      this.playTone({ type: 'square', freq: 880, dur: 0.05, attack: 0.001, decay: 0.05, gain: 0.1 });
    }
  }
  const SFX = new Sound();

  class Keyboard {
    constructor() {
      this.pressed = new Set();
      this.prev = new Set();
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
        this.pressed.add(e.code);
      }, { passive: false });
      window.addEventListener('keyup', (e) => {
        this.pressed.delete(e.code);
      });
    }
    isDown(code) { return this.pressed.has(code); }
    justPressed(code) { return this.pressed.has(code) && !this.prev.has(code); }
    update() {
      this.prev = new Set(this.pressed);
    }
  }

  class VirtualPad {
    constructor() {
      this.pressed = new Set();
      this.prev = new Set();
      this.impulses = new Map();
    }
    press(code, time = 0.09) {
      this.pressed.add(code);
      this.impulses.set(code, Math.max(this.impulses.get(code) || 0, time));
    }
    setDown(code, down) {
      if (down) this.pressed.add(code);
      else this.pressed.delete(code);
    }
    isDown(code) { return this.pressed.has(code); }
    justPressed(code) { return this.pressed.has(code) && !this.prev.has(code); }
    update(dt) {
      for (const [code, t] of this.impulses.entries()) {
        const nt = t - dt;
        if (nt <= 0) {
          this.pressed.delete(code);
          this.impulses.delete(code);
        } else {
          this.impulses.set(code, nt);
        }
      }
      this.prev = new Set(this.pressed);
    }
  }

  class Attack {
    constructor({ name, startup, active, recovery, damage, kbX, kbY, hitstun, width, height, offsetX, offsetY }) {
      this.name = name;
      this.startup = startup;
      this.active = active;
      this.recovery = recovery;
      this.damage = damage;
      this.kbX = kbX;
      this.kbY = kbY;
      this.hitstun = hitstun;
      this.width = width;
      this.height = height;
      this.offsetX = offsetX;
      this.offsetY = offsetY;
    }
    total() { return this.startup + this.active + this.recovery; }
  }

  const ATTACKS = {
    light: new Attack({
      name: 'Light', startup: 0.07, active: 0.06, recovery: 0.22,
      damage: 6, kbX: 380, kbY: -120, hitstun: 0.22,
      width: 52, height: 20, offsetX: 38, offsetY: -70
    }),
    heavy: new Attack({
      name: 'Heavy', startup: 0.14, active: 0.10, recovery: 0.46,
      damage: 12, kbX: 520, kbY: -320, hitstun: 0.36,
      width: 60, height: 26, offsetX: 46, offsetY: -62
    }),
    antiAir: new Attack({
      name: 'Uppercut', startup: 0.11, active: 0.10, recovery: 0.40,
      damage: 9, kbX: 120, kbY: -620, hitstun: 0.35,
      width: 30, height: 60, offsetX: 28, offsetY: -100
    }),
  };

  class Fighter {
    constructor(id, x, color, controls) {
      this.id = id;
      this.color = color;
      this.controls = controls;

      this.pos = { x, y: CONFIG.FLOOR_Y };
      this.vel = { x: 0, y: 0 };
      this.facing = id === 1 ? 1 : -1;
      this.w = CONFIG.HURTBOX.w;
      this.h = CONFIG.HURTBOX.h;
      this.onGround = true;

      this.state = 'idle';
      this.health = 100;
      this.chipHealth = 100;

      this.attack = null;
      this.attackT = 0;
      this.hasHitThisAttack = false;
      this._activeJustStarted = false;

      this.hitstunT = 0;

      this.jumpBuffered = 0;
      this.attackBuffered = null;

      this.name = id === 1 ? 'You' : 'AI';

      this.animT = 0;
      this.landedThisFrame = false;
      this.flashT = 0;
    }

    hurtbox() {
      return {
        x: this.pos.x - this.w / 2,
        y: this.pos.y - this.h,
        w: this.w,
        h: this.h,
      };
    }

    currentHitbox() {
      if (!this.attack) return null;
      const t = this.attackT;
      if (t < this.attack.startup || t > this.attack.startup + this.attack.active) return null;
      const forward = this.facing;
      const cx = this.pos.x + (this.attack.offsetX * forward);
      const cy = this.pos.y + this.attack.offsetY;
      const x = cx - (this.attack.width / 2);
      const y = cy - (this.attack.height / 2);
      return { x, y, w: this.attack.width, h: this.attack.height };
    }

    attackIsActiveNow() {
      if (!this.attack) return false;
      const t = this.attackT;
      return t >= this.attack.startup && t <= this.attack.startup + this.attack.active;
    }

    canControl() {
      return this.state !== 'attack' && this.state !== 'hitstun' && this.state !== 'ko';
    }

    startAttack(a) {
      if (this.state === 'ko') return;
      if (this.state === 'attack' || this.state === 'hitstun') {
        this.attackBuffered = a;
        return;
      }
      this.attack = a;
      this.attackT = 0;
      this.state = 'attack';
      this.hasHitThisAttack = false;
      this._activeJustStarted = false;
    }

    takeHit(from, a) {
      if (this.state === 'ko') return;
      this.health = Math.max(0, this.health - a.damage);
      this.hitstunT = a.hitstun;
      this.state = this.health <= 0 ? 'ko' : 'hitstun';
      const dir = from.pos.x < this.pos.x ? 1 : -1;
      this.vel.x = a.kbX * dir;
      this.vel.y = a.kbY;
      this.onGround = false;
      this.flashT = 0.12;
    }

    updateFacing(opponent) {
      if (this.state === 'ko') return;
      this.facing = this.pos.x < opponent.pos.x ? 1 : -1;
    }

    handleInput(input, dt) {
      if (this.state === 'ko') return;

      if (this.canControl()) {
        let move = 0;
        if (input.isDown(this.controls.left)) move -= 1;
        if (input.isDown(this.controls.right)) move += 1;

        const target = move * CONFIG.MAX_RUN_SPEED;
        const accel = CONFIG.ACCEL * dt;
        if (this.onGround) {
          if (this.vel.x < target) this.vel.x = Math.min(target, this.vel.x + accel);
          else if (this.vel.x > target) this.vel.x = Math.max(target, this.vel.x - accel);
        } else {
          this.vel.x = lerp(this.vel.x, target, 0.06);
        }

        if (move !== 0 && this.onGround) this.state = 'walk';
        else if (this.onGround && this.state !== 'attack') this.state = 'idle';
      }

      if (input.justPressed(this.controls.jump)) {
        this.jumpBuffered = 0.12;
      }
      if (this.jumpBuffered > 0) this.jumpBuffered -= dt;

      if ((this.canControl() || this.state === 'attack') && this.jumpBuffered > 0) {
        if (this.onGround) {
          this.vel.y = -CONFIG.JUMP_SPEED;
          this.onGround = false;
          this.state = 'jump';
          this.jumpBuffered = 0;
          SFX.jump();
        }
      }

      if (input.justPressed(this.controls.light)) this.startAttack(ATTACKS.light);
      if (input.justPressed(this.controls.heavy)) {
        if (!this.onGround) this.startAttack(ATTACKS.antiAir);
        else this.startAttack(ATTACKS.heavy);
      }
    }

    step(dt) {
      this.landedThisFrame = false;

      if (this.state === 'attack' && this.attack) {
        const prevT = this.attackT;
        this.attackT += dt;
        if (prevT < this.attack.startup && this.attackT >= this.attack.startup) {
          this._activeJustStarted = true;
        }
        if (this.attackT >= this.attack.total()) {
          this.attack = null;
          this.attackT = 0;
          this.state = this.onGround ? 'idle' : 'jump';
          if (this.attackBuffered) {
            const buffered = this.attackBuffered;
            this.attackBuffered = null;
            this.startAttack(buffered);
          }
        }
      }

      if (this.state === 'hitstun') {
        this.hitstunT -= dt;
        if (this.hitstunT <= 0) {
          this.state = this.onGround ? 'idle' : 'jump';
        }
      }

      this.vel.y += CONFIG.GRAVITY * dt;

      if (this.onGround && this.canControl()) {
        const s = Math.sign(this.vel.x);
        const mag = Math.abs(this.vel.x);
        const decel = CONFIG.GROUND_FRICTION * dt;
        const newMag = Math.max(0, mag - decel);
        this.vel.x = newMag * s;
      } else if (!this.onGround) {
        this.vel.x *= CONFIG.AIR_DRAG;
      }

      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;

      const half = this.w / 2;
      if (this.pos.x < half) { this.pos.x = half; this.vel.x = 0; }
      if (this.pos.x > CONFIG.WIDTH - half) { this.pos.x = CONFIG.WIDTH - half; this.vel.x = 0; }

      if (this.pos.y >= CONFIG.FLOOR_Y) {
        if (!this.onGround) {
          this.landedThisFrame = true;
          SFX.land();
        }
        this.pos.y = CONFIG.FLOOR_Y;
        this.vel.y = 0;
        if (!this.onGround) {
          this.onGround = true;
          if (this.state === 'jump') this.state = 'idle';
        } else {
          this.onGround = true;
        }
      } else {
        this.onGround = false;
      }

      this.animT += dt;
      if (this.flashT > 0) this.flashT -= dt;

      this.chipHealth = lerp(this.chipHealth, this.health, 0.12);
    }

    draw(ctx, debug = false, time = 0, camShake = { x: 0, y: 0 }) {
      const shadowW = this.w * 0.9;
      const shadowH = 10;
      ctx.fillStyle = COLORS.shadow;
      ctx.beginPath();
      ctx.ellipse(this.pos.x + camShake.x * 0.1, CONFIG.FLOOR_Y + 2 + camShake.y * 0.1, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(this.pos.x + camShake.x, this.pos.y + camShake.y);
      ctx.scale(this.facing, 1);

      const bodyW = this.w;
      const bodyH = this.h;
      const idleBob = Math.sin(time * 6) * (this.onGround ? 1.5 : 0);
      const runSwing = Math.sin(time * 12) * 10 * (this.state === 'walk' ? 1 : 0);
      const jumpTilt = this.onGround ? 0 : clamp(this.vel.y * 0.03, -8, 10);

      const baseColor = this.color;
      const flash = this.flashT > 0 ? 1 - this.flashT / 0.12 : 0;
      const mix = (c1, c2, t) => {
        const a = parseInt(c1.slice(1), 16);
        const b = parseInt(c2.slice(1), 16);
        const r = Math.round(((a>>16)&255)*(1-t) + ((b>>16)&255)*t);
        const g = Math.round(((a>>8)&255)*(1-t) + ((b>>8)&255)*t);
        const bl = Math.round((a&255)*(1-t) + (b&255)*t);
        return `rgb(${r},${g},${bl})`;
      };
      const bodyColor = mix(baseColor, '#ffffff', flash * 0.8);

      ctx.save();
      ctx.translate(0, idleBob);
      ctx.rotate((runSwing * 0.02 + jumpTilt * Math.PI / 180));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-bodyW/2, -bodyH, bodyW, bodyH);

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(bodyW*0.15, -bodyH*0.8, 6, 10);

      const armW = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const attackPose = this.state === 'attack' ? clamp((this.attackT / (this.attack?.total() || 1)) * 1.2, 0, 1) : 0;
      const armUp = -bodyH * 0.65;
      const armH = bodyH * 0.55;

      ctx.save();
      ctx.translate(-bodyW/2 - armW, armUp);
      ctx.rotate((-runSwing * 0.05) - attackPose * 0.4);
      ctx.fillRect(0, 0, armW, armH);
      ctx.restore();

      ctx.save();
      ctx.translate(bodyW/2, armUp);
      ctx.rotate((runSwing * 0.05) + attackPose * 0.7);
      ctx.fillRect(0, 0, armW, armH);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-2, armH - 10, armW + 4, 10);
      ctx.restore();

      ctx.restore();

      if (this.attackIsActiveNow()) {
        ctx.save();
        ctx.translate(0, idleBob);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const r = 40;
        ctx.arc(this.pos.x + camShake.x + this.facing * (this.w * 0.6), this.pos.y + camShake.y - this.h * 0.6, r, Math.PI * 0.2, -Math.PI * 0.2, this.facing < 0);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();

      if (debug) {
        const hb = this.hurtbox();
        ctx.fillStyle = COLORS.hurtbox;
        ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
        const atk = this.currentHitbox();
        if (atk) {
          ctx.fillStyle = COLORS.hitbox;
          ctx.fillRect(atk.x, atk.y, atk.w, atk.h);
        }
      }
    }
  }

  class Particle {
    constructor(x, y, vx, vy, life, size, color) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.size = size;
      this.color = color;
    }
    step(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 1200 * dt * 0.2;
    }
    draw(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
      ctx.globalAlpha = 1;
    }
  }

  function spawnHitSparks(particles, x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(140, 320);
      particles.push(new Particle(
        x + Math.cos(a)*4, y + Math.sin(a)*4,
        Math.cos(a) * sp, Math.sin(a) * sp,
        randRange(0.12, 0.22),
        randRange(2, 3),
        color
      ));
    }
  }
  function spawnDust(particles, x, y) {
    for (let i = 0; i < 6; i++) {
      const vx = randRange(40, 120) * (Math.random() < 0.5 ? -1 : 1);
      const vy = randRange(-30, -90);
      particles.push(new Particle(
        x + randRange(-10, 10), y + 2,
        vx, vy,
        randRange(0.18, 0.28),
        randRange(2, 3),
        'rgba(255,255,255,0.25)'
      ));
    }
  }

  const DIFFS = [
    { name: 'Easy', reaction: 0.26, desired: 120, jumpProb: 0.04, attackCD: 0.65, bravery: 0.5 },
    { name: 'Normal', reaction: 0.18, desired: 100, jumpProb: 0.07, attackCD: 0.45, bravery: 0.7 },
    { name: 'Hard', reaction: 0.12, desired: 90, jumpProb: 0.10, attackCD: 0.34, bravery: 0.9 },
  ];

  class AIController {
    constructor(fighter, opponent, pad) {
      this.f = fighter;
      this.opp = opponent;
      this.pad = pad;
      this.t = 0;
      this.nextThink = 0;
      this.coolAttack = 0;
      this.diffIndex = 1;
      this.enabled = false;
    }
    setDifficulty(idx) {
      this.diffIndex = ((idx % DIFFS.length) + DIFFS.length) % DIFFS.length;
    }
    get diff() { return DIFFS[this.diffIndex]; }
    update(dt) {
      this.pad.update(dt);
      if (!this.enabled) return;

      this.t += dt;
      if (this.coolAttack > 0) this.coolAttack -= dt;

      if (this.f.state === 'hitstun' || this.f.state === 'ko') return;

      this.nextThink -= dt;
      if (this.nextThink > 0) return;
      this.nextThink = this.diff.reaction * randRange(0.8, 1.2);

      const f = this.f, o = this.opp;
      const distX = Math.abs(f.pos.x - o.pos.x);
      const onGround = f.onGround;
      const close = distX < 70;
      const mid = distX < 130;

      this.pad.setDown(f.controls.left, false);
      this.pad.setDown(f.controls.right, false);

      if (distX > this.diff.desired + 20) {
        if (f.pos.x < o.pos.x) this.pad.setDown(f.controls.right, true);
        else this.pad.setDown(f.controls.left, true);
      } else if (distX < this.diff.desired - 20) {
        if (Math.random() > this.diff.bravery) {
          if (f.pos.x < o.pos.x) this.pad.setDown(f.controls.left, true);
          else this.pad.setDown(f.controls.right, true);
        }
      } else if (Math.random() < 0.3) {
        if (Math.random() < 0.5) this.pad.setDown(f.controls.left, true);
        else this.pad.setDown(f.controls.right, true);
      }

      if (onGround && distX > this.diff.desired + 40 && Math.random() < this.diff.jumpProb) {
        this.pad.press(f.controls.jump, 0.08);
      }

      const oppRising = !o.onGround && o.vel.y < -50 && mid;
      if (onGround && oppRising && this.coolAttack <= 0) {
        this.pad.press(f.controls.heavy);
        this.coolAttack = this.diff.attackCD;
        return;
      }

      if (onGround && this.coolAttack <= 0) {
        if (close && Math.random() < 0.6) {
          this.pad.press(f.controls.heavy);
          this.coolAttack = this.diff.attackCD;
        } else if (mid && Math.random() < 0.75) {
          this.pad.press(f.controls.light);
          this.coolAttack = this.diff.attackCD * randRange(0.7, 1.2);
        }
      }

      if (!onGround && this.coolAttack <= 0 && Math.random() < 0.5) {
        this.pad.press(f.controls.heavy);
        this.coolAttack = this.diff.attackCD;
      }
    }
  }

  class Game {
    constructor() {
      this.kb = new Keyboard();
      this.p1 = new Fighter(1, CONFIG.WIDTH * 0.3, COLORS.p1, {
        left: 'KeyA',
        right: 'KeyD',
        jump: 'KeyW',
        light: 'KeyJ',
        heavy: 'KeyK',
      });
      this.p2 = new Fighter(2, CONFIG.WIDTH * 0.7, COLORS.p2, {
        left: 'ArrowLeft',
        right: 'ArrowRight',
        jump: 'ArrowUp',
        light: 'Digit1',
        heavy: 'Digit2',
      });

      this.aiPad = new VirtualPad();
      this.ai = new AIController(this.p2, this.p1, this.aiPad);

      this.players = [this.p1, this.p2];

      this.timeLeft = CONFIG.ROUND_TIME;
      this.roundOver = false;
      this.paused = false;
      this.debug = false;
      this.inMenu = true;

      this.lastTs = 0;

      this.hitstopT = 0;
      this.camShakeT = 0;
      this.camShakeMag = 0;
      this.particles = [];
      this.lastTimerWhole = CONFIG.ROUND_TIME;

      window.addEventListener('keydown', (e) => {
        if (this.inMenu && (e.code === 'Enter' || e.code === 'Space')) {
          this.startGame();
          return;
        }
        if (e.code === 'KeyR') this.resetRound();
        if (e.code === 'KeyP') this.togglePause();
        if (e.code === 'Backquote') this.debug = !this.debug;
        if (e.code === 'KeyM') {
          SFX.setMuted(!SFX.muted);
          this.flashMessage(SFX.muted ? 'Sound: Muted' : 'Sound: On', 0.8);
        }
        if (e.code === 'KeyH') {
          this.ai.setDifficulty(this.ai.diffIndex + 1);
          UI.aiDiff.textContent = this.ai.diff.name;
          this.flashMessage(`AI: ${this.ai.diff.name}`, 0.8);
        }
      });
      UI.btnPlay.addEventListener('click', () => this.startGame());

      this.updateUI(true);
      requestAnimationFrame(this.loop.bind(this));
    }

    startGame() {
      if (!this.inMenu) return;
      this.inMenu = false;
      UI.menu.classList.add('hidden');
      this.resetRound();
      this.ai.enabled = true;
      this.flashMessage('Fight!', 1.0);
    }

    flashMessage(msg, secs = 1.2) {
      UI.messages.textContent = msg;
      clearTimeout(this._msgTO);
      this._msgTO = setTimeout(() => {
        if (!this.roundOver && !this.inMenu) UI.messages.textContent = '';
      }, secs * 1000);
    }

    togglePause() {
      if (this.inMenu) return;
      this.paused = !this.paused;
      UI.messages.textContent = this.paused ? 'Paused' : '';
    }

    resetRound() {
      this.p1.pos = { x: CONFIG.WIDTH * 0.3, y: CONFIG.FLOOR_Y };
      this.p2.pos = { x: CONFIG.WIDTH * 0.7, y: CONFIG.FLOOR_Y };
      for (const p of this.players) {
        p.vel = { x: 0, y: 0 };
        p.facing = p === this.p1 ? 1 : -1;
        p.onGround = true;
        p.state = 'idle';
        p.health = 100;
        p.chipHealth = 100;
        p.attack = null;
        p.attackT = 0;
        p.hitstunT = 0;
        p.hasHitThisAttack = false;
        p.flashT = 0;
      }
      this.timeLeft = CONFIG.ROUND_TIME;
      this.roundOver = false;
      this.hitstopT = 0;
      this.camShakeT = 0;
      this.camShakeMag = 0;
      this.particles = [];
      this.lastTimerWhole = CONFIG.ROUND_TIME;
      UI.messages.textContent = '';
      this.updateUI(true);
    }

    endRound(msg) {
      this.roundOver = true;
      UI.messages.textContent = msg + ' — Press R to reset';
      SFX.ko();
    }

    loop(ts) {
      const dtRaw = (ts - this.lastTs) / 1000 || 0;
      this.lastTs = ts;
      const dt = Math.min(1/30, dtRaw);

      if (!this.inMenu && !this.paused) this.step(dt);
      this.draw();

      this.kb.update();
      requestAnimationFrame(this.loop.bind(this));
    }

    step(dt) {
      if (this.hitstopT > 0) {
        this.hitstopT -= dt;
        this.ai.update(dt);
        for (const p of this.players) if (p.flashT > 0) p.flashT -= dt;
        return;
      }

      if (!this.roundOver) {
        this.timeLeft -= dt;
        const whole = Math.max(0, Math.ceil(this.timeLeft));
        if (whole !== this.lastTimerWhole) {
          this.lastTimerWhole = whole;
          if (whole <= 10 && whole > 0) SFX.tick();
        }
        if (this.timeLeft <= 0) {
          const h1 = this.p1.health;
          const h2 = this.p2.health;
          let msg = 'Draw!';
          if (h1 > h2) msg = 'You Win by Timeout!';
          else if (h2 > h1) msg = 'AI Wins by Timeout!';
          this.endRound(msg);
        }
      }

      this.p1.handleInput(this.kb, dt);
      this.ai.update(dt);
      this.p2.handleInput(this.aiPad, dt);

      this.p1.updateFacing(this.p2);
      this.p2.updateFacing(this.p1);

      for (const p of this.players) p.step(dt);

      for (const p of this.players) {
        if (p._activeJustStarted) {
          SFX.whoosh(p.attack?.damage <= 9);
          p._activeJustStarted = false;
        }
      }

      this.resolvePush();

      for (const p of this.players) {
        if (p.landedThisFrame) spawnDust(this.particles, p.pos.x, CONFIG.FLOOR_Y);
      }

      if (!this.roundOver) this.resolveHits();

      if (!this.roundOver) {
        if (this.p1.state === 'ko' || this.p2.state === 'ko') {
          const msg = this.p1.state === 'ko' && this.p2.state === 'ko'
            ? 'Double KO!'
            : (this.p1.state === 'ko' ? 'AI Wins!' : 'You Win!');
          this.endRound(msg);
        }
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.step(dt);
        if (pt.life <= 0) this.particles.splice(i, 1);
      }

      if (this.camShakeT > 0) this.camShakeT -= dt;
      if (this.camShakeT <= 0) this.camShakeMag = 0;

      this.updateUI();
    }

    resolvePush() {
      const a = this.p1.hurtbox();
      const b = this.p2.hurtbox();
      if (!rectsIntersect(a, b)) return;

      const centerA = a.x + a.w / 2;
      const centerB = b.x + b.w / 2;
      const overlapX = (a.w / 2 + b.w / 2) - Math.abs(centerA - centerB);
      if (overlapX > 0) {
        const push = overlapX * 0.5;
        const dir = centerA < centerB ? -1 : 1;
        this.p1.pos.x += push * dir;
        this.p2.pos.x -= push * dir;

        const half = this.p1.w / 2;
        this.p1.pos.x = clamp(this.p1.pos.x, half, CONFIG.WIDTH - half);
        this.p2.pos.x = clamp(this.p2.pos.x, half, CONFIG.WIDTH - half);
      }
    }

    resolveHits() {
      const tryHit = (attacker, defender) => {
        if (attacker.state !== 'attack' || attacker.hasHitThisAttack) return;
        const hb = attacker.currentHitbox();
        if (!hb) return;
        const defHurt = defender.hurtbox();
        if (rectsIntersect(hb, defHurt)) {
          defender.takeHit(attacker, attacker.attack);
          attacker.hasHitThisAttack = true;

          const heavy = attacker.attack.damage > 9;
          this.hitstopT = heavy ? 0.10 : 0.06;
          this.camShakeT = heavy ? 0.22 : 0.14;
          this.camShakeMag = heavy ? 10 : 5;
          const cx = hb.x + hb.w / 2;
          const cy = hb.y + hb.h / 2;
          spawnHitSparks(this.particles, cx, cy, 'rgba(255,255,255,0.9)');
          SFX.hit(!heavy);
        }
      };
      tryHit(this.p1, this.p2);
      tryHit(this.p2, this.p1);
    }

    updateUI(force = false) {
      const setBars = (el, chipEl, value, chip) => {
        const v = clamp(value, 0, 100);
        const c = clamp(chip, 0, 100);
        el.style.width = `${v}%`;
        chipEl.style.width = `${c}%`;
      };
      setBars(UI.p1Health, UI.p1Chip, this.p1.health, this.p1.chipHealth);
      setBars(UI.p2Health, UI.p2Chip, this.p2.health, this.p2.chipHealth);

      const t = Math.max(0, Math.ceil(this.timeLeft));
      if (UI.timer.textContent !== String(t) || force) UI.timer.textContent = String(t);
    }

    draw() {
      const { WIDTH, HEIGHT, FLOOR_Y } = CONFIG;

      let cam = { x: 0, y: 0 };
      if (this.camShakeT > 0) {
        cam.x = (Math.random() * 2 - 1) * this.camShakeMag;
        cam.y = (Math.random() * 2 - 1) * this.camShakeMag * 0.6;
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      for (let i = 0; i < 4; i++) {
        const h = 80 + i * 40;
        const y = FLOOR_Y - 160 - i * 26;
        ctx.fillStyle = `rgba(255,255,255,${0.04 + i*0.02})`;
        ctx.fillRect(30 + i*140, y, 120, h);
        ctx.fillRect(300 + i*120, y + 10, 100, h - 20);
        ctx.fillRect(560 + i*140, y - 6, 140, h + 10);
        ctx.fillRect(820 + i*80, y + 6, 70, h - 12);
      }

      const grd = ctx.createLinearGradient(0, FLOOR_Y - 50, 0, HEIGHT);
      grd.addColorStop(0, 'rgba(0,0,0,0.08)');
      grd.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, FLOOR_Y - 40, WIDTH, HEIGHT - (FLOOR_Y - 40));

      ctx.strokeStyle = COLORS.stageLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y + 1);
      ctx.lineTo(WIDTH, FLOOR_Y + 1);
      ctx.stroke();

      const now = performance.now() / 1000;

      this.p1.draw(ctx, this.debug, now, cam);
      this.p2.draw(ctx, this.debug, now, cam);

      for (const pt of this.particles) pt.draw(ctx);
    }
  }

  new Game();
})();
