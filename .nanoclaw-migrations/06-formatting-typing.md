# 06 — Internal-tag stripping + typing indicators

These two unrelated improvements both layer on top of skill-introduced code in `src/router.ts`, `src/index.ts`, and `src/task-scheduler.ts`.

## 6.1 Multi-chunk `<internal>` tag stripping (`src/router.ts`)

**Intent:** The credential-proxy skill introduces a basic `stripInternalTags()` that only handles balanced `<internal>...</internal>` pairs in a single string. When agent output is streamed to the channel, a tag can split across chunks (open in chunk N, close in chunk N+1), causing internal content to leak. The user's enhancement handles three cases: balanced pairs, dangling close tags, and dangling open tags.

**Apply this patch to `src/router.ts`** after the skill is merged.

Replace:

```typescript
export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}
```

With:

```typescript
export function stripInternalTags(text: string): string {
  let result = text.replace(/<internal>[\s\S]*?<\/internal>/g, '');
  // Handle tags split across separate streamed outputs: drop content from
  // an unmatched </internal> back to start, and from an unmatched <internal>
  // through the end. Without this, an open-in-chunk-1 / close-in-chunk-2
  // split leaks the tag literal.
  result = result.replace(/^[\s\S]*?<\/internal>/, '');
  result = result.replace(/<internal>[\s\S]*$/, '');
  return result.trim();
}
```

The skill's `formatOutbound()` wrapper does not change.

## 6.2 Test cases for `stripInternalTags` (`src/formatting.test.ts`)

Add four test cases inside the `describe('stripInternalTags', () => { ... })` block, after the last existing `it(...)` and before the closing `});`:

```typescript
  it('strips dangling open tag through end of string', () => {
    expect(stripInternalTags('hello <internal>secret stuff')).toBe('hello');
  });

  it('strips leading content up through dangling close tag', () => {
    expect(stripInternalTags('secret stuff</internal> world')).toBe('world');
  });

  it('handles close-then-open across an unbalanced pair', () => {
    expect(stripInternalTags('leak1</internal>visible<internal>leak2')).toBe(
      'visible',
    );
  });

  it('strips an open tag left after a balanced pair is removed', () => {
    expect(
      stripInternalTags('<internal>a</internal>visible<internal>tail'),
    ).toBe('visible');
  });
```

## 6.3 IPC path also runs `formatOutbound()` (`src/index.ts`)

The skill applies `formatOutbound()` to the streaming agent output. The user's commit `1e1277a` ("strip <internal> tags on all outbound paths") closes the IPC bypass so messages sent through the IPC watcher also get stripped.

**Apply this patch to `src/index.ts`** in the `startIpcWatcher({ ... })` block:

Replace:

```typescript
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
```

With:

```typescript
  startIpcWatcher({
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      const text = formatOutbound(rawText);
      if (!text) {
        logger.debug({ jid }, 'IPC message empty after stripping <internal>');
        return;
      }
      await channel.sendMessage(jid, text);
    },
```

`formatOutbound` is already imported from `./router.js` by the skill. If not, add the import.

## 6.4 Typing indicator refresh loop (`src/index.ts`)

**Intent:** Telegram's `sendChatAction('typing')` indicator expires after 5 seconds. The skill calls `setTyping(true)` once at the start of message processing. When the agent runs longer than 5 s, the indicator disappears. The fix is to refresh every 4 s.

**Apply to `src/index.ts`** inside `processGroupMessages()`:

After the line `await channel.setTyping?.(chatJid, true);`, add:

```typescript
  // Telegram's typing indicator expires after 5s — refresh every 4s
  const typingInterval = setInterval(() => {
    channel.setTyping?.(chatJid, true)?.catch(() => {});
  }, 4000);
```

In the `runAgent(...)` callback that processes streaming results, add `clearInterval(typingInterval)` to BOTH the success and error paths:

```typescript
      if (result.status === 'success') {
        clearInterval(typingInterval);
        queue.notifyIdle(chatJid);
      }

      if (result.status === 'error') {
        clearInterval(typingInterval);
        hadError = true;
      }
```

After the `runAgent(...)` call returns and before `await channel.setTyping?.(chatJid, false);`, add a final unconditional `clearInterval(typingInterval);` (defensive: covers paths where neither success nor error was reached, e.g., timeouts).

## 6.5 Wire `setTyping` into the scheduler (`src/index.ts`)

The skill's scheduler dependencies block typically looks like:

```typescript
  const scheduler = startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      // ...
    },
  });
```

Add a `setTyping` callback so scheduled tasks also show typing indicators:

```typescript
    setTyping: async (jid, isTyping) => {
      const channel = findChannel(channels, jid);
      if (channel?.setTyping) {
        await channel.setTyping(jid, isTyping);
      }
    },
```

Place it inside the `startSchedulerLoop({ ... })` arg, alongside the other dependencies (e.g. between `onProcess` and `sendMessage`).

## 6.6 Typing indicator in scheduled tasks (`src/task-scheduler.ts`)

**Apply to `src/task-scheduler.ts`:**

### Change 1 — `SchedulerDependencies` interface

Add the optional `setTyping` field:

```typescript
export interface SchedulerDependencies {
  // ...existing fields...
  sendMessage: (jid: string, text: string) => Promise<void>;
  setTyping?: (jid: string, isTyping: boolean) => Promise<void>;
}
```

### Change 2 — typing lifecycle in `runTask()`

Inside `runTask()`, before the container input is prepared (after the early-exit checks for missing groups), add:

```typescript
  // Show typing indicator while the task runs.
  // Telegram's typing expires after 5s, so repeat every 4s.
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  if (deps.setTyping) {
    deps.setTyping(task.chat_jid, true).catch(() => {});
    typingInterval = setInterval(() => {
      deps.setTyping!(task.chat_jid, true).catch(() => {});
    }, 4000);
  }
```

After the task runs (before `const durationMs = Date.now() - startTime;` or wherever the task end is), add:

```typescript
  if (typingInterval) clearInterval(typingInterval);
```

If upstream has restructured `runTask()`, anchor on the start (`logger.info({...}, 'Task starting')`) and end (`logTaskRun(...)`) — set the interval at start, clear it before logging duration.

## Validation

```bash
npm run build
npx vitest run src/formatting.test.ts
```

The new test cases in `src/formatting.test.ts` must pass. To smoke-test typing indicators, send a long-running message (e.g. `@Shade run a 10-second task`) and confirm the "typing..." indicator stays visible the entire time.
