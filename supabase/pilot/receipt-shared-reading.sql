-- One reviewed reading reused by reception/control/catalogue. Originals and snapshots are immutable.
BEGIN;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='3s';
ALTER TABLE public.pilot_trade_documents ADD COLUMN reading jsonb;
ALTER TABLE public.pilot_price_history ADD COLUMN source_line_id uuid;
CREATE UNIQUE INDEX pilot_price_source_line ON public.pilot_price_history(document_id,source_line_id) WHERE source_line_id IS NOT NULL;
CREATE TABLE private.pilot_catalogue_memories(document_id uuid NOT NULL REFERENCES public.pilot_trade_documents(id),source_line_id uuid NOT NULL,offer_id uuid NOT NULL REFERENCES public.pilot_product_offers(id),actor uuid NOT NULL REFERENCES public.profiles(id),snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,source_line_id));
ALTER TABLE private.pilot_catalogue_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.pilot_catalogue_memories FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE src text;needle text;
BEGIN
 src=pg_get_functiondef('public.pilot_receipt_controls(text,uuid,jsonb)'::regprocedure);
 needle='coalesce(v_doc.receipt_draft,v_doc.payload)';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CONTROL_SOURCE_CHANGED';END IF;
 src=replace(src,needle,'coalesce(v_doc.receipt_draft,v_doc.reading,v_doc.payload)');
 needle=$n$'supplier_reference',left(coalesce(item->>'supplier_reference',''),100)$n$;IF position(needle IN src)=0 THEN RAISE EXCEPTION 'CONTROL_LINE_SOURCE_CHANGED';END IF;
 src=replace(src,needle,needle||$n$,'source_line_id',item->>'source_line_id','quantity',coalesce(item->>'quantity',''),'unit',coalesce(item->>'unit',''),'source_page',item->'source_page','uncertain_fields',coalesce(item->'uncertain_fields','[]'::jsonb)$n$);EXECUTE src;
 src=pg_get_functiondef('public.pilot_documents(text,uuid,jsonb)'::regprocedure);needle=$n$IF p_action='receive' THEN$n$;IF position(needle IN src)=0 THEN RAISE EXCEPTION 'DOCUMENT_SOURCE_CHANGED';END IF;
 src=replace(src,needle,$n$IF p_action='apply' AND EXISTS(SELECT FROM public.pilot_trade_documents x WHERE x.id=(p_payload->>'id')::uuid AND x.reading IS NOT NULL) THEN RAISE EXCEPTION 'USE_REVIEWED_SHARED_READING' USING ERRCODE='23514';END IF;
 IF p_action='receive' THEN$n$);EXECUTE src;
