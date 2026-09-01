# AGENTS.md — Working Guide for AI and Developers

This is the repository-level operating guide. Read this file and `README.md` before changing code. When documentation and implementation disagree, verify the relevant tests and source; the following files are the authoritative order:

1. Domain pure functions and their tests in `src/domain/`
2. Shared contracts in `src/types/classroomGame.ts` and `src/services/classroomGameService.ts`
3. Firebase rules and service transactions
4. Page/component orchestration
5. This document and `README.md`

Do not revive concepts from the old “มัทนาต้องรอด” project. The current product is **Our City, Our Choice / เมืองนี้อยู่ที่เรา**, a Thai classroom civic-simulation game.

## Product in one paragraph

A teacher creates a realtime classroom room. Students complete PRE, receive one of eight rotating civic roles, make ten timed ethical decisions, and respond to two crisis events after questions 4 and 8. The teacher client resolves trusted outcomes. Aggregated decisions move a 0–1000 city score and seven independent building scores. The city scene, five-level building models, labels, effects, summaries, personal results, POST/reflection, teacher observation, and judge-facing evidence all derive from those persisted results.

## Non-negotiable domain invariants

- There are 8 roles, 10 normal questions per role/cycle, 2 crises per cycle, at most 8 cycles.
- There are 7 buildings because `teacher` and `student` both map to `school`.
- Normal impact is integrity `+50`, corruption `-100`, timeout `-20`.
- Crisis impact is integrity `+100`, corruption `-200`, timeout `-20`; it is already doubled when produced and must never be doubled again downstream.
- City score begins at 500, adds the round/event average across locked players, and clamps to 0–1000.
- Building scores also begin at 500 but update independently from their location summary average.
- `cityScore`, `buildingScores`, `cityLevel`, and `buildingLevels` are authoritative gameplay data. UI components must not recreate scoring rules.
- A label/effect receives resolved previous/current levels. It must not infer a transition from cumulative score.
- A neutral label shows only `Lv.N`; changed labels show previous level, animated triangle, and current level.
- Every building uses the same shared visual-effect family. Building identity may determine asset/placement, never effect semantics.
- Negative current levels remain visibly degraded after refresh; transition-only effects are insufficient.
- Live answer popups use trusted answer resolution and the calibrated building-label coordinate set. They must stay in the same scene overlay so zoom/pan applies exactly once.
- Student clients never receive `integrityChoiceId`, corruption choice identity, scores, impacts, outcomes, or answer-key data in public question documents.
- Firestore accepts immutable create-once student answers with stable IDs. Do not add client-side answer updates without redesigning rules and tests.
- PRE, POST, Reflection, and Observation records are immutable/create-once evidence. Derived means/gains are calculated from raw records, not stored per student.
- Reflection is qualitative and unscored. Do not auto-tag or convert it into a numeric result.
- Published public evidence is a whitelist aggregate only; never expose individual assessment responses.

## State machine

`ClassroomRoomStatus` is defined in `src/types/classroomGame.ts`:

```text
lobby
  -> role-draw
  -> playing
  -> round-result
       -> playing (next normal question)
       -> crisis-intro (after Q4/Q8)
            -> crisis-playing
            -> crisis-result
            -> playing (Q5/Q9)
       -> game-result (after Q10)
            -> role-draw (continue another city cycle)
            -> finished (end activity)
```

PRE is a one-way gate inside `lobby`, not a room status. POST and Reflection are appropriate only after `finished`. The teacher controls checkpoint progression. Timer expiry/all-answered may close the active question/event, but presentation settling must complete before the next teacher action becomes available.

Student route decisions belong in pure helpers in `src/domain/classroomGameLoop.ts`; do not scatter incompatible status redirects across pages.

## Roles, locations, buildings

