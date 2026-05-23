# 04 — Telegram channel

**Intent:** A grammy-based Telegram bot channel that receives messages, photos (with vision), voice (with transcription), files, replies/quotes, and topic/thread context. Posts replies as Markdown v1 with plain-text fallback, splits at 4096 chars, sends typing indicators.

**Important:** Upstream now ships a different `add-telegram` skill that uses `@chat-adapter/telegram` (a Chat-SDK abstraction) and copies files from `origin/channels`. **Do NOT apply that skill** — it would conflict with this older grammy-based implementation. We treat the user's telegram code as a custom file set, copied verbatim.

## 4.1 Add `MessageImage` type to `src/types.ts`

Add the interface after `RegisteredGroup` and add the optional `images` field to `NewMessage`:

```typescript
export interface MessageImage {
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64-encoded
}
```

In the `NewMessage` interface, after `reply_to_sender_name?: string;`, add:

```typescript
  images?: MessageImage[];
```

(Both image vision and Telegram channel reference this type. Apply this first.)

## 4.2 Copy the Telegram channel files

```bash
GUIDE_DIR="$(git rev-parse --show-toplevel)/.nanoclaw-migrations"
mkdir -p src/channels
cp "$GUIDE_DIR/files/src/channels/telegram.ts"      src/channels/telegram.ts
cp "$GUIDE_DIR/files/src/channels/telegram.test.ts" src/channels/telegram.test.ts
```

These files are 550 + 1159 lines respectively. Both reference:

- npm: `grammy` (Telegram bot SDK)
- `../config.js` → `ASSISTANT_NAME`, `TRIGGER_PATTERN`
- `../env.js` → `readEnvFile`
- `../group-folder.js` → `resolveGroupFolderPath`
- `../image.js` → `processImage`
- `../logger.js` → `logger`
- `./registry.js` → `registerChannel`, `ChannelOpts`
- `../types.js` → `Channel`, `MessageImage`, `OnChatMetadata`, `OnInboundMessage`, `RegisteredGroup`
- `../transcription.js` (dynamic import inside voice handler) → `transcribeAudio`
- env: `TELEGRAM_BOT_TOKEN`

If any of these imports don't exist on the new upstream (file moves / API changes), reconcile manually. The likely candidates for breakage:

- `registerChannel`, `ChannelOpts` from `./registry.js` — may have been refactored
- `Channel`, `OnChatMetadata`, `OnInboundMessage` from `../types.js` — may have been renamed/restructured
- `resolveGroupFolderPath` from `../group-folder.js` — file may have been renamed

If signatures changed, update the telegram.ts imports/usage to match new upstream. The functional logic (handlers, file download, reply context) should remain.

## 4.3 Register the Telegram channel in `src/channels/index.ts`

Add this line under the `// telegram` comment (or near the other channel imports):

```typescript
import './telegram.js';
```

The full barrel file should end up as (or similar — order/comments don't matter, only the import line is critical):

```typescript
// Channel self-registration barrel file.
// Each import triggers the channel module's registerChannel() call.

// discord

// gmail

// slack

// telegram
import './telegram.js';

// whatsapp
```

If upstream has reorganized this file (e.g., moved to a different registration mechanism), follow the new pattern but make sure `telegram.ts` is loaded at startup so its `registerChannel('telegram', ...)` call fires.

## 4.4 Add `grammy` and `sharp` to `package.json`

In the `dependencies` section of `package.json`, add:

```json
"grammy": "^1.39.3",
"sharp": "^0.34.5"
```

(Sharp is for image processing — used by `processImage()` in `src/image.ts`. Co-located here because Telegram photo handling depends on it.)

If `package.json` already includes them, leave alone. If upstream uses different versions, evaluate compatibility — grammy `^1.39` is the version the Telegram code was developed against.

## 4.5 Validate

```bash
npm install
npm run build
npx vitest run src/channels/telegram.test.ts
```

All telegram tests must pass. If imports fail, fix them per the notes in section 4.2.

## Notes on what the channel does

- **Reply/quote piping:** when a user replies to or quotes another message, that context is captured in `reply_to_message_id`, `reply_to_message_content`, `reply_to_sender_name` and passed to the agent.
- **@mention translation:** Telegram `@bot_username` mentions are translated to the configured `TRIGGER_PATTERN` (e.g. `@Andy` or `@Shade`) so the trigger matcher recognizes them.
- **File downloads:** photos, videos, voice, audio, documents are downloaded to `groups/<folder>/attachments/` with sanitized filenames; the agent receives the container-relative path.
- **Photo handling:** the largest size variant is downloaded, resized via `processImage()` (sharp, max 1568px), and passed inline as a `MessageImage[]` so the agent gets vision capability.
- **Voice handling:** voice notes are downloaded as `.oga`, normalized to `.ogg`, and transcribed via `transcribeAudio()` (dynamic import). Content becomes `[Voice: <transcript>]`.
- **Typing indicators:** `setTyping()` calls `sendChatAction('typing')`. Telegram's typing indicator expires after 5 s, so the orchestrator (see `06-formatting-typing.md`) refreshes every 4 s.
- **Bot commands:** `/chatid` returns the chat's JID for registration; `/ping` returns `{ASSISTANT_NAME} is online.`. Both are filtered out of the agent's input.
- **Markdown output:** sends with `parse_mode: 'Markdown'` (Telegram v1) and falls back to plain text on parse failure. Splits messages > 4096 characters.
