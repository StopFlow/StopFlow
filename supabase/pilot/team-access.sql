-- Pilot-only onboarding. No internal Auth DDL and no table/plan recreation.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
CREATE TABLE private.pilot_owner_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 owner_email text NOT NULL,
 owner_id uuid REFERENCES auth.users(id),
 establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id)
);
REVOKE ALL ON private.pilot_owner_config FROM PUBLIC,anon,authenticated;
CREATE TABLE public.pilot_registration_requests (
 profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.pilot_team_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK(action IN ('approved','rejected','revoked')),
 version bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pilot_registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_team_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_registration_requests,public.pilot_team_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.pilot_team_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pilot_registration_requests,public.pilot_team_events TO authenticated;

CREATE FUNCTION private.pilot_account_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles p WHERE p.id=p_user AND p.actif
 AND NOT EXISTS(SELECT FROM public.pilot_registration_requests r WHERE r.profile_id=p.id AND r.status<>'approved'));
$$;
CREATE FUNCTION private.pilot_is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.pilot_owner_config c JOIN public.profiles p ON p.id=c.owner_id
 WHERE c.singleton AND p.id=auth.uid() AND p.role='admin' AND private.pilot_account_active(p.id));
$$;
REVOKE ALL ON FUNCTION private.pilot_account_active(uuid),private.pilot_is_owner() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.pilot_account_active(uuid),private.pilot_is_owner() TO authenticated;
CREATE POLICY pilot_requests_read ON public.pilot_registration_requests FOR SELECT TO authenticated
 USING(profile_id=auth.uid() OR private.pilot_is_owner());
CREATE POLICY pilot_events_read ON public.pilot_team_events FOR SELECT TO authenticated USING(private.pilot_is_owner());

-- Preserve historical permissions; add the approval state as a required guard.
CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND role='admin' AND private.pilot_account_active(id));
$$;
CREATE OR REPLACE FUNCTION private.has_permission_for_user(p_user_id uuid,p_permission_key text,p_scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.is_known_permission_key(p_permission_key) AND private.is_valid_permission_scope(p_permission_key,p_scope)
 AND private.pilot_account_active(p_user_id) AND (
 EXISTS(SELECT FROM public.profiles p WHERE p.id=p_user_id AND p.role='admin') OR
 EXISTS(SELECT FROM public.profile_permissions p WHERE p.profile_id=p_user_id AND p.permission_key=p_permission_key AND p.scope=p_scope));
$$;
CREATE OR REPLACE FUNCTION private.reservations_can(p_establishment_id uuid,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.reservation_memberships m
 JOIN public.reservation_establishments e ON e.id=m.establishment_id AND e.active
 JOIN public.profiles p ON p.id=m.profile_id AND private.pilot_account_active(p.id)
 WHERE m.establishment_id=p_establishment_id AND m.profile_id=auth.uid() AND m.active
 AND CASE p_action WHEN 'view' THEN m.can_view WHEN 'rooms.manage' THEN m.can_manage_rooms
 WHEN 'tables.manage' THEN m.can_manage_tables WHEN 'layouts.manage' THEN m.can_manage_layouts ELSE false END);
$$;

-- Restrictive policies compose with the existing department/tenant policies.
DO $gates$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
 AND tablename NOT IN ('profiles','pilot_registration_requests','pilot_team_events') LOOP
  EXECUTE format('CREATE POLICY pilot_approved_account ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(private.pilot_account_active(auth.uid())) WITH CHECK(private.pilot_account_active(auth.uid()))',t);
 END LOOP;
END $gates$;
CREATE POLICY pilot_profile_boundary ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
 USING(id=auth.uid() OR private.pilot_is_owner()) WITH CHECK(private.pilot_is_owner());

CREATE FUNCTION public.pilot_request_access(p_first text,p_last text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u auth.users; p public.profiles; r public.pilot_registration_requests;
BEGIN
 IF auth.uid() IS NULL OR length(btrim(coalesce(p_first,''))) NOT BETWEEN 1 AND 80
 OR length(btrim(coalesce(p_last,''))) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'PILOT_REGISTRATION_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR u.email_confirmed_at IS NULL OR u.is_anonymous THEN
  RAISE EXCEPTION 'PILOT_CONFIRMED_EMAIL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM private.pilot_owner_config WHERE lower(owner_email)=lower(u.email)) THEN
  RAISE EXCEPTION 'PILOT_OWNER_PRIVATE_ACTIVATION_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pilot-request:'||u.id,0));
 SELECT * INTO p FROM public.profiles WHERE id=u.id FOR UPDATE;
 SELECT * INTO r FROM public.pilot_registration_requests WHERE profile_id=u.id FOR UPDATE;
 IF r.profile_id IS NOT NULL THEN RETURN jsonb_build_object('status',r.status,'version',r.version); END IF;
 IF p.id IS NOT NULL AND p.actif THEN RETURN jsonb_build_object('status','approved','version',NULL); END IF;
 IF p.id IS NULL THEN
  INSERT INTO public.profiles(id,email,prenom,nom,role,actif,departement)
  VALUES(u.id,u.email,btrim(p_first),btrim(p_last),'employe',false,NULL);
 END IF;
 DELETE FROM public.profile_permissions WHERE profile_id=u.id;
 DELETE FROM public.profile_departments WHERE profile_id=u.id;
 INSERT INTO public.pilot_registration_requests(profile_id) VALUES(u.id) RETURNING * INTO r;
 RETURN jsonb_build_object('status',r.status,'version',r.version);