END $patch$;
CREATE FUNCTION public.pilot_document_reading(p_action text,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid=auth.uid();dep text=p_payload->>'department';did uuid=(p_payload->>'id')::uuid;doc public.pilot_trade_documents;prev private.pilot_operation_intents;data jsonb;item jsonb;items jsonb='[]';result jsonb;lineid uuid;seen uuid[]='{}';vendor public.suppliers;prod public.pilot_products;offer public.pilot_product_offers;mem private.pilot_catalogue_memories;price public.pilot_price_history;amount numeric;pack numeric;unit text;counter integer;created integer=0;prices integer=0;
BEGIN
 IF actor IS NULL OR NOT private.is_active_user() OR dep NOT IN ('cuisine','salle') OR dep IS NULL OR octet_length(p_payload::text)>500000 OR NOT private.pilot_document_access(did,p_action<>'read') THEN RAISE EXCEPTION 'READING_ACCESS' USING ERRCODE='42501';END IF;
 SELECT * INTO doc FROM public.pilot_trade_documents WHERE id=did FOR UPDATE;
 IF NOT dep=ANY(doc.departments) THEN RAISE EXCEPTION 'READING_DEPARTMENT' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN RETURN private.pilot_receipt_view(did);END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'REQUEST_REQUIRED' USING ERRCODE='22023';END IF;
 SELECT * INTO prev FROM private.pilot_operation_intents WHERE id=p_request;
 IF prev.id IS NOT NULL THEN IF prev.actor<>actor OR prev.action<>'reading_'||p_action OR prev.payload<>p_payload THEN RAISE EXCEPTION 'REQUEST_PAYLOAD_CHANGED' USING ERRCODE='22023';END IF;RETURN prev.result;END IF;
 IF doc.revision IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'READING_VERSION' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT FROM public.pilot_document_files f JOIN storage.objects o ON o.bucket_id='pilot-receipts-private' AND o.name=f.path WHERE f.document_id=did AND f.purpose='original') THEN RAISE EXCEPTION 'READING_ORIGINAL_REQUIRED' USING ERRCODE='23514';END IF;
 IF p_action='save' THEN
 data=p_payload->'reading';IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR jsonb_typeof(data->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'lines')>300 OR jsonb_array_length(coalesce(data->'pages','[]'))>20 THEN RAISE EXCEPTION 'READING_FORMAT' USING ERRCODE='22023';END IF;
 IF nullif(data->>'supplier_id','') IS NOT NULL AND NOT EXISTS(SELECT FROM public.suppliers s WHERE s.id=(data->>'supplier_id')::uuid AND s.active AND NOT EXISTS(SELECT FROM unnest(doc.departments) d WHERE NOT private.pilot_supplier_in_department(s.id,d))) THEN RAISE EXCEPTION 'READING_SUPPLIER' USING ERRCODE='42501';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(data->'lines') LOOP
  lineid=coalesce(nullif(item->>'source_line_id','')::uuid,gen_random_uuid());IF lineid=ANY(seen) OR item->>'department'<>dep OR length(coalesce(item->>'description',''))>300 OR length(coalesce(item->>'supplier_reference',''))>100 OR item->>'type' NOT IN ('product','freight','deposit','other') THEN RAISE EXCEPTION 'READING_LINES' USING ERRCODE='22023';END IF;seen=array_append(seen,lineid);items=items||jsonb_build_array(item||jsonb_build_object('source_line_id',lineid));
 END LOOP;
 data=jsonb_set(data,'{lines}',items);IF length(coalesce(data->>'number',''))>120 THEN RAISE EXCEPTION 'READING_NUMBER' USING ERRCODE='22023';END IF;
 IF doc.receipt_state IN ('complete','legacy_received') AND (nullif(data->>'supplier_id','')::uuid IS DISTINCT FROM doc.supplier_id OR coalesce(data->>'number','')<>doc.document_number) THEN RAISE EXCEPTION 'CORRECT_CONTROL_IDENTITY_FIRST' USING ERRCODE='40001';END IF;
 UPDATE public.pilot_trade_documents SET reading=data WHERE id=did;
 IF doc.receipt_state IN ('draft','pdf_pending') THEN
  PERFORM public.pilot_receipt_controls('save',gen_random_uuid(),jsonb_build_object('department',dep,'id',did,'version',doc.revision,'control',data));
 ELSE
  UPDATE public.pilot_trade_documents SET revision=revision+1,updated_at=now(),supplier_id=nullif(data->>'supplier_id','')::uuid,document_number=coalesce(data->>'number',''),document_date=nullif(data->>'date','')::date WHERE id=did;
 END IF;
 result=private.pilot_receipt_view(did);
 ELSIF p_action='start' THEN
  PERFORM public.pilot_receipt_controls('start',gen_random_uuid(),jsonb_build_object('department',dep,'id',did,'version',doc.revision));result=private.pilot_receipt_view(did);
 ELSIF p_action='catalogue' THEN
  IF NOT private.has_permission('articles.manage',dep) THEN RAISE EXCEPTION 'CATALOGUE_PERMISSION' USING ERRCODE='42501';END IF;
  data=doc.reading;SELECT * INTO vendor FROM public.suppliers WHERE id=nullif(data->>'supplier_id','')::uuid AND active;
  IF vendor.id IS NULL OR NOT private.pilot_supplier_in_department(vendor.id,dep) OR p_payload->>'human_verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'CATALOGUE_HUMAN_REVIEW' USING ERRCODE='23514';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(data->'lines') LOOP
   IF item->>'confirm_catalogue' IS DISTINCT FROM 'true' OR item->>'type'<>'product' THEN CONTINUE;END IF;
   lineid=(item->>'source_line_id')::uuid;IF item->>'department'<>dep OR nullif(btrim(item->>'supplier_reference'),'') IS NULL OR nullif(btrim(item->>'description'),'') IS NULL THEN RAISE EXCEPTION 'CATALOGUE_FIELDS' USING ERRCODE='23514';END IF;
   SELECT * INTO mem FROM private.pilot_catalogue_memories WHERE document_id=did AND source_line_id=lineid;
   IF mem.document_id IS NOT NULL THEN IF (mem.snapshot - ARRAY['received_quantity','received_unit','temperature','temperature_relevant','conformity','observations'])<>(item - ARRAY['received_quantity','received_unit','temperature','temperature_relevant','conformity','observations']) THEN RAISE EXCEPTION 'CATALOGUE_ALREADY_MEMORIZED_CHANGED_REVIEW_HISTORY' USING ERRCODE='40001';END IF;CONTINUE;END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(vendor.id::text||':'||lower(item->>'supplier_reference'),17));
   SELECT * INTO prod FROM public.pilot_products WHERE id=nullif(item->>'product_id','')::uuid AND department=dep AND active FOR UPDATE;
   IF prod.id IS NULL AND item->>'create_product'='true' THEN
    SELECT p.* INTO prod FROM public.pilot_products p JOIN public.pilot_product_offers o ON o.product_id=p.id JOIN private.pilot_catalogue_memories m ON m.offer_id=o.id AND m.document_id=did WHERE p.department=dep AND p.name=item->>'description' AND p.unit=coalesce(nullif(item->>'pack_unit',''),item->>'unit') AND o.supplier_id=vendor.id AND lower(o.supplier_reference)=lower(item->>'supplier_reference') LIMIT 1;
   END IF;
   IF prod.id IS NULL THEN
    IF item->>'create_product' IS DISTINCT FROM 'true' OR EXISTS(SELECT FROM public.pilot_product_offers o WHERE o.supplier_id=vendor.id AND lower(o.supplier_reference)=lower(item->>'supplier_reference')) OR coalesce(nullif(item->>'pack_unit',''),item->>'unit','') NOT IN ('kg','g','l','cl','ml','piece','pièce','pieces','pièces') THEN RAISE EXCEPTION 'CHOOSE_EXPLICIT_PRODUCT' USING ERRCODE='23514';END IF;
    INSERT INTO public.pilot_products(department,name,unit,target,updated_by) VALUES(dep,left(item->>'description',160),coalesce(nullif(item->>'pack_unit',''),item->>'unit'),0,actor) RETURNING * INTO prod;
   END IF;
   SELECT * INTO offer FROM public.pilot_product_offers o WHERE o.product_id=prod.id AND o.supplier_id=vendor.id AND lower(o.supplier_reference)=lower(item->>'supplier_reference') FOR UPDATE;
   IF offer.id IS NULL THEN INSERT INTO public.pilot_product_offers(product_id,supplier_id,supplier_reference,updated_by) VALUES(prod.id,vendor.id,item->>'supplier_reference',actor) RETURNING * INTO offer;END IF;
   IF item->>'confirm_price'='true' THEN
    IF coalesce(item->>'unit_price','') !~ '^[0-9]{1,9}([.,][0-9]{1,4})?$' OR item->>'basis' NOT IN ('HT','TTC') OR item->>'currency'<>'EUR' OR nullif(data->>'date','') IS NULL OR coalesce(item->>'quantity','') !~ '^[0-9]{1,7}([.,][0-9]{1,3})?$' THEN RAISE EXCEPTION 'PRICE_FIELDS_EXPLICIT' USING ERRCODE='23514';END IF;
    unit=coalesce(nullif(item->>'pack_unit',''),item->>'unit');IF coalesce(item->>'pack_quantity','') !~ '^([0-9]{1,7}([.,][0-9]{1,3})?)?$' THEN RAISE EXCEPTION 'PACK_QUANTITY' USING ERRCODE='23514';END IF;pack=coalesce(nullif(replace(item->>'pack_quantity',',','.'),''),'1')::numeric;IF pack<=0 THEN RAISE EXCEPTION 'PACK_QUANTITY' USING ERRCODE='23514';END IF;IF private.pilot_unit_factor(unit,prod.unit) IS NULL THEN RAISE EXCEPTION 'PRICE_UNIT_INCOMPATIBLE' USING ERRCODE='23514';END IF;amount=replace(item->>'unit_price',',','.')::numeric;
    SELECT coalesce(max(line_number),-1)+1 INTO counter FROM public.pilot_price_history WHERE document_id=did;
    INSERT INTO public.pilot_price_history(offer_id,document_id,line_number,source_line_id,price_date,pack_quantity,pack_unit,pack_price,basis,quantity,discount) VALUES(offer.id,did,counter,lineid,(data->>'date')::date,pack,unit,amount,item->>'basis',replace(item->>'quantity',',','.')::numeric,0) RETURNING * INTO price;
    IF offer.price_date IS NULL OR price.price_date>offer.price_date THEN UPDATE public.pilot_product_offers SET pack_quantity=pack,pack_unit=unit,pack_price=amount,price_basis=price.basis,price_date=price.price_date,price_source=price.id,version=version+1,updated_by=actor,updated_at=now() WHERE id=offer.id;END IF;prices=prices+1;
   END IF;
   INSERT INTO private.pilot_catalogue_memories(document_id,source_line_id,offer_id,actor,snapshot) VALUES(did,lineid,offer.id,actor,item);created=created+1;
  END LOOP;
  result=jsonb_build_object('id',did,'revision',doc.revision,'lines_memorized',created,'prices_recorded',prices,'replayed_without_duplicates',created=0);
 ELSE RAISE EXCEPTION 'READING_ACTION' USING ERRCODE='22023';END IF;
 INSERT INTO private.pilot_operation_intents(id,actor,action,department,payload,result) VALUES(p_request,actor,'reading_'||p_action,dep,p_payload,result);
 INSERT INTO private.pilot_document_audit(document_id,actor,action,revision,details) VALUES(did,actor,'reading_'||p_action,doc.revision,jsonb_build_object('request',p_request));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pilot_document_reading(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pilot_document_reading(text,uuid,jsonb) TO authenticated;
COMMIT;
