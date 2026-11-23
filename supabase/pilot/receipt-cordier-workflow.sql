-- Only the pilot receipt workflow. No document/catalogue data rewrite.
BEGIN;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='3s';
DO $patch$
DECLARE source text;needle text;
BEGIN
 source=pg_get_functiondef('public.pilot_receipt_controls(text,uuid,jsonb)'::regprocedure);
 needle=$n$v_data=p_payload->'control';$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'CONTROL_INPUT_CHANGED';END IF;
 source=replace(source,needle,needle||$n$
 IF jsonb_typeof(coalesce(v_data->'missing_lines','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(v_data->'missing_lines','[]'))>300 THEN RAISE EXCEPTION 'MISSING_LINES_FORMAT' USING ERRCODE='22023';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(v_data->'missing_lines','[]')) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR length(coalesce(item->>'description',''))>300 OR length(coalesce(item->>'supplier_reference',''))>100 THEN RAISE EXCEPTION 'MISSING_LINE_VALUES' USING ERRCODE='22023';END IF;
 END LOOP;
 $n$);
 needle=$n$'lines',v_lines);$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'CONTROL_CANONICAL_CHANGED';END IF;
 source=replace(source,needle,$n$'missing_lines',coalesce(v_data->'missing_lines','[]'),'lines',v_lines);$n$);
 needle=$n$IF item->>'type'='product' THEN$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'DELIVERY_PREPARE_CHANGED';END IF;
 EXECUTE replace(source,needle,needle||$n$
 IF coalesce(item->'uncertain_fields','[]') ? 'reread_unmatched' THEN RAISE EXCEPTION 'READING_ROW_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;$n$);
 source=pg_get_functiondef('public.pilot_document_reading(text,uuid,jsonb)'::regprocedure);
 needle=$n$ARRAY['received_quantity','received_unit','temperature','temperature_relevant','conformity','observations']$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'MEMORY_COMPARISON_CHANGED';END IF;
 -- Human control changes must not invalidate a previously confirmed catalogue memory.
 source=replace(source,needle,$n$ARRAY['received_quantity','received_unit','temperature','temperature_relevant','conformity','observations','packaging_intact','quantity_diff','quantity_confirmed_same','catalogue_choice','catalogue_product','corrected_fields','source_rows','uncertain_fields','review_required','confirm_price','confirm_catalogue','create_product','product_id']$n$);
 needle=$n$IF mem.document_id IS NOT NULL THEN IF$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'MEMORY_SOURCE_CHANGED';END IF;
 source=replace(source,needle,$n$IF mem.document_id IS NOT NULL THEN
 IF nullif(item->>'product_id','') IS NOT NULL AND NOT EXISTS(SELECT FROM public.pilot_product_offers o WHERE o.id=mem.offer_id AND o.product_id=(item->>'product_id')::uuid) THEN RAISE EXCEPTION 'MEMORY_PRODUCT_CHANGED' USING ERRCODE='40001';END IF;
 IF$n$);
 needle=$n$END IF;CONTINUE;END IF;$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'MEMORY_REPLAY_CHANGED';END IF;
 source=replace(source,needle,$n$END IF;IF item->>'confirm_price' IS DISTINCT FROM 'true' OR EXISTS(SELECT FROM public.pilot_price_history ph WHERE ph.document_id=did AND ph.source_line_id=lineid) THEN CONTINUE;END IF;END IF;$n$);
 needle=$n$VALUES(did,lineid,offer.id,actor,item);$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'MEMORY_INSERT_CHANGED';END IF;
 source=replace(source,needle,$n$VALUES(did,lineid,offer.id,actor,item) ON CONFLICT(document_id,source_line_id) DO NOTHING;$n$);
 source=replace(source,'price.price_date>offer.price_date','price.price_date>=offer.price_date');
 EXECUTE source;
 source=pg_get_functiondef('public.pilot_documents(text,uuid,jsonb)'::regprocedure);
 needle=$n$jsonb_build_object('supplier_candidate',coalesce(d.reading->>'supplier_candidate',''),'receipt_state',d.receipt_state$n$;
 IF position(needle IN source)=0 THEN RAISE EXCEPTION 'DOCUMENT_LIST_CHANGED';END IF;
 EXECUTE replace(source,needle,$n$jsonb_build_object('search_articles',coalesce((SELECT jsonb_agg(coalesce(l->>'supplier_reference','')||' '||coalesce(l->>'description','')) FROM jsonb_array_elements(coalesce(d.reading->'lines',d.receipt_draft->'lines',d.payload->'lines','[]')||coalesce(d.reading->'missing_lines','[]')) l),'[]'),'supplier_candidate',coalesce(d.reading->>'supplier_candidate',''),'receipt_state',d.receipt_state$n$);
END $patch$;
COMMIT;
