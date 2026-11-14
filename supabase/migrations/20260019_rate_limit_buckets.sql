-- supabase/migrations/20260019_rate_limit_buckets.sql
-- Migration 0019: Distributed Rate Limiting Storage
-- Provides atomic fixed-window counters for Vercel serverless functions and multi-instance deployments.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key      TEXT NOT NULL,
  window_bucket   BIGINT NOT NULL,
  count           INTEGER NOT NULL DEFAULT 1,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_bucket)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_expires_at ON public.rate_limit_buckets(expires_at);

-- Atomic increment function for high-concurrency distributed rate limit consumption
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key TEXT,
  p_window_bucket BIGINT,
  p_window_ms BIGINT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_expires_at := to_timestamp((p_window_bucket + p_window_ms) / 1000.0);

  INSERT INTO public.rate_limit_buckets (bucket_key, window_bucket, count, expires_at)
  VALUES (p_key, p_window_bucket, 1, v_expires_at)
  ON CONFLICT (bucket_key, window_bucket)
  DO UPDATE SET
    count = rate_limit_buckets.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- Enable RLS and lock down permissions
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limit_buckets FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_buckets TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(TEXT, BIGINT, BIGINT) TO service_role;