| Role ID | Thai role | Location ID | Building ID |
| --- | --- | --- | --- |
| `doctor` | หมอ | `hospital` | `hospital` |
| `municipal` | เจ้าหน้าที่เทศบาล | `municipal-office` | `municipality` |
| `police` | ตำรวจ | `police-station` | `police` |
| `teacher` | ครู | `school` | `school` |
| `merchant` | พ่อค้าแม่ค้า | `market` | `market` |
| `contractor` | ผู้รับเหมา | `construction` | `construction` |
| `student` | นักเรียน | `school` | `school` |
| `journalist` | นักข่าว | `news-office` | `newsAgency` |

Mappings live in `src/domain/cityScoring.ts` and `src/domain/cityBuildings.ts`. Reuse them; never introduce a second hand-written mapping in business logic.

## Score and level policy

City levels (`getCityLevel`):

- 0–199 `critical` (-2)
- 200–299 `declining` (-1)
- 300–599 `neutral` (0)
- 600–799 `improving` (+1)
- 800–1000 `prosperous` (+2)

Building levels (`getBuildingLevelFromScore`):

- 0–199 `-2`
- 200–399 `-1`
- 400–599 `0`
- 600–799 `1`
- 800–1000 `2`

The city and building thresholds intentionally differ. Keep tests explicit around every boundary.

## Question trust boundary

The teacher loads the Google Sheets CSV through `src/services/googleSheetsQuestions.ts`. `src/domain/classroomQuestions.ts` validates the sheet, selects the first 10 active questions per role by `sort_order`, and creates:

- `RoomTrustedQuestion[]`: stays on the teacher browser and is persisted in teacher localStorage.
- `PublicRoomQuestion[]`: written to Firestore without answer identity or impact.

Choice order is deterministically balanced 5/5 per player/cycle and published only as a positional bit. The stable trusted snapshot is required to close a normal question after refresh. A different browser cannot reconstruct the answer key from Firestore.

## Backend architecture

All UI code talks to `ClassroomGameService`. Implementations:

- `firebaseClassroomService.ts`: real Anonymous Auth + Firestore backend
- `demoClassroomService.ts`: compatible in-memory/shared-development backend

`src/services/index.ts` selects the implementation from `VITE_DEMO_MODE`. Components should not import Firebase primitives directly.

Primary Firestore topology:

```text
rooms/{roomId}
  players/{playerId}
  questions/{questionId}
  answers/{answerId}
  rounds/{gameCycle}::{questionNumber}
  crisisResults/{gameCycle}::{eventIndex}
  personalResults/{decisionId}
  assessments/{assessmentId}
```

Layout calibration collections exist only for staging/demo runtime:

```text
cityLayoutDraft/{recordId}
cityLayoutPublished/current
cityLayoutVersions/{versionId}
```

Production rules deny those runtime layout collections. Production uses frozen source positions.

## City presentation architecture

- `cityBuildings.ts`: asset table, frozen 3×7×5 placement table, score/level derivation, depth sorting
- `cityLayoutOverrides.ts`: staging draft/published layout validation and resolution
- `CityLayoutContext.tsx` / `useCityLayoutManager.ts`: runtime calibration state
- `CityScene.tsx`: background, models, depth order, shared ambient/base effects
- `CityStage.tsx`: teacher map chrome, calibrated labels, impact network, zoom/pan, selected-building details
- `cityPresentation.ts`: pure transition/effect/timing mapping only
- `LiveAnswerImpacts.tsx`: trusted score popups anchored above the current calibrated labels

There are three scene profiles (`degraded`, `normal`, `developed`), seven buildings, and five model levels. Any placement change must be checked across all 105 combinations. `/layout-editor` writes staging drafts and versions; `npm run layout:freeze-staging` is the only normal route from published staging layout into production source.

Visual effects must emphasize the surrounding area, not PNG silhouettes. Use wrapper pseudo-elements/ambient radial glows/ground halos. Avoid strong image `drop-shadow` because many model assets have deliberately rough transparent cut edges.

## Evidence architecture

