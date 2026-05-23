# 05 — Voice transcription + image vision

These two features are independent of each other but both flow through the Telegram channel. Voice uses Groq's Whisper API; image vision uses sharp + base64 + Claude's multimodal content blocks.

## 5.1 Voice transcription (`src/transcription.ts`)

**Intent:** Transcribe Telegram voice notes via Groq's Whisper API. OpenAI-compatible endpoint format, hardcoded to Portuguese (the user's language).

**Apply:**

```bash
GUIDE_DIR="$(git rev-parse --show-toplevel)/.nanoclaw-migrations"
cp "$GUIDE_DIR/files/src/transcription.ts" src/transcription.ts
```

The file is ~76 lines. Key facts a fresh Claude needs:

- API: `https://api.groq.com/openai/v1/audio/transcriptions`
- Model: `whisper-large-v3-turbo`
- Language: `pt` (hardcoded — change to user's language if relocating)
- Env var: `GROQ_API_KEY` (read via `readEnvFile(['GROQ_API_KEY'])`)
- Returns `null` on missing key / missing file / API error (graceful degradation)
- Normalizes Telegram's `.oga` extension to `.ogg` before upload (Groq's Whisper accepts ogg but rejects oga)
- Logs character count of successful transcriptions

**Imports it relies on (must exist on new upstream):**
- `./logger.js` → `logger`
- `./env.js` → `readEnvFile`

If `readEnvFile` has been moved/renamed, update the import. The function only needs to read a single env var with `.env` fallback.

## 5.2 Image vision (`src/image.ts`)

**Intent:** Resize Telegram photos with sharp (max 1568px, fit:inside, no upscaling), encode as base64 JPEG (85% quality), pass to Claude as multimodal content blocks.

**Apply:**

```bash
GUIDE_DIR="$(git rev-parse --show-toplevel)/.nanoclaw-migrations"
cp "$GUIDE_DIR/files/src/image.ts" src/image.ts
```

The file is ~51 lines. Key facts:

- npm: `sharp` (already added via 04-telegram-channel.md)
- Exports: `interface ImageAttachment` (matches `MessageImage` shape) and `async function processImage(filePath): Promise<ImageAttachment | null>`
- Max dimension: 1568px (Claude vision spec)
- Output: JPEG @ 85% quality, base64-encoded
- Returns `null` on missing file / processing failure

**Note:** The exported `ImageAttachment` interface is structurally identical to `MessageImage` from `src/types.ts` (added in 04-telegram-channel.md). Both are intentional — `processImage()` returns the local interface and the caller (`telegram.ts`) treats it as `MessageImage`.

## 5.3 Wire image vision through to the agent

Image data flows: `telegram.ts` → `runAgent()` → `runContainerAgent()` → container subprocess → agent SDK message stream.

### Modify `src/types.ts`

Already done in 04-telegram-channel.md (`MessageImage` interface and optional `images` on `NewMessage`).

### Modify `src/container-runner.ts`

Add `MessageImage` to the import from `./types.js`:

```typescript
import { MessageImage, RegisteredGroup } from './types.js';
```

Add `images` field to `ContainerInput` interface:

```typescript
export interface ContainerInput {
  // ...existing fields...
  images?: MessageImage[];
}
```

(Place it after `script?` to match the existing diff. Exact ordering is cosmetic — just put it inside the interface.)

### Modify `container/agent-runner/src/index.ts`

This file runs INSIDE the container. It needs:

1. **A local copy of the `MessageImage` interface** (the container does not import from `src/types.ts`):

```typescript
interface MessageImage {
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64-encoded
}
```

Place it after the `@anthropic-ai/claude-agent-sdk` import block.

2. **Add `images?` to the local `ContainerInput` interface:**

```typescript
interface ContainerInput {
  // ...existing fields...
  images?: MessageImage[];
}
```

3. **Add a `ContentBlock` type** (text + image variants matching the Claude SDK):

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        data: string;
      };
    };
```

4. **Update `SDKUserMessage` content union** from `string` to `string | ContentBlock[]`:

```typescript
interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string | ContentBlock[] };
  parent_tool_use_id: null;
  session_id: string;
}
```

5. **Update `MessageStream.push()`** to accept images and emit a multimodal content block array:

```typescript
push(text: string, images: MessageImage[] = []): void {
  const content: ContentBlock[] = [
    ...images.map((img) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.media_type,
        data: img.data,
      },
    })),
    { type: 'text' as const, text },
  ];

  this.queue.push({
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    session_id: '',
  });
  this.waiting?.();
}
```

6. **Update `runQuery()` signature and call:**

Add `images?: MessageImage[]` as a trailing parameter to `runQuery()`. Inside, replace `stream.push(prompt)` with `stream.push(prompt, images)`.

7. **In `main()`, route images one-shot:**

After loading `containerInput`, declare:

```typescript
// Images are only attached to the first query (from the initial message batch)
let pendingImages = containerInput.images;
```

In the query loop, pass `pendingImages` to `runQuery(...)` and then `pendingImages = undefined;` so subsequent queries don't repeat them.

### Modify `src/index.ts` (image extraction + pipe-through)

Two changes here, both inside `processGroupMessages()` and `runAgent()`:

**A. Import `MessageImage`** at the top of the file:

```typescript
import { Channel, MessageImage, NewMessage, RegisteredGroup } from './types.js';
```

(Add `MessageImage` to the existing import.)

**B. Inside `processGroupMessages()`**, before the `runAgent(...)` call, extract images from messages:

```typescript
const images = missedMessages.flatMap((m) => m.images || []);
```

**C. Update the `runAgent()` call** to pass `images`. Add `images` as a positional argument (between `chatJid` and the callback):

```typescript
const output = await runAgent(group, prompt, chatJid, images, async (result) => {
  // ...callback body unchanged...
});
```

**D. Update the `runAgent()` function signature** to accept and forward images:

```typescript
async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  images: MessageImage[],
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  // ...existing body...
  const output = await runContainerAgent(
    group,
    {
      prompt,
      sessionId,
      groupFolder: group.folder,
      chatJid,
      isMain,
      assistantName: ASSISTANT_NAME,
      images,
    },
    // ...rest of args unchanged...
  );
  // ...
}
```

If upstream has changed `runAgent`'s signature significantly, the principle is the same: inbound `MessageImage[]` from messages must reach `runContainerAgent` as `containerInput.images`.

## 5.4 Container rebuild after agent-runner changes

After modifying `container/agent-runner/src/index.ts`, the container image must be rebuilt:

```bash
./container/build.sh
```

If sessions are already cached (`data/sessions/*/agent-runner-src/`), sync the new TypeScript:

```bash
for dir in data/sessions/*/agent-runner-src/; do
  cp container/agent-runner/src/*.ts "$dir"
done
```

## Validation

```bash
npm run build
# Send a photo and a voice note via Telegram and confirm:
#  - photo: agent describes the image
#  - voice: agent receives the message as "[Voice: <transcript>]"
```
