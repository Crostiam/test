# 2D Fighting Game (HTML5 Canvas) — VS AI, Animations & Sounds

A tiny, no-dependency 2D fighting game you can run in your browser. You play as P1 against an AI opponent (P2). Includes basic animations, synthesized sound effects (no external assets), particles, health bars, round timer, and KO logic.

## How to run

- Option 1: Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).
- Option 2: Serve with a local web server:
  - Python: `python3 -m http.server` then visit http://localhost:8000
  - Node: `npx serve` or `npx http-server`

Tip: Click the page or press any key to enable audio (browsers require user interaction to start sound).

## Controls

- You (Player 1):
  - Move: A / D
  - Jump: W
  - Light: J
  - Heavy: K
- System:
  - Reset Round: R
  - Pause: P
  - Toggle Debug Boxes: ` (backtick)
  - Toggle Mute: M
  - Cycle AI Difficulty: H

## Features

- AI opponent with 3 difficulties (Easy, Normal, Hard)
  - Maintains spacing, approaches/backs off, jumps in occasionally
  - Attacks based on distance; tries to anti-air
- Procedural animations
  - Idle bob, run sway, jump tilt, attack swing arcs
  - Hit flash, landing dust, particle hit sparks
  - Camera shake and hitstop on impact
- Sound effects (synthesized via WebAudio, no files)
  - Whoosh on swings, hit thuds, jump/land, timer ticks, KO
- Gameplay
  - 3 attacks (light, heavy, anti-air while airborne)
  - Knockback, hitstun, health bars with chip animation
  - Round timer, KO/Timeout handling and reset

## Customize

- Physics: edit `CONFIG` in `src/main.js` (gravity, speeds, etc.)
- Attacks: `ATTACKS` specs (startup/active/recovery, damage, knockback, hitstun, hitbox size/offset)
- AI: `DIFFS` array for behavior knobs (reaction, desired range, aggressiveness)
- Art/FX: tweak Fighter.draw for shapes/poses and particle functions
- Audio: tune Sound methods for envelopes/tones

## Notes

- No external dependencies. Everything runs locally in the browser.
- If audio doesn't play, interact with the page once (click or press a key) and ensure your tab isn't muted.

Enjoy!