- `assessment.ts`: 10 PRE/POST items, 1–5 scale, matched calculations, three reflection prompts, O1–O4 definitions
- `competitionEvidence.ts`: judge-facing matched and simulation evidence
- `useTeacherLearningEvidencePublisher.ts`: finished-room aggregation and whitelist publication
- `FinishedLearningEvidenceSection.tsx`: public finished summary
- `TeacherCompetitionEvidenceDashboard.tsx`: teacher-only detailed evidence
- `TeacherObservationSection.tsx`: immutable room-level observation input/display

The public result page must include the latest city image/model state. The teacher evidence page is available only to the teacher session that owns the room.

## Audio

- `TeacherSoundtrack.tsx`: looping lobby/game BGM, stored volume/mute/position, transition ducking
- `soundPack.ts`: UI, crisis, scene, and ambience effects created only after a user gesture
- Normal BGM output equals the selected control volume. Ducking is temporary and intentional.

Preserve browser autoplay handling. Do not create audio eagerly before a user gesture.

## Bots and diagnostics

`scripts/classroom-bots.mjs` drives 1–40 Firebase/emulator students through PRE, normal questions, crises, POST, and Reflection. It has a hard production-project guard. Useful profiles:

- `--integrity-rate 0..1`
- `--early-corrupt-through N`
- `--late-corrupt-from N`
- `--cycle-flip`
- `--building-spread-worst-city`
- `--building-spread-best-city`
- `--post-only`

The building-spread profiles intentionally exercise Lv.-2 through Lv.+2 while producing either a bad or prosperous city. Preserve the profile mutual-exclusion check.

The opt-in teacher flight recorder is enabled with `?debug=2`. It is diagnostic only and must not alter gameplay.

## Environment and deploy safety

Allowed Firebase IDs:

- production: `our-city-our-choice`
- staging: `our-city-our-choice-staging`

Never read, print, commit, or overwrite real `.env`, `.env.local`, or `.env.*.local` values. `.env.example` is safe. Never commit service-account credentials.

Staging commands validate `.env.staging.local` and refuse a production project:

```powershell
npm run dev:staging
npm run build:staging
npm run test:rules:staging
npm run deploy:staging
```

Production deploy is a separate, explicit action. Do not infer permission to deploy, commit, push, publish layouts, run bots, or run load tests.

## Change discipline

- Put calculations, thresholds, routing decisions, and mappings in pure domain helpers with boundary tests.
- Keep Firebase and Demo service behavior aligned through the shared interface and mirrored tests.
- Treat room state and persisted results as authoritative; animation state is presentation-only.
- Use Thai-first user-facing copy. If English is necessary, add Thai translation or put English in parentheses.
- Preserve responsive behavior on teacher projector, 1366×768/tablet landscape, mobile, and portrait.
- Do not add large UI dependencies for effects that CSS/SVG can implement.
- Do not change scoring/data shape/Firestore while handling a UI-only request.
- Preserve unrelated dirty worktree changes and inspect `git diff` before staging.
- Do not commit generated `dist/`, `.firebase/`, test artifacts, or environment files.

## Verification matrix

Minimum for every change:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Additional checks:

- Firestore/rules: `npm run test:rules` or `npm run test:rules:staging`
- Layout: open `/layout-editor`, verify 3 scenes × 5 levels × 7 buildings and zoom/pan
- Teacher visual changes: verify current city map plus result/evidence layouts
- Student flow: verify refresh guards and immutable submission behavior
- Audio: verify muted, stored volume, autoplay failure, duck/restore
- Bots: use staging/emulator only and inspect the target project before starting

ESLint currently exits successfully with one known `react-refresh/only-export-components` warning in `TeacherSoundtrack.tsx`. Do not introduce additional warnings.

## Before handing off

Report:

1. What behavior changed
2. Files changed
3. Tests/typecheck/lint/build results
4. Whether staging/production was deployed
5. Whether Git was committed/pushed, including branch and commit hash
