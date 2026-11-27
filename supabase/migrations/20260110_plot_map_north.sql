-- 20260110_plot_map_north.sql — the compass on a plot map: which way north points on the layout drawing, in degrees
-- clockwise from "up" (0 = north is up). Set per layout by the team; shown on the team map and the buyers' link.
ALTER TABLE public.plot_layouts
  ADD COLUMN IF NOT EXISTS north_deg SMALLINT NOT NULL DEFAULT 0 CHECK (north_deg >= 0 AND north_deg < 360);
