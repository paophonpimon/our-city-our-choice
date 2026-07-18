# Simple Classroom Google Sheets Question Sync

## Architecture

Phase 4A uses the Teacher Client as the classroom game controller. It does not require Firebase Functions, a service
account, custom claims, Cloud Tasks, Google Cloud IAM, Java, Firebase Emulator, server-only trusted collections, or a
Blaze plan.

When the teacher creates or starts a room, the Teacher Client:

1. Downloads the `QUESTIONS` CSV from Google Sheets.
2. Parses and validates every non-blank row, including source row numbers.
3. Requires at least 10 active questions for each canonical role.
4. Selects 10 questions per role and locks a room snapshot.
5. Keeps the trusted snapshot, including `integrity_choice`, in React state and teacher `localStorage`.
6. Writes only public questions to Firestore.

Students read public questions from Firestore and submit only stable `questionId`/`choiceId` values. They never load
the Sheet and never send score, impact, outcome, or `integrity_choice`.

## CSV source

```text
https://docs.google.com/spreadsheets/d/1ndzvM2Fd021etUmJX60N_j_YaficwFkZ/gviz/tq?tqx=out:csv&sheet=QUESTIONS
```

Required columns:

```text
active, role_id, question_id, sort_order, question, choice_1, choice_2, integrity_choice, image_url
```

The loader is implemented in `src/services/googleSheetsQuestions.ts`. Browser access from the final demonstration
origin must be smoke-tested before the UI integration phase.

## Snapshot boundary

Teacher-only local snapshot:

- Stores the two stable choice IDs.
- Stores `integrityChoiceId` and `corruptionChoiceId`.
- Is versioned and keyed by room ID in localStorage.
- Restores after refresh on the same teacher browser.
- Is copied when the room starts, so later Sheet edits do not change an active game.

Public Firestore question:

- `questionId`
- `roleId`
- `questionNumber`
- `prompt`
- `choices`
- `imageUrl`

It must not contain `integrityChoiceId`, `corruptionChoiceId`, score, impact, outcome, or score deltas.

## Firestore layout

```text
rooms/{roomId}
rooms/{roomId}/players/{playerId}
rooms/{roomId}/questions/{questionId}
rooms/{roomId}/answers/{playerId}::{questionId}
rooms/{roomId}/rounds/{questionNumber}
```

The teacher owns room/question/round writes. A student may create one answer document for their own player and may
not update it. The stable document ID makes retries idempotent. The teacher listens to answers, validates each
stable choice ID against the local trusted snapshot, calculates the round result, and writes only aggregate results.

## Timer and progression

All players use the room's shared `currentQuestionNumber`, `questionStartedAt`, and `questionDeadlineAt`. The Teacher
Client closes the question when all locked players have answered or the deadline is reached, applies timeout `-20`
to missing answers, and writes the round/city aggregate.

Whether the next question opens automatically or waits for the teacher to press Next remains an open product
decision. Phase 4A does not decide or implement that transition.

## Restore limitation

The trusted snapshot can be restored only from the same teacher browser's localStorage. Recovery after clearing site
data or changing teacher devices remains an open design decision. Firestore intentionally cannot reconstruct
`integrity_choice` from the public snapshot.

## Verification

Run from the project root:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

No deployment or commit is authorized by Phase 4A.
