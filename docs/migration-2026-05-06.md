# v1 → v2 Migration — completed 2026-05-06

Migration of `/home/shade/Projects/nanoclaw` (v1.2.52) → `/home/shade/Projects/nanoclaw-v2`.

## Migration steps (from migrate-v2.sh handoff)
- 1a-env: success
- 1b-db: success (1 group migrated)
- 1c-groups: success (3 folders)
- 1d-sessions: success
- 1e-tasks: success (11 tasks ported)
- 3a-docker: failed but irrelevant — system uses nerdctl with k3s containerd
- 3b-onecli: failed — OneCLI installer requires Docker daemon
- 3e-build: success (image: nanoclaw-agent-v2-8b3ca5ae:latest)

## Manual fixes applied (Phase 0a)
- Installed Telegram channel adapter from `origin/channels` branch
- Bumped `chat` from 4.26.0 → 4.27.0 to match adapter peer
- Replaced OneCLI gateway with native credential proxy (manual port — `src/credential-proxy.ts`)
- Made container runtime configurable via `CONTAINER_RUNTIME` env var (defaults to docker)
- Added `CONTAINER_HOST_NETWORK=true` toggle for host-network containers (nerdctl/k3s)
- Gated OneCLI approval handler init behind `ONECLI_URL` so it stays dormant when proxy is in use

## Configuration (.env additions)
- `CONTAINER_RUNTIME=/home/shade/Projects/nanoclaw-v2/bin/nanoclaw-ctr`
- `CONTAINER_HOST_NETWORK=true`

## Owner / access (Phase 1)
- Owner role granted: `telegram:6556499778` (João Furtado)
- `messaging_groups.unknown_sender_policy`: `known_only`
- `agent_group_members`: `telegram:6556499778` → `ag-1778070131375-5r74e1`

## CLAUDE.local.md (Phase 2)
- `groups/telegram_main/CLAUDE.local.md`: stripped v1 boilerplate (Container Mounts, Managing Groups, Authentication, Global Memory, Scheduling, Task Scripts, Communication, Memory). Kept identity ("Shade"), "Who You Are", "Your Human", "React Like a Human", "Heartbeat", "Message Formatting" (Telegram-only).
- `groups/main/CLAUDE.local.md`: minimal placeholder (group not wired to any messaging group)

## Container config (Phase 3)
- `groups/telegram_main/container.json`: pre-existed, additionalMounts empty (matches v1)
- `groups/main/container.json`: created (empty, group not wired)
- `agent_groups.name` renamed: "João DM" → "Shade" (was leaking through to system prompt as "You are João DM")

## v1 fork (Phase 4)
v1 was 39 commits ahead of upstream. Already covered by v2 trunk or manual fixes:
- Telegram adapter (`/add-telegram`)
- Native credential proxy (manual port)
- nerdctl runtime (manual port)
- `<internal>` tag stripping (in trunk)
- Personality (in CLAUDE.local.md)

Ported manually after initial pass:
- Voice transcription via Groq Whisper API (`src/transcription.ts`, hooked into `src/channels/chat-sdk-bridge.ts`; uses existing `GROQ_API_KEY` from `.env`, language `pt`). Container formatter renders transcribed audio as `[Voice: <transcript>]`. No `/add-voice-transcription` was used — that skill is WhatsApp-specific.

NOT ported (no v2 Telegram-specific skill exists yet):
- Image vision for Telegram (v1 had photo handling; `/add-image-vision` skill is WhatsApp-only)

## Scheduled tasks (post-audit)
The migrate script's `1e-tasks` log says `migrated=0,skipped=11` but actually ported 10 cron tasks correctly to `inbound.db` (kind='task'). Two real gaps were caught and fixed in the audit:
- The interval-type heartbeat task (every 30 min) didn't translate; ported manually as cron `*/30 * * * *` with id `task-heartbeat-migrated`.
- All 4 scripted tasks referenced `/workspace/group/` (v1 mount path); rewritten to `/workspace/agent/` to match v2's mounts.

Final task count: 11/11 active.

## v1 install
Preserved at `/home/shade/Projects/nanoclaw`. v1 service stopped (`nanoclaw.service` inactive).
Revert with `systemctl --user stop nanoclaw-v2-8b3ca5ae && systemctl --user start nanoclaw`.
