/* 2D Fighting Game - No libraries, runs in browser
   Author: You
   Notes:
   - Open index.html in a browser
   - Two-player local game with rectangles
   - Tweak constants in CONFIG for feel */

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
  };

  const CONFIG = {
    WIDTH: canvas.width,
    HEIGHT: canvas.height,
    FLOOR_Y: canvas.height - 90,
    GRAVITY: 2400,
    GROUND_FRICTION: 1800,
    AIR_DRAG: 0.98,
    MAX_RUN_SPEED: 360,
    ACCEL: 2600,
    JUMP_SPEED: 900,
    HURTBOX: { w: 56, h: 110 },
    ROUND_TIME: 99, // seconds
    PUSHBOX: 0.5, // push-apart strength
  };

  const COLORS = {
    stageLine: 'rgba(255,255,255,0.15)',
    hitbox: 'rgba(255,0,0,0.35)',
    hurtbox: 'rgba(255,255,255,0.15)',
    p1: '#33d6a6',
    p2: '#f7768e',
    shadow: 'rgba(0,0,0,0.35)',
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  class Keyboard {
    constructor() {
      this.pressed = new Set();
      this.prev = new Set();
      window.addEventListener('keydown', (e) => {
        // Avoid page scrolling with arrows/space
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
      this.offsetX = offsetX; // from torso center, forward is +X
      this.offsetY = offsetY; // from feet up is -Y
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
      this.facing = id === 1 ? 1 : -1; // 1 -> right, -1 -> left
      this.w = CONFIG.HURTBOX.w;
      this.h = CONFIG.HURTBOX.h;
      this.onGround = true;

      this.state = 'idle'; // idle, walk, jump, attack, hitstun, ko
      this.health = 100;
      this.chipHealth = 100;

      this.attack = null;
      this.attackT = 0;
      this.hasHitThisAttack = false;

      this.hitstunT = 0;

      this.jumpBuffered = 0;
      this.attackBuffered = null;

      this.name = `P${id}`;
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

    canControl() {
      return this.state !== 'attack' && this.state !== 'hitstun' && this.state !== 'ko';
    }

    startAttack(a) {
      if (this.state === 'ko') return;
      if (this.state === 'attack' || this.state === 'hitstun') {
        // buffer one
        this.attackBuffered = a;
        return;
      }
      this.attack = a;
      this.attackT = 0;
      this.state = 'attack';
      this.hasHitThisAttack = false;
    }

    takeHit(from, a) {
      if (this.state === 'ko') return;
      this.health = Math.max(0, this.health - a.damage);
      this.hitstunT = a.hitstun;
      this.state = this.health <= 0 ? 'ko' : 'hitstun';
      const dir = from.pos.x < this.pos.x ? 1 : -1; // knock away from attacker
      this.vel.x = a.kbX * dir;
      this.vel.y = a.kbY; // upward is negative in our coordinate, but y grows downward. So negative lifts.
      // ensure we are considered airborne for a bit
      this.onGround = false;
    }

    updateFacing(opponent) {
      if (this.state === 'ko') return;
      this.facing = this.pos.x < opponent.pos.x ? 1 : -1;
    }

    handleInput(kb, dt) {
      if (this.state === 'ko') return;

      // Movement
      if (this.canControl()) {
        let move = 0;
        if (kb.isDown(this.controls.left)) move -= 1;
        if (kb.isDown(this.controls.right)) move += 1;

        // Ground acceleration
        const target = move * CONFIG.MAX_RUN_SPEED;
        const accel = CONFIG.ACCEL * dt;
        if (this.onGround) {
          if (this.vel.x < target) this.vel.x = Math.min(target, this.vel.x + accel);
          else if (this.vel.x > target) this.vel.x = Math.max(target, this.vel.x - accel);
        } else {
          // In air: slight control
          this.vel.x = lerp(this.vel.x, target, 0.06);
        }

        if (move !== 0 && this.onGround) this.state = 'walk';
        else if (this.onGround && this.state !== 'attack') this.state = 'idle';
      }

      // Jump (buffer small window)
      if (kb.justPressed(this.controls.jump)) {
        this.jumpBuffered = 0.12;
      }
      if (this.jumpBuffered > 0) this.jumpBuffered -= dt;

      if ((this.canControl() || this.state === 'attack') && this.jumpBuffered > 0) {
        if (this.onGround) {
          this.vel.y = -CONFIG.JUMP_SPEED;
          this.onGround = false;
          this.state = 'jump';
          this.jumpBuffered = 0;
        }
      }

      // Attacks
      if (kb.justPressed(this.controls.light)) this.startAttack(ATTACKS.light);
      if (kb.justPressed(this.controls.heavy)) {
        if (!this.onGround) this.startAttack(ATTACKS.antiAir);
        else this.startAttack(ATTACKS.heavy);
      }
    }

    step(dt) {
      // Attack progression
      if (this.state === 'attack' && this.attack) {
        this.attackT += dt;
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

      // Hitstun
      if (this.state === 'hitstun') {
        this.hitstunT -= dt;
        if (this.hitstunT <= 0) {
          this.state = this.onGround ? 'idle' : 'jump';
        }
      }

      // Physics
      this.vel.y += CONFIG.GRAVITY * dt;

      // Friction
      if (this.onGround && this.canControl()) {
        const sign = Math.sign(this.vel.x);
        const mag = Math.abs(this.vel.x);
        const decel = CONFIG.GROUND_FRICTION * dt;
        const newMag = Math.max(0, mag - decel);
        this.vel.x = newMag * sign;
      } else if (!this.onGround) {
        this.vel.x *= CONFIG.AIR_DRAG;
      }

      // Integrate
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;

      // World bounds
      const half = this.w / 2;
      if (this.pos.x < half) { this.pos.x = half; this.vel.x = 0; }
      if (this.pos.x > CONFIG.WIDTH - half) { this.pos.x = CONFIG.WIDTH - half; this.vel.x = 0; }

      // Ground collision
      if (this.pos.y >= CONFIG.FLOOR_Y) {
        this.pos.y = CONFIG.FLOOR_Y;
        this.vel.y = 0;
        if (!this.onGround) {
          this.onGround = true;
          if (this.state === 'jump') this.state = 'idle';
        }
      } else {
        this.onGround = false;
      }

      // Chip health tween for smooth bar
      this.chipHealth = lerp(this.chipHealth, this.health, 0.12);
    }

    draw(ctx, debug = false) {
      // Shadow
      const shadowW = this.w * 0.9;
      const shadowH = 10;
      ctx.fillStyle = COLORS.shadow;
      ctx.beginPath();
      ctx.ellipse(this.pos.x, CONFIG.FLOOR_Y + 2, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body (simple rectangle)
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.scale(this.facing, 1);

      // Body core
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.w/2, -this.h, this.w, this.h);

      // Face stripe
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(this.w*0.15, -this.h*0.8, 6, 10);

      // Arms
      const armW = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-this.w/2 - armW, -this.h*0.65, armW, this.h*0.55);
      ctx.fillRect(this.w/2, -this.h*0.65, armW, this.h*0.55);

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

      this.players = [this.p1, this.p2];

      this.timeLeft = CONFIG.ROUND_TIME;
      this.roundOver = false;
      this.paused = false;
      this.debug = false;

      this.lastTs = 0;

      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyR') this.resetRound();
        if (e.code === 'KeyP') this.togglePause();
        if (e.code === 'Backquote') this.debug = !this.debug;
      });

      this.updateUI();
      requestAnimationFrame(this.loop.bind(this));
    }

    togglePause() {
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
      }
      this.timeLeft = CONFIG.ROUND_TIME;
      this.roundOver = false;
      UI.messages.textContent = '';
      this.updateUI(true);
    }

    endRound(msg) {
      this.roundOver = true;
      UI.messages.textContent = msg + ' — Press R to reset';
    }

    loop(ts) {
      const dtRaw = (ts - this.lastTs) / 1000 || 0;
      this.lastTs = ts;

      // Clamp dt to avoid huge jumps if tab inactive
      const dt = Math.min(1/30, dtRaw);

      if (!this.paused) this.step(dt);
      this.draw();

      this.kb.update();
      requestAnimationFrame(this.loop.bind(this));
    }

    step(dt) {
      if (!this.roundOver) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          // Time over: decide winner by health
          const h1 = this.p1.health;
          const h2 = this.p2.health;
          let msg = 'Draw!';
          if (h1 > h2) msg = 'P1 Wins by Timeout!';
          else if (h2 > h1) msg = 'P2 Wins by Timeout!';
          this.endRound(msg);
        }
      }

      // Input and facing
      for (const p of this.players) p.handleInput(this.kb, dt);
      this.p1.updateFacing(this.p2);
      this.p2.updateFacing(this.p1);

      // Physics
      for (const p of this.players) p.step(dt);

      // Push-apart to avoid overlap
      this.resolvePush();

      // Attacks / hit detection
      if (!this.roundOver) this.resolveHits();

      // KO check
      if (!this.roundOver) {
        if (this.p1.state === 'ko' || this.p2.state === 'ko') {
          const msg = this.p1.state === 'ko' && this.p2.state === 'ko'
            ? 'Double KO!'
            : (this.p1.state === 'ko' ? 'P2 Wins!' : 'P1 Wins!');
          this.endRound(msg);
        }
      }

      this.updateUI();
    }

    resolvePush() {
      const a = this.p1.hurtbox();
      const b = this.p2.hurtbox();
      if (!rectsIntersect(a, b)) return;

      // Compute overlap x only (simple)
      const centerA = a.x + a.w / 2;
      const centerB = b.x + b.w / 2;
      const overlapX = (a.w / 2 + b.w / 2) - Math.abs(centerA - centerB);
      if (overlapX > 0) {
        const push = overlapX * CONFIG.PUSHBOX;
        const dir = centerA < centerB ? -1 : 1;
        // Push both apart if possible
        this.p1.pos.x += push * dir;
        this.p2.pos.x -= push * dir;

        // Clamp within bounds
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
        }
      };
      tryHit(this.p1, this.p2);
      tryHit(this.p2, this.p1);
    }

    updateUI(force = false) {
      const setBars = (el, chipEl, value, chip) => {
        // Clamp 0..100 then scale to %
        const v = clamp(value, 0, 100);
        const c = clamp(chip, 0, 100);
        el.style.transform = `scaleX(${v/100})`;
        chipEl.style.transform = `scaleX(${c/100})`;
      };
      setBars(UI.p1Health, UI.p1Chip, this.p1.health, this.p1.chipHealth);
      setBars(UI.p2Health, UI.p2Chip, this.p2.health, this.p2.chipHealth);

      const t = Math.max(0, Math.ceil(this.timeLeft));
      if (UI.timer.textContent !== String(t) || force) UI.timer.textContent = String(t);
    }

    draw() {
      const { WIDTH, HEIGHT, FLOOR_Y } = CONFIG;

      // Background layers
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Far skyline
      for (let i = 0; i < 4; i++) {
        const h = 80 + i * 40;
        const y = FLOOR_Y - 160 - i * 26;
        ctx.fillStyle = `rgba(255,255,255,${0.04 + i*0.02})`;
        ctx.fillRect(30 + i*140, y, 120, h);
        ctx.fillRect(300 + i*120, y + 10, 100, h - 20);
        ctx.fillRect(560 + i*140, y - 6, 140, h + 10);
        ctx.fillRect(820 + i*80, y + 6, 70, h - 12);
      }

      // Ground plane gradient
      const grd = ctx.createLinearGradient(0, FLOOR_Y - 50, 0, HEIGHT);
      grd.addColorStop(0, 'rgba(0,0,0,0.08)');
      grd.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, FLOOR_Y - 40, WIDTH, HEIGHT - (FLOOR_Y - 40));

      // Stage line
      ctx.strokeStyle = COLORS.stageLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y + 1);
      ctx.lineTo(WIDTH, FLOOR_Y + 1);
      ctx.stroke();

      // Draw players
      this.p1.draw(ctx, this.debug);
      this.p2.draw(ctx, this.debug);
    }
  }

  // Boot
  new Game();
})();
