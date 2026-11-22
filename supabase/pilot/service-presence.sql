-- Service occupancy is categorical. No departure or duration is manufactured.
BEGIN;
SET LOCAL lock_timeout='4s';SET LOCAL statement_timeout='30s';
DO $pre$ BEGIN
 IF EXISTS(SELECT FROM (VALUES ('private','booking_guard','3f770b54cddf86a675cb9c2214234134'),('private','booking_resource_guard','d4b069b09809705ca8c4c85efaad6a11'),('public','reservations_booking_day','b91ecb4ba5c0f268f049ae2e4e10a569'),('public','reservations_save_booking','cdcc2ea35f7cfbae52b670be60a1c5ba'),('public','reservations_cancel_booking','dd2ae0dd1d40d398a72ed061a3ded306'),('private','reservation_sync_allocations','889de00e625ff90807335929c6ed721d'),('private','reservation_choices','6d3b50b25b664f08769357d55785e71c'),('public','reservations_service_available','9aab421fc1e13e1b97bf10fdde327ab3'),('private','reservation_service_commit','525e3f8c75f203d115bf7235fe1781d1'),('public','reservations_service_day','38d0140e379f3202b15e0b2cffa6c5c5'),('private','service_evidence','9e24282d1ac92fd521e41185c6b27b21'),('public','reservations_service_preview','f8a12aefdf222ce4907d1779213b972e'),('public','reservations_service_confirm','f7bf0bea61027b66ed373c3727ea1331')) AS expected(nsp,name,hash) WHERE (SELECT count(*)=1 AND bool_and(md5(p.prosrc)=expected.hash) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=expected.nsp AND p.proname=expected.name) IS NOT TRUE) THEN RAISE EXCEPTION 'PRIOR_SERVICE_DEFINITION_DIFFERENT';END IF;
END $pre$;

ALTER TABLE public.reservation_bookings ALTER COLUMN ends_at DROP NOT NULL;
ALTER TABLE public.reservation_bookings ADD COLUMN presence_state text NOT NULL DEFAULT 'expected' CHECK(presence_state IN ('expected','arrived','departed')),
 ADD COLUMN arrived_at timestamptz, ADD COLUMN departed_at timestamptz,
 ADD COLUMN arrived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,ADD COLUMN departed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD CHECK((presence_state<>'arrived' OR arrived_at IS NOT NULL) AND (presence_state<>'departed' OR departed_at IS NOT NULL));
ALTER TABLE public.reservation_booking_allocations DROP CONSTRAINT reservation_allocation_no_overlap;
ALTER TABLE public.reservation_booking_allocations ALTER COLUMN occupied DROP NOT NULL;
ALTER TABLE public.reservation_booking_allocations ADD COLUMN service_day date,ADD COLUMN service text CHECK(service IN ('midi','soir')),ADD COLUMN automatic_claim boolean NOT NULL DEFAULT false;
UPDATE public.reservation_booking_allocations a SET service_day=(b.starts_at AT TIME ZONE e.booking_timezone)::date,service=private.service_period(b.starts_at AT TIME ZONE e.booking_timezone),automatic_claim=b.assignment_mode='automatic'
 FROM public.reservation_bookings b JOIN public.reservation_establishments e ON e.id=b.establishment_id WHERE b.id=a.booking_id;
ALTER TABLE public.reservation_booking_allocations ALTER COLUMN service_day SET NOT NULL,ALTER COLUMN service SET NOT NULL;
CREATE UNIQUE INDEX reservation_automatic_service_claim ON public.reservation_booking_allocations(table_id,service_day,service) WHERE automatic_claim;


CREATE OR REPLACE FUNCTION private.service_evidence(p_est uuid,p_id uuid,p_room uuid,p_ids uuid[],p_start timestamptz,p_end timestamptz,p_covers integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('placement',private.service_placement(p_room,p_ids,p_start,p_end,p_covers),
 'tables',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'capacity',t.capacity,'version',t.version) ORDER BY t.id) FROM public.reservation_tables t WHERE t.establishment_id=p_est AND t.room_id=p_room AND t.id=ANY(p_ids)),'[]'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.contact_name,'start',b.starts_at,'end',CASE WHEN b.departure_explicit THEN b.ends_at ELSE NULL END,'covers',b.covers,'version',b.version,'presence',b.presence_state,'overlap',CASE WHEN b.departure_explicit AND p_end IS NOT NULL THEN tstzrange(b.starts_at,b.ends_at,'[)')&&tstzrange(p_start,p_end,'[)') ELSE NULL END) ORDER BY b.starts_at,b.id)
 FROM public.reservation_bookings b WHERE b.establishment_id=p_est AND b.status='confirmed' AND b.presence_state<>'departed' AND b.id IS DISTINCT FROM p_id AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&p_ids
 AND (b.starts_at AT TIME ZONE e.booking_timezone)::date=(p_start AT TIME ZONE e.booking_timezone)::date AND private.service_period(b.starts_at AT TIME ZONE e.booking_timezone)=private.service_period(p_start AT TIME ZONE e.booking_timezone)),'[]'::jsonb),
 'capacity',(SELECT coalesce(sum(capacity),0) FROM public.reservation_tables WHERE establishment_id=p_est AND room_id=p_room AND id=ANY(p_ids)),'covers',p_covers)
 FROM public.reservation_establishments e WHERE e.id=p_est $$;

