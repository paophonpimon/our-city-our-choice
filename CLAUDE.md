# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

"Our City, Our Choice" — a classroom civic-simulation game (React + TypeScript
+ Vite + Firebase). Game rules live in `src/domain`, backends (Firebase +
in-memory demo) in `src/services`.

## Safeguards

PreToolUse hooks (`.claude/hooks/guard.mjs`, wired via `.claude/settings.json`)
automatically deny:

- Reading or writing real `.env*` files (`.env.example` is allowed)
- `git push`
- `firebase deploy`
- Destructive recursive deletes (`rm -rf`, `Remove-Item -Recurse -Force`,
  `rd`/`rmdir /s`, `del /s`, `git clean -f*`)

See `.claude/rules/` for the rationale behind each rule. Do not remove or
weaken these hooks without an explicit user request.
