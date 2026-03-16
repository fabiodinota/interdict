# T02: Docker Compose cert-init hardening

## Description

Harden the Docker Compose cert-init service to run non-root with read-only rootfs and isolated from application networks. Closes assessment findings M-07 and L-14. The tricky part is that `read_only: true` prevents `apk add openssl` because apk writes to `/lib`, `/usr`, etc. The solution is D053's `apk --root /tmp/apkroot` pattern — install openssl to a tmpfs-backed directory, then add that to PATH before running the cert generation script. Network isolation: remove cert-init from the `data` network so it can't reach application services (Postgres, ClickHouse, etc.) while keeping default bridge access for `apk add`.

## Steps

1. Open `docker-compose.yml`. Locate the cert-init service block (starts at line 126).

2. Modify the service to add security properties. The final cert-init block should look like:
   ```yaml
   cert-init:
     image: alpine:3.21
     user: "1000:1000"
     read_only: true
     security_opt:
       - no-new-privileges:true
     tmpfs:
       - /tmp
     logging:
       driver: json-file
       options:
         max-size: "10m"
         max-file: "3"
     entrypoint: /bin/sh
     command:
       - -c
       - |
         apk --root /tmp/apkroot --initdb add --no-cache openssl &&
         PATH=/tmp/apkroot/usr/bin:$$PATH sh /scripts/generate-internal-ca.sh
     volumes:
       - ./docker/certs/generate-internal-ca.sh:/scripts/generate-internal-ca.sh:ro
       - certs:/certs
     restart: "no"
   ```

   Key changes from current:
   - Added: `user: "1000:1000"`, `read_only: true`, `security_opt`, `tmpfs`
   - Removed: `networks: - data` (cert-init uses default bridge instead — internet access for apk but no access to application services)
   - Modified: `command` uses `apk --root /tmp/apkroot` pattern and sets PATH for openssl

3. **Important edge case**: The `certs` volume is written by cert-init. Since `read_only: true` applies to the container's rootfs but NOT to mounted volumes, the `certs:/certs` volume mount remains writable. The generate-internal-ca.sh script writes to `/certs/`, which is the volume — this is fine.

4. **Important edge case**: The `user: "1000:1000"` means cert-init runs as UID 1000. The `certs` volume is a Docker named volume — first write sets ownership. Other services (control-plane, evidence-collector, kernel) also run as UID 1000, so permissions are consistent.

5. Verify with `docker compose config` from the repo root. Confirm:
   - cert-init has `read_only: true`
   - cert-init has `user: "1000:1000"`
   - cert-init does NOT appear under the `data` network
   - cert-init has `security_opt: [no-new-privileges:true]`
   - cert-init has `tmpfs: [/tmp]`

## Must-Haves

- cert-init runs as non-root (`user: "1000:1000"`)
- cert-init has read-only rootfs (`read_only: true`)
- cert-init uses `apk --root /tmp/apkroot` pattern for openssl install
- cert-init is NOT on the `data` network (removed from `networks:`)
- cert-init has `security_opt: [no-new-privileges:true]`
- cert-init has `tmpfs: [/tmp]` for apk install target
- `docker compose config` validates successfully

## Verification

```bash
docker compose config  # must succeed without errors
# Inspect output to confirm cert-init properties
docker compose config | grep -A 30 "cert-init:"
```

## Inputs

- `docker-compose.yml` lines 126-144: current cert-init service block with `networks: - data`, no security hardening
- D053 decision: `apk --root /tmp/apkroot` pattern for read-only rootfs with runtime package install
- D059 decision: CA validity already reduced to 1 year (cert script is correct, only the comment was stale which T01 fixes)

## Expected Output

- `docker-compose.yml` cert-init service block includes `user`, `read_only`, `security_opt`, `tmpfs`
- cert-init has no `networks:` key (uses default bridge)
- `docker compose config` validates without errors
