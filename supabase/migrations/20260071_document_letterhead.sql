-- 20260071_document_letterhead.sql
-- Documents carry the company's own details (letterhead, signatory, bank account for payments).
--   * org_business_profiles: one row per organisation, edited by owners and admins (enforced in the API).
--     Server-only, like document_templates (20260052): RLS on, no client privileges or policies.
--   * document_templates.letterhead: whether documents from this template carry the letterhead.
--   * document_templates.kind: adds booking confirmation, allotment letter and payment demand.
--   * lead_documents.letterhead: a frozen copy of the details used, so a later change of address or GSTIN never
--     rewrites a document a buyer was already sent (same rule as the frozen body).
--   * lead_documents.edited: the salesperson changed the filled-in text before sharing it.
-- Additive only: existing templates and documents keep working unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_business_profiles (
  org_id              UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  legal_name          TEXT CHECK (legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 1 AND 160),
  address             TEXT CHECK (address IS NULL OR char_length(address) <= 400),
  city                TEXT CHECK (city IS NULL OR char_length(city) <= 80),
  state               TEXT CHECK (state IS NULL OR char_length(state) <= 80),
  pincode             TEXT CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$'),
  gstin               TEXT CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan                 TEXT CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  rera_number         TEXT CHECK (rera_number IS NULL OR char_length(rera_number) <= 80),
  phone               TEXT CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{6,24}$'),
  email               TEXT CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website             TEXT CHECK (website IS NULL OR (website ~ '^https?://' AND char_length(website) <= 200)),
  logo_url            TEXT CHECK (logo_url IS NULL OR (logo_url ~ '^https://' AND char_length(logo_url) <= 500)),
  signatory_name      TEXT CHECK (signatory_name IS NULL OR char_length(signatory_name) <= 80),
  signatory_title     TEXT CHECK (signatory_title IS NULL OR char_length(signatory_title) <= 80),
  bank_account_name   TEXT CHECK (bank_account_name IS NULL OR char_length(bank_account_name) <= 120),
  bank_name           TEXT CHECK (bank_name IS NULL OR char_length(bank_name) <= 120),
  bank_account_number TEXT CHECK (bank_account_number IS NULL OR bank_account_number ~ '^[0-9]{6,20}$'),
  bank_ifsc           TEXT CHECK (bank_ifsc IS NULL OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  footer_note         TEXT CHECK (footer_note IS NULL OR char_length(footer_note) <= 500),
  updated_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_business_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_business_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_business_profiles TO service_role;

ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS letterhead BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.document_templates DROP CONSTRAINT IF EXISTS document_templates_kind_check;
ALTER TABLE public.document_templates ADD CONSTRAINT document_templates_kind_check
  CHECK (kind IN ('cost_sheet', 'quotation', 'booking', 'allotment', 'demand', 'letter', 'other'));

ALTER TABLE public.lead_documents
  ADD COLUMN IF NOT EXISTS letterhead JSONB CHECK (letterhead IS NULL OR jsonb_typeof(letterhead) = 'object'),
  ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false;

COMMIT;
