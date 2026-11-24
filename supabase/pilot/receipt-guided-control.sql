-- Pilot-only guided progress; existing receipts and PDF versions are not rewritten.
BEGIN;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='3s';
CREATE FUNCTION private.pilot_receipt_review_valid(item jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(item->'physical_reviewed'='true'::jsonb,false) AND jsonb_typeof(item->'physical_snapshot')='object' AND NOT EXISTS (
 SELECT FROM unnest(ARRAY['description','supplier_reference','quantity','unit','packaging_intact','quantity_diff','received_quantity','received_unit','temperature_relevant','temperature','observations','incident_kind']) key WHERE (item->'physical_snapshot'->>key) IS DISTINCT FROM coalesce(item->>key,''))
$$;
REVOKE ALL ON FUNCTION private.pilot_receipt_review_valid(jsonb) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE src text;needle text;
BEGIN
 src=pg_get_functiondef('public.pilot_receipt_controls(text,uuid,jsonb)'::regprocedure);
 needle=$n$'supplier_reference',left(coalesce(item->>'supplier_reference',''),100)$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'GUIDE_CONTROL_CANONICAL_CHANGED';END IF;
 src=replace(src,needle,needle||$n$,'incident_kind',left(coalesce(item->>'incident_kind',''),30),'physical_reviewed',private.pilot_receipt_review_valid(item),'physical_snapshot',coalesce(item->'physical_snapshot','{}'),'physical_checked_by',CASE WHEN private.pilot_receipt_review_valid(item) THEN coalesce((SELECT l->>'physical_checked_by' FROM jsonb_array_elements(coalesce(v_doc.receipt_draft->'lines','[]')) l WHERE l->>'source_line_id'=item->>'source_line_id' AND l->'physical_snapshot'=item->'physical_snapshot' LIMIT 1),v_actor::text) ELSE '' END,'physical_checked_at',CASE WHEN private.pilot_receipt_review_valid(item) THEN coalesce((SELECT l->>'physical_checked_at' FROM jsonb_array_elements(coalesce(v_doc.receipt_draft->'lines','[]')) l WHERE l->>'source_line_id'=item->>'source_line_id' AND l->'physical_snapshot'=item->'physical_snapshot' LIMIT 1),now()::text) ELSE '' END$n$);
 needle=$n$'kind',v_doc.kind,'supplier_id',coalesce(v_data->>'supplier_id','')$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'GUIDE_CONTROL_ROOT_CHANGED';END IF;
 src=replace(src,needle,$n$'workflow_version',coalesce(v_data->>'workflow_version',''),'kind',v_doc.kind,'supplier_id',coalesce(v_data->>'supplier_id','')$n$);
 needle=$n$v_data=v_doc.receipt_draft;$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'GUIDE_PREPARE_CHANGED';END IF;
 src=replace(src,needle,needle||$n$
 IF v_data->>'workflow_version'='guided1' AND EXISTS(SELECT FROM jsonb_array_elements(v_data->'lines') l WHERE l->>'type'='product' AND NOT coalesce(private.pilot_receipt_review_valid(l),false)) THEN RAISE EXCEPTION 'PHYSICAL_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
 $n$);
 EXECUTE src;
 src=pg_get_functiondef('public.pilot_document_reading(text,uuid,jsonb)'::regprocedure);
 needle=$n$'temperature_category','reference_verified','conformity'$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'GUIDE_MEMORY_SOURCE_CHANGED';END IF;
 src=replace(src,needle,$n$'temperature_category','reference_verified','physical_reviewed','physical_snapshot','physical_checked_by','physical_checked_at','incident_kind','source_geometry','source_sha256','conformity'$n$);
 EXECUTE src;
 src=pg_get_functiondef('public.pilot_documents(text,uuid,jsonb)'::regprocedure);
 needle=$n$'receipt_state',d.receipt_state,'completed_control_id'$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'GUIDE_LIST_SOURCE_CHANGED';END IF;
 src=replace(src,needle,$n$'receipt_state',d.receipt_state,'progress_summary',(SELECT jsonb_build_object('total',count(*),'checked',count(*) FILTER(WHERE private.pilot_receipt_review_valid(l) OR d.receipt_state IN ('complete','legacy_received')),'reading',count(*) FILTER(WHERE jsonb_array_length(coalesce(l->'uncertain_fields','[]'))>0)) FROM jsonb_array_elements(coalesce(d.reading->'lines',d.receipt_draft->'lines',d.payload->'lines','[]')) l WHERE l->>'type'='product'),'thumbnail_original',(SELECT to_jsonb(f) FROM public.pilot_document_files f WHERE f.document_id=d.id AND f.purpose='original' ORDER BY f.created_at,f.id LIMIT 1),'controller_label',(SELECT concat_ws(' ',p.prenom,p.nom) FROM public.profiles p WHERE p.id=d.received_by),'control_version',(SELECT max(v.version) FROM public.pilot_receipt_control_versions v WHERE v.document_id=d.id AND v.status IN ('completed','legacy')),'deviation_count',(SELECT count(*) FROM jsonb_array_elements(coalesce(d.receipt_draft->'lines',d.reading->'lines','[]')) l WHERE l->>'quantity_diff'='true' OR l->>'packaging_intact'='no' OR coalesce(l->>'incident_kind','')<>''),'completed_control_id'$n$);
 EXECUTE src;
END $patch$;
COMMIT;
