-- Pilot only. Future plans use the reviewed 1100 × 660 coordinate system.
-- No existing plan, table, booking, owner, policy or grant is changed.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $guard$
DECLARE w text; h text; before_rows text; after_rows text;
BEGIN
  LOCK TABLE public.reservation_layouts IN ACCESS EXCLUSIVE MODE;
  SELECT pg_get_expr(d.adbin,d.adrelid) INTO w FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='public.reservation_layouts'::regclass AND a.attname='width';
  SELECT pg_get_expr(d.adbin,d.adrelid) INTO h FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='public.reservation_layouts'::regclass AND a.attname='height';
  IF NOT ((w='1000' AND h='700') OR (w='1100' AND h='660')) OR w IS NULL OR h IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLAN_DEFAULTS_UNEXPECTED'; END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY id)::text,'')) INTO before_rows FROM public.reservation_layouts l;
  ALTER TABLE public.reservation_layouts ALTER COLUMN width SET DEFAULT 1100;
  ALTER TABLE public.reservation_layouts ALTER COLUMN height SET DEFAULT 660;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY id)::text,'')) INTO after_rows FROM public.reservation_layouts l;
  IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='EXISTING_PLANS_CHANGED'; END IF;
END $guard$;
COMMIT;
