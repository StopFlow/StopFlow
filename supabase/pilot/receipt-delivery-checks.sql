-- Targeted control additions; no historical document or catalogue rewrite.
BEGIN;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='3s';
DO $patch$
DECLARE source text;needle text;
BEGIN
 source=pg_get_functiondef('public.pilot_receipt_controls(text,uuid,jsonb)'::regprocedure);
 needle=$n$'supplier_reference',left(coalesce(item->>'supplier_reference',''),100)$n$;
 IF position(needle IN source)=0 OR position('packaging_intact' IN source)>0 THEN RAISE EXCEPTION 'CONTROL_SOURCE_CHANGED';END IF;
 source=replace(source,needle,needle||$n$,'packaging_intact',coalesce(item->>'packaging_intact',''),'quantity_diff',coalesce((item->>'quantity_diff')::boolean,false),'quantity_confirmed_same',coalesce((item->>'quantity_confirmed_same')::boolean,false)$n$);
 needle=$n$FOR item IN SELECT value FROM jsonb_array_elements(v_data->'lines') LOOP$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'CONTROL_LOOP_CHANGED';END IF;
 source=replace(source,needle,needle||$n$
 IF coalesce(item->>'packaging_intact','') NOT IN ('','yes','no') OR (item ? 'quantity_diff' AND jsonb_typeof(item->'quantity_diff') IS DISTINCT FROM 'boolean') OR (item ? 'quantity_confirmed_same' AND jsonb_typeof(item->'quantity_confirmed_same') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'DELIVERY_CHECK_VALUES' USING ERRCODE='22023';END IF;
 $n$);
 needle=$n$SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id) INTO v_orig$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'CONTROL_PREPARE_CHANGED';END IF;
 source=replace(source,needle,$n$
 FOR item IN SELECT value FROM jsonb_array_elements(v_data->'lines') LOOP
 IF item->>'type'='product' THEN
  IF coalesce(item->>'packaging_intact','') NOT IN ('yes','no') THEN RAISE EXCEPTION 'PACKAGING_HUMAN_REQUIRED' USING ERRCODE='23514';END IF;
  IF item->>'packaging_intact'='no' AND (length(btrim(coalesce(item->>'observations','')))=0 OR item->>'conformity' IS DISTINCT FROM 'no') THEN RAISE EXCEPTION 'DAMAGED_PACKAGING_OBSERVATION' USING ERRCODE='23514';END IF;
  IF item->>'quantity_confirmed_same'='true' THEN
   IF item->>'quantity_diff'='true' OR coalesce(item->>'quantity','') !~ '^[0-9]{1,7}([.,][0-9]{1,3})?$' THEN RAISE EXCEPTION 'QUANTITY_HUMAN_CONFIRMATION' USING ERRCODE='23514';END IF;
   IF replace(item->>'quantity',',','.')::numeric IS DISTINCT FROM replace(item->>'received_quantity',',','.')::numeric THEN RAISE EXCEPTION 'QUANTITY_SAME_MISMATCH' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 END LOOP;
 $n$||needle);
 EXECUTE source;
 source=pg_get_functiondef('public.pilot_document_reading(text,uuid,jsonb)'::regprocedure);
 needle=$n$ELSIF p_action='start' THEN$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'READING_START_CHANGED';END IF;
 source=replace(source,needle,needle||$n$
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(coalesce(doc.reading->'lines','[]')) l WHERE length(btrim(coalesce(l->>'description',l->>'supplier_reference','')))>0) OR coalesce(doc.reading->'reading_result'->>'status','success') NOT IN ('success','partial') THEN RAISE EXCEPTION 'READING_PRODUCTS_REQUIRED' USING ERRCODE='23514';END IF;
 $n$);
 EXECUTE source;
 source=pg_get_functiondef('public.pilot_documents(text,uuid,jsonb)'::regprocedure);
 needle=$n$jsonb_build_object('receipt_state',d.receipt_state$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'DOCUMENT_LIST_CHANGED';END IF;
 EXECUTE replace(source,needle,$n$jsonb_build_object('supplier_candidate',coalesce(d.reading->>'supplier_candidate',''),'receipt_state',d.receipt_state$n$);
END $patch$;
COMMIT;
