# Game Show Animations & Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kahoot/game-show style animations and synthesized sound effects to make the live quiz experience more engaging and fun for students.

**Architecture:** Create a `useSoundEffects` hook using Web Audio API for synthesized sounds (no audio files needed). Enhance existing CSS animations and add new ones. All changes are in the live game components (host-view, player-view) and globals.css.

**Tech Stack:** Web Audio API, CSS keyframes, React hooks

---

## File Structure

- **Create:** `src/lib/sounds.ts` — Web Audio API sound effect functions
- **Modify:** `src/app/globals.css` — New keyframes and enhanced animations
- **Modify:** `src/components/live/player-view.tsx` — Player-side sounds + animations
- **Modify:** `src/components/live/host-view.tsx` — Host-side sounds + animations

---

### Task 1: Create Sound Effects Library

**Files:**
- Create: `src/lib/sounds.ts`

- [ ] **Step 1: Create the sound effects module**

```typescript
// src/lib/sounds.ts
"use client";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/** Short ascending jingle — correct answer */
export function playCorrect() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.3);
  });
}

/** Descending buzzer — wrong answer */
export function playWrong() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

/** Single tick for countdown (last 5 seconds) */
export function playTick() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880; // A5
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

/** Drumroll for leaderboard reveal */
export function playDrumroll(durationMs = 2000) {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const dur = durationMs / 1000;
  const count = Math.floor(dur * 25); // 25 hits per second
  for (let i = 0; i < count; i++) {
    const t = now + (i / count) * dur;
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.3;
    noise.buffer = buffer;
    const gain = ctx.createGain();
    const vol = 0.05 + (i / count) * 0.15; // crescendo
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    noise.connect(gain).connect(ctx.destination);
    noise.start(t);
  }
}

/** Fanfare for podium — triumphant chord */
export function playFanfare() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  // Triumphant C major chord with arpeggio
  const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i < 3 ? "triangle" : "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.05);
    gain.gain.setValueAtTime(0.2, start + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 1.5);
  });
}

/** Time's up — urgent double beep */
export function playTimeUp() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  [0, 0.15].forEach((delay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.2, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.15);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sounds.ts
git commit -m "feat: add Web Audio API sound effects library"
```

---

### Task 2: Add New CSS Animations

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add new keyframes after existing animations (after line 254)**

New animations to add:
- `screen-flash` — full-screen flash for answer reveal
- `zoom-in-bounce` — bouncy zoom entrance
- `slot-machine` — vertical slide for leaderboard entries
- `firework-burst` — radial explosion for podium
- `pulse-glow` — glowing pulse for correct answer highlight
- `slide-in-left` / `slide-in-right` — for staggered card entrances
- Enhance confetti: more pieces, varied shapes, slower fall, more colors

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add game-show CSS animations"
```

---

### Task 3: Enhance Player View — Feedback & Countdown

**Files:**
- Modify: `src/components/live/player-view.tsx`

Changes:
- [ ] **Step 1: Import sounds and add tick to countdown**
  - Import `playTick`, `playCorrect`, `playWrong`, `playTimeUp` from sounds.ts
  - In the countdown timer effect, call `playTick()` when `timeLeft <= 5`
  - Call `playTimeUp()` when `timeLeft === 0`

- [ ] **Step 2: Enhance Confetti component**
  - More pieces (50 instead of 30)
  - Vibrant game-show colors instead of grayscale
  - Varied shapes (circles + rectangles + stars)
  - Longer animation, more spread

- [ ] **Step 3: Add sounds to feedback phase**
  - Call `playCorrect()` when `isCorrect`
  - Call `playWrong()` when `!isCorrect`

- [ ] **Step 4: Enhance feedback animations**
  - Add screen flash effect before showing result
  - Make checkmark/X bigger with zoom-in-bounce
  - Add pulse-glow on correct answer screen

- [ ] **Step 5: Commit**

```bash
git add src/components/live/player-view.tsx
git commit -m "feat: add game-show sounds and animations to player view"
```

---

### Task 4: Enhance Host View — Countdown, Results, Podium

**Files:**
- Modify: `src/components/live/host-view.tsx`

Changes:
- [ ] **Step 1: Import sounds and add to countdown**
  - Import `playTick`, `playTimeUp`, `playDrumroll`, `playFanfare`
  - Tick sound on host countdown ≤5s
  - Time's up sound when timer reaches 0

- [ ] **Step 2: Enhance results reveal**
  - Distribution bars animate with staggered slot-machine entrance
  - Leaderboard entries slide in one by one with drumroll
  - Screen flash when results appear

- [ ] **Step 3: Enhance podium**
  - Call `playFanfare()` when podium appears
  - Call `playDrumroll()` before podium entries animate in
  - Add firework-burst effect behind winner
  - Confetti on podium screen

- [ ] **Step 4: Commit**

```bash
git add src/components/live/host-view.tsx
git commit -m "feat: add game-show sounds and animations to host view"
```
