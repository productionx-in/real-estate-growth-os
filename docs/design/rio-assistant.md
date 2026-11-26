# Rio: RE’s guide, its AI providers and its memory

Rio is the parrot chat on the website, the sign-in pages and inside every workspace. On the website it acts as a
senior sales consultant, in workspaces it does technical support and customer success, and it hands over to a
person when it should. These files do the work:

| Part | File |
|---|---|
| Product knowledge (the only facts Rio may use) | `lib/support/knowledge.ts` |
| Rules, persona, link allowlist | `lib/support/ai.ts` |
| Claude / OpenAI / Gemini behind one interface | `lib/support/providers.ts` |
| Offline answers (no AI configured, or every provider down) | `lib/support/guide.ts` |
| Memory: storage, ratings, export | `lib/support/memory.ts`, migration `20260064` |
| Endpoints | `app/api/assistant`, `app/api/assistant/rate`, `app/api/platform/assistant/export` |
| Owner dashboard | Console → Administration → Rio insights (`/platform/assistant`) |

## Choosing the AI

Settings live in Vercel (`docs/operations/ENVIRONMENT.md`), so changing them needs no code change.

- Add a key for one or more providers: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`.
- OpenAI and Gemini also need a model name (`REGROW_MODEL_OPENAI`, `REGROW_MODEL_GEMINI`); nothing is assumed.
  For Claude the default is `claude-opus-5-5`, which `REGROW_MODEL_ANTHROPIC` overrides.
- `REGROW_ASSISTANT_PROVIDER` picks which provider is tried first. The others are tried in turn if it fails, and
  the offline guide answers if they all do.
- Every provider receives the same knowledge, rules and reply format, and the same checks run on the reply, so
  switching provider changes the voice, not what Rio is allowed to say.

## Memory: what is stored, for research and training

Each question and each answer is stored, whoever answered (any AI or the offline guide), together with:

- the provider, the model, the response time and the tokens used;
- whether Rio handed over to a person, and whether a callback was saved;
- the visitor's thumbs up or down, which is the quality label for training and for comparing models.

Privacy by design:

- **Text is redacted before it is written.** E-mails, phone numbers and any run of six or more digits (OTPs,
  account numbers) are masked. Callback details go to the Sales pipeline only, never into this memory.
- **No identity is stored.** There is no user id, organisation id or IP address. A workspace conversation keeps
  only a keyed one-way hash of the workspace (HMAC with `ENCRYPTION_KEY`).
- **Workspace conversations are never shown or exported.** Staff never read customer business data. Using them for
  training would need customers' consent in the Terms and Privacy Policy first; that decision rests with the owner
  and legal counsel.
- The chat tells people that conversations are saved to improve RE and asks them not to share passwords or
  payment details.
- The tables have row-level security on and no client grants. Only the Platform Owner can export, and every export
  is written to the platform audit log.

**Founder action:** add Rio's chat storage to the Privacy Policy (purpose: improving RE’s service and
assistant; retention period; contact for deletion requests) before relying on it at scale.

## Building RE’s own intelligence later

Storing conversations does not train a model by itself. It builds the labelled dataset you need to train one.

1. **Export.** Rio insights → Export (all, or only conversations rated 👍). The file is JSONL, one conversation per
   line in the standard chat format (`{"messages":[{"role":"system"…},{"role":"user"…},{"role":"assistant"…}],
   "metadata":{…}}`). Most fine-tuning tools, OpenAI's and open-source ones (for example for Llama or Mistral),
   accept this format with little or no change.
2. **Curate.** Keep the conversations rated 👍, fix or drop the 👎 ones, and add expert answers for common
   questions that went to a person.
3. **Train or fine-tune.** Fine-tune a hosted model, or fine-tune an open model you host yourself. Use
   `lib/support/knowledge.ts` as the system prompt or as retrieval documents, so the facts stay current without
   retraining.
4. **Plug it in.** Add the new model as another provider in `lib/support/providers.ts` (an OpenAI-compatible
   endpoint is a one-line change). It inherits the same rules, checks, memory and dashboard, and the existing
   ratings let you compare it against the current model before switching.
