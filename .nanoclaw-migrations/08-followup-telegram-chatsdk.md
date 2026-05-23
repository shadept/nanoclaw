# 08 — Follow-up: migrate Telegram to upstream's Chat SDK

**Status:** Deferred. Tracked here so a future session can pick it up.

**Why:** The fork's grammy-based Telegram (`src/channels/telegram.ts`, ~550 lines) predates upstream's Chat SDK refactor. Upstream now uses a `@chat-adapter/telegram` abstraction with a `ChannelAdapter` interface and shared `chat-sdk-bridge.ts`. Staying on the old implementation is fine for now but will accumulate divergence: every new upstream channel (Discord/Slack via Chat SDK), every host-router refactor, and every grammy security update is on the user to track. The user has stated a preference for convergence with upstream wherever possible.

**Why not now:** The migration is a substantial rewrite (not a port), and several user-valued features are missing or different in upstream's path. Doing it during a 747-commit catch-up upgrade would compound risk.

## What's in the user's adapter that upstream lacks

When undertaking this migration, the following must be preserved (or re-added as a thin overlay on top of the Chat SDK bridge):

1. **Topic / thread support** (`message_thread_id`) — upstream's bridge config has `supportsThreads: false` for Telegram. Forum topics will be lost unless explicitly re-enabled.
2. **`/chatid` and `/ping` bot commands** — upstream's Chat SDK adapter has no command-handler concept. These would need to be implemented as either a grammy-side hook, a router-level command parser, or a custom skill.
3. **Bot-command filtering** (the `TELEGRAM_BOT_COMMANDS` set) — upstream delivers all `/...` messages as regular content. Without filtering, the agent will see and try to respond to `/chatid`, `/ping`, etc.
4. **Graceful Markdown fallback** — upstream uses mandatory `sanitizeTelegramLegacyMarkdown()`. The user's adapter catches Markdown parse errors and re-sends as plain text. If upstream's sanitizer ever misses a case, the user's safety net is gone.
5. **Inline vision + transcription** — upstream's bridge serializes attachments to JSON and lets a host vision/transcription module handle them. The user's adapter calls `processImage()` and `transcribeAudio()` directly. Re-wiring those to upstream's host services may require host changes.

## Migration sketch (for a future session)

1. Read `upstream/main:src/channels/adapter.ts`, `chat-sdk-bridge.ts`, `channel-registry.ts` to understand the v2 ChannelAdapter shape.
2. Read `upstream/channels:src/channels/telegram.ts`, `telegram-pairing.ts`, `telegram-markdown-sanitize.ts`, and `setup/pair-telegram.ts` — these are the canonical reference files copied by upstream's `add-telegram` skill.
3. Apply upstream's `add-telegram` skill on a clean branch:
   ```bash
   git checkout -b telegram-chatsdk-migration
   # Follow .claude/skills/add-telegram/SKILL.md (the upstream version after the migration in this guide)
   ```
4. Create a thin overlay restoring the missing features:
   - **Command handler:** intercept `/chatid` and `/ping` before delivery (router-level filter or grammy raw-event hook through Chat SDK's escape hatch, if any).
   - **Bot-command filter:** generic block of `/cmd` patterns at the router/adapter boundary.
   - **Topic IDs:** patch the bridge config to `supportsThreads: true` for Telegram and verify the `threadId` flows through router/scheduler/IPC.
   - **Markdown try/catch:** wrap upstream's send call in a fallback to plain text on parse failure.
5. Cut over: replace `src/channels/telegram.ts` with the upstream-shape adapter + overlay. Keep `transcription.ts` and `image.ts` if upstream still calls them; otherwise migrate to upstream's host vision module.
6. Validate against the existing test suite — most of `telegram.test.ts` will need to be rewritten because it mocks grammy directly. Replace with bridge-level tests.
7. After cutover, delete this file and the corresponding Telegram sections from `04-telegram-channel.md` (or annotate them as superseded).

## Estimated effort

- 1–2 days of focused work for the rewrite
- Most risk is in the overlay (commands + thread support) — those features have no upstream equivalent
- Should be done on a separate branch with the full test suite passing before merging to main

## Triggers for revisiting this

- Adding a second upstream-managed channel (Discord, Slack, Teams) — the dual-path message handling will start to hurt
- A grammy CVE that requires updating past a major version
- An upstream refactor of the host router that breaks the user's registry callback contract
- Boredom + a quiet weekend
