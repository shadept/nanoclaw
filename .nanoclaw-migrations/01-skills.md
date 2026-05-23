# 01 — Upstream skill to reapply

## native-credential-proxy

**Intent:** Replace OneCLI gateway-style credential injection with a built-in HTTP proxy that injects credentials (API key or OAuth token) into upstream Anthropic API requests. Containers connect to the proxy with placeholder credentials; the proxy strips them and forwards real ones.

**Source:** `upstream/skill/native-credential-proxy`

**Reapply method:**

```bash
# In the upgrade worktree (with upstream/main as the starting point):
git merge upstream/skill/native-credential-proxy --no-edit
```

If the merge reports conflicts, the skill branch likely needs updating against the new upstream. Stop and resolve interactively — do not blindly take theirs/ours.

**What the skill provides (for reference; reapplied automatically):**

- New: `src/credential-proxy.ts`
- New: `src/credential-proxy.test.ts`
- Modified: `src/container-runner.test.ts` (replaces OneCLI mocks with `detectAuthMode` mock; adds `CREDENTIAL_PROXY_PORT` to config mock)
- Modified: `src/container-runner.ts` (imports from `./credential-proxy.js` and `./container-runtime.js`)
- Modified: `src/container-runtime.ts` (adds `CONTAINER_RUNTIME_BIN`, `CONTAINER_HOST_GATEWAY`, `PROXY_BIND_HOST`, `hostGatewayArgs()`, `detectProxyBindHost()`)
- Modified: `src/config.ts` (adds `CREDENTIAL_PROXY_PORT`, removes `ONECLI_URL`)
- Modified: `src/index.ts` (imports `startCredentialProxy`, calls it in `main()`, removes `ensureOneCLIAgent` function and its callsites)
- Modified: `src/router.ts` (introduces `formatOutbound()` and `stripInternalTags()`)
- Modified: `setup/verify.ts` (drops `ONECLI_URL` from credentials regex)
- Modified: `container/build.sh` (default `CONTAINER_RUNTIME` becomes `${SCRIPT_ROOT}/bin/nanoclaw-ctr`)

**Note on `container/build.sh`:** the skill itself sets the default to the nerdctl wrapper. That wrapper script (`bin/nanoclaw-ctr`) is NOT created by the skill — it must be added by the customization in `03-runtime-nerdctl.md`.

**Note on `package.json`:** the skill does not touch `package.json`. The `@onecli-sh/sdk` dependency remains in `package.json` even though it's no longer used at runtime. Leave whatever upstream provides; do not manually remove.

## Skill verification

After merging, confirm:

- `src/credential-proxy.ts` exists and exports `startCredentialProxy` and `detectAuthMode`
- `src/config.ts` exports `CREDENTIAL_PROXY_PORT` and `PROXY_BIND_HOST` is exported from `src/container-runtime.ts`
- `src/index.ts` calls `startCredentialProxy(CREDENTIAL_PROXY_PORT, PROXY_BIND_HOST)` somewhere in `main()`
- No references to `ONECLI_URL` remain in `src/config.ts` or `setup/verify.ts`
- `src/container-runner.test.ts` uses `detectAuthMode` mock, not `ONECLI_URL`

If any of those don't match, the skill on the new upstream has changed shape and needs investigation before continuing.
