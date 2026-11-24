-- Pilot-only additive receipt behavior. No historical rows/PDFs are rewritten.
BEGIN;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='3s';
CREATE FUNCTION private.pilot_receipt_slug(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT trim(BOTH '-' FROM regexp_replace(translate(left(coalesce(value,''),48),'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ','aaaeeeeiioouuucAAAEEEEIIOOUUUC'),'[^A-Za-z0-9]+','-','g'))
$$;
CREATE FUNCTION private.pilot_receipt_file_name(snapshot jsonb,version integer) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE day text;vendor text;operator text;number text;
BEGIN
 day=coalesce((nullif(snapshot#>>'{control,received_at}','')::timestamptz AT TIME ZONE 'Europe/Brussels')::date::text,nullif(snapshot#>>'{control,date}',''),'date-inconnue');
 vendor=coalesce(nullif(private.pilot_receipt_slug(snapshot->>'supplier_name'),''),'Fournisseur');operator=coalesce(nullif(private.pilot_receipt_slug(snapshot->>'operator_label'),''),'Operateur');number=private.pilot_receipt_slug(snapshot#>>'{control,number}');
 IF number~*'^BL-' THEN number=substring(number FROM 4);END IF;
 RETURN day||'_'||vendor||'_'||operator||CASE WHEN number<>'' THEN '_BL-'||number ELSE '' END||'_v'||version||'.pdf';
END $$;
REVOKE ALL ON FUNCTION private.pilot_receipt_slug(text),private.pilot_receipt_file_name(jsonb,integer) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE src text;needle text;
BEGIN
 src=pg_get_functiondef('public.pilot_receipt_controls(text,uuid,jsonb)'::regprocedure);
 needle=$n$v_data=p_payload->'control';$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CONTROL_INPUT_CHANGED';END IF;
 src=replace(src,needle,needle||$n$
 IF jsonb_typeof(coalesce(v_data->'containers','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(v_data->'containers','[]'))>100 THEN RAISE EXCEPTION 'CONTAINER_FORMAT' USING ERRCODE='22023';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(v_data->'containers','[]')) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR length(coalesce(item->>'description',''))>300 OR length(coalesce(item->>'supplier_reference',''))>100 OR coalesce(item->>'received_count','') !~ '^([0-9]{1,4})?$' OR coalesce(item->>'returned_count','') !~ '^([0-9]{1,4})?$' OR length(coalesce(item->>'observations',''))>1000 THEN RAISE EXCEPTION 'CONTAINER_COUNTS' USING ERRCODE='22023';END IF;
 END LOOP;
 $n$);
 needle=$n$'missing_lines',coalesce(v_data->'missing_lines','[]'),'lines',v_lines);$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CONTROL_CANONICAL_CHANGED';END IF;
 src=replace(src,needle,$n$'containers',coalesce(v_data->'containers','[]'),'missing_lines',coalesce(v_data->'missing_lines','[]'),'lines',v_lines);$n$);
 needle=$n$'supplier_reference',left(coalesce(item->>'supplier_reference',''),100)$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CONTROL_PRICES_CHANGED';END IF;
 src=replace(src,needle,needle||$n$,'unit_price',left(coalesce(item->>'unit_price',''),50),'line_total',left(coalesce(item->>'line_total',''),50),'deposit',left(coalesce(item->>'deposit',''),50),'tax',left(coalesce(item->>'tax',''),50),'basis',left(coalesce(item->>'basis',''),10),'currency',left(coalesce(item->>'currency',''),10)$n$);
 src=replace(src,'jsonb_array_length(v_data->''lines'')=0','(jsonb_array_length(v_data->''lines'')=0 AND jsonb_array_length(coalesce(v_data->''containers'',''[]''))=0)');
 needle=$n$v_data=v_doc.receipt_draft;$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CONTROL_PREPARE_CHANGED';END IF;
 src=replace(src,needle,needle||$n$
 IF EXISTS(SELECT FROM jsonb_object_keys(coalesce(v_doc.reading->'pending_rescans','{}'))) THEN RAISE EXCEPTION 'RESCAN_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
 $n$);
 needle=$n$'Controle-v'||v_job.version||'.pdf'$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'PDF_REGISTER_CHANGED';END IF;
 EXECUTE replace(src,needle,$n$private.pilot_receipt_file_name(v_job.snapshot,v_job.version)$n$);
 src=pg_get_functiondef('public.pilot_document_reading(text,uuid,jsonb)'::regprocedure);
 needle=$n$ELSIF p_action='catalogue' THEN$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CATALOGUE_SOURCE_CHANGED';END IF;
 src=replace(src,needle,needle||$n$
 IF p_payload ? 'selected_line_ids' THEN
  IF jsonb_typeof(p_payload->'selected_line_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'selected_line_ids') NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'CATALOGUE_SELECTION' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT FROM jsonb_array_elements(p_payload->'selected_line_ids') x WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(doc.reading->'lines') l WHERE to_jsonb(l->>'source_line_id')=x)) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(p_payload->'selected_line_ids') x)<>jsonb_array_length(p_payload->'selected_line_ids') THEN RAISE EXCEPTION 'CATALOGUE_SELECTED_LINE_UNKNOWN' USING ERRCODE='22023';END IF;
 END IF;
 $n$);
 needle=$n$IF item->>'confirm_catalogue' IS DISTINCT FROM 'true' OR item->>'type'<>'product' THEN CONTINUE;END IF;$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CATALOGUE_LOOP_CHANGED';END IF;
 src=replace(src,needle,needle||$n$
 IF p_payload ? 'selected_line_ids' AND NOT (p_payload->'selected_line_ids' @> jsonb_build_array(item->>'source_line_id')) THEN CONTINUE;END IF;
 $n$);
 needle=$n$coalesce(doc.reading->'lines','[]')$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'READING_CONTAINER_START_CHANGED';END IF;
 -- Only the start guard contains this exact coalesce; products remain the catalogue source.
 src=replace(src,needle,$n$(coalesce(doc.reading->'lines','[]') || coalesce(doc.reading->'containers','[]'))$n$);
 src=replace(src,'''temperature_relevant'',''conformity''','''temperature_relevant'',''temperature_category'',''reference_verified'',''conformity''');
 -- Price lookup and historical writes keep their original product/supplier/unit/basis guards.
 EXECUTE src;
END $patch$;
COMMIT;
