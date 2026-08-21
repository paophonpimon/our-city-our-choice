# Rule: no git push

Pushing rewrites shared/remote history and can affect other collaborators or
CI. An agent may commit and branch locally, but `git push` (in any form) must
be run by a human.

Enforced by `.claude/hooks/guard.mjs` on any `Bash`/`PowerShell` command
containing `git ... push`.
