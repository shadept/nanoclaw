# 07 — Cleanup: removed CI workflows + dependency adds

## 7.1 Remove auto-sync GitHub Actions

**Intent:** The user disabled two upstream-bundled GitHub Actions:
- `.github/workflows/bump-version.yml` — automated patch version bumps on src/container changes
- `.github/workflows/update-tokens.yml` — token-count badge updates

These run on every push and create churn in a personal fork. They're removed permanently.

**Apply:**

```bash
rm -f .github/workflows/bump-version.yml
rm -f .github/workflows/update-tokens.yml
```

If upstream has reorganized workflows under different names but with the same intent (auto-versioning, token tracking), remove those too. Look for any workflow that pushes commits back to the branch — those are the ones to drop.

Other CI files (e.g. CI test runners) should be left alone.

## 7.2 Dependencies in `package.json`

The `dependencies` block must contain (in addition to whatever upstream provides):

```json
"grammy": "^1.39.3",
"sharp": "^0.34.5"
```

These are added in `04-telegram-channel.md` (grammy for Telegram, sharp for image vision). Mentioned again here so a fresh installer remembers to verify after `npm install`.

## 7.3 Final validation

After all sections (01–07) are applied:

```bash
npm install
npm run build
npm test
```

If `npm test` is not configured at the package level, run vitest directly:

```bash
npx vitest run
```

All tests must pass before the upgrade is considered complete. Pay particular attention to:
- `src/channels/telegram.test.ts` (telegram channel tests)
- `src/formatting.test.ts` (the four new dangling-tag cases)
- `src/credential-proxy.test.ts` (skill-provided)
- `src/container-runner.test.ts` (skill-provided)

## 7.4 Container rebuild

After `container/agent-runner/src/index.ts` changes (image content blocks), the container image must be rebuilt:

```bash
./container/build.sh
```

If sessions are cached and need synced source:

```bash
for dir in data/sessions/*/agent-runner-src/; do
  cp container/agent-runner/src/*.ts "$dir"
done
```

## 7.5 Service restart

The user's homelab runs systemd:

```bash
systemctl --user restart nanoclaw
```

(macOS launchd is not used here.)

## What stays untouched

- `.env` — contains `ASSISTANT_NAME=Shade`, `TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`, `CREDENTIAL_PROXY_PORT` (default 3001), and other secrets.
- `groups/` — per-group memory and identity (Shade personality lives in `groups/<main>/CLAUDE.md`).
- `store/`, `data/` — SQLite DB and session caches.
- `migration-state.md` — created by the original OpenClaw migration; leave alone.
