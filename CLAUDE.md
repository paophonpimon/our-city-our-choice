# CLAUDE.md

Read `AGENTS.md` first. It is the current repository-wide source of truth for
the product, game rules, architecture, trust boundaries, verification matrix,
staging layout workflow, bots, and handoff requirements.

This file only adds Claude Code-specific safeguards.

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
