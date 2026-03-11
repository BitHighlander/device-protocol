# npm Trusted Publishing (OIDC) — Setup Notes

## Status

**Not yet working in CI.** v7.14.0 was published manually with OTP.
The workflow (`build-and-publish.yml`) has the fix applied but is untested.

## What Is Trusted Publishing?

npm trusted publishing lets GitHub Actions publish to npm **without storing
an npm token as a secret**. Instead, GitHub's OIDC provider issues a
short-lived token that npm validates against a "Trusted Publisher" config
on npmjs.com. No secrets to rotate, no tokens to leak.

## What Went Wrong (March 2026)

`actions/setup-node@v4` has a known bug ([actions/setup-node#1440][1]):

When you pass `registry-url: 'https://registry.npmjs.org'`, it writes an
`.npmrc` with `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` and
exports `NODE_AUTH_TOKEN` set to either `$GITHUB_TOKEN` or a placeholder
`XXXXX-XXXXX-XXXXX-XXXXX`.

npm sees `NODE_AUTH_TOKEN` is set and uses it as the auth token for
registry.npmjs.org — it **never falls through to OIDC auto-detection**.
The GITHUB_TOKEN / placeholder is obviously invalid for npmjs.org, so
the publish returns 404.

### What We Tried (All Failed)

| Attempt | Result |
|---------|--------|
| Remove `registry-url` from setup-node | `ENEEDAUTH` — no registry configured |
| Unset `NODE_AUTH_TOKEN` before publish | `ENEEDAUTH` — .npmrc still references the var |
| Set `NODE_AUTH_TOKEN` to empty string | `ENEEDAUTH` — empty string is still "a value" |
| Use `--registry` flag on `npm publish` | `ENEEDAUTH` — .npmrc auth config takes precedence |

The fundamental issue: `setup-node` writes an `.npmrc` that **hardcodes
token-based auth**, making it impossible for npm to auto-detect the OIDC
environment.

## The Fix

**Do NOT pass `registry-url` to `setup-node`.** npm's default registry is
already `https://registry.npmjs.org`. Without `registry-url`, setup-node
does not create the `.npmrc` entry and does not export `NODE_AUTH_TOKEN`.

Then `unset NODE_AUTH_TOKEN` before publish (belt and suspenders) and use
`npm publish --provenance --access public`.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '24'
    # DO NOT set registry-url — it blocks OIDC

- name: Publish
  run: |
    unset NODE_AUTH_TOKEN
    npm publish --provenance --access public
```

This is now applied in `build-and-publish.yml` but needs a test run.

## Prerequisites Checklist

1. **npm >= 11.5.1** — ships with Node 24. Node 22 ships npm 10.x (too old).
   If stuck on Node 22, add `npm install -g npm@latest` before publish.

2. **`id-token: write`** permission on the **job** (not just workflow level —
   job-level permissions override workflow-level).

3. **Trusted Publisher configured on npmjs.com**:
   - Go to: https://www.npmjs.com/package/@bithighlander/device-protocol/access
   - Under "Trusted Publisher" → GitHub Actions
   - Repository owner: `BitHighlander` (case-sensitive!)
   - Repository name: `device-protocol`
   - Workflow filename: `build-and-publish.yml` (exact match)
   - Environment: (leave blank unless using GitHub Environments)

4. **`repository` field in package.json** must match the GitHub repo:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/BitHighlander/device-protocol.git"
   }
   ```
   A 422 error occurs if this is missing or doesn't match.

5. **Cloud-hosted runners only** — self-hosted runners don't support OIDC.

6. **Package must already exist on npm** — first publish can't use OIDC.
   Use a classic token (or manual `npm publish` with OTP) for the initial
   publish, then configure the Trusted Publisher for subsequent publishes.
   (We already did this — v7.14.0 is on npm.)

## How OIDC Works Under the Hood

1. GitHub Actions runtime exposes `ACTIONS_ID_TOKEN_REQUEST_URL` +
   `ACTIONS_ID_TOKEN_REQUEST_TOKEN` env vars (when `id-token: write` granted)
2. npm >= 11.5.1 detects these and knows it's OIDC-capable
3. npm requests a short-lived OIDC token from GitHub
4. npm sends this to the registry instead of a classic auth token
5. Registry validates against the Trusted Publisher config (org, repo,
   workflow filename, optional environment)
6. Provenance attestation is auto-generated and attached to the package

**Key insight**: npm only attempts OIDC if `NODE_AUTH_TOKEN` is
**completely unset**. Any value short-circuits to token-based auth.

## Fallback: NPM_TOKEN Secret

If OIDC still won't cooperate, the classic approach works fine:

1. Create a granular access token on npmjs.com (Automation type)
2. Add it as `NPM_TOKEN` secret in GitHub repo settings
3. Use in workflow:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '24'
    registry-url: 'https://registry.npmjs.org'

- run: npm publish --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

This is battle-tested and works everywhere. The only downside vs OIDC is
having a long-lived token to manage.

## Common Errors Reference

| Error | Cause | Fix |
|-------|-------|-----|
| 404 on PUT | `NODE_AUTH_TOKEN` set (blocks OIDC) | Remove `registry-url`, unset token |
| ENEEDAUTH | No auth and OIDC not detected | Ensure `id-token: write`, npm >= 11.5.1 |
| 422 Unprocessable | `repository.url` wrong/missing | Match package.json to GitHub repo |
| 404 on scoped pkg | Trusted Publisher org has `@` | Use org name without `@` |

## References

- [npm Trusted Publishers docs](https://docs.npmjs.com/trusted-publishers/)
- [actions/setup-node#1440 — NODE_AUTH_TOKEN blocks OIDC][1]
- [npm/cli#8730 — OIDC publish failing](https://github.com/npm/cli/issues/8730)
- [Phil Nash — Things you need for trusted publishing](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)

[1]: https://github.com/actions/setup-node/issues/1440
