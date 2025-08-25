# 2D Fighting Game (HTML5 Canvas)

A tiny, no-dependency 2D fighting game you can run in your browser. Two players, basic physics, hitboxes, hurtboxes, health bars, round timer, and KO logic.

## How to run

- Option 1: Just open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).
- Option 2: Serve the folder with a local web server:
  - Python: `python3 -m http.server` then visit http://localhost:8000
  - Node: `npx serve` or `npx http-server`

No build step required.

## Controls

- Player 1:
  - Move: A / D
  - Jump: W
  - Light: J
  - Heavy: K
- Player 2:
  - Move: ← / →
  - Jump: ↑
  - Light: 1
  - Heavy: 2
- System:
  - Reset Round: R
  - Pause: P
  - Toggle Debug Boxes (hurtbox/hitbox): ` (backtick)

## Features

- Rect-based fighters with gravity, ground friction, air control.
- 3 attacks (contextual heavy becomes anti-air in air).
- Hit detection with startup/active/recovery windows.
- Knockback and hitstun.
- Health bars with chip animation and round timer.
- KO/Timeout handling and reset.

## Customize

Open `src/main.js` and tweak:

- Physics: `CONFIG` (gravity, speed, jump, etc.)
- Attacks: `ATTACKS` specs (startup/active/recovery, damage, knockback, hitstun, hitbox size/offset)
- Stage size: canvas size in `index.html` and `CONFIG.WIDTH/HEIGHT`
- Controls: mappings per player in the `Game` constructor.

## Ideas to extend

- Add crouch/block states and damage scaling.
- Add sprites/animations instead of rectangles.
- Add special moves (quarter circles, charge).
- Add sound effects (HTMLAudio).
- Add simple AI for single-player.

Enjoy!
