BEGIN;
SET LOCAL statement_timeout='20s';SET LOCAL lock_timeout='3s';
DO $guard$
DECLARE source text;needle text=$n$ELSIF p_action='catalogue' THEN$n$;
BEGIN
 source=pg_get_functiondef('public.pilot_document_reading(text,uuid,jsonb)'::regprocedure);
 IF position(needle IN source)=0 OR position('LEGACY_CATALOGUE_ALREADY_APPLIED' IN source)>0 THEN RAISE EXCEPTION 'READING_SOURCE_DIFFERENT';END IF;
 EXECUTE replace(source,needle,needle||$n$
 IF doc.phase='applied' THEN RAISE EXCEPTION 'LEGACY_CATALOGUE_ALREADY_APPLIED' USING ERRCODE='23514';END IF;
 $n$);
END $guard$;
COMMIT;
