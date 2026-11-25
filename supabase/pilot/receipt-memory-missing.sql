-- Pilot: explicit missing control, calculation provenance and verified supplier contacts.
-- No existing document, price, plan or permission is rewritten.
BEGIN;
SET LOCAL statement_timeout='25s'; SET LOCAL lock_timeout='3s';
CREATE FUNCTION private.pilot_receipt_missing(item jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(item->>'incident_kind'='missing' AND item->>'quantity_diff'='true' AND coalesce(item->>'received_quantity','')~'^0([.,]0+)?$',false)
$$;
REVOKE ALL ON FUNCTION private.pilot_receipt_missing(jsonb) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE src text;needle text;
BEGIN
 src=pg_get_functiondef('public.pilot_receipt_controls(text,uuid,jsonb)'::regprocedure);
 needle=$n$IF coalesce(item->>'packaging_intact','') NOT IN ('yes','no') THEN$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_PACKAGING_SOURCE_CHANGED';END IF;
 src=replace(src,needle,$n$IF NOT private.pilot_receipt_missing(item) AND coalesce(item->>'packaging_intact','') NOT IN ('yes','no') THEN$n$);
 needle=$n$IF coalesce(item->>'packaging_intact','') NOT IN ('','yes','no')$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_CONTROL_VALUES_CHANGED';END IF;
 src=replace(src,needle,$n$IF item->>'incident_kind'='missing' AND (NOT private.pilot_receipt_missing(item) OR item->>'temperature_relevant'='true' OR coalesce(item->>'temperature','')<>'' OR item->>'conformity' IS DISTINCT FROM 'no' OR item->>'quantity_confirmed_same'='true') THEN RAISE EXCEPTION 'MISSING_CONTROL_VALUES' USING ERRCODE='23514';END IF;
 IF coalesce(item->>'packaging_intact','') NOT IN ('','yes','no')$n$);
 needle=$n$'unit_price',left(coalesce(item->>'unit_price',''),50)$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_PRICE_CANONICAL_CHANGED';END IF;
 src=replace(src,needle,needle||$n$,'pack_unit',left(coalesce(item->>'pack_unit',item->>'unit',''),32),'pack_quantity',left(coalesce(item->>'pack_quantity',''),30),'price_derivation',CASE WHEN jsonb_typeof(item->'price_derivation')='object' AND octet_length((item->'price_derivation')::text)<1500 THEN item->'price_derivation' ELSE NULL END$n$);
 EXECUTE src;
 src=pg_get_functiondef('public.pilot_operations(text,uuid,jsonb)'::regprocedure);
 needle=$n$PERFORM private.pilot_set_supplier_scopes(vendor.id,dep,p_payload->'departments');$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_SUPPLIER_SOURCE_CHANGED';END IF;
 src=replace(src,needle,$n$
 IF p_payload ? 'contact_details' THEN
  IF jsonb_typeof(p_payload->'contact_details') IS DISTINCT FROM 'object' OR octet_length((p_payload->'contact_details')::text)>3000 OR EXISTS(SELECT FROM jsonb_each_text(p_payload->'contact_details') e WHERE e.key NOT IN ('email','phone','address','vat_number','contact_name') OR length(e.value)>500) OR (coalesce(p_payload#>>'{contact_details,email}','')<>'' AND p_payload#>>'{contact_details,email}' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'SUPPLIER_CONTACT_FIELDS' USING ERRCODE='22023';END IF;
  UPDATE public.suppliers SET email=CASE WHEN p_payload->'contact_details'?'email' THEN btrim(p_payload#>>'{contact_details,email}') ELSE email END,phone=CASE WHEN p_payload->'contact_details'?'phone' THEN btrim(p_payload#>>'{contact_details,phone}') ELSE phone END,address=CASE WHEN p_payload->'contact_details'?'address' THEN btrim(p_payload#>>'{contact_details,address}') ELSE address END,vat_number=CASE WHEN p_payload->'contact_details'?'vat_number' THEN btrim(p_payload#>>'{contact_details,vat_number}') ELSE vat_number END,contact_name=CASE WHEN p_payload->'contact_details'?'contact_name' THEN btrim(p_payload#>>'{contact_details,contact_name}') ELSE contact_name END WHERE id=vendor.id RETURNING * INTO vendor;
 END IF;
 $n$||needle);
 needle=$n$'version',s.pilot_version,'departments'$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_SUPPLIER_CONTEXT_CHANGED';END IF;
 src=replace(src,needle,$n$'email',s.email,'phone',s.phone,'address',s.address,'vat_number',s.vat_number,'contact_name',s.contact_name,'version',s.pilot_version,'departments'$n$);
 EXECUTE src;
 src=pg_get_functiondef('public.pilot_document_reading(text,uuid,jsonb)'::regprocedure);
 needle=$n$'incident_kind','source_geometry'$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_HUMAN_COMPARISON_CHANGED';END IF;
 src=replace(src,needle,$n$'incident_kind','missing_restore','source_geometry'$n$);
 needle=$n$IF item->>'confirm_price'='true' THEN$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_PRICE_GUARD_CHANGED';END IF;
 src=replace(src,needle,needle||$n$
 IF coalesce(item->>'quantity','')~'^0+([.,]0+)?$' THEN RAISE EXCEPTION 'PRICE_QUANTITY_ZERO' USING ERRCODE='23514';END IF;$n$);
 needle=$n$ELSIF p_action='catalogue' THEN$n$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'MEMORY_READING_SOURCE_CHANGED';END IF;
 src=replace(src,needle,$n$ELSIF p_action='supplier' THEN
  IF doc.receipt_state IN ('complete','legacy_received') THEN RAISE EXCEPTION 'SUPPLIER_CONTROL_CORRECTION_REQUIRED' USING ERRCODE='40001';END IF;
  result=public.pilot_operations('supplier',gen_random_uuid(),(p_payload->'vendor')||jsonb_build_object('department',dep));
  data=jsonb_set(doc.reading,'{supplier_id}',result->'id');
  PERFORM public.pilot_document_reading('save',gen_random_uuid(),jsonb_build_object('department',dep,'id',did,'version',doc.revision,'reading',data));
  result=private.pilot_receipt_view(did);
 ELSIF p_action='catalogue' THEN$n$);
 EXECUTE src;
END $patch$;
COMMIT;
