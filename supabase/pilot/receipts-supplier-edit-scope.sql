-- Legacy department is immutable provenance, not the remaining shared scopes.
BEGIN;
SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='3s';
CREATE OR REPLACE FUNCTION private.pilot_supplier_update_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_scope text;
BEGIN
 IF NEW.department IS DISTINCT FROM OLD.department THEN RAISE EXCEPTION 'USE_SUPPLIER_SCOPES_KEEP_HISTORY' USING ERRCODE='23514';END IF;
 SELECT department INTO current_scope FROM public.pilot_supplier_departments WHERE supplier_id=OLD.id ORDER BY department LIMIT 1;
 IF current_scope IS NULL THEN RAISE EXCEPTION 'SUPPLIER_SCOPES_MISSING' USING ERRCODE='23514';END IF;
 IF auth.uid() IS NOT NULL THEN PERFORM private.pilot_check_supplier_scopes(OLD.id,current_scope,NULL);END IF;
 RETURN NEW;
END$$;
CREATE FUNCTION private.pilot_can_manage_supplier(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.is_active_user() AND EXISTS(SELECT FROM public.pilot_supplier_departments WHERE supplier_id=sid) AND NOT EXISTS(SELECT FROM public.pilot_supplier_departments WHERE supplier_id=sid AND NOT private.has_permission('suppliers.manage',department))
$$;
REVOKE ALL ON FUNCTION private.pilot_can_manage_supplier(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.pilot_can_manage_supplier(uuid) TO authenticated;
ALTER POLICY suppliers_update_permissions ON public.suppliers USING(private.pilot_can_manage_supplier(id)) WITH CHECK(private.pilot_can_manage_supplier(id) AND private.is_operational_department(department));
COMMIT;
