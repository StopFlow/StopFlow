-- Private document drafts, human checks, invoice-backed prices and explicit equivalences.
BEGIN;
SET LOCAL statement_timeout='25s'; SET LOCAL lock_timeout='3s';
CREATE TABLE public.pilot_trade_documents(
 id uuid PRIMARY KEY,departments text[] NOT NULL CHECK(cardinality(departments) BETWEEN 1 AND 3 AND departments<@ARRAY['cuisine','salle','nettoyage']::text[]),
 author_id uuid NOT NULL REFERENCES public.profiles(id),revision bigint NOT NULL DEFAULT 1,
 phase text NOT NULL DEFAULT 'draft' CHECK(phase IN ('draft','received','reviewed','applied')),
 kind text NOT NULL CHECK(kind IN ('delivery','invoice','credit')),supplier_id uuid REFERENCES public.suppliers(id),
 document_number text NOT NULL DEFAULT '',document_date date,payload jsonb NOT NULL DEFAULT '{}',
 archive_state text NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK(archive_state='NOT_CONFIGURED'),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES public.profiles(id),reviewed_at timestamptz,received_by uuid REFERENCES public.profiles(id),received_at timestamptz,
 CHECK(jsonb_typeof(payload)='object')
);
CREATE UNIQUE INDEX pilot_invoice_duplicate ON public.pilot_trade_documents(supplier_id,kind,lower(btrim(document_number)),extract(year FROM document_date)) WHERE phase='applied' AND kind IN ('invoice','credit');
CREATE TABLE public.pilot_document_files(id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES public.pilot_trade_documents(id),path text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 15728640),mime text NOT NULL CHECK(mime IN ('application/pdf','image/jpeg','image/png','image/webp')),name text NOT NULL CHECK(length(name)<=180),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(sha256));
CREATE TABLE public.pilot_price_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),offer_id uuid NOT NULL REFERENCES public.pilot_product_offers(id),document_id uuid NOT NULL REFERENCES public.pilot_trade_documents(id),line_number integer NOT NULL CHECK(line_number>=0),price_date date NOT NULL,pack_quantity numeric NOT NULL CHECK(pack_quantity>0),pack_unit text NOT NULL,pack_price numeric NOT NULL CHECK(pack_price>=0),basis text NOT NULL CHECK(basis IN ('HT','TTC')),quantity numeric NOT NULL CHECK(quantity>0),discount numeric NOT NULL CHECK(discount BETWEEN 0 AND 100),UNIQUE(document_id,line_number));
CREATE TABLE public.pilot_equivalence_decisions(id uuid PRIMARY KEY,source_offer uuid NOT NULL REFERENCES public.pilot_product_offers(id),target_offer uuid NOT NULL REFERENCES public.pilot_product_offers(id),decision text NOT NULL CHECK(decision IN ('approved','separate')),actor uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),CHECK(source_offer<>target_offer));
CREATE TABLE private.pilot_document_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,document_id uuid REFERENCES public.pilot_trade_documents(id),actor uuid NOT NULL REFERENCES public.profiles(id),action text NOT NULL,revision bigint,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.pilot_trade_documents ENABLE ROW LEVEL SECURITY;ALTER TABLE public.pilot_document_files ENABLE ROW LEVEL SECURITY;ALTER TABLE public.pilot_price_history ENABLE ROW LEVEL SECURITY;ALTER TABLE public.pilot_equivalence_decisions ENABLE ROW LEVEL SECURITY;ALTER TABLE private.pilot_document_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_trade_documents,public.pilot_document_files,public.pilot_price_history,public.pilot_equivalence_decisions,private.pilot_document_audit FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.pilot_document_access(doc uuid,writing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.is_active_user() AND EXISTS(SELECT FROM public.pilot_trade_documents d WHERE d.id=doc AND NOT EXISTS(SELECT FROM unnest(d.departments) dep WHERE NOT private.can_read_catalog_department(dep)) AND (d.author_id=auth.uid() OR NOT EXISTS(SELECT FROM unnest(d.departments) dep WHERE NOT (private.has_permission('history.view',dep) OR private.has_permission('orders.manage',dep) OR private.has_permission('articles.manage',dep)))) AND (NOT writing OR (d.author_id=auth.uid() AND NOT EXISTS(SELECT FROM unnest(d.departments) dep WHERE NOT private.has_permission('inventory.use',dep))) OR NOT EXISTS(SELECT FROM unnest(d.departments) dep WHERE NOT private.has_permission('articles.manage',dep))))
$$;
CREATE FUNCTION public.pilot_documents(p_action text,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
REVOKE ALL ON FUNCTION public.pilot_documents(text,uuid,jsonb),private.pilot_document_access(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_documents(text,uuid,jsonb) TO authenticated;
-- Temporary private originals, NOT the OneDrive archive. Immutable objects prevent replacement after review.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('pilot-receipts-private','pilot-receipts-private',false,15728640,ARRAY['application/pdf','image/jpeg','image/png','image/webp']);
CREATE FUNCTION private.pilot_document_file_access(object_path text,writing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT FROM public.pilot_document_files f JOIN public.pilot_trade_documents d ON d.id=f.document_id WHERE f.path=object_path AND private.pilot_document_access(d.id,writing) AND (NOT writing OR d.phase NOT IN ('reviewed','applied')))$$;
REVOKE ALL ON FUNCTION private.pilot_document_file_access(text,boolean) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION private.pilot_document_file_access(text,boolean) TO authenticated;
CREATE POLICY pilot_receipt_original_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='pilot-receipts-private' AND private.pilot_document_file_access(name,true));
CREATE POLICY pilot_receipt_original_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='pilot-receipts-private' AND private.pilot_document_file_access(name,false));
CREATE FUNCTION private.pilot_supplier_scope_document_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF EXISTS(SELECT FROM public.pilot_trade_documents d WHERE d.supplier_id=OLD.supplier_id AND OLD.department=ANY(d.departments)) THEN RAISE EXCEPTION 'SUPPLIER_SCOPE_DOCUMENT_HISTORY' USING ERRCODE='23514';END IF;RETURN OLD;END$$;
REVOKE ALL ON FUNCTION private.pilot_supplier_scope_document_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pilot_supplier_scope_document_guard BEFORE DELETE ON public.pilot_supplier_departments FOR EACH ROW EXECUTE FUNCTION private.pilot_supplier_scope_document_guard();
COMMIT;
