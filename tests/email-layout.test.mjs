// tests/email-layout.test.mjs — branded email rendering: escaping, safe links, text version, template drift.
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { renderEmail, invitationEmail, escapeHtml } = await jiti.import(path.join(root, 'lib/email/layout.ts'))
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('BRANDED EMAIL')
test('names and organisation names typed by users cannot inject markup or links', () => {
  const e = invitationEmail({
    orgName: '<a href="https://evil.example">Click</a>', role: 'sales_exec',
    inviteUrl: 'https://app.regrow.in/invite/abc', inviterName: '<img src=x onerror=alert(1)>Mallory',
  })
  assert.ok(!e.html.includes('<a href="https://evil.example">'), 'org name escaped')
  assert.ok(!e.html.includes('<img src=x'), 'inviter escaped')
  assert.ok(e.html.includes('&lt;a href=&quot;https://evil.example&quot;&gt;'))
  assert.equal((e.html.match(/<a href=/g) ?? []).length, 2, 'only the button and its fallback link')
})
test('only http(s) links can become buttons', () => {
  assert.throws(() => renderEmail({ preheader: 'p', heading: 'h', paragraphs: [], cta: { label: 'x', url: 'javascript:alert(1)' } }))
  assert.throws(() => renderEmail({ preheader: 'p', heading: 'h', paragraphs: [], cta: { label: 'x', url: 'data:text/html,hi' } }))
})
test('the invitation names the role in words and has a plain-text version with the link', () => {
  const e = invitationEmail({ orgName: 'Skyline Developers', role: 'sales_exec', inviteUrl: 'https://app.regrow.in/invite/abc', inviterName: 'Kiran' })
  assert.equal(e.subject, 'Kiran invited you to Skyline Developers on REGrow')
  assert.ok(e.html.includes('a sales executive'))
  assert.ok(e.text.includes('Accept invitation: https://app.regrow.in/invite/abc'))
  assert.ok(!e.text.includes('**'))
})
test('**bold** is the only formatting interpreted', () => {
  const { html } = renderEmail({ preheader: 'p', heading: 'h', paragraphs: ['**yes** <b>no</b>'] })
  assert.ok(html.includes('<strong>yes</strong> &lt;b&gt;no&lt;/b&gt;'))
  assert.equal(escapeHtml(`"'&<>`), '&quot;&#39;&amp;&lt;&gt;')
})
test('committed Supabase auth templates match the current layout', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-auth-email-templates.mjs'), '--check'], { stdio: 'pipe' })
})
console.log(`\nBranded email: ${passed} checks passed.`)
