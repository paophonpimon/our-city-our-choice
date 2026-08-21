# Rule: no destructive recursive delete

Commands that recursively delete without confirmation
(`rm -rf`/`rm -fr`, `Remove-Item -Recurse -Force`, `rd`/`rmdir /s`, `del /s`,
`git clean -f*`) can destroy uncommitted work with no recovery path.

Enforced by `.claude/hooks/guard.mjs` on any `Bash`/`PowerShell` command
matching these patterns.