END $$;

CREATE FUNCTION public.pilot_team_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE own boolean:=private.pilot_is_owner(); requests jsonb; me public.profiles;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PILOT_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO me FROM public.profiles WHERE id=auth.uid();
 IF own THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'first',p.prenom,'last',p.nom,'email',p.email,
  'role',p.role,'status',r.status,'version',r.version,'permissions',coalesce((SELECT jsonb_agg(jsonb_build_object('permission_key',x.permission_key,'scope',x.scope)) FROM public.profile_permissions x WHERE x.profile_id=p.id),'[]'),
  'reservations',coalesce((SELECT to_jsonb(m)-'created_by'-'updated_by' FROM public.reservation_memberships m JOIN private.pilot_owner_config c ON c.establishment_id=m.establishment_id WHERE m.profile_id=p.id),'{}')) ORDER BY r.created_at),'[]')
  INTO requests FROM public.pilot_registration_requests r JOIN public.profiles p ON p.id=r.profile_id;
 ELSE requests:='[]'; END IF;
 RETURN jsonb_build_object('is_owner',own,'status',CASE WHEN private.pilot_account_active(auth.uid()) THEN 'approved' ELSE coalesce((SELECT status FROM public.pilot_registration_requests WHERE profile_id=auth.uid()),'unregistered') END,
 'profile',CASE WHEN me.id IS NULL THEN NULL ELSE jsonb_build_object('first',me.prenom,'last',me.nom,'role',me.role,'active',me.actif) END,
 'pending_count',CASE WHEN own THEN (SELECT count(*) FROM public.pilot_registration_requests WHERE status='pending') ELSE 0 END,'requests',requests);
END $$;

