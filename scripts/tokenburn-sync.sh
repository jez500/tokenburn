#!/usr/bin/env bash
#
# tokenburn-sync.sh — sync local Claude/Codex usage logs to a remote TokenBurn host.
#
# TokenBurn reads cost/token figures from the CLI session logs on the machine
# where you actually use Claude Code / the Codex CLI. If TokenBurn runs on a
# different server, copy this script somewhere on your *local* machine, edit the
# vars below, make it executable (chmod +x), then run it from cron.
#
# Only cost/token logs are synced. Do NOT sync credentials — usage windows come
# live from the providers' APIs on the server.

# ============================ EDIT THESE ====================================

# Source dirs — where the logs live on THIS machine. Trailing slash matters.
CLAUDE_SRC="${HOME}/.claude/projects/"
CODEX_SRC="${HOME}/.codex/sessions/"

# Destination dirs — user@host:/path/ on the remote TokenBurn server. These must
# be the dirs mounted into its codexbar-api container (the server user's
# ~/.claude / ~/.codex). Trailing slash matters.
CLAUDE_DEST="user@server:/home/user/.claude/projects/"
CODEX_DEST="user@server:/home/user/.codex/sessions/"

# SSH identity file for non-interactive auth (leave empty to use your SSH agent
# / ~/.ssh/config default).
SSH_KEY=""

# Set to 0 to skip a provider you don't use.
SYNC_CLAUDE=1
SYNC_CODEX=1

# Where to write logs (leave empty to log to stdout, e.g. for testing).
LOG_FILE="${HOME}/.tokenburn-sync.log"

# ========================== END CONFIG ======================================

set -uo pipefail

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# Sync contents only — no owner/group/permission metadata. This avoids
# chown/chgrp/chmod errors on remotes where the user isn't root, uids/gids
# differ, or the target filesystem doesn't support them (e.g. SMB/CIFS mounts).
# Remote files just take the destination's default perms; codexbar only reads them.
rsync_opts=(-rltD --no-owner --no-group --no-perms --prune-empty-dirs --include='*/' --include='*.jsonl' --exclude='*')
[ -n "${SSH_KEY}" ] && rsync_opts+=(-e "ssh -i ${SSH_KEY}")

rc=0

sync_one() {
  local label="$1" src="$2" dest="$3"
  if [ ! -d "${src}" ]; then
    log "[${label}] skip — source '${src}' not found"
    return 0
  fi
  if rsync "${rsync_opts[@]}" "${src}" "${dest}"; then
    log "[${label}] ok — ${src} -> ${dest}"
  else
    log "[${label}] FAILED — ${src} -> ${dest}"
    rc=1
  fi
}

run() {
  log "tokenburn-sync: start"
  if ! command -v rsync >/dev/null 2>&1; then
    log "error: rsync not installed"
    return 1
  fi
  [ "${SYNC_CLAUDE}" = "1" ] && sync_one claude "${CLAUDE_SRC}" "${CLAUDE_DEST}"
  [ "${SYNC_CODEX}" = "1" ] && sync_one codex "${CODEX_SRC}" "${CODEX_DEST}"
  log "tokenburn-sync: done (rc=${rc})"
  return "${rc}"
}

if [ -n "${LOG_FILE}" ]; then
  run >>"${LOG_FILE}" 2>&1
else
  run
fi
