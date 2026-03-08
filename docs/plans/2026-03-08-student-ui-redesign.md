# Student UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the student interface with emoji avatars, bold gradients, confetti/vibration effects, and micro-animations.

**Architecture:** Add emoji avatar data module, propagate avatar through Socket.io events, rewrite player-view.tsx with new visual design, add CSS animations for confetti/shake effects. No DB changes — avatar lives only in the live session memory.

**Tech Stack:** React 19, Tailwind CSS 4, CSS animations (no new dependencies)

---

### Task 1: Emoji avatars data module

**Files:**
- Create: `src/lib/emoji-avatars.ts`

**Step 1: Create the module**

```typescript
export interface EmojiCategory {
  name: string;
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    name: "Faccine",
    emojis: [
      "\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F60E}", "\u{1F914}",
      "\u{1F913}", "\u{1F92A}", "\u{1F973}", "\u{1F929}", "\u{1F92B}",
      "\u{1F9D0}", "\u{1F92F}", "\u{1F47B}", "\u{1F47D}", "\u{1F916}",
    ],
  },
  {
    name: "Animali",
    emojis: [
      "\u{1F436}", "\u{1F431}", "\u{1F98A}", "\u{1F984}", "\u{1F43B}",
      "\u{1F43C}", "\u{1F428}", "\u{1F42F}", "\u{1F981}", "\u{1F438}",
      "\u{1F435}", "\u{1F427}", "\u{1F989}", "\u{1F98B}", "\u{1F419}",
    ],
  },
  {
    name: "Cibo",
    emojis: [
      "\u{1F355}", "\u{1F354}", "\u{1F32E}", "\u{1F363}", "\u{1F366}",
      "\u{1F369}", "\u{1F36A}", "\u{1F349}", "\u{1F951}", "\u{1F37F}",
      "\u{1F382}", "\u{1F36B}",
    ],
  },
  {
    name: "Sport",
    emojis: [
      "\u26BD", "\u{1F3C0}", "\u{1F3C8}", "\u{1F3BE}", "\u{1F3B8}",
      "\u{1F3AE}", "\u{1F680}", "\u{1F308}", "\u26A1", "\u{1F525}",
      "\u2B50", "\u{1F48E}", "\u{1F451}",
    ],
  },
];

export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

export function randomEmoji(): string {
  return ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
}
```

**Step 2: Commit**

```bash
git add src/lib/emoji-avatars.ts
git commit -m "feat: add emoji avatar data module with 55 emojis in 4 categories"
```

---

### Task 2: Add playerAvatar to Socket.io types and server

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/socket/server.ts`

**Step 1: Update types**

In `src/types/index.ts`, add `playerAvatar` to these events:

1. In `ClientToServerEvents.joinSession`, add `playerAvatar?: string` after `playerEmail`:
```typescript
  joinSession: (data: { pin: string; playerName: string; playerEmail?: string; playerAvatar?: string }) => void;
```

2. In `ServerToClientEvents.playerJoined`, add `playerAvatar?`:
```typescript
  playerJoined: (data: { playerName: string; playerCount: number; playerAvatar?: string }) => void;
```

3. In `ServerToClientEvents.gameOver`, add `playerAvatar?` to both podium and fullResults:
```typescript
  gameOver: (data: {
    podium: { playerName: string; score: number; position: number; playerAvatar?: string }[];
    fullResults: { playerName: string; score: number; playerAvatar?: string }[];
  }) => void;
```

4. In `ServerToClientEvents.questionResult`, add `playerAvatar?` to leaderboard:
```typescript
  questionResult: (data: {
    correctAnswer: QuestionOptions;
    distribution: Record<string, number>;
    leaderboard: { playerName: string; score: number; delta: number; playerAvatar?: string }[];
  }) => void;
```

**Step 2: Update server**

In `src/lib/socket/server.ts`:

1. Add `avatar?: string` to the `PlayerInfo` interface (after `email`).

2. In `joinSession` handler, capture the avatar when creating/updating player info:
```typescript
game.players.set(playerName, {
  socketId: socket.id,
  name: playerName,
  email: playerEmail,
  avatar: playerAvatar,
  totalScore: game.players.get(playerName)?.totalScore ?? 0,
  lastDelta: 0,
});
```

3. In `joinSession`, emit avatar with playerJoined:
```typescript
io.to(room(sessionId)).emit("playerJoined", {
  playerName,
  playerCount: game.players.size,
  playerAvatar: playerAvatar,
});
```

4. In `buildLeaderboard`, add avatar:
```typescript
return [...game.players.values()]
  .sort((a, b) => b.totalScore - a.totalScore)
  .map((p) => ({
    playerName: p.name,
    score: p.totalScore,
    delta: p.lastDelta,
    playerAvatar: p.avatar,
  }));
