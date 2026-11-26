// scripts/build-auth-email-templates.mjs
// Generates Supabase Auth email templates (supabase/templates/*.html) from the app's own email layout, so
// sign-up, password-reset, magic-link and email-change mail look like every other RE email.
//   node scripts/build-auth-email-templates.mjs          → writes the files
//   node scripts/build-auth-email-templates.mjs --check  → exits 1 if the committed files are out of date
// Production: paste each file into Supabase → Authentication → Email Templates (subjects in config.toml).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { renderEmail } = await jiti.import(path.join(root, 'lib/email/layout.ts'))
const PLACEHOLDER = 'https://placeholder.invalid/__CONFIRMATION_URL__'

export const TEMPLATES = {
  confirmation: {
    subject: 'Confirm your email for RE',
    preheader: 'Confirm your email address to finish setting up your RE account.',
    heading: 'Confirm your email address',
    paragraphs: ['Confirm that this is your email address to finish setting up your RE account.'],
    cta: 'Confirm email',
    // Token-hash links go to /auth/confirm and work on any device (a PKCE link only in the requesting browser).
    link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/select-org',
    footnote: 'If you didn’t create a RE account, you can ignore this email.',
  },
  recovery: {
    subject: 'Reset your RE password',
    preheader: 'Choose a new password for your RE account.',
    heading: 'Reset your password',
    paragraphs: ['We received a request to reset the password for your RE account. Choose a new one with the button below.'],
    cta: 'Choose a new password',
    link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password',
    footnote: 'This link works once and expires soon. If you didn’t ask to reset your password, ignore this email — your password stays the same. After a reset, other devices are signed out.',
  },
  magic_link: {
    subject: 'Your RE sign-in link',
    preheader: 'Sign in to RE with one click.',
    heading: 'Sign in to RE',
    paragraphs: ['Use the button below to sign in.'],
    cta: 'Sign in',
    link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/select-org',
    footnote: 'This link works once and expires soon. If you didn’t try to sign in, ignore this email.',
  },
  email_change: {
    subject: 'Confirm your new email for RE',
    preheader: 'Confirm the change of email address on your RE account.',
    heading: 'Confirm your new email address',
    paragraphs: ['Someone asked to change the email address on a RE account to this one. Confirm it with the button below.'],
    cta: 'Confirm new email',
    footnote: 'If you didn’t ask for this change, ignore this email and tell your workspace administrator.',
  },
}

const build = (t) =>
  renderEmail({ preheader: t.preheader, heading: t.heading, paragraphs: t.paragraphs, cta: { label: t.cta, url: PLACEHOLDER }, footnote: t.footnote })
    .html.replaceAll(PLACEHOLDER, t.link ?? '{{ .ConfirmationURL }}')
    .replace(/© \d{4}/, '©') // templates are static: no year that goes stale

const check = process.argv.includes('--check')
let stale = []
for (const [name, t] of Object.entries(TEMPLATES)) {
  const file = path.join(root, 'supabase/templates', `${name}.html`)
  const html = build(t)
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) stale.push(name) }
  else fs.writeFileSync(file, html)
}
if (check && stale.length) { console.error(`Auth email templates out of date: ${stale.join(', ')}. Run node scripts/build-auth-email-templates.mjs`); process.exit(1) }
console.log(check ? 'Auth email templates up to date.' : `Wrote ${Object.keys(TEMPLATES).length} templates to supabase/templates/.`)
