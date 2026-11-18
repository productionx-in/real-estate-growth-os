// components/integrations/DeveloperApiDocsModal.tsx
// Developer Documentation & Outbound Webhook Verification Modal.
'use client'

import { useState } from 'react'
import {
  X,
  Code,
  Copy,
  Check,
  ShieldCheck,
  Webhook,
  Key,
} from 'lucide-react'

interface DeveloperApiDocsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DeveloperApiDocsModal({ isOpen, onClose }: DeveloperApiDocsModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'webhooks' | 'verify'>('api')
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(id)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const sampleCurl = `curl -X POST https://api.productionx.in/api/v1/leads \\
  -H "Authorization: Bearer px_live_998877665544332211" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Kiran Varma",
    "phone": "+919849012345",
    "email": "kiran.v@gmail.com",
    "projectId": "proj_skygardens_01",
    "notes": "Looking for 3BHK flat on upper floor"
  }'`

  const nodeVerificationSnippet = `import crypto from 'node:crypto';

// Express / Next.js webhook route handler
export function verifySignature(rawBody, signatureHeader, timestampHeader, secret) {
  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);

  // Replay defense (5 minute window)
  if (Math.abs(now - timestamp) > 300) return false;

  const signedData = \`\${timestamp}.\${rawBody}\`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedData);
  const expectedSig = 'sha256=' + hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expectedSig)
  );
}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="bg-surface rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-default">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-default bg-surface-muted/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-accent-bg text-accent flex items-center justify-center shadow-2xs">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Developer APIs &amp; Outbound Webhooks</h3>
              <p className="text-xs text-subtle">Programmatic REST API v1 &amp; Cryptographic Event Webhooks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-subtle hover:text-muted rounded-lg hover:bg-surface-hover transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-default bg-surface-muted/30 px-5 pt-3 space-x-2">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition border-t border-x flex items-center space-x-1.5 ${
              activeTab === 'api'
                ? 'bg-surface text-accent border-default border-b-white -mb-px shadow-2xs'
                : 'bg-transparent text-subtle border-transparent hover:text-foreground'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Developer REST API</span>
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition border-t border-x flex items-center space-x-1.5 ${
              activeTab === 'webhooks'
                ? 'bg-surface text-accent border-default border-b-white -mb-px shadow-2xs'
                : 'bg-transparent text-subtle border-transparent hover:text-foreground'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Outbound Webhooks</span>
          </button>
          <button
            onClick={() => setActiveTab('verify')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition border-t border-x flex items-center space-x-1.5 ${
              activeTab === 'verify'
                ? 'bg-surface text-accent border-default border-b-white -mb-px shadow-2xs'
                : 'bg-transparent text-subtle border-transparent hover:text-foreground'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>HMAC Verification Snippet</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="bg-accent-bg border border-accent-border rounded-xl p-4">
                <h4 className="font-semibold text-accent text-xs uppercase tracking-wider mb-1">
                  API Key Authentication
                </h4>
                <p className="text-xs text-accent leading-relaxed">
                  Authenticate server-to-server requests using Bearer tokens in the format{' '}
                  <code className="bg-accent-bg px-1 py-0.5 rounded font-mono text-[11px]">
                    Authorization: Bearer px_live_...
                  </code>
                  . Keys are hashed using SHA-256 for vault security.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">
                  Available REST Endpoints
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="bg-surface-muted p-3 rounded-xl border border-default flex justify-between items-center">
                    <span className="font-mono text-success font-bold">GET /api/v1/projects</span>
                    <span className="text-subtle">List all active projects &amp; categories</span>
                  </div>
                  <div className="bg-surface-muted p-3 rounded-xl border border-default flex justify-between items-center">
                    <span className="font-mono text-success font-bold">GET /api/v1/inventory</span>
                    <span className="text-subtle">Query units by project, category &amp; status</span>
                  </div>
                  <div className="bg-surface-muted p-3 rounded-xl border border-default flex justify-between items-center">
                    <span className="font-mono text-brand font-bold">POST /api/v1/leads</span>
                    <span className="text-subtle">Programmatic lead submission with deduplication</span>
                  </div>
                  <div className="bg-surface-muted p-3 rounded-xl border border-default flex justify-between items-center">
                    <span className="font-mono text-success font-bold">GET /api/v1/leads</span>
                    <span className="text-subtle">Query leads with pagination</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
                    Example cURL Request
                  </span>
                  <button
                    onClick={() => handleCopy(sampleCurl, 'curl')}
                    className="text-xs text-muted hover:text-foreground flex items-center space-x-1"
                  >
                    {copiedIndex === 'curl' ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedIndex === 'curl' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="bg-foreground text-gray-100 p-3.5 rounded-xl text-xs font-mono overflow-x-auto">
                  {sampleCurl}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div className="space-y-4">
              <div className="bg-brand-light/60 border border-brand/30 rounded-xl p-4">
                <h4 className="font-semibold text-brand text-xs uppercase tracking-wider mb-1">
                  Real-time Outbound Webhook Subscriptions
                </h4>
                <p className="text-xs text-brand leading-relaxed">
                  Configure HTTPS webhook endpoints to receive push notifications when critical CRM events occur. Each payload is signed with HMAC-SHA256.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">
                  Supported Event Types
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-surface-muted rounded-lg border border-default">
                    <p className="font-mono font-bold text-foreground">lead.created</p>
                    <p className="text-subtle text-[11px]">Dispatched when a new buyer enquiry is captured</p>
                  </div>
                  <div className="p-2.5 bg-surface-muted rounded-lg border border-default">
                    <p className="font-mono font-bold text-foreground">lead.status_changed</p>
                    <p className="text-subtle text-[11px]">Dispatched when lead moves to contact, site visit, etc.</p>
                  </div>
                  <div className="p-2.5 bg-surface-muted rounded-lg border border-default">
                    <p className="font-mono font-bold text-foreground">inventory.status_changed</p>
                    <p className="text-subtle text-[11px]">Dispatched when a unit is booked, blocked, or sold</p>
                  </div>
                  <div className="p-2.5 bg-surface-muted rounded-lg border border-default">
                    <p className="font-mono font-bold text-foreground">booking.created</p>
                    <p className="text-subtle text-[11px]">Dispatched when a sales booking is executed</p>
                  </div>
                </div>
              </div>

              <div className="bg-surface-muted rounded-xl p-4 border border-default space-y-2 text-xs">
                <h4 className="font-semibold text-foreground">Outbound HTTP Headers Sent</h4>
                <ul className="space-y-1 text-muted font-mono text-[11px]">
                  <li><span className="font-bold text-foreground">x-px-signature-256:</span> sha256=&lt;hmac_hex&gt;</li>
                  <li><span className="font-bold text-foreground">x-px-timestamp:</span> &lt;unix_epoch_seconds&gt;</li>
                  <li><span className="font-bold text-foreground">x-px-event:</span> &lt;event_type&gt;</li>
                  <li><span className="font-bold text-foreground">Content-Type:</span> application/json</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'verify' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-foreground text-xs uppercase tracking-wider">
                  Node.js / TypeScript Verification Snippet
                </span>
                <button
                  onClick={() => handleCopy(nodeVerificationSnippet, 'node')}
                  className="text-xs text-muted hover:text-foreground flex items-center space-x-1"
                >
                  {copiedIndex === 'node' ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedIndex === 'node' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="bg-foreground text-gray-100 p-3.5 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                {nodeVerificationSnippet}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-default bg-surface-muted/50 flex justify-between items-center text-xs">
          <div className="flex items-center space-x-1 text-subtle">
            <ShieldCheck className="w-4 h-4 text-success" />
            <span>SHA-256 Hashed Keys &bull; HMAC Replay Defense</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-hover hover:bg-strong text-foreground rounded-xl font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