```

5. In `endGame`, include avatar in podium and fullResults:
```typescript
const podium = leaderboard.slice(0, 3).map((l, i) => ({
  playerName: l.playerName,
  score: l.score,
  position: i + 1,
  playerAvatar: l.playerAvatar,
}));
const fullResults = leaderboard.map((l) => ({
  playerName: l.playerName,
  score: l.score,
  playerAvatar: l.playerAvatar,
}));
```

**Step 3: Commit**

```bash
git add src/types/index.ts src/lib/socket/server.ts
git commit -m "feat: propagate playerAvatar through Socket.io events"
```

---

### Task 3: Add CSS animations (confetti, shake, bounce)

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add new keyframes and classes**

Append after the existing `.animate-countdown-pulse` class (after line 193):

```css
/* Confetti animation */
@keyframes confetti-fall {
  0% {
    transform: translateY(-100%) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

.confetti-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 50;
}

.confetti-piece {
  position: absolute;
  top: -20px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  animation: confetti-fall 1.5s ease-in forwards;
}

/* Shake animation */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
  20%, 40%, 60%, 80% { transform: translateX(6px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}

/* Slow bounce for waiting phase */
@keyframes float-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}

.animate-float-bounce {
  animation: float-bounce 1.5s ease-in-out infinite;
}

/* Score count-up */
@keyframes count-up-pop {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.animate-count-up-pop {
  animation: count-up-pop 0.6s ease-out both;
}
```

**Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add confetti, shake, float-bounce and count-up CSS animations"
```

---

### Task 4: Rewrite player-view.tsx — Join phase with emoji picker

**Files:**
- Modify: `src/components/live/player-view.tsx`

This is the biggest task. The full player-view.tsx needs to be rewritten with the new design. Due to size, split into phases.

**Step 1: Rewrite the component**

Replace the entire `src/components/live/player-view.tsx` with the new version. The new component must:

1. **Import** `EMOJI_CATEGORIES, randomEmoji` from `@/lib/emoji-avatars`
2. **Add state**: `avatar` (initialized with `randomEmoji()`), `avatarCategory` (number, default 0)
3. **Send avatar** in `joinSession` event: `socket.emit("joinSession", { pin, playerName: name, playerAvatar: avatar })`
4. **Track avatars from others**: store `podiumData` and `feedbackData` types to include `playerAvatar`

**Join phase design:**
- Background: `bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400`
- Title: "Quiz Live" text-5xl font-extrabold text-white with drop-shadow
- PIN input: `bg-white/20 backdrop-blur-md` border-white/30, text-white, placeholder-white/50
- Name input: same glass style
- Emoji picker:
  - Category tabs (4 buttons, active has white bg)
  - Grid of emojis (5 columns, gap-2, max-h-48 overflow-y-auto)
  - Selected emoji: ring-4 ring-white scale-110 bg-white/30 rounded-xl
  - Selected emoji preview large (text-6xl) above the grid
- Enter button: `bg-white text-purple-700 font-bold rounded-2xl shadow-lg shadow-purple-900/30 hover:scale-105 active:scale-95 transition-all`

**Waiting phase design:**
- Background: same gradient as join
- Avatar large (text-8xl) with `animate-float-bounce`
- Name text-2xl text-white font-bold
- "In attesa..." with animated dots

**Question phase design:**
- Background: `bg-gray-950`
- Timer: gradient badge, red pulse when <= 5s
- Question text: text-xl font-bold text-white animate-slide-up-fade
- Multiple choice buttons: gradient backgrounds (red, blue, yellow, green), rounded-2xl, min-h-20, hover:scale-105 active:scale-95
- True/false: two full-width gradient buttons (green/red)
- All other types: styled with dark glass cards

**Feedback phase design:**
- Correct: `bg-gradient-to-b from-emerald-400 to-green-600`, confetti component rendered, checkmark text-8xl animate-score-pop
- Wrong: `bg-gradient-to-b from-red-400 to-rose-600`, animate-shake on container, `navigator.vibrate?.(200)`, X text-8xl
- Both show: avatar (text-5xl), "+{score} punti" animate-count-up-pop, position, total score, class %

**Podium phase design:**
- Background: `bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500`
- Title "Classifica" text-3xl
- Top 3: glass cards (bg-white/15 backdrop-blur-md rounded-2xl), avatar text-5xl, medal emoji, name, score, animate-podium-rise with stagger
- Rest: smaller glass cards with avatar text-2xl

**Confetti component** (inline in the file):
```tsx
function Confetti() {
  const colors = ["#FF6B6B", "#FFE66D", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.5}s`,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
  }));
  return (
    <div className="confetti-container">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: p.left,
            animationDelay: p.delay,
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx next build 2>&1 | head -30` or just `npm run dev:custom` and check the browser.

**Step 3: Commit**

```bash
git add src/components/live/player-view.tsx
git commit -m "feat: redesign student interface with avatars, gradients and effects"
```

---

### Task 5: Update host-view.tsx to show avatars in lobby

**Files:**
- Modify: `src/components/live/host-view.tsx`

**Step 1: Show avatars in lobby and results**

1. Add avatar tracking state: change `players` from `string[]` to `{ name: string; avatar?: string }[]`

2. In the `playerJoined` listener, store the avatar:
```typescript
setPlayers((prev) => [...prev.filter(p => p.name !== data.playerName), { name: data.playerName, avatar: data.playerAvatar }]);
```

3. In the lobby phase where players are listed, show the avatar emoji before each name:
```tsx
<span className="text-2xl">{player.avatar || "👤"}</span>
<span>{player.name}</span>
```

4. In the podium/results phase, show avatars from the gameOver data next to player names.

5. In the questionResult leaderboard display, show avatars.

**Step 2: Commit**

```bash
git add src/components/live/host-view.tsx
git commit -m "feat: show player avatars in host lobby and results"
```
