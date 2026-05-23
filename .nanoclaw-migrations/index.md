# NanoClaw Migration Guide

Generated: 2026-05-06T11:46:15Z
Base (merge-base): 934f063aff5c30e7b49ce58b53b41901d3472a3e
HEAD at generation: 1e1277a4f6dfcb016fa63469ea665530e8a3ec12
Upstream at generation: f2d2ce9aed00612524f0a24acb020076d6375133

This guide reapplies a heavily-customized NanoClaw fork on top of clean upstream/main. The fork is ~747 commits behind upstream and contains 37 commits across 24 files (≈2978 insertions). Upstream has since done a major version bump (1.2.x → 2.0.x) and refactored Telegram support to use a `@chat-adapter/*` Chat-SDK model — the fork's customizations predate that refactor and are preserved as-is.

## Migration Plan (Tier 3)

Apply in this order on a clean upstream worktree:

1. **Re-merge the upstream skill** `skill/native-credential-proxy` — provides `src/credential-proxy.ts`, removes OneCLI from `src/index.ts`, `src/config.ts`, `src/container-runner.test.ts`, `setup/verify.ts`. (See `01-skills.md`.)
2. **Restore local-only skills** that upstream has since removed/renamed. (See `02-local-skills.md`.)
3. **Apply runtime customizations** — nerdctl wrapper, host networking. (See `03-runtime-nerdctl.md`.)
4. **Apply Telegram channel** — new files + registration + types. (See `04-telegram-channel.md`.)
5. **Apply voice + image vision** — Groq Whisper, sharp. (See `05-voice-vision.md`.)
6. **Apply formatting + typing customizations** — multi-chunk `<internal>` stripping, typing indicator refresh. (See `06-formatting-typing.md`.)
7. **Apply CI workflow removals**. (See `07-cleanup.md`.)
8. **Validate** — `npm install && npm run build && npm test`.

### Order rationale

- The credential-proxy skill must be merged before runtime customizations because the user's nerdctl/host-networking changes modify code that the skill introduces (`PROXY_BIND_HOST`, `hostGatewayArgs()`).
- Telegram, voice, and image vision are independent of each other but share the `MessageImage` type definition — apply types first inside the Telegram step.
- Internal-tag stripping enhancement modifies code that the skill introduces (the basic `stripInternalTags` function), so it must come after the skill merge.

### Risk areas

- **`src/index.ts`** is heavily touched by both the user (typing intervals, image piping, scheduler.setTyping wiring, IPC formatOutbound) and by upstream over 747 commits. Apply user customizations by anchor (function name, surrounding lines) rather than line numbers — upstream has likely refactored.
- **`src/container-runtime.ts`** has user changes that DELETE skill-introduced code (the `detectProxyBindHost()` function and platform branching in `hostGatewayArgs()`). The skill on the new upstream may have been updated; reconcile carefully.
- **Telegram**: upstream now ships a different add-telegram skill using `@chat-adapter/telegram`. The fork's implementation is the older grammy-based version. **Do NOT apply upstream's new add-telegram skill** — that would conflict with the preserved code. The user's `src/channels/telegram.ts` is treated as a custom file copied verbatim.

### Skill interactions

- The `native-credential-proxy` skill defines `PROXY_BIND_HOST` with platform-specific detection. The user's `3274063` commit replaces that with a hardcoded `127.0.0.1` and switches `hostGatewayArgs()` to `--network=host`. After re-merging the skill, the file must be patched again to apply this simplification.
- The skill removes OneCLI references but the fork's `package.json` still contains `@onecli-sh/sdk` as a dependency. This is intentional: even though OneCLI is no longer used at runtime, the dependency was not removed. Leave it as upstream provides it.

## File index

- `index.md` — this file
- `01-skills.md` — upstream skill to re-merge
- `02-local-skills.md` — local-only skills to preserve from `files/.claude/skills/`
- `03-runtime-nerdctl.md` — nerdctl wrapper + host networking
- `04-telegram-channel.md` — Telegram channel installation
- `05-voice-vision.md` — voice transcription + image vision
- `06-formatting-typing.md` — internal-tag stripping + typing indicators
- `07-cleanup.md` — CI workflow removals + dependency adds
- `08-followup-telegram-chatsdk.md` — deferred follow-up: switch Telegram to upstream's Chat SDK adapter to reduce drift
- `files/` — verbatim copies of new files and preserved skill SKILL.md files

## Applied skills (summary)

| Skill | Source | Reapply method |
|-------|--------|----------------|
| `native-credential-proxy` | `upstream/skill/native-credential-proxy` | git merge (see 01-skills.md) |

## Customization summary

| Customization | Files affected | See |
|---------------|----------------|-----|
| nerdctl runtime via `bin/nanoclaw-ctr` | `bin/nanoclaw-ctr`, `container/build.sh`, `src/container-runtime.ts` | 03-runtime-nerdctl.md |
| Host networking (replaces docker0 detection) | `src/container-runtime.ts` | 03-runtime-nerdctl.md |
| Telegram channel (grammy, replies, files) | `src/channels/telegram.ts`, `src/channels/telegram.test.ts`, `src/channels/index.ts`, `package.json` | 04-telegram-channel.md |
| `MessageImage` type + `images` on `NewMessage` | `src/types.ts` | 04-telegram-channel.md |
| Image vision (sharp + base64) | `src/image.ts`, `src/container-runner.ts`, `container/agent-runner/src/index.ts`, `package.json` | 05-voice-vision.md |
| Voice transcription (Groq Whisper, Portuguese) | `src/transcription.ts` | 05-voice-vision.md |
| Multi-chunk `<internal>` tag stripping | `src/router.ts`, `src/formatting.test.ts` | 06-formatting-typing.md |
| Typing indicator refresh loop (4s) | `src/index.ts`, `src/task-scheduler.ts` | 06-formatting-typing.md |
| IPC `formatOutbound` wrapping | `src/index.ts` | 06-formatting-typing.md |
| Removed CI workflows | `.github/workflows/{bump-version,update-tokens}.yml` | 07-cleanup.md |
| Telegram + image deps | `package.json` | 07-cleanup.md |

## What is NOT in this guide (intentionally)

- `groups/`, `store/`, `data/`, `.env` — data/identity content. Preserved by not touching it during upgrade. The user's "Shade" personality lives in `.env` as `ASSISTANT_NAME=Shade` and per-group `groups/*/CLAUDE.md` files.
- `migration-state.md` — created by `fd2b750` (OpenClaw migration). Not in BASE..HEAD diff because it predates upstream tracking; leave it alone.
- `package-lock.json` — regenerated by `npm install`.