CREATE OR REPLACE FUNCTION private.booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; seats bigint; n integer; zone text; proof private.reservation_manual_decisions;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='cancelled' THEN RAISE EXCEPTION 'BOOKING_CANCELLED_IMMUTABLE' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||NEW.establishment_id::text,0));
 IF TG_OP='UPDATE' AND OLD.presence_state='departed' AND NEW.presence_state<>'departed' THEN RAISE EXCEPTION 'DEPARTED_STATE_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF NEW.status='cancelled' OR NEW.presence_state='departed' THEN RETURN NEW; END IF;
 IF (TG_OP='INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at) AND private.service_closed(NEW.establishment_id,NEW.starts_at) THEN RAISE EXCEPTION 'SERVICE_CLOSED' USING ERRCODE='23514';END IF;
 PERFORM 1 FROM public.reservation_rooms WHERE id=NEW.room_id AND establishment_id=NEW.establishment_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_ROOM_INACTIVE' USING ERRCODE='22023';END IF;
 ids:=coalesce(NEW.member_table_ids,ARRAY[NEW.table_id]);
 IF NEW.assignment_mode='legacy' AND (TG_OP='INSERT' OR private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) IS DISTINCT FROM private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers)) THEN NEW.assignment_mode:='automatic';END IF;
 IF EXISTS(SELECT FROM private.reservation_hidden_plans WHERE room_id=NEW.room_id) AND (TG_OP='INSERT' OR private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) IS DISTINCT FROM private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers)) THEN RAISE EXCEPTION 'PLAN_NOT_CURRENT' USING ERRCODE='22023';END IF;
 IF NEW.placement_state='unplaced' THEN
  IF NEW.table_id IS NOT NULL OR cardinality(ids)<>0 OR NEW.assignment_mode<>'automatic' THEN RAISE EXCEPTION 'PLACEMENT_INVALID' USING ERRCODE='22023';END IF;
  RETURN NEW;
 END IF;
 IF cardinality(ids) NOT BETWEEN 1 AND 20 OR array_position(ids,NULL) IS NOT NULL OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR NOT NEW.table_id=ANY(ids) THEN RAISE EXCEPTION 'BOOKING_MEMBERS_INVALID' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.reservation_tables WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 SELECT count(*),sum(capacity) INTO n,seats FROM public.reservation_tables WHERE id=ANY(ids) AND room_id=NEW.room_id AND establishment_id=NEW.establishment_id AND active;
 IF n<>cardinality(ids) THEN RAISE EXCEPTION 'BOOKING_MEMBERS_INVALID' USING ERRCODE='22023';END IF;
 IF NEW.assignment_mode='manual' THEN
  SELECT * INTO proof FROM private.reservation_manual_decisions WHERE id=NEW.manual_decision AND establishment_id=NEW.establishment_id AND booking_id=NEW.id;
  IF NOT FOUND OR proof.placement IS DISTINCT FROM private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) THEN RAISE EXCEPTION 'MANUAL_DECISION_REQUIRED' USING ERRCODE='42501';END IF;
 ELSE
  IF NEW.covers>seats THEN RAISE EXCEPTION 'BOOKING_MEMBERS_INVALID_OR_TOO_SMALL' USING ERRCODE='22023';END IF;
  SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=NEW.establishment_id;
  IF (TG_OP='INSERT' OR NEW.assignment_mode IS DISTINCT FROM OLD.assignment_mode OR private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) IS DISTINCT FROM private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers)) AND EXISTS(SELECT FROM public.reservation_bookings b WHERE b.establishment_id=NEW.establishment_id AND b.id<>NEW.id AND b.status='confirmed' AND b.presence_state<>'departed' AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&ids AND
   (b.starts_at AT TIME ZONE zone)::date=(NEW.starts_at AT TIME ZONE zone)::date AND private.service_period(b.starts_at AT TIME ZONE zone)=private.service_period(NEW.starts_at AT TIME ZONE zone)) THEN RAISE EXCEPTION 'TABLE_ALREADY_ASSIGNED' USING ERRCODE='23P01';END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.reservation_sync_allocations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE zone text;BEGIN
 DELETE FROM public.reservation_booking_allocations WHERE booking_id=NEW.id;
 IF NEW.status='confirmed' AND NEW.presence_state<>'departed' AND NEW.placement_state='assigned' THEN
  SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=NEW.establishment_id;
  INSERT INTO public.reservation_booking_allocations(booking_id,establishment_id,room_id,table_id,occupied,manual_override,service_day,service,automatic_claim)
  SELECT NEW.id,NEW.establishment_id,NEW.room_id,x,NULL,NEW.assignment_mode='manual',(NEW.starts_at AT TIME ZONE zone)::date,private.service_period(NEW.starts_at AT TIME ZONE zone),NEW.assignment_mode='automatic'
  FROM unnest(coalesce(NEW.member_table_ids,ARRAY[NEW.table_id])) x;
 END IF;RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION private.reservation_choices(p_est uuid,p_start timestamp,p_end timestamp,p_covers integer,p_exclude uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE lo timestamptz;hi timestamptz;zone text;
BEGIN
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 lo:=private.booking_instant(p_start,zone);hi:=CASE WHEN p_end IS NULL THEN NULL ELSE private.booking_instant(p_end,zone) END;
 IF (hi IS NOT NULL AND hi<=lo) OR p_covers IS NULL OR p_covers NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 RETURN coalesce((WITH choices AS (
  SELECT t.id,'table'::text kind,t.room_id,t.label name,ARRAY[t.id] ids,t.capacity::bigint seats FROM public.reservation_tables t WHERE t.establishment_id=p_est AND t.active
  UNION ALL
  SELECT g.id,'group',g.room_id,g.name,g.table_ids,(SELECT sum(t.capacity) FROM public.reservation_tables t WHERE t.id=ANY(g.table_ids)) FROM public.reservation_table_groups g WHERE g.establishment_id=p_est AND g.active
 ) SELECT jsonb_agg(to_jsonb(c) ORDER BY cardinality(c.ids),c.seats,c.name,c.id) FROM choices c JOIN public.reservation_rooms r ON r.id=c.room_id AND r.establishment_id=p_est AND r.active
 WHERE NOT EXISTS(SELECT FROM private.reservation_hidden_plans hp WHERE hp.room_id=c.room_id) AND c.seats>=p_covers AND (SELECT count(*) FROM public.reservation_tables t WHERE t.id=ANY(c.ids) AND t.establishment_id=p_est AND t.room_id=c.room_id AND t.active)=cardinality(c.ids)
 AND NOT EXISTS(SELECT FROM public.reservation_bookings b WHERE b.establishment_id=p_est AND b.id IS DISTINCT FROM p_exclude AND b.status='confirmed' AND b.presence_state<>'departed' AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&c.ids AND (b.starts_at AT TIME ZONE zone)::date=(lo AT TIME ZONE zone)::date AND private.service_period(b.starts_at AT TIME ZONE zone)=private.service_period(lo AT TIME ZONE zone))),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.reservations_service_preview(p_est uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; evidence jsonb;old public.reservation_bookings; zone text; lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_est,'manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(p_payload->'ids') x;
 IF cardinality(ids) NOT BETWEEN 1 AND 20 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR (SELECT count(*) FROM public.reservation_tables WHERE id=ANY(ids) AND establishment_id=p_est AND room_id=(p_payload->>'room')::uuid AND active)<>cardinality(ids) THEN RAISE EXCEPTION 'PLACEMENT_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO old FROM public.reservation_bookings WHERE id=(p_payload->>'id')::uuid AND establishment_id=p_est;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF old.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 IF old.presence_state='departed' OR old.status<>'confirmed' THEN RAISE EXCEPTION 'BOOKING_NOT_OCCUPYING' USING ERRCODE='23514';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 lo:=private.booking_instant((p_payload->>'start')::timestamp,zone);hi:=CASE WHEN coalesce((p_payload->>'departure_explicit')::boolean,false) THEN private.booking_instant((p_payload->>'end')::timestamp,zone) WHEN NOT old.departure_explicit AND old.starts_at=lo THEN old.ends_at ELSE NULL END;
 IF hi IS NOT NULL AND hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 evidence:=private.service_evidence(p_est,(p_payload->>'id')::uuid,(p_payload->>'room')::uuid,ids,lo,hi,(p_payload->>'covers')::integer);
 IF NOT coalesce((p_payload->>'departure_explicit')::boolean,false) THEN evidence:=jsonb_set(evidence,'{reservations}',coalesce((SELECT jsonb_agg(x||jsonb_build_object('overlap',NULL)) FROM jsonb_array_elements(evidence->'reservations') x),'[]'::jsonb));END IF;
 RETURN evidence||jsonb_build_object('token',md5(evidence::text));
END $$;

CREATE OR REPLACE FUNCTION public.reservations_service_confirm(p_est uuid,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.reservation_bookings; b public.reservation_bookings; r private.reservation_service_requests;
 bid uuid:=(p_payload->>'id')::uuid; ver bigint:=(p_payload->>'version')::bigint; room uuid:=(p_payload->>'room')::uuid;
 mode text:=p_payload->>'mode'; ids uuid[]; zone text;lo timestamptz;hi timestamptz;seats bigint; ph text;cid uuid;decid uuid; evidence jsonb; choice jsonb;
BEGIN
 IF NOT private.bookings_can(p_est,'manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR bid IS NULL OR mode NOT IN ('auto','keep','manual') OR mode IS NULL OR length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 120 OR p_payload->>'name' IS NULL OR (p_payload->>'covers')::integer NOT BETWEEN 1 AND 1000 OR p_payload->>'covers' IS NULL OR length(coalesce(p_payload->>'note',''))>2000 THEN RAISE EXCEPTION 'BOOKING_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_est::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('service-request:'||p_request::text,0));
 SELECT * INTO r FROM private.reservation_service_requests WHERE request_id=p_request;
 IF FOUND THEN
  IF r.establishment_id<>p_est OR r.actor<>auth.uid() OR r.kind<>'booking' OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT' USING ERRCODE='40001';END IF;RETURN r.result;
 END IF;
 SELECT * INTO old FROM public.reservation_bookings WHERE id=bid FOR UPDATE;
 IF FOUND THEN
  IF old.establishment_id<>p_est THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF ver IS NULL OR old.version<>ver OR old.status<>'confirmed' THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 ELSIF ver IS NOT NULL THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 lo:=private.booking_instant((p_payload->>'start')::timestamp,zone);hi:=CASE WHEN coalesce((p_payload->>'departure_explicit')::boolean,false) THEN private.booking_instant((p_payload->>'end')::timestamp,zone) WHEN old.id IS NOT NULL AND NOT old.departure_explicit AND old.starts_at=lo THEN old.ends_at ELSE NULL END;
 IF hi IS NOT NULL AND hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 IF (old.id IS NULL OR old.starts_at<>lo) AND ((p_payload->>'start')::timestamp::time<time '08:00' OR (p_payload->>'start')::timestamp::time>time '22:30' OR extract(minute FROM (p_payload->>'start')::timestamp) NOT IN (0,30) OR extract(second FROM (p_payload->>'start')::timestamp)<>0) THEN RAISE EXCEPTION 'ARRIVAL_INVALID' USING ERRCODE='22023';END IF;
 IF old.presence_state='departed' AND mode<>'keep' THEN RAISE EXCEPTION 'DEPARTED_PLACEMENT_IMMUTABLE' USING ERRCODE='23514';END IF;
 IF mode='keep' THEN
  IF old.id IS NULL THEN RAISE EXCEPTION 'BOOKING_REQUIRED' USING ERRCODE='22023';END IF;
  room:=old.room_id;ids:=coalesce(old.member_table_ids,ARRAY[old.table_id]);
  -- A manual exception never expands silently when times/covers change.
  IF old.assignment_mode='manual' AND (lo<>old.starts_at OR hi IS DISTINCT FROM old.ends_at OR (p_payload->>'covers')::integer<>old.covers) THEN RAISE EXCEPTION 'MANUAL_RECONFIRM_REQUIRED' USING ERRCODE='23514';END IF;
  mode:=old.assignment_mode;decid:=old.manual_decision;
 ELSE
  IF NOT EXISTS(SELECT FROM public.reservation_rooms WHERE id=room AND establishment_id=p_est AND active) OR EXISTS(SELECT FROM private.reservation_hidden_plans WHERE room_id=room) THEN RAISE EXCEPTION 'PLAN_NOT_CURRENT' USING ERRCODE='22023';END IF;
  IF mode='auto' THEN
   SELECT c INTO choice FROM jsonb_array_elements(private.reservation_choices(p_est,(p_payload->>'start')::timestamp,CASE WHEN coalesce((p_payload->>'departure_explicit')::boolean,false) THEN (p_payload->>'end')::timestamp ELSE NULL END,(p_payload->>'covers')::integer,bid)) c
   WHERE (c->>'room_id')::uuid=room AND NOT EXISTS(SELECT FROM public.reservation_bookings x WHERE x.establishment_id=p_est AND x.id<>bid AND x.status='confirmed' AND x.presence_state<>'departed' AND coalesce(x.member_table_ids,ARRAY[x.table_id])&&ARRAY(SELECT j::uuid FROM jsonb_array_elements_text(c->'ids') j) AND (x.starts_at AT TIME ZONE zone)::date=(lo AT TIME ZONE zone)::date AND private.service_period(x.starts_at AT TIME ZONE zone)=private.service_period(lo AT TIME ZONE zone))
   ORDER BY CASE c->>'kind' WHEN 'table' THEN 0 ELSE 1 END,(c->>'seats')::integer,c->>'name',c->>'id' LIMIT 1;
   SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(choice->'ids','[]'::jsonb)) x;
   mode:='automatic';
  ELSE
   evidence:=public.reservations_service_preview(p_est,p_payload);ids:=ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_payload->'ids') x ORDER BY x::uuid);
   IF p_payload->>'confirmation' IS DISTINCT FROM evidence->>'token' THEN RAISE EXCEPTION 'PLACEMENT_CHANGED_REVIEW_REQUIRED' USING ERRCODE='40001';END IF;
   IF (jsonb_array_length(evidence->'reservations')>0 OR (evidence->>'capacity')::integer<(p_payload->>'covers')::integer) AND coalesce((p_payload->>'shared_confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'EXPLICIT_SHARED_CONFIRMATION_REQUIRED' USING ERRCODE='23514';END IF;
   decid:=p_request;
   INSERT INTO private.reservation_manual_decisions VALUES(decid,p_est,bid,auth.uid(),private.service_placement(room,ids,lo,hi,(p_payload->>'covers')::integer),evidence,clock_timestamp());mode:='manual';
  END IF;
 END IF;
 ph:=private.reservation_phone(p_payload->>'phone');
 IF nullif(btrim(p_payload->>'email'),'') IS NOT NULL AND (length(p_payload->>'email')>254 OR p_payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'EMAIL_INVALID' USING ERRCODE='22023';END IF;
 INSERT INTO public.reservation_clients(establishment_id,phone,name,email) VALUES(p_est,ph,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'email'),'')) ON CONFLICT(establishment_id,phone) DO NOTHING;
 SELECT id INTO cid FROM public.reservation_clients WHERE establishment_id=p_est AND phone=ph;
 IF old.id IS NULL THEN
  INSERT INTO public.reservation_bookings(id,establishment_id,room_id,table_id,member_table_ids,client_id,contact_name,contact_phone,contact_email,starts_at,ends_at,covers,note,departure_explicit,placement_state,assignment_mode,manual_decision)
  VALUES(bid,p_est,room,ids[1],ids,cid,btrim(p_payload->>'name'),ph,nullif(btrim(p_payload->>'email'),''),lo,hi,(p_payload->>'covers')::integer,coalesce(p_payload->>'note',''),coalesce((p_payload->>'departure_explicit')::boolean,false),CASE WHEN cardinality(ids)=0 THEN 'unplaced' ELSE 'assigned' END,mode,decid) RETURNING * INTO b;
 ELSE
  UPDATE public.reservation_bookings SET room_id=room,table_id=ids[1],member_table_ids=ids,client_id=cid,contact_name=btrim(p_payload->>'name'),contact_phone=ph,contact_email=nullif(btrim(p_payload->>'email'),''),starts_at=lo,ends_at=hi,covers=(p_payload->>'covers')::integer,note=coalesce(p_payload->>'note',''),departure_explicit=coalesce((p_payload->>'departure_explicit')::boolean,old.departure_explicit),placement_state=CASE WHEN cardinality(ids)=0 THEN 'unplaced' ELSE 'assigned' END,assignment_mode=mode,manual_decision=decid WHERE id=bid RETURNING * INTO b;
 END IF;
 INSERT INTO private.reservation_service_requests VALUES(p_request,p_est,auth.uid(),'booking',p_payload,to_jsonb(b),clock_timestamp());RETURN to_jsonb(b);
END $$;

CREATE OR REPLACE FUNCTION public.reservations_service_available(p_est uuid,p_start timestamp,p_end timestamp,p_covers integer,p_exclude uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;b public.reservation_bookings;zone text;
BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_exclude IS NOT NULL AND NOT EXISTS(SELECT FROM public.reservation_bookings WHERE id=p_exclude AND establishment_id=p_est) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 result:=private.reservation_choices(p_est,p_start,p_end,p_covers,p_exclude);
 IF p_exclude IS NOT NULL THEN
  SELECT * INTO b FROM public.reservation_bookings WHERE id=p_exclude AND establishment_id=p_est AND status='confirmed' AND presence_state<>'departed';
  IF FOUND AND (SELECT sum(capacity) FROM public.reservation_tables WHERE id=ANY(coalesce(b.member_table_ids,ARRAY[b.table_id])) AND active)>=p_covers AND NOT EXISTS(SELECT FROM public.reservation_booking_allocations a WHERE a.table_id=ANY(coalesce(b.member_table_ids,ARRAY[b.table_id])) AND a.booking_id<>p_exclude AND a.service_day=p_start::date AND a.service=private.service_period(p_start)) THEN
   result:=result||jsonb_build_array(jsonb_build_object('id',b.id,'kind','booking','room_id',b.room_id,'name','Attribution actuelle','ids',coalesce(b.member_table_ids,ARRAY[b.table_id]),'seats',(SELECT sum(capacity) FROM public.reservation_tables WHERE id=ANY(coalesce(b.member_table_ids,ARRAY[b.table_id])))));
  END IF;
 END IF;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.reservation_service_commit(p_est uuid,p_id uuid,p_version bigint,p_resource uuid,p_kind text,p_name text,p_phone text,p_email text,p_start timestamp,p_end timestamp,p_covers integer,p_source text,p_expected_members uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];room uuid;zone text;lo timestamptz;hi timestamptz;cid uuid;ph text;b public.reservation_bookings;
BEGIN
 IF p_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_source NOT IN ('staff','web') THEN RAISE EXCEPTION 'BOOKING_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_est::text,0));
 ph:=private.reservation_phone(p_phone);
 IF nullif(btrim(p_email),'') IS NOT NULL AND (length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'EMAIL_INVALID' USING ERRCODE='22023';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;lo:=private.booking_instant(p_start,zone);hi:=CASE WHEN p_end IS NULL THEN NULL ELSE private.booking_instant(p_end,zone) END;
 IF hi IS NOT NULL AND hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 IF p_kind='table' THEN SELECT ARRAY[id],room_id INTO ids,room FROM public.reservation_tables WHERE id=p_resource AND establishment_id=p_est AND active;
 ELSIF p_kind='group' THEN SELECT table_ids,room_id INTO ids,room FROM public.reservation_table_groups WHERE id=p_resource AND establishment_id=p_est AND active FOR SHARE;
 ELSIF p_kind='booking' AND p_source='staff' AND p_resource=p_id AND p_version IS NOT NULL THEN SELECT coalesce(member_table_ids,ARRAY[table_id]),room_id INTO ids,room FROM public.reservation_bookings WHERE id=p_id AND establishment_id=p_est AND status='confirmed';
 END IF;
 IF ids IS NULL THEN RAISE EXCEPTION 'RESOURCE_INVALID' USING ERRCODE='22023';END IF;
 SELECT array_agg(x ORDER BY x) INTO ids FROM unnest(ids) x;
 IF p_expected_members IS NULL OR ids IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(p_expected_members) x) THEN RAISE EXCEPTION 'GROUP_MEMBERS_CHANGED' USING ERRCODE='40001';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stopflow:booking:'||p_id::text,0));
 SELECT * INTO b FROM public.reservation_bookings WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF b.establishment_id<>p_est OR (p_source='web' AND (b.source<>'web' OR p_version IS NOT NULL)) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF b.status='confirmed' AND b.contact_name=btrim(p_name) AND b.starts_at=lo AND (b.ends_at IS NOT DISTINCT FROM hi OR (p_end IS NULL AND NOT b.departure_explicit)) AND b.covers=p_covers AND coalesce(b.member_table_ids,ARRAY[b.table_id])=ids AND b.contact_phone=ph AND coalesce(b.contact_email,'')=coalesce(nullif(btrim(p_email),''),'') AND ((p_version IS NULL AND b.version=1) OR b.version=p_version+1) THEN RETURN to_jsonb(b);END IF;
  IF p_version IS NULL OR b.version<>p_version OR p_source='web' THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 ELSIF p_version IS NOT NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 INSERT INTO public.reservation_clients(establishment_id,phone,name,email) VALUES(p_est,ph,btrim(p_name),nullif(btrim(p_email),'')) ON CONFLICT(establishment_id,phone) DO NOTHING;
 SELECT id INTO cid FROM public.reservation_clients WHERE establishment_id=p_est AND phone=ph;
 IF b.id IS NULL THEN
  INSERT INTO public.reservation_bookings(id,establishment_id,room_id,table_id,member_table_ids,client_id,contact_phone,contact_email,source,contact_name,starts_at,ends_at,covers,departure_explicit) VALUES(p_id,p_est,room,ids[1],ids,cid,ph,nullif(btrim(p_email),''),p_source,btrim(p_name),lo,hi,p_covers,p_end IS NOT NULL) RETURNING * INTO b;
 ELSE
  UPDATE public.reservation_bookings SET room_id=room,table_id=ids[1],member_table_ids=ids,client_id=cid,contact_phone=ph,contact_email=nullif(btrim(p_email),''),contact_name=btrim(p_name),starts_at=lo,ends_at=CASE WHEN p_end IS NULL AND NOT b.departure_explicit AND b.starts_at=lo THEN b.ends_at ELSE hi END,departure_explicit=p_end IS NOT NULL,covers=p_covers WHERE id=p_id RETURNING * INTO b;
 END IF;
 RETURN to_jsonb(b);
END $$;

CREATE OR REPLACE FUNCTION public.reservations_save_booking(p_establishment_id uuid,p_id uuid,p_expected_version bigint,p_room_id uuid,p_table_id uuid,p_contact_name text,p_start timestamp,p_end timestamp,p_covers integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.reservation_bookings;zone text;lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'manage') THEN RAISE EXCEPTION 'BOOKING_MANAGE_DENIED' USING ERRCODE='42501';END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'BOOKING_ID_REQUIRED' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_establishment_id::text,0));
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_establishment_id;
 lo:=private.booking_instant(p_start,zone);hi:=CASE WHEN p_end IS NULL THEN NULL ELSE private.booking_instant(p_end,zone) END;
 PERFORM pg_advisory_xact_lock(hashtextextended('stopflow:booking:'||p_id::text,0));
 SELECT * INTO b FROM public.reservation_bookings WHERE id=p_id AND establishment_id=p_establishment_id FOR UPDATE;
 IF FOUND THEN
  IF p_expected_version IS NULL THEN
   IF b.created_by=auth.uid() AND b.status='confirmed' AND b.contact_name=btrim(p_contact_name) AND b.room_id=p_room_id AND b.table_id=p_table_id AND b.starts_at=lo AND (b.ends_at IS NOT DISTINCT FROM hi OR (p_end IS NULL AND NOT b.departure_explicit)) AND b.covers=p_covers THEN RETURN to_jsonb(b);END IF;
   RAISE EXCEPTION 'BOOKING_CREATE_INTENT_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF b.version=p_expected_version+1 AND b.updated_by=auth.uid() AND b.status='confirmed' AND b.contact_name=btrim(p_contact_name) AND b.room_id=p_room_id AND b.table_id=p_table_id AND b.starts_at=lo AND (b.ends_at IS NOT DISTINCT FROM hi OR (p_end IS NULL AND NOT b.departure_explicit)) AND b.covers=p_covers THEN RETURN to_jsonb(b);END IF;
  IF b.version<>p_expected_version THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  UPDATE public.reservation_bookings SET room_id=p_room_id,table_id=p_table_id,contact_name=btrim(p_contact_name),starts_at=lo,ends_at=CASE WHEN p_end IS NULL AND NOT b.departure_explicit AND b.starts_at=lo THEN b.ends_at ELSE hi END,departure_explicit=p_end IS NOT NULL,covers=p_covers WHERE id=b.id RETURNING * INTO b;
 ELSE
  IF p_expected_version IS NOT NULL OR EXISTS(SELECT FROM public.reservation_bookings WHERE id=p_id) THEN RAISE EXCEPTION 'BOOKING_ACCESS_OR_VERSION_DENIED' USING ERRCODE='42501';END IF;
  INSERT INTO public.reservation_bookings(id,establishment_id,room_id,table_id,contact_name,starts_at,ends_at,covers,departure_explicit)
  VALUES(p_id,p_establishment_id,p_room_id,p_table_id,btrim(p_contact_name),lo,hi,p_covers,p_end IS NOT NULL) RETURNING * INTO b;
 END IF;
 RETURN to_jsonb(b);
END;
$$;

CREATE OR REPLACE FUNCTION public.reservations_cancel_booking(p_establishment_id uuid,p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.reservation_bookings;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'manage') THEN RAISE EXCEPTION 'BOOKING_MANAGE_DENIED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_establishment_id::text,0));
 SELECT * INTO b FROM public.reservation_bookings WHERE id=p_id AND establishment_id=p_establishment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF b.status='cancelled' AND b.version=p_expected_version+1 AND b.updated_by=auth.uid() THEN RETURN to_jsonb(b);END IF;
 IF p_expected_version IS NULL OR b.version<>p_expected_version THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 UPDATE public.reservation_bookings SET status='cancelled' WHERE id=b.id RETURNING * INTO b;RETURN to_jsonb(b);
END;
$$;

CREATE OR REPLACE FUNCTION public.reservations_service_day(p_est uuid,p_day date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;zone text;
BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 SELECT coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('phone',coalesce(b.contact_phone,c.phone),'email',coalesce(b.contact_email,c.email)) ORDER BY b.starts_at,b.id),'[]'::jsonb) INTO result FROM public.reservation_bookings b LEFT JOIN public.reservation_clients c ON c.id=b.client_id AND c.establishment_id=b.establishment_id WHERE b.establishment_id=p_est AND (b.starts_at AT TIME ZONE zone)::date=p_day;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.reservations_booking_day(p_establishment_id uuid,p_day date,p_room_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE zone text;lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_establishment_id,'view') THEN RAISE EXCEPTION 'BOOKING_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_establishment_id;
 IF zone IS NULL OR p_day IS NULL OR NOT isfinite(p_day) THEN RAISE EXCEPTION 'BOOKING_DAY_OR_TIMEZONE_REQUIRED' USING ERRCODE='22023';END IF;
 lo:=p_day::timestamp AT TIME ZONE zone;hi:=(p_day+1)::timestamp AT TIME ZONE zone;
 RETURN jsonb_build_object('bookings',coalesce((SELECT jsonb_agg(b ORDER BY b.starts_at,b.id) FROM public.reservation_bookings b WHERE b.establishment_id=p_establishment_id AND (p_room_id IS NULL OR b.room_id=p_room_id) AND b.starts_at>=lo AND b.starts_at<hi),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION private.booking_resource_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='reservation_tables' THEN
  IF (NOT NEW.active OR NEW.capacity<OLD.capacity) AND EXISTS(SELECT FROM public.reservation_booking_allocations a JOIN public.reservation_establishments e ON e.id=a.establishment_id WHERE a.table_id=OLD.id AND a.service_day>=(clock_timestamp() AT TIME ZONE e.booking_timezone)::date) THEN RAISE EXCEPTION 'BOOKING_RESOURCE_IN_USE' USING ERRCODE='23514';END IF;
 ELSIF NOT NEW.active AND EXISTS(SELECT FROM public.reservation_bookings b JOIN public.reservation_establishments e ON e.id=b.establishment_id WHERE b.room_id=OLD.id AND b.status='confirmed' AND b.presence_state<>'departed' AND (b.starts_at AT TIME ZONE e.booking_timezone)::date>=(clock_timestamp() AT TIME ZONE e.booking_timezone)::date) THEN RAISE EXCEPTION 'BOOKING_RESOURCE_IN_USE' USING ERRCODE='23514';END IF;
 RETURN NEW;END $$;

CREATE FUNCTION public.reservations_service_presence(p_est uuid,p_request uuid,p_id uuid,p_version bigint,p_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.reservation_service_requests;b public.reservation_bookings;payload jsonb:=jsonb_build_object('id',p_id,'version',p_version,'state',p_state);
BEGIN
 IF NOT private.bookings_can(p_est,'manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_id IS NULL OR p_state NOT IN ('arrived','departed') OR p_state IS NULL THEN RAISE EXCEPTION 'PRESENCE_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_est::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('service-request:'||p_request::text,0));
 SELECT * INTO r FROM private.reservation_service_requests WHERE request_id=p_request;
 IF FOUND THEN IF r.establishment_id<>p_est OR r.actor IS DISTINCT FROM auth.uid() OR r.kind<>'presence' OR r.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT' USING ERRCODE='40001';END IF;RETURN r.result;END IF;
 SELECT * INTO b FROM public.reservation_bookings WHERE id=p_id AND establishment_id=p_est FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF b.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 IF b.status<>'confirmed' OR b.presence_state='departed' OR (p_state='arrived' AND b.presence_state<>'expected') THEN RAISE EXCEPTION 'PRESENCE_TRANSITION_INVALID' USING ERRCODE='23514';END IF;
 UPDATE public.reservation_bookings SET presence_state=p_state,
 arrived_at=CASE WHEN p_state='arrived' THEN clock_timestamp() ELSE arrived_at END,
 arrived_by=CASE WHEN p_state='arrived' THEN auth.uid() ELSE arrived_by END,
 departed_at=CASE WHEN p_state='departed' THEN clock_timestamp() ELSE departed_at END,
 departed_by=CASE WHEN p_state='departed' THEN auth.uid() ELSE departed_by END WHERE id=p_id RETURNING * INTO b;
 INSERT INTO private.reservation_service_requests VALUES(p_request,p_est,auth.uid(),'presence',payload,to_jsonb(b),clock_timestamp());RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.reservations_service_presence(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_service_presence(uuid,uuid,uuid,bigint,text) TO authenticated;
COMMIT;
