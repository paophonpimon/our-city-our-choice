# Rule: no firebase deploy

`firebase deploy` publishes hosting/functions/rules to the live project
(`our-city-our-choice`) that real students and teachers use. This must be a
deliberate human action, never an agent side effect.

Enforced by `.claude/hooks/guard.mjs` on any `Bash`/`PowerShell` command
containing `firebase ... deploy`.