CREATE FUNCTION public.pilot_review_request(p_profile uuid,p_version bigint,p_decision text,p_role text,p_permissions jsonb,p_reservations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.pilot_registration_requests; est uuid; p public.profiles; flags jsonb; k text;
BEGIN
 IF NOT private.pilot_is_owner() OR p_profile=auth.uid() THEN RAISE EXCEPTION 'PILOT_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approved','rejected','revoked') OR p_role NOT IN ('employe','responsable')
 OR jsonb_typeof(p_permissions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_permissions)>80
 OR jsonb_typeof(p_reservations) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'PILOT_REVIEW_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(p_permissions) x WHERE jsonb_typeof(x)<>'object'
 OR NOT coalesce(private.is_known_permission_key(x->>'permission_key'),false)
 OR NOT coalesce(private.is_valid_permission_scope(x->>'permission_key',x->>'scope'),false)) THEN
  RAISE EXCEPTION 'PILOT_PERMISSION_INVALID' USING ERRCODE='22023'; END IF;
 flags:='{"can_view":false,"can_view_bookings":false,"can_manage_bookings":false,"can_manage_rooms":false,"can_manage_tables":false,"can_manage_layouts":false}'::jsonb;
 FOR k IN SELECT jsonb_object_keys(p_reservations) LOOP
  IF NOT flags ? k OR jsonb_typeof(p_reservations->k)<>'boolean' THEN RAISE EXCEPTION 'PILOT_RESERVATIONS_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 flags:=flags||p_reservations;
 SELECT * INTO r FROM public.pilot_registration_requests WHERE profile_id=p_profile FOR UPDATE;
 IF r.profile_id IS NULL THEN RAISE EXCEPTION 'PILOT_REQUEST_MISSING' USING ERRCODE='P0002'; END IF;
 IF p_version IS NULL OR r.version<>p_version THEN RAISE EXCEPTION 'PILOT_REQUEST_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_profile FOR UPDATE;
 SELECT establishment_id INTO STRICT est FROM private.pilot_owner_config WHERE singleton;
 IF p_decision<>'approved' THEN p_permissions:='[]'; flags:='{"can_view":false,"can_view_bookings":false,"can_manage_bookings":false,"can_manage_rooms":false,"can_manage_tables":false,"can_manage_layouts":false}'; END IF;
 -- State, legacy permissions, profile and membership change in this transaction.
 UPDATE public.pilot_registration_requests SET status=p_decision,version=version+1,decided_at=now(),decided_by=auth.uid() WHERE profile_id=p_profile RETURNING * INTO r;
 PERFORM public.admin_set_user_profile_permissions_070(p_profile,p.prenom,p.nom,p_role,p_decision='approved',p_permissions,'update');
 INSERT INTO public.reservation_memberships(establishment_id,profile_id,active,can_view,can_view_bookings,can_manage_bookings,can_manage_rooms,can_manage_tables,can_manage_layouts)
 VALUES(est,p_profile,p_decision='approved',(flags->>'can_view')::boolean,(flags->>'can_view_bookings')::boolean,(flags->>'can_manage_bookings')::boolean,
 (flags->>'can_manage_rooms')::boolean,(flags->>'can_manage_tables')::boolean,(flags->>'can_manage_layouts')::boolean)
 ON CONFLICT(establishment_id,profile_id) DO UPDATE SET active=excluded.active,can_view=excluded.can_view,
 can_view_bookings=excluded.can_view_bookings,can_manage_bookings=excluded.can_manage_bookings,
 can_manage_rooms=excluded.can_manage_rooms,can_manage_tables=excluded.can_manage_tables,can_manage_layouts=excluded.can_manage_layouts;
 INSERT INTO public.pilot_team_events(actor_id,profile_id,action,version) VALUES(auth.uid(),p_profile,p_decision,r.version);
 RETURN jsonb_build_object('status',r.status,'version',r.version);
END $$;

-- Called only from the private server-key bootstrap, never from the public app.
CREATE FUNCTION public.pilot_complete_owner_bootstrap(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.pilot_owner_config; u auth.users; p public.profiles;
BEGIN
 SELECT * INTO STRICT c FROM private.pilot_owner_config WHERE singleton FOR UPDATE;
 SELECT * INTO u FROM auth.users WHERE id=p_user AND lower(email)=lower(c.owner_email);
 IF u.id IS NULL OR (c.owner_id IS NOT NULL AND c.owner_id<>u.id) THEN RAISE EXCEPTION 'PILOT_OWNER_IDENTITY_DIFFERENT' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=u.id FOR UPDATE;
 IF p.id IS NOT NULL AND (p.role<>'admin' OR NOT p.actif) THEN RAISE EXCEPTION 'PILOT_EXISTING_PROFILE_REVIEW_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p.id IS NULL THEN INSERT INTO public.profiles(id,email,prenom,nom,role,actif,departement) VALUES(u.id,u.email,'Quentin','Pollet','admin',true,'bureau'); END IF;
 UPDATE private.pilot_owner_config SET owner_id=u.id WHERE singleton;
 INSERT INTO public.reservation_memberships(establishment_id,profile_id,active,can_view,can_view_bookings,can_manage_bookings,can_manage_rooms,can_manage_tables,can_manage_layouts)
 VALUES(c.establishment_id,u.id,true,true,true,true,true,true,true)
 ON CONFLICT(establishment_id,profile_id) DO UPDATE SET active=true,can_view=true,can_view_bookings=true,can_manage_bookings=true,can_manage_rooms=true,can_manage_tables=true,can_manage_layouts=true;
 RETURN jsonb_build_object('owner_ready',true,'role','admin','reservations_complete',true);
END $$;
REVOKE ALL ON FUNCTION public.pilot_request_access(text,text),public.pilot_team_context(),public.pilot_review_request(uuid,bigint,text,text,jsonb,jsonb),public.pilot_complete_owner_bootstrap(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_request_access(text,text),public.pilot_team_context(),public.pilot_review_request(uuid,bigint,text,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_complete_owner_bootstrap(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
