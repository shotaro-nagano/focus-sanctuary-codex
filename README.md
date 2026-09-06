# Focus Sanctuary / Chrono Chrysalis

A Vite + TypeScript + Three.js focus timer built from the attached Focus Sanctuary comparison prompt.

The app is a single-page 3D timer: a chrome and glass chrysalis holds the current focus session, shifts shape for short and long breaks, and keeps Pomodoro-style records in localStorage. The 3D scene is procedural; no generated bitmap art is used for the sculpture.

## Live/Local Usage

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

Production build:

```powershell
npm run build
```

This project targets Node.js `>=22.12.0` because the current Vite version requires a modern runtime.

## Timer Behavior

- Focus: 25 minutes
- Short break: 5 minutes
- Long break: 15 minutes after every fourth completed focus session
- Focus completions are saved atomically in one localStorage key: `focus-sanctuary.chrysalis.v1`
- Incomplete resets and mode switches are not counted
- Preview URLs do not write real timer records

## Preview URLs

- `/?preview=inspect` exposes `window.chrysalisPreview` for visual QA without saving records
- `/?preview=complete` plays the completion sequence without touching real timer data
- `/?quality=high` and `/?quality=medium` force the renderer quality preset

## QA Commands

```powershell
npm test
npm run build
node scripts/qa.mjs
node scripts/record.mjs
```

`node scripts/qa.mjs` expects the dev server to be running. It captures desktop and mobile screenshots into `artifacts/` and verifies WebGL, storage behavior, timer boundaries, reduced motion, and context-loss handling.

## Key Artifacts

- `artifacts/desktop-final.png`
- `artifacts/mobile-final.png`
- `artifacts/focus-sanctuary-demo.webm`
- `VISUAL_QA.md`

## Dependencies And Licenses

Core runtime dependencies:

- Three.js, MIT License
- GSAP, Standard No Charge License
- Syne via Fontsource, SIL Open Font License 1.1
- IBM Plex Mono via Fontsource, SIL Open Font License 1.1

The app uses browser WebGL through Three.js and browser localStorage for persistence. No server-side user data store is used.
