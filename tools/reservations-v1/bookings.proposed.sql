-- Review only. Requires existing foundations + btree_gist (no extension install here).
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL transaction_timeout='30s';
DO $pre$
BEGIN
 IF to_regprocedure('private.reservations_can(uuid,text)') IS NULL
 OR to_regprocedure('private.reservation_stamp()') IS NULL
 OR NOT EXISTS(SELECT FROM pg_extension WHERE extname='btree_gist') THEN
  RAISE EXCEPTION 'BOOKING_FOUNDATIONS_OR_BTREE_GIST_REQUIRED' USING ERRCODE='55000';
 END IF;
END $pre$;
ALTER TABLE public.reservation_memberships ADD COLUMN can_view_bookings boolean NOT NULL DEFAULT false,
 ADD COLUMN can_manage_bookings boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT reservation_booking_membership CHECK ((NOT can_manage_bookings OR can_view_bookings) AND (NOT can_view_bookings OR can_view));
ALTER TABLE public.reservation_establishments ADD COLUMN booking_timezone text;
CREATE FUNCTION private.booking_timezone_valid(p_zone text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_zone IS NULL OR EXISTS(SELECT FROM pg_catalog.pg_timezone_names WHERE name=p_zone);
$$;
ALTER TABLE public.reservation_establishments ADD CONSTRAINT booking_timezone_valid CHECK(private.booking_timezone_valid(booking_timezone));
CREATE FUNCTION private.bookings_can(p_est uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.reservations_can(p_est,'view') AND EXISTS(SELECT FROM public.reservation_memberships m
 WHERE m.establishment_id=p_est AND m.profile_id=auth.uid() AND m.active AND m.can_view_bookings
 AND CASE p_action WHEN 'view' THEN true WHEN 'manage' THEN m.can_manage_bookings ELSE false END);
$$;
REVOKE ALL ON FUNCTION private.bookings_can(uuid,text),private.booking_timezone_valid(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.bookings_can(uuid,text),private.booking_timezone_valid(text) TO authenticated;
CREATE TABLE public.reservation_bookings (
 id uuid PRIMARY KEY,establishment_id uuid NOT NULL,room_id uuid NOT NULL,table_id uuid NOT NULL,
 contact_name text NOT NULL CHECK(length(btrim(contact_name)) BETWEEN 1 AND 120),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 covers integer NOT NULL CHECK(covers BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','cancelled')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 FOREIGN KEY(establishment_id,room_id,table_id) REFERENCES public.reservation_tables(establishment_id,room_id,id) ON DELETE RESTRICT,
 CHECK(isfinite(starts_at) AND isfinite(ends_at) AND ends_at>starts_at)
);
DO $exclusion$
DECLARE n text;
BEGIN
 SELECT ns.nspname INTO STRICT n FROM pg_extension e JOIN pg_namespace ns ON ns.oid=e.extnamespace WHERE e.extname='btree_gist';
 EXECUTE format('ALTER TABLE public.reservation_bookings ADD CONSTRAINT reservation_booking_no_overlap EXCLUDE USING gist (table_id %I.gist_uuid_ops WITH =, tstzrange(starts_at,ends_at,''[)'') WITH &&) WHERE (status=''confirmed'')',n);
END $exclusion$;
CREATE INDEX reservation_bookings_agenda ON public.reservation_bookings(establishment_id,starts_at,room_id);
CREATE TABLE public.reservation_booking_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id),
 booking_id uuid NOT NULL REFERENCES public.reservation_bookings(id),action text NOT NULL CHECK(action IN('INSERT','UPDATE')),
 before_value jsonb,after_value jsonb NOT NULL,actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reservation_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_booking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_bookings,public.reservation_booking_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reservation_bookings,public.reservation_booking_events TO authenticated;
CREATE POLICY booking_read ON public.reservation_bookings FOR SELECT TO authenticated USING(private.bookings_can(establishment_id,'view'));
CREATE POLICY booking_events_read ON public.reservation_booking_events FOR SELECT TO authenticated USING(private.bookings_can(establishment_id,'view'));
CREATE FUNCTION private.booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.reservation_tables;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='cancelled' THEN RAISE EXCEPTION 'BOOKING_CANCELLED_IMMUTABLE' USING ERRCODE='22023';END IF;
 IF NEW.status='confirmed' THEN
  PERFORM 1 FROM public.reservation_rooms WHERE id=NEW.room_id AND establishment_id=NEW.establishment_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_ROOM_INACTIVE' USING ERRCODE='22023';END IF;
  SELECT * INTO t FROM public.reservation_tables WHERE id=NEW.table_id AND establishment_id=NEW.establishment_id AND room_id=NEW.room_id FOR UPDATE;
  IF NOT FOUND OR NOT t.active OR t.capacity<NEW.covers THEN RAISE EXCEPTION 'BOOKING_TABLE_INVALID_OR_TOO_SMALL' USING ERRCODE='22023';END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION private.booking_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.reservation_booking_events(establishment_id,booking_id,action,before_value,after_value,actor_id)
 VALUES(NEW.establishment_id,NEW.id,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),auth.uid());RETURN NEW;
END;
$$;
CREATE TRIGGER booking_a_guard BEFORE INSERT OR UPDATE ON public.reservation_bookings FOR EACH ROW EXECUTE FUNCTION private.booking_guard();
CREATE TRIGGER booking_b_stamp BEFORE INSERT OR UPDATE ON public.reservation_bookings FOR EACH ROW EXECUTE FUNCTION private.reservation_stamp();
CREATE TRIGGER booking_event AFTER INSERT OR UPDATE ON public.reservation_bookings FOR EACH ROW EXECUTE FUNCTION private.booking_event();
-- Preserve the validity of future/ongoing bookings when physical resources change.
CREATE FUNCTION private.booking_resource_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='reservation_tables' THEN
  IF EXISTS(SELECT FROM public.reservation_bookings b WHERE b.table_id=OLD.id AND b.status='confirmed' AND b.ends_at>clock_timestamp() AND (NOT NEW.active OR b.covers>NEW.capacity)) THEN
   RAISE EXCEPTION 'BOOKING_RESOURCE_IN_USE' USING ERRCODE='23514';END IF;
 ELSE
  IF NOT NEW.active AND EXISTS(SELECT FROM public.reservation_bookings b WHERE b.room_id=OLD.id AND b.status='confirmed' AND b.ends_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'BOOKING_RESOURCE_IN_USE' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER booking_resource_guard BEFORE UPDATE ON public.reservation_tables FOR EACH ROW EXECUTE FUNCTION private.booking_resource_guard();
CREATE TRIGGER booking_resource_guard BEFORE UPDATE ON public.reservation_rooms FOR EACH ROW EXECUTE FUNCTION private.booking_resource_guard();
CREATE FUNCTION private.booking_instant(p_local timestamp,p_zone text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE base timestamptz; result timestamptz; candidates integer;
BEGIN
 IF p_local IS NULL OR NOT isfinite(p_local) OR p_zone IS NULL OR NOT private.booking_timezone_valid(p_zone) THEN RAISE EXCEPTION 'BOOKING_TIMEZONE_OR_TIME_REQUIRED' USING ERRCODE='22023';END IF;
 base:=p_local AT TIME ZONE p_zone;
 -- Discover offsets around the transition; refuse nonexistent AND ambiguous wall times.
 WITH offsets AS (SELECT DISTINCT ((t AT TIME ZONE p_zone)-(t AT TIME ZONE 'UTC')) AS off
 FROM generate_series(base-interval '2 days',base+interval '2 days',interval '1 hour') t),
 options AS (SELECT (p_local-off) AT TIME ZONE 'UTC' AS instant FROM offsets)
 SELECT count(*),min(instant) INTO candidates,result FROM options WHERE instant AT TIME ZONE p_zone=p_local;
 IF candidates<>1 THEN RAISE EXCEPTION 'BOOKING_AMBIGUOUS_OR_NONEXISTENT_TIME' USING ERRCODE='22023';END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.reservations_booking_context(p_establishment_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.reservations_can(p_establishment_id,'view') THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('timezone',(SELECT booking_timezone FROM public.reservation_establishments WHERE id=p_establishment_id),
 'can_view',private.bookings_can(p_establishment_id,'view'),'can_manage',private.bookings_can(p_establishment_id,'manage'));
END;
$$;
CREATE FUNCTION public.reservations_booking_day(p_establishment_id uuid,p_day date,p_room_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE zone text;lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'view') THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_establishment_id;
 IF zone IS NULL OR p_day IS NULL OR NOT isfinite(p_day) THEN RAISE EXCEPTION 'BOOKING_DAY_OR_TIMEZONE_REQUIRED' USING ERRCODE='22023';END IF;
 lo:=p_day::timestamp AT TIME ZONE zone;hi:=(p_day+1)::timestamp AT TIME ZONE zone;
 RETURN jsonb_build_object('bookings',coalesce((SELECT jsonb_agg(b ORDER BY b.starts_at,b.id) FROM public.reservation_bookings b WHERE b.establishment_id=p_establishment_id AND (p_room_id IS NULL OR b.room_id=p_room_id) AND b.starts_at<hi AND b.ends_at>lo),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.reservations_booking_one(p_establishment_id uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'view') THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN (SELECT to_jsonb(b) FROM public.reservation_bookings b WHERE b.id=p_id AND b.establishment_id=p_establishment_id);
END;
$$;
CREATE FUNCTION public.reservations_booking_available(p_establishment_id uuid,p_start timestamp,p_end timestamp,p_covers integer,p_room_id uuid DEFAULT NULL,p_exclude_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE zone text;lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'view') THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_covers IS NULL OR p_covers NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'BOOKING_COVERS_REQUIRED' USING ERRCODE='22023';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_establishment_id;
 lo:=private.booking_instant(p_start,zone);hi:=private.booking_instant(p_end,zone);
 IF hi<=lo THEN RAISE EXCEPTION 'BOOKING_END_REQUIRED' USING ERRCODE='22023';END IF;
 IF p_exclude_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.reservation_bookings WHERE id=p_exclude_id AND establishment_id=p_establishment_id) THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('tables',coalesce((SELECT jsonb_agg(t ORDER BY r.sort_order,t.label,t.id) FROM public.reservation_tables t JOIN public.reservation_rooms r ON r.id=t.room_id AND r.establishment_id=t.establishment_id
 WHERE t.establishment_id=p_establishment_id AND t.active AND r.active AND t.capacity>=p_covers AND (p_room_id IS NULL OR t.room_id=p_room_id)
 AND NOT EXISTS(SELECT FROM public.reservation_bookings b WHERE b.table_id=t.id AND b.establishment_id=p_establishment_id AND b.status='confirmed' AND b.id IS DISTINCT FROM p_exclude_id AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(lo,hi,'[)'))),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.reservations_save_booking(p_establishment_id uuid,p_id uuid,p_expected_version bigint,p_room_id uuid,p_table_id uuid,p_contact_name text,p_start timestamp,p_end timestamp,p_covers integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.reservation_bookings;zone text;lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'manage') THEN RAISE EXCEPTION 'BOOKING_MANAGE_DENIED' USING ERRCODE='42501';END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'BOOKING_ID_REQUIRED' USING ERRCODE='22023';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_establishment_id;
 lo:=private.booking_instant(p_start,zone);hi:=private.booking_instant(p_end,zone);
 PERFORM pg_advisory_xact_lock(hashtextextended('stopflow:booking:'||p_id::text,0));
 SELECT * INTO b FROM public.reservation_bookings WHERE id=p_id AND establishment_id=p_establishment_id FOR UPDATE;
 IF FOUND THEN
  IF p_expected_version IS NULL THEN
   IF b.created_by=auth.uid() AND b.status='confirmed' AND b.contact_name=btrim(p_contact_name) AND b.room_id=p_room_id AND b.table_id=p_table_id AND b.starts_at=lo AND b.ends_at=hi AND b.covers=p_covers THEN RETURN to_jsonb(b);END IF;
   RAISE EXCEPTION 'BOOKING_CREATE_INTENT_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF b.version=p_expected_version+1 AND b.updated_by=auth.uid() AND b.status='confirmed' AND b.contact_name=btrim(p_contact_name) AND b.room_id=p_room_id AND b.table_id=p_table_id AND b.starts_at=lo AND b.ends_at=hi AND b.covers=p_covers THEN RETURN to_jsonb(b);END IF;
  IF b.version<>p_expected_version THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  UPDATE public.reservation_bookings SET room_id=p_room_id,table_id=p_table_id,contact_name=btrim(p_contact_name),starts_at=lo,ends_at=hi,covers=p_covers WHERE id=b.id RETURNING * INTO b;
 ELSE
  IF p_expected_version IS NOT NULL OR EXISTS(SELECT FROM public.reservation_bookings WHERE id=p_id) THEN RAISE EXCEPTION 'BOOKING_ACCESS_OR_VERSION_DENIED' USING ERRCODE='42501';END IF;
  INSERT INTO public.reservation_bookings(id,establishment_id,room_id,table_id,contact_name,starts_at,ends_at,covers)
  VALUES(p_id,p_establishment_id,p_room_id,p_table_id,btrim(p_contact_name),lo,hi,p_covers) RETURNING * INTO b;
 END IF;
 RETURN to_jsonb(b);
END;
$$;
CREATE FUNCTION public.reservations_cancel_booking(p_establishment_id uuid,p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.reservation_bookings;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'manage') THEN RAISE EXCEPTION 'BOOKING_MANAGE_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO b FROM public.reservation_bookings WHERE id=p_id AND establishment_id=p_establishment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF b.status='cancelled' AND b.version=p_expected_version+1 AND b.updated_by=auth.uid() THEN RETURN to_jsonb(b);END IF;
 IF p_expected_version IS NULL OR b.version<>p_expected_version THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 UPDATE public.reservation_bookings SET status='cancelled' WHERE id=b.id RETURNING * INTO b;RETURN to_jsonb(b);
END;
$$;
REVOKE ALL ON FUNCTION private.booking_guard(),private.booking_event(),private.booking_resource_guard(),private.booking_instant(timestamp,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reservations_booking_context(uuid),public.reservations_booking_one(uuid,uuid),public.reservations_booking_day(uuid,date,uuid),public.reservations_booking_available(uuid,timestamp,timestamp,integer,uuid,uuid),public.reservations_save_booking(uuid,uuid,bigint,uuid,uuid,text,timestamp,timestamp,integer),public.reservations_cancel_booking(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reservations_booking_context(uuid),public.reservations_booking_one(uuid,uuid),public.reservations_booking_day(uuid,date,uuid),public.reservations_booking_available(uuid,timestamp,timestamp,integer,uuid,uuid),public.reservations_save_booking(uuid,uuid,bigint,uuid,uuid,text,timestamp,timestamp,integer),public.reservations_cancel_booking(uuid,uuid,bigint) TO authenticated;
COMMIT;
