-- Pilot only. Additive supplier scopes; no account permissions changed.
BEGIN;
SET LOCAL statement_timeout='25s'; SET LOCAL lock_timeout='3s';
DO $$BEGIN
 IF md5(pg_get_functiondef('public.pilot_operations(text,uuid,jsonb)'::regprocedure))<>'58725c97550d6eb9e0a4a2bac3b85337' THEN RAISE EXCEPTION 'PREVIOUS_OPERATIONS_CHANGED';END IF;
END$$;
CREATE TABLE public.pilot_supplier_departments(supplier_id uuid NOT NULL REFERENCES public.suppliers(id),department text NOT NULL CHECK(department IN ('cuisine','salle','nettoyage')),PRIMARY KEY(supplier_id,department));
INSERT INTO public.pilot_supplier_departments SELECT id,department FROM public.suppliers;
ALTER TABLE public.pilot_supplier_departments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_supplier_departments FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.pilot_supplier_in_department(sid uuid,dep text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT FROM public.pilot_supplier_departments WHERE supplier_id=sid AND department=dep)$$;
CREATE FUNCTION private.pilot_check_supplier_scopes(sid uuid,dep text,scopes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d text;
BEGIN
 IF scopes IS NULL THEN scopes=coalesce((SELECT jsonb_agg(department) FROM public.pilot_supplier_departments WHERE supplier_id=sid),jsonb_build_array(dep));END IF;
 IF jsonb_typeof(scopes)<>'array' OR jsonb_array_length(scopes) NOT BETWEEN 1 AND 3 OR NOT scopes ? dep THEN RAISE EXCEPTION 'SUPPLIER_SCOPES' USING ERRCODE='22023';END IF;
 FOR d IN SELECT DISTINCT x FROM (SELECT jsonb_array_elements_text(scopes) x UNION SELECT department FROM public.pilot_supplier_departments WHERE supplier_id=sid) a LOOP
 IF d NOT IN ('cuisine','salle','nettoyage') OR NOT private.has_permission('suppliers.manage',d) THEN RAISE EXCEPTION 'SUPPLIER_ALL_SCOPES_PERMISSION' USING ERRCODE='42501';END IF;
 END LOOP;
 -- Existing documents/products keep their scope. Do not orphan an old department.
 IF EXISTS(SELECT FROM public.pilot_supplier_departments d WHERE d.supplier_id=sid AND NOT scopes ? d.department AND
 (EXISTS(SELECT FROM public.pilot_product_offers o JOIN public.pilot_products p ON p.id=o.product_id WHERE o.supplier_id=sid AND p.department=d.department)
 OR EXISTS(SELECT FROM public.articles a WHERE a.supplier_id=sid AND a.department=d.department)
 OR EXISTS(SELECT FROM public.orders o JOIN public.suppliers s ON s.id=sid WHERE lower(o.supplier)=lower(s.name) AND o.department=d.department))) THEN RAISE EXCEPTION 'SUPPLIER_SCOPE_IN_USE' USING ERRCODE='23514';END IF;
END$$;
CREATE FUNCTION private.pilot_set_supplier_scopes(sid uuid,dep text,scopes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF scopes IS NULL THEN RETURN;END IF;
 PERFORM private.pilot_check_supplier_scopes(sid,dep,scopes);
 DELETE FROM public.pilot_supplier_departments WHERE supplier_id=sid AND NOT scopes ? department;
 INSERT INTO public.pilot_supplier_departments SELECT sid,x FROM jsonb_array_elements_text(scopes) x ON CONFLICT DO NOTHING;
END$$;
CREATE FUNCTION private.pilot_supplier_insert_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN INSERT INTO public.pilot_supplier_departments VALUES(NEW.id,NEW.department);RETURN NEW;END$$;
CREATE TRIGGER pilot_supplier_insert_scope AFTER INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION private.pilot_supplier_insert_scope();
CREATE FUNCTION private.pilot_supplier_update_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NEW.department IS DISTINCT FROM OLD.department THEN RAISE EXCEPTION 'USE_SUPPLIER_SCOPES_KEEP_HISTORY' USING ERRCODE='23514';END IF;
 IF auth.uid() IS NOT NULL THEN PERFORM private.pilot_check_supplier_scopes(OLD.id,OLD.department,NULL);END IF;RETURN NEW;
END$$;
CREATE TRIGGER pilot_supplier_update_guard BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION private.pilot_supplier_update_guard();
CREATE OR REPLACE FUNCTION private.stopflow_060_cascade_supplier_department() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NEW.name IS DISTINCT FROM OLD.name THEN
 UPDATE public.articles SET supplier=NEW.name WHERE supplier_id=NEW.id;
 UPDATE public.orders SET supplier=NEW.name WHERE status='Brouillon' AND lower(supplier)=lower(OLD.name);
 END IF;RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION private.stopflow_060_apply_article_department() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE s public.suppliers;BEGIN
 SELECT * INTO s FROM public.suppliers WHERE id=NEW.supplier_id OR (NEW.supplier_id IS NULL AND lower(name)=lower(btrim(NEW.supplier))) ORDER BY id LIMIT 1;
 IF s.id IS NULL OR NOT private.pilot_supplier_in_department(s.id,NEW.department) THEN RAISE EXCEPTION 'ARTICLE_SUPPLIER_SCOPE' USING ERRCODE='23514';END IF;
 NEW.supplier_id=s.id;NEW.supplier=s.name;RETURN NEW;END$$;
CREATE OR REPLACE FUNCTION private.stopflow_060_apply_order_department() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE s public.suppliers;BEGIN
 SELECT * INTO s FROM public.suppliers WHERE lower(name)=lower(btrim(NEW.supplier)) ORDER BY id LIMIT 1;
 IF s.id IS NULL OR NOT private.pilot_supplier_in_department(s.id,NEW.department) OR (TG_OP='INSERT' AND NOT s.active) THEN RAISE EXCEPTION 'ORDER_SUPPLIER_SCOPE' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND NEW.department IS DISTINCT FROM OLD.department THEN RAISE EXCEPTION 'ORDER_SCOPE_IMMUTABLE' USING ERRCODE='23514';END IF;
 NEW.supplier=s.name;RETURN NEW;END$$;
DROP POLICY suppliers_select_permissions ON public.suppliers;
CREATE POLICY suppliers_select_permissions ON public.suppliers FOR SELECT TO authenticated USING(EXISTS(SELECT FROM public.pilot_supplier_departments d WHERE d.supplier_id=id AND private.can_read_catalog_department(d.department)) AND (active OR EXISTS(SELECT FROM public.pilot_supplier_departments d WHERE d.supplier_id=id AND (private.has_permission('suppliers.manage',d.department) OR private.has_permission('articles.manage',d.department)))));
-- The helper used by the SELECT policy is a narrowly scoped definer, not direct table access.
CREATE FUNCTION private.pilot_can_read_supplier(sid uuid,is_active boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT FROM public.pilot_supplier_departments d WHERE d.supplier_id=sid AND private.can_read_catalog_department(d.department) AND (is_active OR private.has_permission('suppliers.manage',d.department) OR private.has_permission('articles.manage',d.department)))$$;
ALTER POLICY suppliers_select_permissions ON public.suppliers USING(private.pilot_can_read_supplier(id,active));
ALTER TABLE public.pilot_product_offers ADD COLUMN supplier_reference text NOT NULL DEFAULT '' CHECK(length(supplier_reference)<=100),ADD COLUMN characteristics jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(characteristics)='object'),ADD COLUMN price_date date,ADD COLUMN price_source uuid;
CREATE UNIQUE INDEX pilot_offer_reference_unique ON public.pilot_product_offers(supplier_id,product_id,lower(supplier_reference)) WHERE supplier_reference<>'';
CREATE OR REPLACE FUNCTION public.pilot_operations(p_action text,p_request uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dep text=p_payload->>'department';actor uuid=auth.uid();key text;result jsonb;old_intent private.pilot_operation_intents;
 prod public.pilot_products;offer public.pilot_product_offers;vendor public.suppliers;run public.pilot_inventory_runs;doc public.orders;
 item jsonb;lines jsonb='[]';prepared jsonb='[]';ids uuid[]='{}';v_id uuid;oid uuid;sid uuid;v_version bigint;
 stock numeric;target numeric;need numeric;factor numeric;pack numeric;packs numeric;note text;can_edit boolean;
BEGIN
 IF actor IS NULL OR NOT private.is_active_user() OR dep NOT IN ('cuisine','salle','nettoyage') OR dep IS NULL
 OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>500000 THEN RAISE EXCEPTION 'OPERATIONS_ACCESS' USING ERRCODE='42501';END IF;
 IF p_action IN ('context','inventory_read','documents') THEN
  IF NOT private.can_read_catalog_department(dep) AND NOT private.has_permission('history.view',dep) THEN RAISE EXCEPTION 'OPERATIONS_ACCESS' USING ERRCODE='42501';END IF;
 ELSIF p_action IN ('inventory_save','prepare') THEN key='inventory.use';
 ELSIF p_action IN ('product','offer','preference') THEN key='articles.manage';
 ELSIF p_action='supplier' THEN key='suppliers.manage';
 ELSIF p_action='transition' THEN key=NULL;
 ELSIF p_action='receipt' THEN
  SELECT i.* INTO old_intent FROM private.pilot_operation_intents i WHERE i.id=p_request AND i.actor=auth.uid() AND i.department=dep;
  IF NOT private.can_read_catalog_department(dep) THEN RAISE EXCEPTION 'OPERATIONS_ACCESS' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('found',old_intent.id IS NOT NULL,'result',old_intent.result);
 ELSE RAISE EXCEPTION 'OPERATIONS_ACTION' USING ERRCODE='22023';END IF;
 IF key IS NOT NULL AND NOT private.has_permission(key,dep) THEN RAISE EXCEPTION 'OPERATIONS_PERMISSION' USING ERRCODE='42501';END IF;
 IF p_action='context' THEN
  IF NOT private.can_read_catalog_department(dep) THEN RAISE EXCEPTION 'CATALOGUE_PERMISSION' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('products',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM public.pilot_products p WHERE p.department=dep),'[]'),
   'offers',coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM public.pilot_product_offers o JOIN public.pilot_products p ON p.id=o.product_id WHERE p.department=dep),'[]'),
   'suppliers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'active',s.active,'order_email',coalesce(nullif(s.order_email,''),s.email),'version',s.pilot_version,'departments',(SELECT jsonb_agg(d.department ORDER BY d.department) FROM public.pilot_supplier_departments d WHERE d.supplier_id=s.id))) FROM public.suppliers s WHERE private.pilot_supplier_in_department(s.id,dep)),'[]'),
   'runs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'phase',r.phase,'updated_at',r.updated_at)) FROM public.pilot_inventory_runs r WHERE r.department=dep AND (r.author_id=actor OR private.has_permission('orders.manage',dep))),'[]'));
 END IF;
 IF p_action='documents' THEN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('order',to_jsonb(o),'snapshot',d.snapshot) ORDER BY o.created_at DESC) FROM public.orders o JOIN public.pilot_order_documents d ON d.order_id=o.id WHERE o.department=dep AND private.can_access_order(o.id)),'[]');
 END IF;
 IF p_action='inventory_read' THEN
  SELECT * INTO run FROM public.pilot_inventory_runs r WHERE r.id=(p_payload->>'id')::uuid AND r.department=dep AND (r.author_id=actor OR private.has_permission('orders.manage',dep));
  IF run.id IS NULL THEN RAISE EXCEPTION 'INVENTORY_NOT_ACCESSIBLE' USING ERRCODE='42501';END IF;RETURN to_jsonb(run);
 END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'REQUEST_REQUIRED' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT i.* INTO old_intent FROM private.pilot_operation_intents i WHERE i.id=p_request;
 IF old_intent.id IS NOT NULL THEN
  IF old_intent.actor IS DISTINCT FROM actor OR old_intent.action<>p_action OR old_intent.payload<>p_payload THEN RAISE EXCEPTION 'INTENTION_DIFFERENT' USING ERRCODE='40001';END IF;
  -- Access was checked above; transition replay also needs current access.
  IF p_action='transition' AND NOT private.can_access_order((p_payload->>'id')::uuid) THEN RAISE EXCEPTION 'OPERATIONS_PERMISSION' USING ERRCODE='42501';END IF;
  RETURN old_intent.result;
 END IF;
 v_id=(p_payload->>'id')::uuid;v_version=(p_payload->>'version')::bigint;
 IF p_action='supplier' THEN
  PERFORM private.pilot_check_supplier_scopes(v_id,dep,p_payload->'departments');
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(p_payload->>'name')),1));
  IF EXISTS(SELECT FROM public.suppliers s WHERE lower(btrim(s.name))=lower(btrim(p_payload->>'name')) AND s.id<>v_id) THEN RAISE EXCEPTION 'SUPPLIER_NAME_ALREADY_USED_REVIEW' USING ERRCODE='23514';END IF;
  SELECT * INTO vendor FROM public.suppliers WHERE id=v_id FOR UPDATE;
  IF FOUND THEN IF NOT private.pilot_supplier_in_department(vendor.id,dep) OR vendor.pilot_version IS DISTINCT FROM v_version THEN RAISE EXCEPTION 'SUPPLIER_CONFLICT' USING ERRCODE='40001';END IF;
   UPDATE public.suppliers SET name=btrim(p_payload->>'name'),order_email=btrim(p_payload->>'order_email') WHERE id=v_id RETURNING * INTO vendor;
  ELSE
   IF v_version IS NOT NULL THEN RAISE EXCEPTION 'SUPPLIER_CONFLICT' USING ERRCODE='40001';END IF;
   INSERT INTO public.suppliers(id,code,name,order_email,department) VALUES(v_id,'p-'||v_id,btrim(p_payload->>'name'),btrim(p_payload->>'order_email'),dep) RETURNING * INTO vendor;
  END IF;
  IF length(vendor.name) NOT BETWEEN 1 AND 160 OR (coalesce(vendor.order_email,'')<>'' AND vendor.order_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'SUPPLIER_FIELDS' USING ERRCODE='22023';END IF;
  PERFORM private.pilot_set_supplier_scopes(vendor.id,dep,p_payload->'departments');
  result=jsonb_build_object('id',vendor.id,'version',vendor.pilot_version);
 ELSIF p_action='product' THEN
  SELECT * INTO prod FROM public.pilot_products WHERE id=v_id FOR UPDATE;
  IF FOUND THEN IF prod.department<>dep OR prod.version IS DISTINCT FROM v_version THEN RAISE EXCEPTION 'PRODUCT_CONFLICT' USING ERRCODE='40001';END IF;
   UPDATE public.pilot_products SET name=btrim(p_payload->>'name'),category=btrim(p_payload->>'category'),unit=btrim(p_payload->>'unit'),target=(p_payload->>'target')::numeric,version=version+1,updated_at=now(),updated_by=actor WHERE id=v_id RETURNING * INTO prod;
  ELSE
   IF v_version IS NOT NULL THEN RAISE EXCEPTION 'PRODUCT_CONFLICT' USING ERRCODE='40001';END IF;
   INSERT INTO public.pilot_products(id,department,name,category,unit,target,updated_by) VALUES(v_id,dep,btrim(p_payload->>'name'),coalesce(btrim(p_payload->>'category'),''),btrim(p_payload->>'unit'),(p_payload->>'target')::numeric,actor) RETURNING * INTO prod;
  END IF; result=to_jsonb(prod);
 ELSIF p_action IN ('offer','preference') THEN
  SELECT * INTO prod FROM public.pilot_products WHERE id=(p_payload->>'product_id')::uuid FOR UPDATE;
  IF prod.id IS NULL OR prod.department<>dep OR NOT prod.active THEN RAISE EXCEPTION 'PRODUCT_ACCESS' USING ERRCODE='42501';END IF;
  IF p_action='preference' THEN
   IF prod.version IS DISTINCT FROM v_version THEN RAISE EXCEPTION 'PRODUCT_CONFLICT' USING ERRCODE='40001';END IF;
   IF NOT EXISTS(SELECT FROM public.pilot_product_offers o JOIN public.suppliers s ON s.id=o.supplier_id WHERE o.id=v_id AND o.product_id=prod.id AND o.active AND s.active AND private.pilot_supplier_in_department(s.id,dep)) THEN RAISE EXCEPTION 'OFFER_ACCESS' USING ERRCODE='23514';END IF;
   UPDATE public.pilot_products SET preferred_offer_id=v_id,version=version+1,updated_at=now(),updated_by=actor WHERE id=prod.id;result=jsonb_build_object('id',prod.id);
  ELSE
   SELECT * INTO vendor FROM public.suppliers WHERE id=(p_payload->>'supplier_id')::uuid FOR SHARE;
   IF vendor.id IS NULL OR NOT private.pilot_supplier_in_department(vendor.id,dep) OR NOT vendor.active THEN RAISE EXCEPTION 'SUPPLIER_ACCESS' USING ERRCODE='42501';END IF;
   SELECT * INTO offer FROM public.pilot_product_offers WHERE id=v_id FOR UPDATE;
   IF FOUND AND (offer.product_id<>prod.id OR offer.version IS DISTINCT FROM v_version) THEN RAISE EXCEPTION 'OFFER_CONFLICT' USING ERRCODE='40001';END IF;
   IF offer.id IS NULL AND v_version IS NOT NULL THEN RAISE EXCEPTION 'OFFER_CONFLICT' USING ERRCODE='40001';END IF;
   INSERT INTO public.pilot_product_offers(id,product_id,supplier_id,pack_quantity,pack_unit,pack_price,price_basis,updated_by)
   VALUES(v_id,prod.id,vendor.id,(p_payload->>'pack_quantity')::numeric,btrim(p_payload->>'pack_unit'),(p_payload->>'pack_price')::numeric,p_payload->>'price_basis',actor)
   ON CONFLICT(id) DO UPDATE SET supplier_id=EXCLUDED.supplier_id,pack_quantity=EXCLUDED.pack_quantity,pack_unit=EXCLUDED.pack_unit,pack_price=EXCLUDED.pack_price,price_basis=EXCLUDED.price_basis,updated_by=actor,updated_at=now(),version=public.pilot_product_offers.version+1 RETURNING * INTO offer;
   IF private.pilot_unit_factor(offer.pack_unit,prod.unit) IS NULL THEN RAISE EXCEPTION 'UNITS_INCOMPATIBLE' USING ERRCODE='22023';END IF;
   UPDATE public.pilot_product_offers SET price_date=NULL,price_source=NULL,supplier_reference=CASE WHEN p_payload ? 'supplier_reference' THEN btrim(p_payload->>'supplier_reference') ELSE supplier_reference END,characteristics=CASE WHEN p_payload ? 'characteristics' THEN p_payload->'characteristics' ELSE characteristics END WHERE id=offer.id RETURNING * INTO offer;
   result=to_jsonb(offer);
  END IF;
 ELSIF p_action IN ('inventory_save','prepare') THEN
  SELECT * INTO run FROM public.pilot_inventory_runs WHERE id=v_id FOR UPDATE;
  IF run.id IS NOT NULL AND (run.department<>dep OR (run.author_id<>actor AND NOT private.has_permission('orders.manage',dep))) THEN RAISE EXCEPTION 'INVENTORY_ACCESS' USING ERRCODE='42501';END IF;
  IF run.id IS NOT NULL AND (run.revision IS DISTINCT FROM v_version OR run.phase<>'draft') THEN RAISE EXCEPTION 'INVENTORY_CONFLICT_RELOAD' USING ERRCODE='40001';END IF;
  IF run.id IS NULL AND (v_version IS NOT NULL OR p_action='prepare') THEN RAISE EXCEPTION 'INVENTORY_SAVE_FIRST' USING ERRCODE='40001';END IF;
  IF jsonb_typeof(p_payload->'lines')<>'array' OR jsonb_array_length(p_payload->'lines')>1000 THEN RAISE EXCEPTION 'INVENTORY_LINES' USING ERRCODE='22023';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   SELECT * INTO prod FROM public.pilot_products WHERE id=(item->>'product_id')::uuid FOR SHARE;
   IF prod.id IS NULL OR prod.department<>dep OR prod.id=ANY(ids) THEN RAISE EXCEPTION 'PRODUCT_ACCESS_OR_DUPLICATE' USING ERRCODE='42501';END IF;ids=array_append(ids,prod.id);
   IF (p_payload->'notes' IS NOT NULL AND jsonb_typeof(p_payload->'notes')<>'object') THEN RAISE EXCEPTION 'NOTES_OBJECT_REQUIRED' USING ERRCODE='22023';END IF;
   IF NOT coalesce(item->>'stock','') ~ '^([0-9]{1,7}([.,][0-9]{1,3})?)?$' OR NOT coalesce(item->>'target','') ~ '^([0-9]{1,7}([.,][0-9]{1,3})?)?$' THEN RAISE EXCEPTION 'COUNT_NUMBER_INVALID' USING ERRCODE='22023';END IF;
   stock=nullif(replace(item->>'stock',',','.'),'')::numeric;target=nullif(replace(item->>'target',',','.'),'')::numeric;
   IF coalesce(stock,0)>1000000 OR coalesce(target,0)>1000000 THEN RAISE EXCEPTION 'COUNT_RANGE' USING ERRCODE='22023';END IF;
   item=jsonb_build_object('product_id',prod.id,'stock',coalesce(item->>'stock',''),'target',coalesce(item->>'target',''),'offer_id',nullif(item->>'offer_id',''),'note',left(coalesce(item->>'note',''),400));
   lines=lines||jsonb_build_array(item);
   IF p_action='prepare' THEN
    IF stock IS NULL OR target IS NULL OR NOT prod.active THEN RAISE EXCEPTION 'COUNT_INCOMPLETE_OR_ARCHIVED' USING ERRCODE='23514';END IF;
    need=greatest(0,target-stock);
    IF need>0 THEN
     SELECT * INTO offer FROM public.pilot_product_offers WHERE id=(item->>'offer_id')::uuid FOR SHARE;
     SELECT * INTO vendor FROM public.suppliers WHERE id=offer.supplier_id FOR SHARE;
     factor=private.pilot_unit_factor(offer.pack_unit,prod.unit);pack=offer.pack_quantity*factor;
     IF offer.id IS NULL OR offer.product_id<>prod.id OR NOT offer.active OR vendor.id IS NULL OR NOT vendor.active OR NOT private.pilot_supplier_in_department(vendor.id,dep) OR pack IS NULL OR pack<=0 OR offer.pack_price IS NULL OR offer.price_basis IS NULL OR coalesce(nullif(vendor.order_email,''),vendor.email,'')='' THEN RAISE EXCEPTION 'OFFER_OR_RECIPIENT_INCOMPLETE' USING ERRCODE='23514';END IF;
     -- Catalogue changes cannot silently alter a reviewed supplier/pack choice.
     IF (p_payload->'versions'->>offer.id::text)::bigint IS DISTINCT FROM offer.version OR (p_payload->'versions'->>vendor.id::text)::bigint IS DISTINCT FROM vendor.pilot_version OR (p_payload->'versions'->>prod.id::text)::bigint IS DISTINCT FROM prod.version THEN RAISE EXCEPTION 'CATALOGUE_CHANGED_REVIEW' USING ERRCODE='40001';END IF;
     packs=ceil(need/pack);
     prepared=prepared||jsonb_build_array(jsonb_build_object('product_id',prod.id,'legacy_article_id',prod.legacy_article_id,'name',prod.name,'category',prod.category,'unit',prod.unit,'stock',stock,'target',target,'need',need,'supplier_id',vendor.id,'supplier_name',vendor.name,'email',coalesce(nullif(vendor.order_email,''),vendor.email),'packs',packs,'pack_quantity',offer.pack_quantity,'pack_unit',offer.pack_unit,'ordered',packs*pack,'price',offer.pack_price,'basis',offer.price_basis,'total',round(packs*offer.pack_price,2),'note',item->>'note'));
    END IF;
   END IF;
  END LOOP;
  IF jsonb_array_length(lines)=0 THEN RAISE EXCEPTION 'COUNT_EMPTY' USING ERRCODE='23514';END IF;
  IF p_action='inventory_save' THEN
   IF run.id IS NULL THEN INSERT INTO public.pilot_inventory_runs(id,department,author_id,payload) VALUES(v_id,dep,actor,jsonb_build_object('lines',lines,'notes',coalesce(p_payload->'notes','{}'))) RETURNING * INTO run;
   ELSE UPDATE public.pilot_inventory_runs SET payload=jsonb_build_object('lines',lines,'notes',coalesce(p_payload->'notes','{}')),revision=revision+1,updated_at=now() WHERE id=v_id RETURNING * INTO run;END IF;
  ELSE
   ids='{}';
   FOR sid IN SELECT DISTINCT (x->>'supplier_id')::uuid FROM jsonb_array_elements(prepared) x LOOP
    oid=gen_random_uuid();note=left(coalesce(p_payload->'notes'->>sid::text,''),2000);
    INSERT INTO public.orders(id,supplier,author_id,author_name,department,note) SELECT oid,s.name,actor,concat_ws(' ',p.prenom,p.nom),dep,note FROM public.suppliers s JOIN public.profiles p ON p.id=actor WHERE s.id=sid;
    INSERT INTO public.order_lines(order_id,line_position,article_id,article_name,category,unit,stock,target,proposed,quantity,purchase_price,line_total)
    SELECT oid,row_number() OVER (),x->>'legacy_article_id',x->>'name',x->>'category',x->>'unit',(x->>'stock')::numeric,(x->>'target')::numeric,(x->>'need')::numeric,(x->>'ordered')::numeric,(x->>'price')::numeric/((x->>'ordered')::numeric/(x->>'packs')::numeric),(x->>'total')::numeric FROM jsonb_array_elements(prepared) x WHERE (x->>'supplier_id')::uuid=sid;
    INSERT INTO public.pilot_order_documents VALUES(oid,v_id,sid,jsonb_build_object('lines',(SELECT jsonb_agg(x) FROM jsonb_array_elements(prepared) x WHERE (x->>'supplier_id')::uuid=sid),'note',note));ids=array_append(ids,oid);
   END LOOP;
   UPDATE public.pilot_inventory_runs SET payload=jsonb_build_object('lines',lines,'notes',coalesce(p_payload->'notes','{}')),phase='prepared',order_ids=ids,revision=revision+1,updated_at=now() WHERE id=v_id RETURNING * INTO run;
  END IF;result=to_jsonb(run);
 ELSIF p_action='transition' THEN
  SELECT * INTO doc FROM public.orders WHERE id=v_id FOR UPDATE;
  IF doc.id IS NULL OR doc.department<>dep OR NOT private.can_access_order(doc.id) THEN RAISE EXCEPTION 'ORDER_ACCESS' USING ERRCODE='42501';END IF;
  IF doc.revision IS DISTINCT FROM v_version THEN RAISE EXCEPTION 'ORDER_CONFLICT' USING ERRCODE='40001';END IF;
  CASE p_payload->>'transition'
   WHEN 'submit' THEN PERFORM public.submit_order(v_id);
   WHEN 'validate' THEN PERFORM public.validate_order(v_id);
   WHEN 'ordered' THEN PERFORM public.mark_ordered(v_id);
   WHEN 'cancel' THEN PERFORM public.cancel_order(v_id);
   ELSE RAISE EXCEPTION 'ORDER_ACTION_INVALID' USING ERRCODE='22023';END CASE;
  UPDATE public.orders SET revision=revision+1 WHERE id=v_id RETURNING * INTO doc;result=to_jsonb(doc);
 END IF;
 INSERT INTO private.pilot_operation_intents(id,actor,action,department,payload,result) VALUES(p_request,actor,p_action,dep,p_payload,result);
 RETURN result;
END$$;

REVOKE ALL ON FUNCTION private.pilot_supplier_in_department(uuid,text),private.pilot_check_supplier_scopes(uuid,text,jsonb),private.pilot_set_supplier_scopes(uuid,text,jsonb),private.pilot_supplier_insert_scope(),private.pilot_supplier_update_guard(),private.pilot_can_read_supplier(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.pilot_can_read_supplier(uuid,boolean) TO authenticated;
COMMIT;
