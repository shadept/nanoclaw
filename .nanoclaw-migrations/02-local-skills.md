# 02 — Local-only skills to preserve

These skill directories existed at the merge-base but have since been removed or renamed in upstream. They are user-valued and must be copied back from `files/.claude/skills/` to `.claude/skills/` after resetting to upstream.

## Skills to copy back

| Skill | Status in upstream | Action |
|-------|-------------------|--------|
| `add-compact` | Removed | Copy back |
| `add-gmail` | Renamed to `add-gmail-tool` (different shape) | Copy back; keep both directories — `add-gmail` is the user's preferred installer |
| `add-image-vision` | Removed | Copy back |
| `add-pdf-reader` | Removed | Copy back |
| `add-reactions` | Removed | Copy back |
| `add-telegram-swarm` | Removed | Copy back |
| `add-voice-transcription` | Removed | Copy back |
| `channel-formatting` | Removed | Copy back |
| `use-local-whisper` | Removed | Copy back |

## Reapply method

From the migrated worktree root:

```bash
GUIDE_DIR="$(git rev-parse --show-toplevel)/.nanoclaw-migrations"
for skill in add-compact add-gmail add-image-vision add-pdf-reader \
             add-reactions add-telegram-swarm add-voice-transcription \
             channel-formatting use-local-whisper; do
  if [ -d "$GUIDE_DIR/files/.claude/skills/$skill" ]; then
    mkdir -p ".claude/skills/$skill"
    cp -r "$GUIDE_DIR/files/.claude/skills/$skill"/* ".claude/skills/$skill/"
  fi
done
```

## Notes

- These skills are documentation/installers (each is a single `SKILL.md` describing how to apply the feature). The actual integrations (Telegram channel, voice transcription, image vision) are already in the source tree as customizations from later sections — installing the skill won't double-apply them. The pre-flight check inside each skill (`if src/X.ts exists, skip to Phase 3`) handles the idempotency.
- `add-voice-transcription` and `add-image-vision` reference a `whatsapp` git remote (`https://github.com/qwibitai/nanoclaw-whatsapp.git`) for skill branches. **The user does not have WhatsApp installed** — these features were ported to Telegram manually. The SKILL.md text is preserved for reference but the merge commands inside it should not be run.
- `add-telegram-swarm` references multi-bot Telegram orchestration. Not currently used at runtime but kept for future.
- Other skills already present in upstream (`add-discord`, `add-slack`, `add-whatsapp`, `claw`, `customize`, `debug`, etc.) will be reset to upstream's version automatically. The user has not customized them per the diff, so this is fine.
