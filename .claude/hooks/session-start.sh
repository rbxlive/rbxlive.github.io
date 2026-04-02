#!/bin/bash
# session-start.sh — runs at the start of every Claude Code web session
# Purpose: auto-configure GitHub token so git push works without manual setup
# Token lookup order:
#   1. Already set in environment (nothing to do)
#   2. .env.local in repo root (gitignored, persists via container cache)
#   3. /root/.claude/settings.json env block

set -euo pipefail

# Only run in remote (web) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel 2>/dev/null || echo /home/user/rbxlive.github.io)}"
ENV_LOCAL="$REPO_DIR/.env.local"

# ── 1. Check if already set ───────────────────────────────────────────────────
TOKEN="${GITHUB_TOKEN:-}"

# ── 2. Try .env.local (gitignored file in repo root) ──────────────────────────
if [ -z "$TOKEN" ] && [ -f "$ENV_LOCAL" ]; then
  TOKEN=$(grep -E '^GITHUB_TOKEN=' "$ENV_LOCAL" | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]')
fi

# ── 3. Try /root/.claude/settings.json ────────────────────────────────────────
if [ -z "$TOKEN" ] && [ -f "/root/.claude/settings.json" ]; then
  TOKEN=$(node -e "
    try {
      const s = JSON.parse(require('fs').readFileSync('/root/.claude/settings.json','utf8'));
      process.stdout.write(s.env?.GITHUB_TOKEN || '');
    } catch(e) { process.stdout.write(''); }
  " 2>/dev/null || echo "")
fi

# ── Apply token if found ───────────────────────────────────────────────────────
if [ -n "$TOKEN" ]; then
  # Persist to session environment via CLAUDE_ENV_FILE
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "GITHUB_TOKEN=$TOKEN" >> "$CLAUDE_ENV_FILE"
  fi

  # Configure git remote to use token (bypasses the read-only OAuth proxy)
  git -C "$REPO_DIR" remote set-url origin \
    "https://rbxlive:${TOKEN}@github.com/rbxlive/rbxlive.github.io.git" 2>/dev/null || true

  echo "✅ GitHub token loaded — git push enabled"
else
  # ── Token missing: print one clear fix ──────────────────────────────────────
  echo ""
  echo "⚠️  GitHub token not found. To fix, run this ONCE in the terminal:"
  echo ""
  echo "    echo 'GITHUB_TOKEN=ghp_yourTokenHere' > $ENV_LOCAL"
  echo ""
  echo "Then reload the session. The token will persist via container caching."
  echo "(Get your token from GitHub → Settings → Developer settings → Personal access tokens)"
fi

# ── Install node dependencies if needed ───────────────────────────────────────
if [ -f "$REPO_DIR/clipping/package.json" ] && [ ! -d "$REPO_DIR/clipping/node_modules" ]; then
  echo "📦 Installing clipping dependencies..."
  npm --prefix "$REPO_DIR/clipping" install --silent 2>&1 || echo "⚠️  npm install had warnings (non-fatal)"
fi
