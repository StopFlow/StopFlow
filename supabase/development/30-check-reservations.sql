-- Read-only metadata acceptance. Real JWT/RLS/CRUD tests are still mandatory.
begin read only;
do $$
declare item text; relation regclass; signature regprocedure;
begin
  foreach item in array array['reservation_establishments','reservation_memberships','reservation_rooms','reservation_tables','reservation_layouts','reservation_layout_elements','reservation_audit'] loop
    relation:=to_regclass('public.'||item);
    if relation is null then raise exception 'RESERVATIONS_MISSING: %',item; end if;
    if not exists(select 1 from pg_class where oid=relation and relrowsecurity) then raise exception 'RLS_MISSING: %',item; end if;
    if has_table_privilege('authenticated',relation,'INSERT,UPDATE,DELETE') or has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'UNSAFE_DIRECT_GRANT: %',item; end if;
    if not has_table_privilege('authenticated',relation,'SELECT') then raise exception 'READ_GRANT_MISSING: %',item; end if;
  end loop;
  foreach item in array array[
    'public.reservations_context()', 'public.reservations_read(uuid)',
    'public.reservations_save_room(uuid,uuid,bigint,text,text,integer,boolean)',
    'public.reservations_save_table(uuid,uuid,uuid,bigint,text,integer,text,boolean)'
  ] loop
    signature:=to_regprocedure(item);
    if signature is null then raise exception 'RPC_MISSING: %',item; end if;
    if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'RPC_GRANTS: %',item; end if;
    if not exists(select 1 from pg_proc where oid=signature and prosecdef and coalesce('search_path=""'=any(proconfig),false)) then raise exception 'RPC_DEFINER_OR_PATH: %',item; end if;
  end loop;
end $$;
commit;
