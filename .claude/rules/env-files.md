# Rule: real .env files are off-limits

Real `.env*` files (`.env`, `.env.local`, `.env.production`, ...) hold Firebase
and other live secrets. They must never be read or written by an agent.

`.env.example` is a template with no secrets and is always allowed.

Enforced by `.claude/hooks/guard.mjs` on `Read`, `Edit`, `Write`, `NotebookEdit`,
and any `Bash`/`PowerShell` command that references a real `.env*` path.
