/* Fighthing Street — Crouch state, more unique attacks, super armor (no stagger while attacking)
   - Hold S to crouch (reduced hurtbox + unique crouch attacks)
   - While attacking, you will not be staggered (no hitstun/knockback), but you still take damage
   - Directional attacks remain (Up/Down/Forward/Back/Neutral) + Crouch variants
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
    MAX_RUN_SPEED: 380,
    MAX_CROUCH_SPEED: 140,
    ACCEL: 2800,
    JUMP_SPEED: 940,
    WALL_SLIDE_MAX: 360,
    WALL_JUMP_X: 560,
    WALL_JUMP_Y: 860,
    WALL_STICK: 0.12,
    HURTBOX_W: 58,
    HURTBOX_STAND_H: 116,
    HURTBOX_CROUCH_H: 78,
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
  function rectsIntersect(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function randRange(a, b) { return a + Math.random() * (b - a); }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

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
      this.playNoise({ type: 'bandpass', freq: light ? 950 : 650, q: 0.9, dur: light ? 0.08 : 0.14, gain: light ? 0.22 : 0.3 });
    }
    hit(light=true) {
      this.playNoise({ type: 'lowpass', freq: light ? 1100 : 800, q: 0.9, dur: 0.08, gain: light ? 0.24 : 0.34 });
      this.playTone({ type: 'sine', freq: light ? 220 : 160, dur: 0.06, attack: 0.001, decay: 0.12, gain: 0.25 });
    }
    jump() {
      this.playTone({ type: 'triangle', freq: 420, glideTo: 660, dur: 0.08, attack: 0.001, decay: 0.12, gain: 0.15 });
    }
    land() {
      this.playTone({ type: 'sine', freq: 110, dur: 0.05, attack: 0.001, decay: 0.18, gain: 0.3 });
    }
    ko() {
      this.playTone({ type: 'square', freq: 440, glideTo: 110, dur: 0.5, attack: 0.005, decay: 0.3, gain: 0.22 });
    }
    boom() {
      this.playNoise({ type: 'lowpass', freq: 220, q: 0.9, dur: 0.25, attack: 0.001, decay: 0.5, gain: 0.5 });
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
    update() { this.prev = new Set(this.pressed); }
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
    setDown(code, down) { if (down) this.pressed.add(code); else this.pressed.delete(code); }
    isDown(code) { return this.pressed.has(code); }
    justPressed(code) { return this.pressed.has(code) && !this.prev.has(code); }
    update(dt) {
      for (const [code, t] of this.impulses.entries()) {
        const nt = t - dt;
        if (nt <= 0) { this.pressed.delete(code); this.impulses.delete(code); }
        else this.impulses.set(code, nt);
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

  // Expanded uniqueness: crouch-specific variants
  const ATTACKS = {
    light: {
      neutral: new Attack({ name: 'Jab Hook', startup: 0.05, active: 0.06, recovery: 0.20, damage: 5, kbX: 300, kbY: -80, hitstun: 0.18, width: 50, height: 18, offsetX: 34, offsetY: -68 }),
      forward: new Attack({ name: 'Straight', startup: 0.06, active: 0.06, recovery: 0.22, damage: 6, kbX: 360, kbY: -100, hitstun: 0.20, width: 58, height: 18, offsetX: 44, offsetY: -66 }),
      back: new Attack({ name: 'Backfist', startup: 0.08, active: 0.06, recovery: 0.24, damage: 6, kbX: 320, kbY: -90, hitstun: 0.20, width: 54, height: 18, offsetX: -12, offsetY: -72 }),
      up: new Attack({ name: 'Uppercut L', startup: 0.10, active: 0.08, recovery: 0.28, damage: 7, kbX: 140, kbY: -560, hitstun: 0.28, width: 26, height: 64, offsetX: 26, offsetY: -100 }),
      down: new Attack({ name: 'Hammer L', startup: 0.08, active: 0.06, recovery: 0.26, damage: 6, kbX: 220, kbY: 80, hitstun: 0.22, width: 38, height: 40, offsetX: 24, offsetY: -40 }),
      crouch: new Attack({ name: 'Low Jab', startup: 0.05, active: 0.06, recovery: 0.18, damage: 4, kbX: 240, kbY: 40, hitstun: 0.16, width: 44, height: 16, offsetX: 30, offsetY: -34 }),
    },
    heavy: {
      neutral: new Attack({ name: 'Heavy Hook', startup: 0.12, active: 0.10, recovery: 0.42, damage: 11, kbX: 520, kbY: -240, hitstun: 0.32, width: 68, height: 26, offsetX: 48, offsetY: -64 }),
      forward: new Attack({ name: 'Heavy Straight', startup: 0.13, active: 0.10, recovery: 0.46, damage: 12, kbX: 580, kbY: -260, hitstun: 0.34, width: 74, height: 24, offsetX: 56, offsetY: -64 }),
      back: new Attack({ name: 'Spinning Backfist', startup: 0.14, active: 0.10, recovery: 0.48, damage: 12, kbX: 520, kbY: -240, hitstun: 0.34, width: 66, height: 26, offsetX: -14, offsetY: -70 }),
      up: new Attack({ name: 'Uppercut H', startup: 0.12, active: 0.10, recovery: 0.44, damage: 10, kbX: 160, kbY: -660, hitstun: 0.36, width: 32, height: 72, offsetX: 30, offsetY: -106 }),
      down: new Attack({ name: 'Hammer H', startup: 0.11, active: 0.08, recovery: 0.42, damage: 10, kbX: 280, kbY: 140, hitstun: 0.30, width: 42, height: 48, offsetX: 28, offsetY: -46 }),
      crouch: new Attack({ name: 'Sweep', startup: 0.12, active: 0.12, recovery: 0.44, damage: 9, kbX: 360, kbY: 120, hitstun: 0.34, width: 80, height: 22, offsetX: 36, offsetY: -24 }),
    }
  };

  class Fighter {
    constructor(id, x, color, controls) {
      this.id = id;
      this.color = color;
      this.controls = controls;

      this.pos = { x, y: CONFIG.FLOOR_Y };
      this.vel = { x: 0, y: 0 };
      this.facing = id === 1 ? 1 : -1;
      this.w = CONFIG.HURTBOX_W;
      this.onGround = true;

      this.state = 'idle'; // idle, walk, jump, crouch, attack, hitstun, ko
      this.health = 100;
      this.chipHealth = 100;

      this.attack = null;
      this.attackT = 0;
      this.hasHitThisAttack = false;
      this._activeJustStarted = false;
      this.attackDir = 'neutral';
      this.attackKind = 'light';

      this.hitstunT = 0;

      this.jumpBuffered = 0;
      this.attackBuffered = null;

      this.name = id === 1 ? 'You' : 'AI';

      this.animT = 0;
      this.landedThisFrame = false;
      this.flashT = 0;

      this.touchWall = 0;
      this.wallStickT = 0;
      this.wallJumpLock = 0;
    }

    currentHeight() {
      return this.state === 'crouch' ? CONFIG.HURTBOX_CROUCH_H : CONFIG.HURTBOX_STAND_H;
    }

    hurtbox() {
      const h = this.currentHeight();
      return {
        x: this.pos.x - this.w / 2,
        y: this.pos.y - h,
        w: this.w,
        h,
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

    startDirectionalAttack(kind, dir) {
      if (this.state === 'ko') return;
      if (this.state === 'attack' || this.state === 'hitstun') { this.attackBuffered = { kind, dir }; return; }
      this.attackKind = kind;
      this.attackDir = dir;
      this.attack = ATTACKS[kind][dir];
      this.attackT = 0;
      this.state = 'attack';
      this.hasHitThisAttack = false;
      this._activeJustStarted = false;
    }

    takeHit(from, a, { armored = false } = {}) {
      if (this.state === 'ko') return;
      this.health = Math.max(0, this.health - a.damage);
      this.flashT = 0.12;

      if (armored && this.state === 'attack') {
        // Super armor: no hitstun or knockback; keep current velocity/state
        return;
      }

      // Normal reaction
      this.hitstunT = a.hitstun;
      this.state = this.health <= 0 ? 'ko' : 'hitstun';
      const dir = from.pos.x < this.pos.x ? 1 : -1;
      this.vel.x = a.kbX * dir;
      this.vel.y = a.kbY;
      this.onGround = false;
    }

    updateFacing(opponent) {
      if (this.state === 'ko') return;
      this.facing = this.pos.x < opponent.pos.x ? 1 : -1;
    }

    aimDirFromInput(input) {
      // If crouching and not aiming up, use crouch variant
      if (this.state === 'crouch' && !input.isDown(this.controls.upAim)) return 'crouch';
      if (input.isDown(this.controls.upAim)) return 'up';
      if (input.isDown(this.controls.downAim)) return 'down';
      const left = input.isDown(this.controls.left);
      const right = input.isDown(this.controls.right);
      if (left && !right) return this.facing === -1 ? 'forward' : 'back';
      if (right && !left) return this.facing === 1 ? 'forward' : 'back';
      return 'neutral';
    }

    handleInput(input, dt) {
      if (this.state === 'ko') return;

      // Determine crouch intent (grounded and holding down)
      const wantCrouch = this.onGround && input.isDown(this.controls.downAim) && this.state !== 'attack' && this.state !== 'hitstun';

      // Movement
      if (this.canControl() || this.state === 'crouch') {
        let move = 0;
        if (input.isDown(this.controls.left)) move -= 1;
        if (input.isDown(this.controls.right)) move += 1;

        const isCrouch = wantCrouch || this.state === 'crouch';
        const maxSpd = isCrouch ? CONFIG.MAX_CROUCH_SPEED : CONFIG.MAX_RUN_SPEED;
        const target = move * maxSpd;
        const accel = CONFIG.ACCEL * dt;

        if (this.onGround) {
          if (this.vel.x < target) this.vel.x = Math.min(target, this.vel.x + accel);
          else if (this.vel.x > target) this.vel.x = Math.max(target, this.vel.x - accel);
        } else {
          this.vel.x = lerp(this.vel.x, target, 0.06);
        }

        if (isCrouch) this.state = 'crouch';
        else if (move !== 0 && this.onGround) this.state = 'walk';
        else if (this.onGround && this.state !== 'attack') this.state = 'idle';
      }

      // Jump buffer
      if (input.justPressed(this.controls.jump)) {
        this.jumpBuffered = 0.14;
      }
      if (this.jumpBuffered > 0) this.jumpBuffered -= dt;

      if (this.wallStickT > 0) this.wallStickT -= dt;
      if (this.wallJumpLock > 0) this.wallJumpLock -= dt;

      // Jumps: ground or wall
      if ((this.canControl() || this.state === 'attack' || this.state === 'crouch') && this.jumpBuffered > 0) {
        if (this.onGround) {
          this.vel.y = -CONFIG.JUMP_SPEED;
          this.onGround = false;
          this.state = 'jump';
          this.jumpBuffered = 0;
          SFX.jump();
        } else if (this.touchWall !== 0 && this.wallJumpLock <= 0) {
          const away = -this.touchWall;
          this.vel.x = away * CONFIG.WALL_JUMP_X;
          this.vel.y = -CONFIG.WALL_JUMP_Y;
          this.facing = away;
          this.wallJumpLock = 0.18;
          this.wallStickT = 0;
          this.jumpBuffered = 0;
          SFX.jump();
        }
      }

      // Directional attacks
      if (input.justPressed(this.controls.light)) {
        const dir = this.aimDirFromInput(input);
        this.startDirectionalAttack('light', dir);
      }
      if (input.justPressed(this.controls.heavy)) {
        const dir = this.aimDirFromInput(input);
        this.startDirectionalAttack('heavy', dir);
      }
    }

    step(dt) {
      this.landedThisFrame = false;

      // Attack progression
      if (this.state === 'attack' && this.attack) {
        const prevT = this.attackT;
        this.attackT += dt;
        if (prevT < this.attack.startup && this.attackT >= this.attack.startup) {
          this._activeJustStarted = true;
        }
        if (this.attackT >= this.attack.total()) {
          this.attack = null;
          this.attackT = 0;
          // If holding down on ground, return to crouch, else idle/jump
          if (this.onGround) {
            this.state = (this.state === 'attack' && this.onGround) ? 'idle' : this.state;
            // state will get set to crouch by handleInput next frame if still holding down
            this.state = 'idle';
          } else {
            this.state = 'jump';
          }
          if (this.attackBuffered) {
            const buffered = this.attackBuffered;
            this.attackBuffered = null;
            this.startDirectionalAttack(buffered.kind, buffered.dir);
          }
        }
      }

      // Hitstun
      if (this.state === 'hitstun') {
        this.hitstunT -= dt;
        if (this.hitstunT <= 0) {
          this.state = this.onGround ? 'idle' : 'jump';
        }
      }

      // Gravity
      this.vel.y += CONFIG.GRAVITY * dt;

      // Wall detect
      this.touchWall = 0;
      const half = this.w / 2;
      const atLeft = this.pos.x <= half + 1;
      const atRight = this.pos.x >= CONFIG.WIDTH - half - 1;
      if (!this.onGround) {
        if (atLeft) this.touchWall = -1;
        else if (atRight) this.touchWall = 1;
      }

      // Wall slide
      if (!this.onGround && this.touchWall !== 0) {
        this.vel.y = Math.min(this.vel.y, CONFIG.WALL_SLIDE_MAX);
        this.wallStickT = CONFIG.WALL_STICK;
      }

      // Friction/drag
      if (this.onGround && (this.canControl() || this.state === 'crouch')) {
        const s = Math.sign(this.vel.x);
        const mag = Math.abs(this.vel.x);
        const decel = CONFIG.GROUND_FRICTION * dt;
        const newMag = Math.max(0, mag - decel);
        this.vel.x = newMag * s;
      } else if (!this.onGround) {
        this.vel.x *= CONFIG.AIR_DRAG;
      }

      // Integrate
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;

      // Bounds X
      if (this.pos.x < half) { this.pos.x = half; this.vel.x = Math.max(0, this.vel.x); }
      if (this.pos.x > CONFIG.WIDTH - half) { this.pos.x = CONFIG.WIDTH - half; this.vel.x = Math.min(0, this.vel.x); }

      // Ground collision
      if (this.pos.y >= CONFIG.FLOOR_Y) {
        if (!this.onGround) { this.landedThisFrame = true; SFX.land(); }
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

      // Anim timers
      this.animT += dt;
      if (this.flashT > 0) this.flashT -= dt;

      // Health bar chip tween
      this.chipHealth = lerp(this.chipHealth, this.health, 0.12);
    }

    draw(ctx, debug = false, time = 0, camShake = { x: 0, y: 0 }) {
      const hCur = this.currentHeight();

      // Shadow
      const shadowW = this.w * 0.95;
      const shadowH = 11;
      ctx.fillStyle = COLORS.shadow;
      ctx.beginPath();
      ctx.ellipse(this.pos.x + camShake.x * 0.1, CONFIG.FLOOR_Y + 3 + camShake.y * 0.1, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.save();
      ctx.translate(this.pos.x + camShake.x, this.pos.y + camShake.y);
      ctx.scale(this.facing, 1);

      const bodyW = this.w;
      const baseH = hCur;
      const isCrouch = this.state === 'crouch';
      const bodyH = isCrouch ? baseH * 0.92 : baseH; // compact crouch
      const idleBob = Math.sin(time * 6) * (this.onGround ? 1.5 : 0) * (isCrouch ? 0.4 : 1);
      const runSwing = Math.sin(time * 12) * 10 * ((this.state === 'walk' && !isCrouch) ? 1 : 0);
      const jumpTilt = this.onGround ? 0 : clamp(this.vel.y * 0.03, -8, 10);

      // Hit flash tint
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

      // Torso
      const gx = -bodyW/2, gy = -bodyH, gw = bodyW, gh = bodyH;
      const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
      grad.addColorStop(0, 'rgba(255,255,255,0.12)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = bodyColor;
      roundRectPath(ctx, gx, gy, gw, gh, 10);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, gx, gy, gw, gh, 10);
      ctx.stroke();

      // Face stripe
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(bodyW*0.15, -bodyH*0.8, 6, 11);

      // Arms + poses
      const armW = 12;
      const armH = bodyH * 0.58 * (isCrouch ? 0.9 : 1);
      const armUp = -bodyH * (isCrouch ? 0.56 : 0.64);
      const tRatio = this.attack ? clamp(this.attackT / this.attack.total(), 0, 1) : 0;
      const windup = this.attack ? clamp((this.attack.startup ? (this.attack.startup - Math.min(this.attackT, this.attack.startup)) / this.attack.startup : 0), 0, 1) : 0;

      const dir = this.attack ? this.attackDir : (isCrouch ? 'crouch' : 'neutral');
      let frontAngle = Math.sin(time * 12) * 10 * ((this.state === 'walk' && !isCrouch) ? 1 : 0) * 0.05;
      let backAngle = -frontAngle;

      if (this.state === 'attack') {
        switch (dir) {
          case 'neutral':
            frontAngle += -Math.PI * 0.6 * (0.3 + tRatio);
            backAngle += Math.PI * 0.15 * (0.2 + windup);
            break;
          case 'forward':
            frontAngle += -Math.PI * 0.15 - Math.PI * 1.0 * tRatio;
            backAngle += Math.PI * 0.05 * (0.2 + windup);
            break;
          case 'back':
            frontAngle += Math.PI * 0.1 * (0.2 + windup);
            backAngle += -Math.PI * 0.9 * (0.3 + tRatio);
            break;
          case 'up':
            frontAngle += -Math.PI * (0.4 + 0.8 * tRatio);
            backAngle += Math.PI * 0.2 * (0.2 + windup);
            break;
          case 'down':
            frontAngle += Math.PI * (0.35 + 0.7 * tRatio);
            backAngle += -Math.PI * 0.1 * (0.2 + windup);
            break;
          case 'crouch':
            // Low jab / sweep posture
            frontAngle += Math.PI * (0.15 + 0.55 * tRatio);
            backAngle += -Math.PI * 0.05 * (0.2 + windup);
            break;
        }
      }

      // Back arm
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.save();
      ctx.translate(-bodyW/2 - armW, armUp);
      ctx.rotate(backAngle);
      roundRectPath(ctx, 0, 0, armW, armH, 5);
      ctx.fill();
      ctx.restore();

      // Front arm
      ctx.save();
      ctx.translate(bodyW/2, armUp);
      ctx.rotate(frontAngle);
      roundRectPath(ctx, 0, 0, armW, armH, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(-2, armH - 11, armW + 4, 11);
      ctx.restore();

      ctx.restore(); // torso

      // Attack swing trails
      if (this.attackIsActiveNow()) {
        const trails = 3;
        for (let i = 0; i < trails; i++) {
          ctx.save();
          const a = (trails - i) / trails;
          ctx.strokeStyle = `rgba(255,255,255,${0.12 * a})`;
          ctx.lineWidth = 3 * a;
          ctx.beginPath();
          const r = 44 + i * 6;
          const ox = this.facing * (this.w * 0.62);
          const oy = -hCur * 0.6 * (isCrouch ? 0.8 : 1);
          const cx = this.pos.x + camShake.x + ox;
          const cy = this.pos.y + camShake.y + oy;
          const ccw = this.facing < 0;
          let start = Math.PI * 0.25, end = -Math.PI * 0.25;
          if (dir === 'up') { start = Math.PI * 0.9; end = Math.PI * 0.2; }
          if (dir === 'down' || dir === 'crouch') { start = -Math.PI * 0.1; end = -Math.PI * 0.9; }
          if (dir === 'back') { start = Math.PI * 0.75; end = -Math.PI * 0.75; }
          ctx.arc(cx, cy, r, start, end, ccw);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();

      // Debug boxes
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
      this.rot = Math.random() * Math.PI * 2;
      this.rotSpd = randRange(-6, 6);
    }
    step(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 1200 * dt * 0.28;
      this.rot += this.rotSpd * dt;
    }
    draw(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  class Shockwave {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.life = 0.45;
      this.maxLife = 0.45;
    }
    step(dt) { this.life -= dt; }
    draw(ctx) {
      const t = 1 - clamp(this.life / this.maxLife, 0, 1);
      const r = 20 + t * 140;
      ctx.strokeStyle = `rgba(255,255,255,${0.22 * (1 - t)})`;
      ctx.lineWidth = 3 + 4 * (1 - t);
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  class DamageText {
    constructor(x, y, text, color) {
      this.x = x; this.y = y;
      this.vx = randRange(-40, 40);
      this.vy = -120;
      this.life = 0.7;
      this.maxLife = 0.7;
      this.text = text;
      this.color = color;
      this.size = 16;
    }
    step(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 360 * dt;
    }
    draw(ctx) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.font = `900 ${this.size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.fillStyle = this.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeText(this.text, this.x, this.y);
      ctx.fillText(this.text, this.x, this.y);
      ctx.globalAlpha = 1;
    }
  }

  function spawnHitSparks(particles, x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(180, 360);
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
  function spawnExplosion(particles, shocks, x, y, baseColor) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(200, 720);
      const col = Math.random() < 0.6 ? 'rgba(255,255,255,0.9)' : baseColor.replace(')', ',0.8)').replace('rgb', 'rgba');
      particles.push(new Particle(
        x + Math.cos(a)*6, y + Math.sin(a)*6,
        Math.cos(a) * sp, Math.sin(a) * sp - randRange(0, 200),
        randRange(0.25, 0.6),
        randRange(2, 5),
        col
      ));
    }
    shocks.push(new Shockwave(x, y));
  }

  // AI (unchanged logic, now naturally can use crouch attacks via downAim/crouch state)
  const DIFFS = [
    { name: 'Easy', reaction: 0.26, desired: 120, jumpProb: 0.04, attackCD: 0.65, bravery: 0.5, heavyBias: 0.35 },
    { name: 'Normal', reaction: 0.18, desired: 100, jumpProb: 0.07, attackCD: 0.45, bravery: 0.7, heavyBias: 0.5 },
    { name: 'Hard', reaction: 0.12, desired: 90, jumpProb: 0.10, attackCD: 0.34, bravery: 0.9, heavyBias: 0.65 },
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
    setDifficulty(idx) { this.diffIndex = ((idx % DIFFS.length) + DIFFS.length) % DIFFS.length; }
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

      // Reset movement/aim
      this.pad.setDown(f.controls.left, false);
      this.pad.setDown(f.controls.right, false);
      this.pad.setDown(f.controls.upAim, false);
      // Sometimes crouch for lows at close range
      const doCrouch = onGround && close && Math.random() < 0.25;
      this.pad.setDown(f.controls.downAim, doCrouch);

      // Spacing
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

      // Anti-air
      const oppRising = !o.onGround && o.vel.y < -50 && mid;
      if (onGround && oppRising && this.coolAttack <= 0) {
        this.pad.setDown(f.controls.upAim, true);
        this.pad.press(f.controls.heavy);
        this.coolAttack = this.diff.attackCD;
        return;
      }

      // Attack choice
      const doHeavy = Math.random() < this.diff.heavyBias;
      if (this.coolAttack <= 0) {
        if (onGround && (close || mid)) {
          this.pad.press(doHeavy ? f.controls.heavy : f.controls.light);
          this.coolAttack = this.diff.attackCD * randRange(0.8, 1.2);
        } else if (!onGround && Math.random() < 0.5) {
          this.pad.press(doHeavy ? f.controls.heavy : f.controls.light);
          this.coolAttack = this.diff.attackCD;
        }
      }
    }
  }

  class Game {
    constructor() {
      this.kb = new Keyboard();
      this.p1 = new Fighter(1, CONFIG.WIDTH * 0.3, COLORS.p1, {
        left: 'KeyA',
        right: 'KeyD',
        upAim: 'KeyW',
        downAim: 'KeyS',
        jump: 'Space',
        light: 'KeyJ',
        heavy: 'KeyK',
      });
      this.p2 = new Fighter(2, CONFIG.WIDTH * 0.7, COLORS.p2, {
        left: 'ArrowLeft',
        right: 'ArrowRight',
        upAim: 'ArrowUp',
        downAim: 'ArrowDown',
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
      this.shockwaves = [];
      this.texts = [];
      this.lastTimerWhole = CONFIG.ROUND_TIME;
      this.flashAlpha = 0;

      window.addEventListener('keydown', (e) => {
        if (this.inMenu && (e.code === 'Enter' || e.code === 'Space')) { this.startGame(); return; }
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
      UI.btnPlay?.addEventListener('click', () => this.startGame());

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
        p.attackDir = 'neutral';
        p.attackKind = 'light';
        p.wallStickT = 0;
        p.wallJumpLock = 0;
      }
      this.timeLeft = CONFIG.ROUND_TIME;
      this.roundOver = false;
      this.hitstopT = 0;
      this.camShakeT = 0;
      this.camShakeMag = 0;
      this.particles = [];
      this.shockwaves = [];
      this.texts = [];
      this.lastTimerWhole = CONFIG.ROUND_TIME;
      this.flashAlpha = 0;
      UI.messages.textContent = '';
      this.updateUI(true);
    }

    endRound(msg, explodedFighter = null) {
      this.roundOver = true;
      UI.messages.textContent = msg + ' — Press R to reset';
      SFX.ko();
      if (explodedFighter) {
        const col = explodedFighter === this.p1 ? 'rgba(51,214,166,1)' : 'rgba(247,118,142,1)';
        const h = explodedFighter.currentHeight();
        spawnExplosion(this.particles, this.shockwaves, explodedFighter.pos.x, explodedFighter.pos.y - h * 0.6, col);
        this.flashAlpha = 0.45;
        SFX.boom();
      }
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
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
          this.shockwaves[i].step(dt);
          if (this.shockwaves[i].life <= 0) this.shockwaves.splice(i,1);
        }
        this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.2);
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

      // Inputs and facing
      this.p1.handleInput(this.kb, dt);
      this.ai.update(dt);
      this.p2.handleInput(this.aiPad, dt);

      this.p1.updateFacing(this.p2);
      this.p2.updateFacing(this.p1);

      // Physics/attacks
      for (const p of this.players) p.step(dt);

      // Whoosh on active start
      for (const p of this.players) {
        if (p._activeJustStarted) {
          SFX.whoosh(p.attackKind === 'light');
          p._activeJustStarted = false;
        }
      }

      // Push apart
      this.resolvePush();

      // Landing dust
      for (const p of this.players) {
        if (p.landedThisFrame) spawnDust(this.particles, p.pos.x, CONFIG.FLOOR_Y);
      }

      // Hits
      if (!this.roundOver) this.resolveHits();

      // KO + explosion
      if (!this.roundOver) {
        if (this.p1.state === 'ko' || this.p2.state === 'ko') {
          const msg = this.p1.state === 'ko' && this.p2.state === 'ko'
            ? 'Double KO!'
            : (this.p1.state === 'ko' ? 'AI Wins!' : 'You Win!');
          const exploded = this.p1.state === 'ko' && this.p2.state !== 'ko' ? this.p1
                            : this.p2.state === 'ko' && this.p1.state !== 'ko' ? this.p2
                            : null;
          this.endRound(msg, exploded);
        }
      }

      // FX updates
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.step(dt);
        if (pt.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.step(dt);
        if (t.life <= 0) this.texts.splice(i, 1);
      }
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.step(dt);
        if (sw.life <= 0) this.shockwaves.splice(i, 1);
      }

      // Shake/flash
      if (this.camShakeT > 0) this.camShakeT -= dt;
      if (this.camShakeT <= 0) this.camShakeMag = 0;
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.2);

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
        const push = overlapX * CONFIG.PUSHBOX;
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
          const armored = defender.state === 'attack'; // super armor: no stagger while attacking
          defender.takeHit(attacker, attacker.attack, { armored });
          attacker.hasHitThisAttack = true;

          const heavy = attacker.attack.damage >= 10;
          this.hitstopT = heavy ? CONFIG.HITSTOP_HEAVY : CONFIG.HITSTOP_LIGHT;
          this.camShakeT = heavy ? 0.22 : 0.14;
          this.camShakeMag = heavy ? CONFIG.CAM_SHAKE_HEAVY : CONFIG.CAM_SHAKE_LIGHT;
          const cx = hb.x + hb.w / 2;
          const cy = hb.y + hb.h / 2;
          spawnHitSparks(this.particles, cx, cy, 'rgba(255,255,255,0.9)');
          // Damage number over defender
          this.texts.push(new DamageText(defender.pos.x, defender.pos.y - defender.currentHeight() - 10, `-${attacker.attack.damage}`, 'rgba(255,255,255,0.95)'));
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

    drawFighterUI(f, isAI = false) {
      // Name + mini HP bar above fighter
      const padX = 6;
      const padY = 4;
      const barW = 90;
      const barH = 8;
      let x = clamp(f.pos.x, 60, CONFIG.WIDTH - 60);
      const y = f.pos.y - f.currentHeight() - 26;

      const name = isAI ? `AI (${this.ai.diff.name})` : 'You';
      const col = isAI ? COLORS.p2 : COLORS.p1;

      ctx.save();
      ctx.font = '900 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
      const nameW = Math.max(ctx.measureText(name).width, barW);
      const boxW = nameW + padX * 2;
      const boxH = 14 + padY * 2 + barH + 6;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRectPath(ctx, x - boxW/2, y - boxH, boxW, boxH, 8);
      ctx.fill();

      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, x - boxW/2, y - boxH, boxW, boxH, 8);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      ctx.fillText(name, x - ctx.measureText(name).width/2, y - boxH + padY + 1);

      const hpFrac = clamp(f.health / 100, 0, 1);
      const chipFrac = clamp(f.chipHealth / 100, 0, 1);
      const barX = x - barW/2;
      const barY = y - barH - 6;

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRectPath(ctx, barX, barY, barW, barH, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      roundRectPath(ctx, barX, barY, barW * chipFrac, barH, 4);
      ctx.fill();
      ctx.fillStyle = col;
      roundRectPath(ctx, barX, barY, barW * hpFrac, barH, 4);
      ctx.fill();

      ctx.restore();
    }

    draw() {
      const { WIDTH, HEIGHT, FLOOR_Y } = CONFIG;

      // Camera shake
      let cam = { x: 0, y: 0 };
      if (this.camShakeT > 0) {
        cam.x = (Math.random() * 2 - 1) * this.camShakeMag;
        cam.y = (Math.random() * 2 - 1) * this.camShakeMag * 0.6;
      }

      // Background
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const t = performance.now() / 1000;
      for (let layer = 0; layer < 5; layer++) {
        const y = FLOOR_Y - 180 - layer * 26;
        const alpha = 0.04 + layer * 0.03;
        const wob = Math.sin(t * (0.3 + layer * 0.1)) * 6;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(30 + wob + layer*110, y, 120, 80 + layer * 40);
        ctx.fillRect(300 - wob + layer*100, y + 10, 100, 60 + layer * 35);
        ctx.fillRect(560 + wob + layer*120, y - 6, 140, 70 + layer * 42);
        ctx.fillRect(820 - wob + layer*70, y + 6, 70, 50 + layer * 30);
      }

      const grd = ctx.createLinearGradient(0, FLOOR_Y - 60, 0, HEIGHT);
      grd.addColorStop(0, 'rgba(0,0,0,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, FLOOR_Y - 50, WIDTH, HEIGHT - (FLOOR_Y - 50));

      ctx.strokeStyle = COLORS.stageLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y + 1);
      ctx.lineTo(WIDTH, FLOOR_Y + 1);
      ctx.stroke();

      const now = performance.now() / 1000;

      // Fighters
      this.p1.draw(ctx, this.debug, now, cam);
      this.p2.draw(ctx, this.debug, now, cam);

      // FX
      for (const pt of this.particles) pt.draw(ctx);
      for (const sw of this.shockwaves) sw.draw(ctx);

      // Floating UI
      this.drawFighterUI(this.p1, false);
      this.drawFighterUI(this.p2, true);

      // Damage numbers
      for (const txt of this.texts) txt.draw(ctx);

      // Screen flash
      if (this.flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }
  }

  // Boot
  new Game();
})();
