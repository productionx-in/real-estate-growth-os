# Secret scanning and the 19 November 2026 GitGuardian alert

## Incident record

| | |
|---|---|
| Alert | GitGuardian: "Bearer Token" in `productionx-in/real-estate-growth-os`, push at 2026-11-19 09:41:27 UTC |
| Finding | No real credential was found anywhere in the repository's history (all branches, every commit) |
| Most likely match | The sample request in `components/integrations/DeveloperApiDocsModal.tsx`: `Authorization: Bearer px_live_<18 hex characters>`. It has been in the file since commit `dc6c591` (15 Nov) and is re-sent with every push of a branch containing it. GitGuardian's generic Bearer detector matches exactly this pattern. |
| Why it is not a live credential | It is REGrow's own API-key format, but 26 characters long, while real keys are `px_live_` + 48 hex characters (56). Production has **zero** developer API keys; a hash comparison against `developer_api_keys` (read-only, the value never used) matched nothing. |
| Other matches (all synthetic) | Sample `px_live_` keys in `tests/integration-apis-and-extensibility.test.mjs`; a fake Cashfree sandbox secret in `tests/fixtures/cashfree.mjs`; synthetic secrets in `tests/phase1-final-corrections.test.mjs` |
| Exposure in the browser | The docs sample was in the client bundle; it grants nothing. A production-mode build was scanned: the service-role key appears in no client file; browser-exposed variables are only URLs, the Supabase anon key (public by design) and display flags. |
| CI and deployments | CI uses a disposable local Supabase stack whose keys are generated per run and written only to `$GITHUB_ENV`, not printed. No `.env` or key file is tracked. |

The exact commit and file GitGuardian matched are visible only in its dashboard. Check them there against the table
above before closing the alert.

## What changed (PR "Secret scanning")

1. The docs sample now reads `Authorization: Bearer px_live_YOUR_API_KEY`. Its example e-mail moved to `example.com`.
2. Test sample keys are derived at run time instead of written as literals.
3. The fixed development fallbacks in `lib/integrations/crypto.ts` (credential encryption) and the Meta/Google OAuth
   state signing now **refuse on a production deployment** (`lib/security/dev-fallback.ts`). Production already has the
   environment variables these read first, so behaviour there is unchanged; a missing secret would now fail loudly
   instead of silently using a value that is public in this repository.
4. Prevention:
   - **`scripts/security/scan-secrets.mjs`** scans the working tree, staged changes (`--staged`), a diff file
     (`--diff-file`) or the whole history (`--history`). It prints only file, line, rule and a masked preview.
   - **`.github/workflows/secret-scan.yml`** runs on every PR and every push to `main`. It scans the tree and the PR's
     own changes.
   - **`.githooks/pre-commit`** blocks a commit that adds a credential. Enable it once per clone:
     `git config core.hooksPath .githooks`.
   - **`scripts/security/allowlist.json`** lists accepted test fixtures, pinned by file, rule and SHA-256 of the value.
     A changed value is reported again.
   - **`tests/secret-scan.test.mjs`** (part of `npm test`) checks that the tree is clean and that each rule fires. It also
     checks that no `NEXT_PUBLIC_` variable has a secret-like name and that the production fallbacks refuse.

## History rewrite: not required

No real credential was committed, so the history is left as is. Rewriting shared history would break every open
branch and PR and needs the owner's approval. If a real secret is ever committed:

1. **Revoke and replace it first.** A rewrite does not un-leak a pushed secret.
2. Only then, with approval, remove it with `git filter-repo --replace-text`. Force-push every affected branch,
   ask GitHub Support to purge cached views of the old commits, and have every clone re-cloned.

## If the scanner reports something

- **A real value:** move it to an environment variable (`ENVIRONMENT.md`), revoke the exposed one at the provider, and
  rotate it (`SECURITY.md`).
- **A test fixture:** generate the value at run time, or add an allowlist entry with a reason. Run the scanner with
  `--show-hash` to get the SHA-256 for the entry.
