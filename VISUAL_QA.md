# Visual QA

Date: 2026-09-06 JST
Project: Focus Sanctuary / Chrono Chrysalis

## Required Concept Mapping

- M01 Hero object: implemented as a procedural Three.js chrysalis sculpture with three chrome shell segments and two transparent glass ribbons.
- M02 Distinct timer modes: focus, short break, and long break each animate shell openness, camera distance, accent color, and background word.
- M03 Completion ritual: completed focus sessions trigger a collapse, flash, release, and `SESSION COMPLETE` typographic sequence.
- M04 Editorial layout: full-bleed black canvas with oversized `FOCUS` type, left object caption, right rail text, bottom controls, and no UI card wrapper around the 3D scene.
- M05 Browser persistence: one localStorage object stores the current timer, active deadline, task text, session id, and completion ledger.
- M06 Safety around incomplete time: reset and mode change during an active session require a discard confirmation and do not create completion records.
- M07 Motion: intro, idle drift, pointer parallax, drag exploration, running activation, and per-mode morphs are all live code animation.
- M08 Reduced motion: the app respects `prefers-reduced-motion: reduce` by skipping long cinematic animation while preserving function.
- M09 WebGL resilience: context loss shows a status message and leaves the timer usable.
- M10 Mobile: 390 x 844 viewport keeps the timer, footer, and 3D object in frame without incoherent overlap.
- M11 Preview isolation: `?preview=inspect` and `?preview=complete` do not write real timer records.
- M12 Source delivery: TypeScript source, Vite config through package scripts, tests, screenshots, and demo media are included.

## Verification Run

Commands run with Node.js 24.19.0:

```powershell
npm test
npm run build
node scripts/qa.mjs
node scripts/record.mjs
```

Results:

- Timer unit tests: 17 passed, 0 failed.
- Production build: passed. Vite emitted a chunk-size warning because Three.js ships in the main bundle; the build output was still produced successfully.
- Browser QA, local dev server: 19 checks passed, 0 failed.
- Browser QA, Vercel production URL: 19 checks passed, 0 failed at https://focus-sanctuary-codex.vercel.app/.
- Desktop screenshot: `artifacts/desktop-final.png`, 1440 x 900, WebGL active, renderer reported as `WebKit WebGL`, no console errors.
- Mobile screenshot: `artifacts/mobile-final.png`, 390 x 844, nonblank canvas and timer/footer layout passed bounds checks.
- Demo video: `artifacts/focus-sanctuary-demo.webm`.
- Representative frames: `record-01-intro.png`, `record-02-short.png`, `record-03-long.png`, `record-04-complete-flash.png`, `record-05-complete-return.png`.

## Browser QA Coverage

- Canvas/WebGL initialized and visible.
- Screenshot pixel statistics confirmed nonblank, chromatic output.
- Start decremented from 25:00 to 24:59.
- Pause held remaining time stable.
- Active mode switch opened confirmation dialog.
- Cancel kept the current mode.
- Discard switched mode without counting incomplete time.
- Literal task text persisted as text after reload.
- Preview pages did not overwrite normal timer storage.
- Expired focus deadline completed exactly once and advanced to short break idle.
- Reload after overdue completion stayed idempotent.
- Reduced motion rendered the timer.
- WebGL context loss reported an interruption message while preserving timer usability.
- Browser console and page errors were empty during the QA run.

## Known Limits

- The glow is implemented with additive sprites and material emission, not a separate postprocessing bloom pass.
- The floor cue is a soft procedural light pool, not a physically accurate reflective floor.
- QA used local Chrome headless through Playwright. Physical device testing and Safari/Firefox runs were not performed in this pass.
