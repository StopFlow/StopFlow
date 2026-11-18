-- An invited owner has no business access until private password activation.
BEGIN;
SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s';
ALTER TABLE private.pilot_owner_config ADD COLUMN activation_complete boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION private.pilot_account_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles p WHERE p.id=p_user AND p.actif
 AND NOT EXISTS(SELECT FROM public.pilot_registration_requests r WHERE r.profile_id=p.id AND r.status<>'approved')
 AND NOT EXISTS(SELECT FROM private.pilot_owner_config c WHERE c.owner_id=p.id AND NOT c.activation_complete));
$$;
CREATE FUNCTION public.pilot_owner_activation_complete() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT FROM private.pilot_owner_config c JOIN auth.users u ON u.id=c.owner_id
 WHERE c.owner_id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND coalesce(u.encrypted_password,'')<>'') THEN
  RAISE EXCEPTION 'PILOT_PRIVATE_PASSWORD_ACTIVATION_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE private.pilot_owner_config SET activation_complete=true WHERE owner_id=auth.uid();
 RETURN jsonb_build_object('activated',true);
END $$;
REVOKE ALL ON FUNCTION public.pilot_owner_activation_complete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pilot_owner_activation_complete() TO authenticated;
-- Preserve the context implementation; add the owner's pre-activation state.
ALTER FUNCTION public.pilot_team_context() RENAME TO pilot_team_context_internal;
ALTER FUNCTION public.pilot_team_context_internal() SET SCHEMA private;
REVOKE ALL ON FUNCTION private.pilot_team_context_internal() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.pilot_team_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=private.pilot_team_context_internal();
 IF EXISTS(SELECT FROM private.pilot_owner_config WHERE owner_id=auth.uid() AND NOT activation_complete) THEN
  result:=jsonb_set(result,'{status}','"activation_required"'); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pilot_team_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pilot_team_context() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
