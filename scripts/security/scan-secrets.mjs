#!/usr/bin/env node
// scripts/security/scan-secrets.mjs — finds credentials in the working tree (default), the staged diff (--staged,
// used by the pre-commit hook) or the whole Git history (--history). Prints file, line, rule and a masked preview;
// never the value. --diff-file <path> scans a saved unified diff (CI: the pull request's changes). Exit code 1 when something is found. Allowed fixtures are listed in scripts/security/allowlist.json
// by file + rule + SHA-256 of the value, so an allowlisted string cannot be swapped for a real one unnoticed.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const diffFile = process.argv.includes('--diff-file') ? process.argv[process.argv.indexOf('--diff-file') + 1] : null
const mode = diffFile ? 'diff' : process.argv.includes('--history') ? 'history' : process.argv.includes('--staged') ? 'staged' : 'tree'

export const RULES = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'supabase-secret', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { id: 'razorpay-key', re: /\brzp_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { id: 'resend-key', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { id: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/ },
  { id: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'stripe-key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { id: 'slack-token', re: /\bxox[abpors]-[A-Za-z0-9-]{10,}/ },
  { id: 'meta-token', re: /\bEAA[A-Za-z0-9]{40,}/ },
  { id: 'regrow-api-key', re: /\bpx_live_[A-Za-z0-9]{12,}/ },
  { id: 'bearer-literal', re: /\b[Bb]earer\s+(?!\$\{|<|\.\.\.)(?![^\s'"`]*(?:YOUR|your|EXAMPLE|example|xxxx|XXXX))[A-Za-z0-9._~+/-]{20,}=*/ },
  { id: 'assigned-secret', re: /\b[A-Za-z_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|SERVICE_ROLE_KEY)[A-Za-z_]*\s*[:=]\s*['"`]([A-Za-z0-9._~+/=-]{24,})['"`]/ },
  { id: 'otpauth-uri', re: /otpauth:\/\/[th]otp\/[^\s'"`]*secret=[A-Z2-7]{16,}/i },
  { id: 'url-credentials', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"`]+:[^\s:@/'"`]{8,}@(?!127\.0\.0\.1|localhost)/ },
]
// Files that must never be committed, whatever they contain.
const FORBIDDEN_FILES = [/(^|\/)\.demo-credentials\//, /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/, /\.(pem|p12|pfx|key)$/i]
const SKIP = [/(^|\/)package-lock\.json$/, /(^|\/)node_modules\//, /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz)$/i, /^scripts\/security\/allowlist\.json$/]

const allow = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'scripts/security/allowlist.json'), 'utf8')) } catch { return [] } })()
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex')
const mask = (v) => (v.length <= 8 ? '****' : `${v.slice(0, 4)}…(${v.length} chars)`)
// Local Supabase CLI demo keys are public, identical on every machine, and only work against 127.0.0.1.
const isLocalSupabaseDemo = (v) => { try { const p = JSON.parse(Buffer.from(v.split('.')[1], 'base64url')); return p.iss === 'supabase-demo' } catch { return false } }

export function scanText(file, text) {
  const out = []
  if (FORBIDDEN_FILES.some((r) => r.test(file)) && !/\.env\.example$/.test(file)) return [{ file, line: 1, rule: 'forbidden-file', preview: '(file must not be committed)', sha256: '' }]
  if (SKIP.some((r) => r.test(file))) return out
  text.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      const m = rule.re.exec(line)
      if (!m) continue
      const value = m[1] ?? m[0]
      if (rule.id === 'jwt' && isLocalSupabaseDemo(value)) continue
      if (allow.some((a) => a.file === file && a.rule === rule.id && a.sha256 === sha(value))) continue
      out.push({ file, line: i + 1, rule: rule.id, preview: mask(value), sha256: sha(value) })
    }
  })
  return out
}

function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 }) }

function run() {
  const findings = []
  if (mode === 'tree') {
    for (const f of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
      const p = path.join(root, f)
      if (!fs.existsSync(p) || fs.statSync(p).size > 2_000_000) continue
      findings.push(...scanText(f, fs.readFileSync(p, 'utf8')))
    }
  } else {
    const diff = mode === 'diff' ? fs.readFileSync(diffFile, 'utf8') : mode === 'staged' ? git(['diff', '--cached', '-U0', '--no-color']) : git(['log', '--all', '-p', '-U0', '--no-color', '--format=COMMIT %H'])
    let commit = 'staged', file = null
    for (const line of diff.split('\n')) {
      if (line.startsWith('COMMIT ')) commit = line.slice(7, 19)
      else if (line.startsWith('+++ ')) file = line.startsWith('+++ b/') ? line.slice(6) : null
      else if (file && line.startsWith('+') && !line.startsWith('+++')) for (const f of scanText(file, line.slice(1))) findings.push({ ...f, line: undefined, commit })
    }
  }
  const unique = [...new Map(findings.map((f) => [`${f.commit ?? ''}|${f.file}|${f.line ?? ''}|${f.rule}|${f.preview}`, f])).values()]
  const showHash = process.argv.includes('--show-hash') // for writing an allowlist entry for a test fixture
  for (const f of unique) console.log(`${f.commit ? f.commit + ' ' : ''}${f.file}${f.line ? ':' + f.line : ''}  ${f.rule}  ${f.preview}${showHash ? '  sha256=' + f.sha256 : ''}`)
  console.log(unique.length ? `\n${unique.length} possible secret(s) found (${mode}). Move real values to environment variables; see docs/operations/SECURITY.md.` : `No secrets found (${mode}).`)
  process.exit(unique.length ? 1 : 0)
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) run()
