-- Additive receipt workflow. Originals immutable; control snapshots/PDFs retained by version.
BEGIN;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='3s';
DO $$BEGIN IF md5(pg_get_functiondef('public.pilot_documents(text,uuid,jsonb)'::regprocedure))<>'85874c4b846a93a9604b33daa5ac95ba' THEN RAISE EXCEPTION 'DOCUMENT_RPC_CHANGED';END IF;END$$;
ALTER TABLE public.pilot_trade_documents ADD COLUMN receipt_state text NOT NULL DEFAULT 'awaiting_control' CHECK(receipt_state IN ('awaiting_control','draft','pdf_pending','complete','legacy_received')),ADD COLUMN receipt_draft jsonb,ADD COLUMN completed_control_id uuid;
UPDATE public.pilot_trade_documents SET receipt_state=CASE WHEN received_at IS NOT NULL THEN 'legacy_received' WHEN jsonb_array_length(coalesce(payload->'lines','[]'))>0 THEN 'draft' ELSE 'awaiting_control' END;
ALTER TABLE public.pilot_document_files ADD COLUMN purpose text NOT NULL DEFAULT 'original' CHECK(purpose IN ('original','control_pdf'));
CREATE TABLE public.pilot_receipt_control_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES public.pilot_trade_documents(id),version integer NOT NULL CHECK(version>0),
 source_revision bigint NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','obsolete','legacy')),
 snapshot jsonb NOT NULL,originals jsonb NOT NULL,operator_id uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 pdf_file_id uuid UNIQUE REFERENCES public.pilot_document_files(id),completed_at timestamptz,UNIQUE(document_id,version),UNIQUE(document_id,source_revision),CHECK(jsonb_typeof(snapshot)='object' AND jsonb_typeof(originals)='array')
);
INSERT INTO public.pilot_receipt_control_versions(document_id,version,source_revision,status,snapshot,originals,operator_id,completed_at) SELECT d.id,1,d.revision,'legacy',jsonb_build_object('control',d.payload,'operator_label',(SELECT concat_ws(' ',p.prenom,p.nom) FROM public.profiles p WHERE p.id=d.received_by),'validated_at',d.received_at,'departments',d.departments),coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id) FROM public.pilot_document_files f WHERE f.document_id=d.id),'[]'),coalesce(d.received_by,d.author_id),d.received_at FROM public.pilot_trade_documents d WHERE d.receipt_state='legacy_received';
UPDATE public.pilot_trade_documents d SET completed_control_id=v.id FROM public.pilot_receipt_control_versions v WHERE v.document_id=d.id AND v.status='legacy';
ALTER TABLE public.pilot_trade_documents ADD CONSTRAINT pilot_completed_control_fk FOREIGN KEY(completed_control_id) REFERENCES public.pilot_receipt_control_versions(id);
ALTER TABLE public.pilot_receipt_control_versions ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.pilot_receipt_control_versions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.pilot_control_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF ROW(NEW.id,NEW.document_id,NEW.version,NEW.source_revision,NEW.snapshot,NEW.originals,NEW.operator_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.document_id,OLD.version,OLD.source_revision,OLD.snapshot,OLD.originals,OLD.operator_id,OLD.created_at) OR OLD.status<>'pending' OR NEW.status NOT IN ('pending','completed','obsolete') OR (OLD.pdf_file_id IS NOT NULL AND NEW.pdf_file_id IS DISTINCT FROM OLD.pdf_file_id) THEN RAISE EXCEPTION 'CONTROL_VERSION_IMMUTABLE' USING ERRCODE='23514';END IF;RETURN NEW;
END$$;
CREATE TRIGGER pilot_control_immutable BEFORE UPDATE ON public.pilot_receipt_control_versions FOR EACH ROW EXECUTE FUNCTION private.pilot_control_immutable();
CREATE FUNCTION private.pilot_receipt_view(did uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(d)||jsonb_build_object('author_label',(SELECT concat_ws(' ',p.prenom,p.nom) FROM public.profiles p WHERE p.id=d.author_id),'files',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id) FROM public.pilot_document_files f WHERE f.document_id=d.id),'[]'),'controls',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'source_revision',v.source_revision,'created_at',v.created_at,'completed_at',v.completed_at,'pdf_file_id',v.pdf_file_id,'operator_label',v.snapshot->>'operator_label','originals',v.originals) ORDER BY v.version DESC) FROM public.pilot_receipt_control_versions v WHERE v.document_id=d.id),'[]')) FROM public.pilot_trade_documents d WHERE d.id=did AND private.pilot_document_access(d.id)
$$;
CREATE FUNCTION public.pilot_receipt_controls(p_action text,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid=auth.uid();dep text=p_payload->>'department';did uuid=(p_payload->>'id')::uuid;v_doc public.pilot_trade_documents;v_file public.pilot_document_files;v_job public.pilot_receipt_control_versions;intent private.pilot_operation_intents;result jsonb;
 v_data jsonb;v_lines jsonb='[]';item jsonb;v_orig jsonb;v_operator text;v_scope text;v_fileid uuid;v_revision bigint=(p_payload->>'version')::bigint;v_uuid uuid;action_key text='receipt_control_'||p_action;
BEGIN
 IF v_actor IS NULL OR NOT private.is_active_user() OR dep IS NULL OR dep NOT IN ('cuisine','salle') OR NOT private.can_read_catalog_department(dep) OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>500000 THEN RAISE EXCEPTION 'RECEIPT_ACCESS' USING ERRCODE='42501';END IF;
 IF p_action='receipt' THEN
 SELECT * INTO intent FROM private.pilot_operation_intents i WHERE i.id=p_request AND i.actor=v_actor AND i.department=dep AND i.action LIKE 'receipt_control_%';
 IF intent.id IS NOT NULL THEN
 did=coalesce((intent.result->>'document_id')::uuid,(intent.result->>'id')::uuid);
 IF NOT private.pilot_document_access(did) THEN RAISE EXCEPTION 'RECEIPT_ACCESS' USING ERRCODE='42501';END IF;
 END IF;RETURN jsonb_build_object('found',intent.id IS NOT NULL,'result',intent.result);
 END IF;
 IF p_action<>'capture' THEN
 SELECT * INTO v_doc FROM public.pilot_trade_documents d WHERE d.id=did FOR UPDATE;
 IF v_doc.id IS NULL OR NOT dep=ANY(v_doc.departments) OR NOT private.pilot_document_access(did,p_action NOT IN ('read','job','pdf_info')) THEN RAISE EXCEPTION 'RECEIPT_ACCESS' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN RETURN private.pilot_receipt_view(did);END IF;
 FOREACH v_scope IN ARRAY v_doc.departments LOOP IF NOT private.has_permission('inventory.use',v_scope) THEN RAISE EXCEPTION 'CONTROL_INVENTORY_PERMISSION' USING ERRCODE='42501';END IF;END LOOP;
 IF p_action IN ('job','pdf_info') THEN
 SELECT * INTO v_job FROM public.pilot_receipt_control_versions v WHERE v.id=(p_payload->>'control_id')::uuid AND v.document_id=did;
 IF v_job.id IS NULL THEN RAISE EXCEPTION 'CONTROL_NOT_FOUND' USING ERRCODE='42501';END IF;IF p_action='pdf_info' THEN SELECT * INTO v_file FROM public.pilot_document_files f WHERE f.id=v_job.pdf_file_id AND f.document_id=did AND f.purpose='control_pdf';IF v_file.id IS NULL THEN RAISE EXCEPTION 'CONTROL_PDF_NOT_FOUND' USING ERRCODE='23514';END IF;RETURN to_jsonb(v_file);END IF;RETURN to_jsonb(v_job);
 END IF;
 ELSE
 IF NOT private.has_permission('inventory.use',dep) THEN RAISE EXCEPTION 'CAPTURE_PERMISSION' USING ERRCODE='42501';END IF;
 END IF;
 IF p_request IS NULL OR p_action NOT IN ('capture','append','start','save','prepare','register_pdf','finalize','correct') THEN RAISE EXCEPTION 'CONTROL_ACTION' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO intent FROM private.pilot_operation_intents i WHERE i.id=p_request;
 IF intent.id IS NOT NULL THEN
 IF intent.actor<>v_actor OR intent.action<>action_key OR intent.payload<>p_payload THEN RAISE EXCEPTION 'CONTROL_INTENTION_CHANGED' USING ERRCODE='40001';END IF;
 IF p_action='capture' THEN
 did=(intent.result->>'document_id')::uuid;
 IF NOT private.pilot_document_access(did,true) THEN RAISE EXCEPTION 'RECEIPT_ACCESS' USING ERRCODE='42501';END IF;
 RETURN intent.result||jsonb_build_object('document',private.pilot_receipt_view(did));
 ELSIF p_action IN ('prepare','register_pdf','finalize') THEN
 SELECT * INTO v_job FROM public.pilot_receipt_control_versions WHERE pilot_receipt_control_versions.id=(intent.result->>'id')::uuid;
 RETURN to_jsonb(v_job)||jsonb_build_object('request_actor',v_actor);
 ELSE RETURN intent.result;END IF;
 END IF;
 IF p_action IN ('capture','append') THEN
 v_fileid=(p_payload->>'file_id')::uuid;
 IF p_payload->>'sha256' !~ '^[a-f0-9]{64}$' OR p_payload->>'sha256' IS NULL OR (p_payload->>'bytes')::bigint NOT BETWEEN 1 AND 15728640 OR p_payload->>'mime' NOT IN ('application/pdf','image/jpeg','image/png','image/webp') OR length(coalesce(p_payload->>'name','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'CAPTURE_FILE' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_payload->>'sha256',27));
 SELECT * INTO v_file FROM public.pilot_document_files f WHERE f.sha256=p_payload->>'sha256';
 IF v_file.id IS NOT NULL THEN
 IF v_file.purpose<>'original' OR NOT private.pilot_document_access(v_file.document_id,true) OR (p_action='append' AND v_file.document_id<>did) THEN RAISE EXCEPTION 'ORIGINAL_ALREADY_REGISTERED' USING ERRCODE='23505';END IF;
 did=v_file.document_id;SELECT * INTO v_doc FROM public.pilot_trade_documents d WHERE d.id=did FOR UPDATE;
 IF NOT dep=ANY(v_doc.departments) THEN RAISE EXCEPTION 'CAPTURE_SCOPE' USING ERRCODE='42501';END IF;
 ELSE
 IF p_action='capture' THEN
 INSERT INTO public.pilot_trade_documents(id,departments,author_id,kind) VALUES(did,ARRAY[dep],v_actor,coalesce(p_payload->>'kind','delivery')) RETURNING * INTO v_doc;
 ELSE
 IF v_doc.revision IS DISTINCT FROM v_revision OR v_doc.receipt_state NOT IN ('awaiting_control','draft') OR v_doc.phase IN ('reviewed','applied') THEN RAISE EXCEPTION 'APPEND_REQUIRES_CURRENT_DRAFT' USING ERRCODE='40001';END IF;
 IF (SELECT count(*) FROM public.pilot_document_files WHERE document_id=did AND purpose='original')>=20 THEN RAISE EXCEPTION 'ORIGINAL_COUNT_LIMIT' USING ERRCODE='23514';END IF;
 UPDATE public.pilot_trade_documents SET revision=revision+1,updated_at=now() WHERE id=did RETURNING * INTO v_doc;
 END IF;
 INSERT INTO public.pilot_document_files(id,document_id,path,sha256,bytes,mime,name,purpose) VALUES(v_fileid,did,did||'/'||v_fileid,p_payload->>'sha256',(p_payload->>'bytes')::integer,p_payload->>'mime',p_payload->>'name','original') RETURNING * INTO v_file;
 END IF;
 result=jsonb_build_object('document_id',did,'document',private.pilot_receipt_view(did),'file',to_jsonb(v_file));
 ELSIF p_action IN ('start','correct') THEN
 IF v_doc.revision IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'CONTROL_VERSION' USING ERRCODE='40001';END IF;
 IF p_action='correct' AND v_doc.receipt_state NOT IN ('complete','legacy_received') THEN RAISE EXCEPTION 'CONTROL_CORRECTION_STATE' USING ERRCODE='23514';END IF;
 IF p_action='start' AND v_doc.receipt_state IN ('complete','pdf_pending') THEN RAISE EXCEPTION 'CONTROL_ALREADY_STARTED' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT FROM public.pilot_document_files f JOIN storage.objects o ON o.bucket_id='pilot-receipts-private' AND o.name=f.path WHERE f.document_id=did AND f.purpose='original') THEN RAISE EXCEPTION 'ORIGINAL_NOT_UPLOADED' USING ERRCODE='23514';END IF;
 v_data=coalesce(v_doc.receipt_draft,v_doc.payload)||jsonb_build_object('kind',v_doc.kind,'supplier_id',coalesce(v_doc.supplier_id::text,''),'number',v_doc.document_number,'date',coalesce(v_doc.document_date::text,''),'received_at',coalesce(v_doc.receipt_draft->>'received_at',v_doc.received_at::text,v_doc.created_at::text));
 IF p_action='start' AND v_doc.receipt_draft IS NULL THEN v_data=jsonb_set(v_data,'{lines}',coalesce((SELECT jsonb_agg(x||jsonb_build_object('temperature','','conformity','','temperature_relevant',false)) FROM jsonb_array_elements(coalesce(v_data->'lines','[]')) x),'[]'));END IF;
 UPDATE public.pilot_trade_documents SET receipt_draft=v_data,receipt_state='draft',revision=revision+1,updated_at=now() WHERE id=did RETURNING * INTO v_doc;result=to_jsonb(v_doc);
 ELSIF p_action='save' THEN
 IF v_doc.revision IS DISTINCT FROM v_revision OR v_doc.receipt_state NOT IN ('draft','pdf_pending') THEN RAISE EXCEPTION 'CONTROL_VERSION' USING ERRCODE='40001';END IF;
 v_data=p_payload->'control';
 IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' OR jsonb_typeof(v_data->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(v_data->'lines')>300 THEN RAISE EXCEPTION 'CONTROL_LINES' USING ERRCODE='22023';END IF;
 IF nullif(v_data->>'supplier_id','') IS NOT NULL AND NOT EXISTS(SELECT FROM public.suppliers s WHERE s.id=(v_data->>'supplier_id')::uuid AND s.active AND NOT EXISTS(SELECT FROM unnest(v_doc.departments) d WHERE NOT private.pilot_supplier_in_department(s.id,d))) THEN RAISE EXCEPTION 'CONTROL_SUPPLIER_SCOPE' USING ERRCODE='42501';END IF;
 IF v_doc.phase IN ('reviewed','applied') AND (nullif(v_data->>'supplier_id','')::uuid IS DISTINCT FROM v_doc.supplier_id OR coalesce(v_data->>'number','')<>v_doc.document_number) THEN RAISE EXCEPTION 'INVOICE_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(v_data->'lines') LOOP
 IF NOT coalesce(item->>'department','')=ANY(v_doc.departments) OR item->>'type' NOT IN ('product','freight','deposit','other') OR item->>'type' IS NULL OR length(coalesce(item->>'description',''))>300 OR length(coalesce(item->>'received_unit',''))>32 OR coalesce(item->>'conformity','') NOT IN ('','yes','no') OR coalesce(item->>'received_quantity','') !~ '^([0-9]{1,7}([.,][0-9]{1,3})?)?$' OR coalesce(item->>'temperature','') !~ '^(-?[0-9]{1,3}([.,][0-9]{1,2})?)?$' THEN RAISE EXCEPTION 'CONTROL_LINE_VALUES' USING ERRCODE='22023';END IF;
 v_lines=v_lines||jsonb_build_array(jsonb_build_object('department',item->>'department','type',item->>'type','description',coalesce(item->>'description',''),'received_quantity',coalesce(item->>'received_quantity',''),'received_unit',coalesce(item->>'received_unit',''),'temperature',coalesce(item->>'temperature',''),'temperature_relevant',coalesce((item->>'temperature_relevant')::boolean,false),'conformity',coalesce(item->>'conformity',''),'observations',left(coalesce(item->>'observations',''),1000),'supplier_reference',left(coalesce(item->>'supplier_reference',''),100)));
 END LOOP;
 v_data=jsonb_build_object('kind',v_doc.kind,'supplier_id',coalesce(v_data->>'supplier_id',''),'number',left(coalesce(v_data->>'number',''),120),'date',coalesce(v_data->>'date',''),'received_at',coalesce(v_data->>'received_at',''),'observations',left(coalesce(v_data->>'observations',''),4000),'lines',v_lines);
 UPDATE public.pilot_receipt_control_versions SET status='obsolete' WHERE document_id=did AND status='pending';
 UPDATE public.pilot_trade_documents SET receipt_draft=v_data,receipt_state='draft',supplier_id=CASE WHEN phase IN ('reviewed','applied') THEN supplier_id ELSE nullif(v_data->>'supplier_id','')::uuid END,document_number=CASE WHEN phase IN ('reviewed','applied') THEN document_number ELSE v_data->>'number' END,document_date=CASE WHEN phase IN ('reviewed','applied') THEN document_date ELSE nullif(v_data->>'date','')::date END,revision=revision+1,updated_at=now() WHERE id=did RETURNING * INTO v_doc;result=to_jsonb(v_doc);
 ELSIF p_action='prepare' THEN
 IF v_doc.revision IS DISTINCT FROM v_revision OR v_doc.receipt_state NOT IN ('draft','pdf_pending') THEN RAISE EXCEPTION 'CONTROL_VERSION' USING ERRCODE='40001';END IF;
 SELECT * INTO v_job FROM public.pilot_receipt_control_versions WHERE document_id=did AND source_revision=v_doc.revision;
 IF v_job.id IS NULL THEN
 v_data=v_doc.receipt_draft;
 IF v_data IS NULL OR nullif(v_data->>'supplier_id','') IS NULL OR length(btrim(coalesce(v_data->>'number','')))=0 OR nullif(v_data->>'received_at','')::timestamptz IS NULL OR jsonb_array_length(v_data->'lines')=0 THEN RAISE EXCEPTION 'CONTROL_HUMAN_FIELDS_REQUIRED' USING ERRCODE='23514';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(v_data->'lines') LOOP
 IF item->>'type'='product' AND (length(btrim(coalesce(item->>'description','')))=0 OR coalesce(item->>'received_quantity','')='' OR coalesce(item->>'conformity','') NOT IN ('yes','no') OR (item->>'temperature_relevant'='true' AND coalesce(item->>'temperature','')='')) THEN RAISE EXCEPTION 'CONTROL_HUMAN_FIELDS_REQUIRED' USING ERRCODE='23514';END IF;END LOOP;
 SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id) INTO v_orig FROM public.pilot_document_files f WHERE f.document_id=did AND f.purpose='original';
 IF v_orig IS NULL OR EXISTS(SELECT FROM public.pilot_document_files f WHERE f.document_id=did AND f.purpose='original' AND NOT EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id='pilot-receipts-private' AND o.name=f.path)) THEN RAISE EXCEPTION 'ALL_ORIGINALS_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT concat_ws(' ',p.prenom,p.nom) INTO v_operator FROM public.profiles p WHERE p.id=v_actor;
 INSERT INTO public.pilot_receipt_control_versions(document_id,version,source_revision,snapshot,originals,operator_id) SELECT did,coalesce(max(v.version),0)+1,v_doc.revision,jsonb_build_object('control',v_data,'supplier_name',(SELECT name FROM public.suppliers WHERE id=(v_data->>'supplier_id')::uuid),'operator_label',v_operator,'operator_id',v_actor,'validated_at',now(),'departments',v_doc.departments),v_orig,v_actor FROM public.pilot_receipt_control_versions v WHERE v.document_id=did RETURNING * INTO v_job;
 UPDATE public.pilot_trade_documents SET receipt_state='pdf_pending' WHERE id=did;
 END IF;result=to_jsonb(v_job)||jsonb_build_object('request_actor',v_actor);
 ELSIF p_action IN ('register_pdf','finalize') THEN
 SELECT * INTO v_job FROM public.pilot_receipt_control_versions v WHERE v.id=(p_payload->>'control_id')::uuid AND v.document_id=did FOR UPDATE;
 IF v_job.id IS NULL THEN RAISE EXCEPTION 'CONTROL_ACCESS' USING ERRCODE='42501';END IF;
 IF v_job.status='completed' THEN result=to_jsonb(v_job);
 ELSE
 IF v_job.status<>'pending' OR v_doc.revision<>v_job.source_revision THEN RAISE EXCEPTION 'CONTROL_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 IF p_action='register_pdf' THEN
 IF p_payload->>'sha256' !~ '^[a-f0-9]{64}$' OR p_payload->>'sha256' IS NULL OR (p_payload->>'bytes')::bigint NOT BETWEEN 1 AND 15728640 THEN RAISE EXCEPTION 'CONTROL_PDF_METADATA' USING ERRCODE='22023';END IF;
 SELECT * INTO v_file FROM public.pilot_document_files f WHERE f.id=v_job.id;
 IF v_file.id IS NOT NULL AND (v_file.sha256<>p_payload->>'sha256' OR v_file.bytes<>(p_payload->>'bytes')::integer OR v_file.purpose<>'control_pdf' OR v_file.document_id<>did) THEN RAISE EXCEPTION 'CONTROL_PDF_DIFFERENT' USING ERRCODE='40001';END IF;
 IF v_file.id IS NULL THEN INSERT INTO public.pilot_document_files(id,document_id,path,sha256,bytes,mime,name,purpose) VALUES(v_job.id,did,did||'/'||v_job.id,p_payload->>'sha256',(p_payload->>'bytes')::integer,'application/pdf','Controle-v'||v_job.version||'.pdf','control_pdf') RETURNING * INTO v_file;END IF;
 UPDATE public.pilot_receipt_control_versions SET pdf_file_id=v_file.id WHERE id=v_job.id RETURNING * INTO v_job;
 ELSE
 IF v_job.pdf_file_id IS NULL OR NOT EXISTS(SELECT FROM public.pilot_document_files f JOIN storage.objects o ON o.bucket_id='pilot-receipts-private' AND o.name=f.path WHERE f.id=v_job.pdf_file_id AND f.document_id=did AND f.purpose='control_pdf') THEN RAISE EXCEPTION 'CONTROL_PDF_NOT_UPLOADED' USING ERRCODE='23514';END IF;
 UPDATE public.pilot_receipt_control_versions SET status='completed',completed_at=now() WHERE id=v_job.id RETURNING * INTO v_job;
 UPDATE public.pilot_trade_documents SET receipt_state='complete',completed_control_id=v_job.id,received_by=v_job.operator_id,received_at=(v_job.snapshot->'control'->>'received_at')::timestamptz,revision=revision+1,updated_at=now() WHERE id=did;
 END IF;result=to_jsonb(v_job);END IF;
 END IF;
 INSERT INTO private.pilot_operation_intents(id,actor,action,department,payload,result) VALUES(p_request,v_actor,action_key,dep,p_payload,result);
 INSERT INTO private.pilot_document_audit(document_id,actor,action,revision,details) VALUES(did,v_actor,action_key,coalesce(v_doc.revision,1),jsonb_build_object('control_id',v_job.id,'result',result));
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION private.pilot_control_immutable(),private.pilot_receipt_view(uuid),public.pilot_receipt_controls(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_receipt_controls(text,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION private.pilot_document_file_access(object_path text,writing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.pilot_document_files f JOIN public.pilot_trade_documents d ON d.id=f.document_id WHERE f.path=object_path AND private.pilot_document_access(d.id,writing) AND (NOT writing OR (f.purpose='original' AND d.phase NOT IN ('reviewed','applied') AND d.receipt_state NOT IN ('complete','pdf_pending')) OR (f.purpose='control_pdf' AND EXISTS(SELECT FROM public.pilot_receipt_control_versions v WHERE v.pdf_file_id=f.id AND v.status='pending' AND v.source_revision=d.revision))))
$$;
CREATE FUNCTION private.pilot_documents_before_controls(p_action text,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid=auth.uid();dep text=p_payload->>'department';doc public.pilot_trade_documents;previous private.pilot_operation_intents;v_document jsonb;item jsonb;file public.pilot_document_files;
 prod public.pilot_products;offer public.pilot_product_offers;source_offer public.pilot_product_offers;target_offer public.pilot_product_offers;source_prod public.pilot_products;vendor public.suppliers;
 result jsonb;v_id uuid=(p_payload->>'id')::uuid;scope text;scopes text[];line_no integer;amount numeric;discount numeric;unit_factor numeric;price_row public.pilot_price_history;new_id uuid;seen uuid[]='{}';
BEGIN
 IF v_actor IS NULL OR NOT private.is_active_user() OR dep IS NULL OR dep NOT IN ('cuisine','salle','nettoyage') OR NOT private.can_read_catalog_department(dep) OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>500000 THEN RAISE EXCEPTION 'DOCUMENT_ACCESS' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'revision',d.revision,'phase',d.phase,'kind',d.kind,'document_number',d.document_number,'document_date',d.document_date,'supplier_id',d.supplier_id,'departments',d.departments,'updated_at',d.updated_at)) FROM public.pilot_trade_documents d WHERE dep=ANY(d.departments) AND private.pilot_document_access(d.id) AND (d.author_id=v_actor OR private.has_permission('orders.manage',dep) OR private.has_permission('articles.manage',dep))),'[]');END IF;
 IF p_action='receipt' THEN
 SELECT * INTO previous FROM private.pilot_operation_intents WHERE private.pilot_operation_intents.id=p_request AND private.pilot_operation_intents.actor=v_actor AND department=dep AND action LIKE 'document_%';
 IF previous.id IS NOT NULL AND EXISTS(SELECT FROM public.pilot_trade_documents d WHERE d.id=(previous.result->>'id')::uuid) AND NOT private.pilot_document_access((previous.result->>'id')::uuid) THEN RAISE EXCEPTION 'DOCUMENT_RECEIPT_ACCESS' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('found',previous.id IS NOT NULL,'result',previous.result);
 END IF;
 IF p_action IN ('history','equivalences') THEN
 SELECT * INTO offer FROM public.pilot_product_offers o WHERE o.id=v_id;SELECT * INTO prod FROM public.pilot_products WHERE pilot_products.id=offer.product_id;
 IF prod.id IS NULL OR prod.department<>dep THEN RAISE EXCEPTION 'PRICE_ACCESS' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('history',coalesce((SELECT jsonb_agg(to_jsonb(h)||jsonb_build_object('document_number',d.document_number,'original_accessible',private.pilot_document_access(d.id)) ORDER BY h.price_date,h.id) FROM public.pilot_price_history h JOIN public.pilot_trade_documents d ON d.id=h.document_id WHERE h.offer_id=offer.id),'[]'),
 'comparables',coalesce((SELECT jsonb_agg(to_jsonb(o)||jsonb_build_object('supplier_name',s.name,'source_document_id',(SELECT h.document_id FROM public.pilot_price_history h WHERE h.id=o.price_source),'source_number',(SELECT d.document_number FROM public.pilot_price_history h JOIN public.pilot_trade_documents d ON d.id=h.document_id WHERE h.id=o.price_source))) FROM public.pilot_product_offers o JOIN public.suppliers s ON s.id=o.supplier_id WHERE o.product_id=prod.id AND o.id<>offer.id AND o.active),'[]'),
 'decisions',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM public.pilot_equivalence_decisions e WHERE e.source_offer=offer.id OR e.target_offer=offer.id),'[]'));
 END IF;
 IF p_action='file_info' THEN
 SELECT * INTO file FROM public.pilot_document_files WHERE pilot_document_files.id=v_id;
 IF file.id IS NULL OR NOT private.pilot_document_access(file.document_id) THEN RAISE EXCEPTION 'FILE_ACCESS' USING ERRCODE='42501';END IF;RETURN to_jsonb(file);
 END IF;
 IF p_action NOT IN ('create','equivalence') THEN
 SELECT * INTO doc FROM public.pilot_trade_documents d WHERE d.id=v_id FOR UPDATE;
 IF doc.id IS NULL OR NOT dep=ANY(doc.departments) OR NOT private.pilot_document_access(doc.id,p_action<>'read') THEN RAISE EXCEPTION 'DOCUMENT_ACCESS' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN RETURN to_jsonb(doc)||jsonb_build_object('files',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id) FROM public.pilot_document_files f WHERE f.document_id=doc.id),'[]'));END IF;
 END IF;
 IF p_action NOT IN ('create','save','file','receive','review','apply','equivalence') OR p_request IS NULL THEN RAISE EXCEPTION 'DOCUMENT_ACTION' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO previous FROM private.pilot_operation_intents i WHERE i.id=p_request;
 IF previous.id IS NOT NULL THEN
 IF previous.actor<>v_actor OR previous.action<>'document_'||p_action OR previous.payload<>p_payload THEN RAISE EXCEPTION 'DOCUMENT_INTENTION_CHANGED' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT FROM public.pilot_trade_documents d WHERE d.id=(previous.result->>'id')::uuid) AND NOT private.pilot_document_access((previous.result->>'id')::uuid) THEN RAISE EXCEPTION 'DOCUMENT_RECEIPT_ACCESS' USING ERRCODE='42501';END IF;
 RETURN previous.result;
 END IF;
 IF p_action='equivalence' THEN
 IF NOT private.has_permission('articles.manage',dep) OR coalesce(p_payload->>'reason','')='' THEN RAISE EXCEPTION 'EQUIVALENCE_PERMISSION_OR_REASON' USING ERRCODE='42501';END IF;
 SELECT * INTO source_offer FROM public.pilot_product_offers o WHERE o.id=(p_payload->>'source_offer')::uuid FOR UPDATE;
 SELECT * INTO target_offer FROM public.pilot_product_offers o WHERE o.id=(p_payload->>'target_offer')::uuid FOR UPDATE;
 SELECT * INTO source_prod FROM public.pilot_products p WHERE p.id=source_offer.product_id FOR UPDATE;
 SELECT * INTO prod FROM public.pilot_products p WHERE p.id=target_offer.product_id FOR UPDATE;
 IF source_prod.id IS NULL OR prod.id IS NULL OR NOT source_offer.active OR NOT target_offer.active OR NOT prod.active OR NOT source_prod.active OR source_prod.department<>dep OR prod.department<>dep OR source_offer.id=target_offer.id OR source_offer.version IS DISTINCT FROM (p_payload->>'source_version')::bigint OR target_offer.version IS DISTINCT FROM (p_payload->>'target_version')::bigint THEN RAISE EXCEPTION 'EQUIVALENCE_CONFLICT' USING ERRCODE='40001';END IF;
 IF p_payload->>'decision'='approved' THEN
 IF p_payload->>'attributes_reviewed' IS DISTINCT FROM 'true' OR private.pilot_unit_factor(source_prod.unit,prod.unit) IS NULL OR coalesce(source_offer.characteristics->>'condition','')='' OR source_offer.characteristics->>'condition' IS DISTINCT FROM target_offer.characteristics->>'condition' THEN RAISE EXCEPTION 'EQUIVALENCE_ATTRIBUTES_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT FROM public.pilot_product_offers sibling WHERE sibling.product_id=source_prod.id AND sibling.characteristics->>'condition' IS DISTINCT FROM target_offer.characteristics->>'condition') THEN RAISE EXCEPTION 'EQUIVALENCE_MIXED_CHARACTERISTICS' USING ERRCODE='23514';END IF;
 IF source_prod.id<>prod.id THEN
 -- Never merge independently counted stocks or historical orders. A later explicit migration is needed in that case.
 IF source_prod.legacy_article_id IS NOT NULL OR EXISTS(SELECT FROM public.pilot_inventory_runs r WHERE r.payload::text LIKE '%'||source_prod.id::text||'%') OR EXISTS(SELECT FROM public.pilot_order_documents d WHERE d.snapshot::text LIKE '%'||source_prod.id::text||'%') THEN RAISE EXCEPTION 'EQUIVALENCE_EXISTING_COUNTS_KEEP_SEPARATE' USING ERRCODE='23514';END IF;
 UPDATE public.pilot_products SET preferred_offer_id=NULL,active=false,version=version+1 WHERE pilot_products.id=source_prod.id;
 UPDATE public.pilot_product_offers SET product_id=prod.id,version=version+1 WHERE product_id=source_prod.id;
 UPDATE public.pilot_products SET version=version+1 WHERE pilot_products.id=prod.id;
 END IF;
 END IF;
 INSERT INTO public.pilot_equivalence_decisions(id,source_offer,target_offer,decision,actor,reason) VALUES(v_id,source_offer.id,target_offer.id,p_payload->>'decision',v_actor,left(p_payload->>'reason',1000));result=jsonb_build_object('id',v_id,'decision',p_payload->>'decision');
 ELSIF p_action='create' THEN
 IF NOT private.has_permission('inventory.use',dep) AND NOT private.has_permission('articles.manage',dep) THEN RAISE EXCEPTION 'DOCUMENT_CREATE_PERMISSION' USING ERRCODE='42501';END IF;
 INSERT INTO public.pilot_trade_documents(id,departments,author_id,kind) VALUES(v_id,ARRAY[dep],v_actor,p_payload->>'kind') RETURNING * INTO doc;result=to_jsonb(doc);
 ELSIF p_action='file' THEN
 IF doc.phase IN ('reviewed','applied') OR doc.revision IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'DOCUMENT_VERSION' USING ERRCODE='40001';END IF;
 new_id=(p_payload->>'file_id')::uuid;
 INSERT INTO public.pilot_document_files(id,document_id,path,sha256,bytes,mime,name) VALUES(new_id,doc.id,doc.id||'/'||new_id,p_payload->>'sha256',(p_payload->>'bytes')::integer,p_payload->>'mime',left(p_payload->>'name',180)) RETURNING * INTO file;result=to_jsonb(file);
 ELSIF p_action='save' THEN
 IF doc.phase='applied' OR doc.revision IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'DOCUMENT_VERSION' USING ERRCODE='40001';END IF;
 v_document=p_payload->'document';IF jsonb_typeof(v_document)<>'object' OR jsonb_typeof(v_document->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(v_document->'lines')>300 THEN RAISE EXCEPTION 'DOCUMENT_LINES' USING ERRCODE='22023';END IF;
 SELECT array_agg(DISTINCT x) INTO scopes FROM jsonb_array_elements_text(p_payload->'departments') x;
 IF scopes IS NULL OR NOT dep=ANY(scopes) OR NOT scopes<@ARRAY['cuisine','salle','nettoyage']::text[] THEN RAISE EXCEPTION 'DOCUMENT_DEPARTMENTS' USING ERRCODE='22023';END IF;
 FOREACH scope IN ARRAY scopes LOOP IF NOT private.can_read_catalog_department(scope) OR (NOT private.has_permission('inventory.use',scope) AND NOT private.has_permission('articles.manage',scope)) THEN RAISE EXCEPTION 'DOCUMENT_DEPARTMENT_PERMISSION' USING ERRCODE='42501';END IF;END LOOP;
 IF coalesce(v_document->>'linked_document_id','')<>'' AND (NOT private.pilot_document_access((v_document->>'linked_document_id')::uuid) OR (v_document->>'linked_document_id')::uuid=doc.id OR NOT EXISTS(SELECT FROM public.pilot_trade_documents l WHERE l.id=(v_document->>'linked_document_id')::uuid AND l.supplier_id=nullif(v_document->>'supplier_id','')::uuid)) THEN RAISE EXCEPTION 'RELATED_DOCUMENT_ACCESS' USING ERRCODE='42501';END IF;
 SELECT * INTO vendor FROM public.suppliers WHERE suppliers.id=nullif(v_document->>'supplier_id','')::uuid;
 IF vendor.id IS NOT NULL THEN FOREACH scope IN ARRAY scopes LOOP IF NOT private.pilot_supplier_in_department(vendor.id,scope) THEN RAISE EXCEPTION 'SUPPLIER_DOCUMENT_SCOPE' USING ERRCODE='23514';END IF;END LOOP;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(v_document->'lines') LOOP
 IF NOT coalesce(item->>'department','')=ANY(scopes) OR item->>'type' NOT IN ('product','freight','deposit','other') OR item->>'type' IS NULL OR length(coalesce(item->>'description',''))>300 OR length(coalesce(item->>'supplier_reference',''))>100 THEN RAISE EXCEPTION 'DOCUMENT_LINE_SCOPE_OR_TYPE' USING ERRCODE='22023';END IF;
 IF coalesce(item->>'product_id','')<>'' AND NOT EXISTS(SELECT FROM public.pilot_products p WHERE p.id=(item->>'product_id')::uuid AND p.department=item->>'department') THEN RAISE EXCEPTION 'DOCUMENT_PRODUCT_SCOPE' USING ERRCODE='42501';END IF;
 IF item->>'conformity' IS NOT NULL AND item->>'conformity' NOT IN ('yes','no','') THEN RAISE EXCEPTION 'CONFORMITY_CHOICE' USING ERRCODE='22023';END IF;
 IF coalesce(item->>'temperature','')<>'' AND item->>'temperature' !~ '^-?[0-9]{1,3}([.,][0-9]{1,2})?$' THEN RAISE EXCEPTION 'TEMPERATURE_NUMBER' USING ERRCODE='22023';END IF;
 END LOOP;
 UPDATE public.pilot_trade_documents SET departments=scopes,supplier_id=vendor.id,kind=v_document->>'kind',document_number=left(btrim(coalesce(v_document->>'number','')),120),document_date=nullif(v_document->>'date','')::date,payload=v_document,revision=revision+1,phase=CASE WHEN received_at IS NOT NULL THEN 'received' ELSE 'draft' END,reviewed_at=NULL,reviewed_by=NULL,updated_at=now() WHERE pilot_trade_documents.id=doc.id RETURNING * INTO doc;result=to_jsonb(doc);
 ELSIF p_action IN ('receive','review','apply') THEN
 IF doc.revision IS DISTINCT FROM (p_payload->>'version')::bigint OR doc.phase='applied' THEN RAISE EXCEPTION 'DOCUMENT_VERSION' USING ERRCODE='40001';END IF;
 IF doc.supplier_id IS NULL OR doc.document_date IS NULL OR doc.document_number='' OR jsonb_array_length(doc.payload->'lines')=0 THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='23514';END IF;
 IF p_action='receive' THEN
 FOREACH scope IN ARRAY doc.departments LOOP IF NOT private.has_permission('inventory.use',scope) THEN RAISE EXCEPTION 'RECEPTION_PERMISSION' USING ERRCODE='42501';END IF;END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(doc.payload->'lines') LOOP
 IF item->>'type'='product' AND (coalesce(item->>'received_quantity','') !~ '^[0-9]{1,7}([.,][0-9]{1,3})?$' OR coalesce(item->>'conformity','') NOT IN ('yes','no') OR (item->>'temperature_relevant'='true' AND coalesce(item->>'temperature','')='')) THEN RAISE EXCEPTION 'HUMAN_RECEPTION_INCOMPLETE' USING ERRCODE='23514';END IF;
 END LOOP;
 IF nullif(doc.payload->>'received_at','')::timestamptz IS NULL THEN RAISE EXCEPTION 'RECEIVED_TIME_REQUIRED' USING ERRCODE='23514';END IF;
 UPDATE public.pilot_trade_documents SET received_by=v_actor,received_at=(doc.payload->>'received_at')::timestamptz,phase='received',revision=revision+1,updated_at=now() WHERE pilot_trade_documents.id=doc.id RETURNING * INTO doc;
 ELSE
 FOREACH scope IN ARRAY doc.departments LOOP IF NOT private.has_permission('articles.manage',scope) THEN RAISE EXCEPTION 'INVOICE_REVIEW_PERMISSION' USING ERRCODE='42501';END IF;END LOOP;
 IF doc.kind='delivery' THEN RAISE EXCEPTION 'DELIVERY_WITHOUT_INVOICE_PRICE' USING ERRCODE='23514';END IF;
 IF p_action='review' THEN
 IF NOT EXISTS(SELECT FROM public.pilot_document_files f JOIN storage.objects o ON o.bucket_id='pilot-receipts-private' AND o.name=f.path WHERE f.document_id=doc.id) THEN RAISE EXCEPTION 'PRIVATE_ORIGINAL_REQUIRED' USING ERRCODE='23514';END IF;
 IF p_payload->>'human_verified' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'HUMAN_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
 UPDATE public.pilot_trade_documents SET reviewed_by=v_actor,reviewed_at=now(),phase='reviewed',revision=revision+1,updated_at=now() WHERE pilot_trade_documents.id=doc.id RETURNING * INTO doc;
 ELSE
 IF doc.phase<>'reviewed' OR doc.reviewed_at IS NULL THEN RAISE EXCEPTION 'REVIEW_BEFORE_CATALOGUE' USING ERRCODE='23514';END IF;
 -- Serialize invoice identity even when two documents have different request IDs.
 PERFORM pg_advisory_xact_lock(hashtextextended(doc.supplier_id||':'||doc.kind||':'||lower(doc.document_number)||':'||extract(year FROM doc.document_date),13));
 IF EXISTS(SELECT FROM public.pilot_trade_documents d WHERE d.id<>doc.id AND d.supplier_id=doc.supplier_id AND d.kind=doc.kind AND lower(btrim(d.document_number))=lower(btrim(doc.document_number)) AND extract(year FROM d.document_date)=extract(year FROM doc.document_date) AND d.phase='applied') THEN RAISE EXCEPTION 'INVOICE_ALREADY_APPLIED' USING ERRCODE='23505';END IF;
 IF doc.kind='invoice' THEN
 line_no=-1;
 FOR item IN SELECT value FROM jsonb_array_elements(doc.payload->'lines') LOOP
 line_no=line_no+1;IF item->>'type'<>'product' OR coalesce(item->>'pack_price','')='' THEN CONTINUE;END IF;
 SELECT * INTO prod FROM public.pilot_products p WHERE p.id=nullif(item->>'product_id','')::uuid AND p.department=item->>'department' AND p.active FOR UPDATE;
 IF prod.id IS NULL OR coalesce(item->>'supplier_reference','')='' OR coalesce(item->>'pack_quantity','') !~ '^[0-9]{1,7}([.,][0-9]{1,3})?$' OR coalesce(item->>'quantity','') !~ '^[0-9]{1,7}([.,][0-9]{1,3})?$' OR coalesce(item->>'pack_price','') !~ '^[0-9]{1,9}([.,][0-9]{1,4})?$' OR coalesce(item->>'basis','') NOT IN ('HT','TTC') OR coalesce(item->>'currency','')<>'EUR' THEN RAISE EXCEPTION 'INVOICE_PRICE_FIELDS_REVIEW' USING ERRCODE='23514';END IF;
 unit_factor=private.pilot_unit_factor(item->>'pack_unit',prod.unit);IF unit_factor IS NULL OR replace(item->>'pack_quantity',',','.')::numeric<=0 OR replace(item->>'quantity',',','.')::numeric<=0 THEN RAISE EXCEPTION 'INVOICE_UNITS_OR_QUANTITY' USING ERRCODE='23514';END IF;
 discount=coalesce(nullif(replace(item->>'discount',',','.'),''),'0')::numeric;IF discount NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'INVOICE_DISCOUNT' USING ERRCODE='23514';END IF;
 amount=round(replace(item->>'pack_price',',','.')::numeric*(1-discount/100),4);
 PERFORM pg_advisory_xact_lock(hashtextextended(doc.supplier_id||':'||prod.id||':'||lower(item->>'supplier_reference'),17));
 SELECT * INTO offer FROM public.pilot_product_offers o WHERE o.supplier_id=doc.supplier_id AND o.product_id=prod.id AND lower(o.supplier_reference)=lower(item->>'supplier_reference') FOR UPDATE;
 IF offer.id IS NULL THEN INSERT INTO public.pilot_product_offers(product_id,supplier_id,supplier_reference,characteristics) VALUES(prod.id,doc.supplier_id,item->>'supplier_reference',coalesce(item->'characteristics','{}')) RETURNING * INTO offer;END IF;
 INSERT INTO public.pilot_price_history(offer_id,document_id,line_number,price_date,pack_quantity,pack_unit,pack_price,basis,quantity,discount) VALUES(offer.id,doc.id,line_no,doc.document_date,replace(item->>'pack_quantity',',','.')::numeric,item->>'pack_unit',amount,item->>'basis',replace(item->>'quantity',',','.')::numeric,discount) RETURNING * INTO price_row;
 IF offer.price_date IS NULL OR doc.document_date>offer.price_date THEN UPDATE public.pilot_product_offers SET pack_quantity=price_row.pack_quantity,pack_unit=price_row.pack_unit,pack_price=price_row.pack_price,price_basis=price_row.basis,price_date=doc.document_date,price_source=price_row.id,version=version+1,updated_by=v_actor,updated_at=now() WHERE pilot_product_offers.id=offer.id;END IF;
 END LOOP;END IF;
 UPDATE public.pilot_trade_documents SET phase='applied',revision=revision+1,updated_at=now() WHERE pilot_trade_documents.id=doc.id RETURNING * INTO doc;
 END IF;END IF;result=to_jsonb(doc);
 END IF;
 INSERT INTO private.pilot_operation_intents(id,actor,action,department,payload,result) VALUES(p_request,v_actor,'document_'||p_action,dep,p_payload,result);
 IF doc.id IS NOT NULL THEN INSERT INTO private.pilot_document_audit(document_id,actor,action,revision,details) VALUES(doc.id,v_actor,p_action,doc.revision,jsonb_build_object('snapshot',to_jsonb(doc),'file',CASE WHEN p_action='file' THEN to_jsonb(file) ELSE NULL END));END IF;
 RETURN result;
END$$;

REVOKE ALL ON FUNCTION private.pilot_documents_before_controls(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.pilot_documents(p_action text,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;v_existing public.pilot_trade_documents;
BEGIN
 IF p_action='receive' THEN RAISE EXCEPTION 'USE_VERSIONED_RECEIPT_CONTROL_PDF' USING ERRCODE='23514';END IF;
 IF p_action IN ('file','save') THEN
 SELECT * INTO v_existing FROM public.pilot_trade_documents WHERE id=(p_payload->>'id')::uuid;
 IF p_action='file' AND v_existing.receipt_state IN ('complete','pdf_pending') THEN RAISE EXCEPTION 'APPEND_REQUIRES_CURRENT_DRAFT' USING ERRCODE='40001';END IF;
 IF p_action='save' AND v_existing.receipt_state='complete' AND (nullif(p_payload->'document'->>'supplier_id','')::uuid IS DISTINCT FROM v_existing.supplier_id OR coalesce(p_payload->'document'->>'number','')<>v_existing.document_number) THEN RAISE EXCEPTION 'CONTROL_IDENTITY_CHANGED_REQUIRES_CORRECTION' USING ERRCODE='40001';END IF;
 END IF;
 result=private.pilot_documents_before_controls(p_action,p_request,p_payload);
 IF p_action='read' THEN RETURN private.pilot_receipt_view((p_payload->>'id')::uuid);END IF;
 IF p_action='list' THEN RETURN coalesce((SELECT jsonb_agg(x||jsonb_build_object('receipt_state',d.receipt_state,'completed_control_id',d.completed_control_id,'created_at',d.created_at,'original_name',(SELECT f.name FROM public.pilot_document_files f WHERE f.document_id=d.id AND f.purpose='original' ORDER BY f.created_at,f.id LIMIT 1))) FROM jsonb_array_elements(result) x JOIN public.pilot_trade_documents d ON d.id=(x->>'id')::uuid),'[]');END IF;
 RETURN result;
END$$;
COMMIT;
