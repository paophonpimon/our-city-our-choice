#!/usr/bin/env node
// PreToolUse safeguard hook. Denies a small set of high-risk actions:
// real .env* read/write, git push, firebase deploy, destructive recursive deletes.
import { readFileSync } from 'node:fs'

const readStdin = () => {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

const allow = () => process.exit(0)

let input
try {
  input = JSON.parse(readStdin() || '{}')
} catch {
  allow()
}

const toolName = input.tool_name || ''
const toolInput = input.tool_input || {}

const ENV_TOKEN_RE = /\.env(\.[A-Za-z0-9_-]+)?/gi
const isRealEnvToken = (token) => token.toLowerCase() !== '.env.example'

const containsRealEnvReference = (text) => {
  if (!text) return false
  const matches = text.match(ENV_TOKEN_RE)
  if (!matches) return false
  return matches.some(isRealEnvToken)
}

const isRealEnvPath = (filePath) => {
  if (!filePath) return false
  const base = String(filePath).split(/[\\/]/).pop() || ''
  if (!/^\.env(\.[A-Za-z0-9_-]+)?$/i.test(base)) return false
  return base.toLowerCase() !== '.env.example'
}

const isDestructiveRm = (command) => {
  const calls = command.match(/\brm\b[^\n;&|]*/gi) || []
  return calls.some((call) => {
    const flags = call.match(/--?[a-zA-Z-]+/g) || []
    const shortLetters = flags
      .filter((f) => f.startsWith('-') && !f.startsWith('--'))
      .join('')
      .toLowerCase()
    const longFlags = flags.filter((f) => f.startsWith('--')).map((f) => f.toLowerCase())
    const hasRecursive = shortLetters.includes('r') || longFlags.includes('--recursive')
    const hasForce = shortLetters.includes('f') || longFlags.includes('--force')
    return hasRecursive && hasForce
  })
}

const isDestructiveRemoveItem = (command) => {
  const calls = command.match(/Remove-Item\b[^\n]*/gi) || []
  return calls.some((call) => /-Recurse\b/i.test(call) && /-Force\b/i.test(call))
}

const isDestructiveWinDelete = (command) => {
  if (/\b(rd|rmdir)\b[^\n]*\/s\b/i.test(command)) return true
  if (/\bdel\b[^\n]*\/s\b/i.test(command)) return true
  return false
}

const isDestructiveGitClean = (command) => /\bgit\s+clean\b[^\n]*-[a-zA-Z]*f/i.test(command)

const isDestructiveDelete = (command) =>
  isDestructiveRm(command) ||
  isDestructiveRemoveItem(command) ||
  isDestructiveWinDelete(command) ||
  isDestructiveGitClean(command)

const isGitPush = (command) => /\bgit\b[^&|;\n]*\bpush\b/i.test(command)
const isFirebaseDeploy = (command) => /\bfirebase\b[^&|;\n]*\bdeploy\b/i.test(command)

const FILE_PATH_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])
if (FILE_PATH_TOOLS.has(toolName)) {
  const path = toolInput.file_path || toolInput.notebook_path || ''
  if (isRealEnvPath(path)) {
    deny(`Blocked: ${toolName} on real .env file "${path}". Only .env.example may be read or written.`)
  }
}

const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
if (SHELL_TOOLS.has(toolName)) {
  const command = String(toolInput.command || '')

  if (containsRealEnvReference(command)) {
    deny(`Blocked: command references a real .env file. Only .env.example is allowed.\nCommand: ${command}`)
  }
  if (isGitPush(command)) {
    deny(`Blocked: "git push" is not permitted by the guard.mjs safeguard.\nCommand: ${command}`)
  }
  if (isFirebaseDeploy(command)) {
    deny(`Blocked: "firebase deploy" is not permitted by the guard.mjs safeguard.\nCommand: ${command}`)
  }
  if (isDestructiveDelete(command)) {
    deny(`Blocked: destructive recursive delete is not permitted by the guard.mjs safeguard.\nCommand: ${command}`)
  }
}

allow()
