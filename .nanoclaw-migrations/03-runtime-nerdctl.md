# 03 — Runtime: nerdctl wrapper + host networking

**Intent:** The user's homelab runs k3s with containerd, not Docker. NanoClaw must use `nerdctl` (Docker-compatible CLI for containerd) via a thin wrapper, and the credential proxy must use host networking so containers can reach `127.0.0.1`.

## 3.1 Create the nerdctl wrapper script

**File:** `bin/nanoclaw-ctr`

**Content (copy verbatim from `files/bin/nanoclaw-ctr`):**

```bash
#!/bin/bash
# Wrapper: calls nerdctl via sudo with k3s containerd socket
exec sudo nerdctl --address /run/k3s/containerd/containerd.sock --namespace nanoclaw "$@"
```

**Apply:**

```bash
GUIDE_DIR="$(git rev-parse --show-toplevel)/.nanoclaw-migrations"
mkdir -p bin
cp "$GUIDE_DIR/files/bin/nanoclaw-ctr" bin/nanoclaw-ctr
chmod +x bin/nanoclaw-ctr
```

**Why:** Calls `nerdctl` against the k3s containerd socket in the `nanoclaw` namespace. Sudo is required because the k3s socket is root-owned. The user has passwordless sudo configured for this command in `/etc/sudoers.d/`.

**Note:** `container/build.sh` already defaults `CONTAINER_RUNTIME` to `${SCRIPT_ROOT}/bin/nanoclaw-ctr` (this came in via the credential-proxy skill merge). No further change to `build.sh` is needed.

## 3.2 Modify `src/container-runtime.ts` for host networking

The `native-credential-proxy` skill introduces platform-specific detection logic (`detectProxyBindHost()` for docker0 bridge / WSL / macOS) and conditional `--add-host=host.docker.internal:host-gateway` flags for Linux. The user's nerdctl + host-networking setup makes all of that unnecessary.

**Apply this patch to `src/container-runtime.ts`** after the skill is merged:

### Change 1 — `CONTAINER_HOST_GATEWAY` constant

Replace:

```typescript
export const CONTAINER_HOST_GATEWAY = 'host.docker.internal';
```

With:

```typescript
export const CONTAINER_HOST_GATEWAY = '127.0.0.1';
```

### Change 2 — `PROXY_BIND_HOST` simplification

Replace the entire block (the comment, the `PROXY_BIND_HOST` export, and the `detectProxyBindHost()` function — about 25 lines):

```typescript
/**
 * Address the credential proxy binds to.
 * Docker Desktop (macOS): 127.0.0.1 — the VM routes host.docker.internal to loopback.
 * Docker (Linux): bind to the docker0 bridge IP so only containers can reach it,
 *   falling back to 0.0.0.0 if the interface isn't found.
 */
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();

function detectProxyBindHost(): string {
  if (os.platform() === 'darwin') return '127.0.0.1';

  // WSL uses Docker Desktop (same VM routing as macOS) — loopback is correct.
  // Check /proc filesystem, not env vars — WSL_DISTRO_NAME isn't set under systemd.
  if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) return '127.0.0.1';

  // Bare-metal Linux: bind to the docker0 bridge IP instead of 0.0.0.0
  const ifaces = os.networkInterfaces();
  const docker0 = ifaces['docker0'];
  if (docker0) {
    const ipv4 = docker0.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '0.0.0.0';
}
```

With:

```typescript
/**
 * Address the credential proxy binds to.
 * With host networking, containers share the host network namespace,
 * so the proxy binds to 127.0.0.1 and containers reach it directly.
 */
export const PROXY_BIND_HOST = process.env.CREDENTIAL_PROXY_HOST || '127.0.0.1';
```

### Change 3 — `hostGatewayArgs()` function

Replace:

```typescript
/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  // On Linux, host.docker.internal isn't built-in — add it explicitly
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}
```

With:

```typescript
/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  // Use host networking — containers share the host network namespace.
  // No CNI plugins or bridge networking needed.
  return ['--network=host'];
}
```

### Change 4 — `CONTAINER_RUNTIME_BIN` (verify, may already match)

The skill sets it to `path.join(process.cwd(), 'bin', 'nanoclaw-ctr')`. Verify the value matches:

```typescript
export const CONTAINER_RUNTIME_BIN = path.join(
  process.cwd(),
  'bin',
  'nanoclaw-ctr',
);
```

If the new upstream's skill version uses a different path (e.g. `'docker'`), revert it to the above.

### Imports

After Change 2, the `os` and `fs` imports may become unused. Check the top of `container-runtime.ts` — if they're still referenced elsewhere in the file (e.g., by other skill code), keep them; otherwise remove the unused imports to satisfy the linter.

## Why host networking?

- nerdctl supports `--network=host` natively (containers share the host's network namespace)
- This eliminates the need for CNI plugins, bridge interfaces, and `host-gateway` mapping
- The credential proxy can simply bind to 127.0.0.1 and containers can reach it via the same address
- Trade-off: containers can talk to ALL host network interfaces (no isolation). Acceptable for a single-user homelab.
