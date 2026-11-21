-- Targeted pilot evolution. No seed, no grant of memberships, no physical plan edits.
BEGIN;
SET LOCAL lock_timeout='4s'; SET LOCAL statement_timeout='30s';
ALTER TABLE public.reservation_bookings ALTER COLUMN table_id DROP NOT NULL;
ALTER TABLE public.reservation_bookings ADD COLUMN note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
 ADD COLUMN departure_explicit boolean NOT NULL DEFAULT false,
 ADD COLUMN placement_state text NOT NULL DEFAULT 'assigned' CHECK(placement_state IN ('assigned','unplaced')),
 ADD COLUMN assignment_mode text NOT NULL DEFAULT 'legacy' CHECK(assignment_mode IN ('legacy','automatic','manual')),
 ADD COLUMN manual_decision uuid;
ALTER TABLE public.reservation_bookings ADD CONSTRAINT booking_placement_consistent CHECK(
 (placement_state='unplaced' AND table_id IS NULL AND cardinality(member_table_ids)=0 AND assignment_mode='automatic' AND manual_decision IS NULL)
 OR (placement_state='assigned' AND table_id IS NOT NULL AND (assignment_mode<>'manual' OR manual_decision IS NOT NULL)));
CREATE TABLE private.reservation_service_requests(
 request_id uuid PRIMARY KEY, establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id),
 actor uuid NOT NULL REFERENCES public.profiles(id), kind text NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE private.reservation_manual_decisions(
 id uuid PRIMARY KEY, establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id), booking_id uuid NOT NULL,
 actor uuid NOT NULL REFERENCES public.profiles(id), placement jsonb NOT NULL, evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.reservation_bookings ADD FOREIGN KEY(manual_decision) REFERENCES private.reservation_manual_decisions(id);
CREATE TABLE private.reservation_hidden_plans(room_id uuid PRIMARY KEY REFERENCES public.reservation_rooms(id),
 establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id));
-- Withdrawal from current choices is distinct from archiving: no resource guard is bypassed.
INSERT INTO private.reservation_hidden_plans SELECT r.id,r.establishment_id FROM public.reservation_rooms r
 WHERE r.name IN ('Premier étage','Salle arrière','Test') AND EXISTS(SELECT FROM public.reservation_rooms p WHERE p.establishment_id=r.establishment_id AND p.name='Restaurant & Taverne' AND p.active);
CREATE TABLE public.reservation_service_closures(
 id uuid PRIMARY KEY, establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id),
 first_day date NOT NULL, last_day date NOT NULL, service text NOT NULL CHECK(service IN ('midi','soir','tous')),
 active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1,
 actor uuid NOT NULL REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(isfinite(first_day) AND isfinite(last_day) AND last_day>=first_day));
ALTER TABLE public.reservation_service_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_closure_read ON public.reservation_service_closures FOR SELECT TO authenticated USING(private.bookings_can(establishment_id,'view'));
REVOKE ALL ON public.reservation_service_closures FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reservation_service_closures TO authenticated;
REVOKE ALL ON private.reservation_service_requests,private.reservation_manual_decisions,private.reservation_hidden_plans FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.service_period(p timestamp) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p::time>=time '16:30' THEN 'soir' ELSE 'midi' END $$;
CREATE FUNCTION private.service_placement(p_room uuid,p_ids uuid[],p_start timestamptz,p_end timestamptz,p_covers integer) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('room',p_room,'ids',p_ids,'start',p_start,'end',p_end,'covers',p_covers) $$;
CREATE FUNCTION private.service_evidence(p_est uuid,p_id uuid,p_room uuid,p_ids uuid[],p_start timestamptz,p_end timestamptz,p_covers integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('placement',private.service_placement(p_room,p_ids,p_start,p_end,p_covers),
 'tables',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'capacity',t.capacity,'version',t.version) ORDER BY t.id) FROM public.reservation_tables t WHERE t.establishment_id=p_est AND t.room_id=p_room AND t.id=ANY(p_ids)),'[]'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.contact_name,'start',b.starts_at,'end',b.ends_at,'covers',b.covers,'version',b.version,'overlap',tstzrange(b.starts_at,b.ends_at,'[)')&&tstzrange(p_start,p_end,'[)')) ORDER BY b.starts_at,b.id)
 FROM public.reservation_bookings b WHERE b.establishment_id=p_est AND b.status='confirmed' AND b.id IS DISTINCT FROM p_id AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&p_ids
 AND (tstzrange(b.starts_at,b.ends_at,'[)')&&tstzrange(p_start,p_end,'[)') OR ((b.starts_at AT TIME ZONE e.booking_timezone)::date=(p_start AT TIME ZONE e.booking_timezone)::date AND private.service_period(b.starts_at AT TIME ZONE e.booking_timezone)=private.service_period(p_start AT TIME ZONE e.booking_timezone)))),'[]'::jsonb),
 'capacity',(SELECT coalesce(sum(capacity),0) FROM public.reservation_tables WHERE establishment_id=p_est AND room_id=p_room AND id=ANY(p_ids)), 'covers',p_covers)
 FROM public.reservation_establishments e WHERE e.id=p_est $$;
CREATE FUNCTION private.service_closed(p_est uuid,p_start timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.reservation_service_closures c JOIN public.reservation_establishments e ON e.id=c.establishment_id
 WHERE c.establishment_id=p_est AND c.active AND (p_start AT TIME ZONE e.booking_timezone)::date BETWEEN c.first_day AND c.last_day AND c.service IN ('tous',private.service_period(p_start AT TIME ZONE e.booking_timezone))) $$;

-- Physical exclusions remain for all non-manual allocations. Manual exceptions
-- require a durable, exact placement decision, and table locks serialize every writer.
ALTER TABLE public.reservation_bookings DROP CONSTRAINT reservation_booking_no_overlap;
ALTER TABLE public.reservation_booking_allocations ADD COLUMN manual_override boolean NOT NULL DEFAULT false;
ALTER TABLE public.reservation_booking_allocations DROP CONSTRAINT reservation_allocation_no_overlap;
DO $$ DECLARE ns text; BEGIN
 SELECT n.nspname INTO STRICT ns FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist';
 EXECUTE format('ALTER TABLE public.reservation_booking_allocations ADD CONSTRAINT reservation_allocation_no_overlap EXCLUDE USING gist (table_id %I.gist_uuid_ops WITH =,occupied WITH &&) WHERE (NOT manual_override)',ns);
END $$;
CREATE OR REPLACE FUNCTION private.booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; seats bigint; n integer; zone text; proof private.reservation_manual_decisions;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='cancelled' THEN RAISE EXCEPTION 'BOOKING_CANCELLED_IMMUTABLE' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||NEW.establishment_id::text,0));
 IF NEW.status='cancelled' THEN RETURN NEW; END IF;
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
  IF (TG_OP='INSERT' OR NEW.assignment_mode IS DISTINCT FROM OLD.assignment_mode OR private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) IS DISTINCT FROM private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers)) AND EXISTS(SELECT FROM public.reservation_bookings b WHERE b.establishment_id=NEW.establishment_id AND b.id<>NEW.id AND b.status='confirmed' AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&ids AND
   (tstzrange(b.starts_at,b.ends_at,'[)')&&tstzrange(NEW.starts_at,NEW.ends_at,'[)') OR (NEW.assignment_mode='automatic' AND (b.starts_at AT TIME ZONE zone)::date=(NEW.starts_at AT TIME ZONE zone)::date AND private.service_period(b.starts_at AT TIME ZONE zone)=private.service_period(NEW.starts_at AT TIME ZONE zone)))) THEN RAISE EXCEPTION 'TABLE_ALREADY_ASSIGNED' USING ERRCODE='23P01';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.reservation_sync_allocations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.reservation_booking_allocations WHERE booking_id=NEW.id;
 IF NEW.status='confirmed' AND NEW.placement_state='assigned' THEN
  INSERT INTO public.reservation_booking_allocations(booking_id,establishment_id,room_id,table_id,occupied,manual_override)
  SELECT NEW.id,NEW.establishment_id,NEW.room_id,x,tstzrange(NEW.starts_at,NEW.ends_at,'[)'),NEW.assignment_mode='manual' FROM unnest(coalesce(NEW.member_table_ids,ARRAY[NEW.table_id])) x;
 END IF; RETURN NEW;
END $$;

CREATE FUNCTION public.reservations_service_state(p_est uuid,p_day date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('closures',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.reservation_service_closures c WHERE c.establishment_id=p_est AND p_day BETWEEN c.first_day AND c.last_day),'[]'::jsonb),
 'hidden_plans',coalesce((SELECT jsonb_agg(room_id) FROM private.reservation_hidden_plans WHERE establishment_id=p_est),'[]'::jsonb),'can_close',private.reservations_can(p_est,'rooms.manage'));
END $$;
CREATE FUNCTION public.reservations_service_preview(p_est uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; evidence jsonb; zone text; lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_est,'manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(p_payload->'ids') x;
 IF cardinality(ids) NOT BETWEEN 1 AND 20 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR (SELECT count(*) FROM public.reservation_tables WHERE id=ANY(ids) AND establishment_id=p_est AND room_id=(p_payload->>'room')::uuid AND active)<>cardinality(ids) THEN RAISE EXCEPTION 'PLACEMENT_INVALID' USING ERRCODE='22023';END IF;
 IF nullif(p_payload->>'id','') IS NOT NULL AND NOT EXISTS(SELECT FROM public.reservation_bookings WHERE id=(p_payload->>'id')::uuid AND establishment_id=p_est) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 lo:=private.booking_instant((p_payload->>'start')::timestamp,zone);hi:=private.booking_instant((p_payload->>'end')::timestamp,zone);
 IF hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 evidence:=private.service_evidence(p_est,(p_payload->>'id')::uuid,(p_payload->>'room')::uuid,ids,lo,hi,(p_payload->>'covers')::integer);
 RETURN evidence||jsonb_build_object('token',md5(evidence::text));
END $$;

CREATE FUNCTION public.reservations_service_confirm(p_est uuid,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 lo:=private.booking_instant((p_payload->>'start')::timestamp,zone);hi:=private.booking_instant((p_payload->>'end')::timestamp,zone);
 IF hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 IF (old.id IS NULL OR old.starts_at<>lo) AND ((p_payload->>'start')::timestamp::time<time '08:00' OR (p_payload->>'start')::timestamp::time>time '22:30' OR extract(minute FROM (p_payload->>'start')::timestamp) NOT IN (0,30) OR extract(second FROM (p_payload->>'start')::timestamp)<>0) THEN RAISE EXCEPTION 'ARRIVAL_INVALID' USING ERRCODE='22023';END IF;
 IF coalesce((p_payload->>'departure_explicit')::boolean,false)=false AND (old.id IS NULL OR old.starts_at<>lo OR old.ends_at<>hi) AND hi<>private.booking_instant((p_payload->>'start')::timestamp+interval '2 hours',zone) THEN RAISE EXCEPTION 'TECHNICAL_DURATION_INVALID' USING ERRCODE='22023';END IF;
 IF mode='keep' THEN
  IF old.id IS NULL THEN RAISE EXCEPTION 'BOOKING_REQUIRED' USING ERRCODE='22023';END IF;
  room:=old.room_id;ids:=coalesce(old.member_table_ids,ARRAY[old.table_id]);
  -- A manual exception never expands silently when times/covers change.
  IF old.assignment_mode='manual' AND (lo<>old.starts_at OR hi<>old.ends_at OR (p_payload->>'covers')::integer<>old.covers) THEN RAISE EXCEPTION 'MANUAL_RECONFIRM_REQUIRED' USING ERRCODE='23514';END IF;
  mode:=old.assignment_mode;decid:=old.manual_decision;
 ELSE
  IF NOT EXISTS(SELECT FROM public.reservation_rooms WHERE id=room AND establishment_id=p_est AND active) OR EXISTS(SELECT FROM private.reservation_hidden_plans WHERE room_id=room) THEN RAISE EXCEPTION 'PLAN_NOT_CURRENT' USING ERRCODE='22023';END IF;
  IF mode='auto' THEN
   SELECT c INTO choice FROM jsonb_array_elements(private.reservation_choices(p_est,(p_payload->>'start')::timestamp,(p_payload->>'end')::timestamp,(p_payload->>'covers')::integer,bid)) c
   WHERE (c->>'room_id')::uuid=room AND NOT EXISTS(SELECT FROM public.reservation_bookings x WHERE x.establishment_id=p_est AND x.id<>bid AND x.status='confirmed' AND coalesce(x.member_table_ids,ARRAY[x.table_id])&&ARRAY(SELECT j::uuid FROM jsonb_array_elements_text(c->'ids') j) AND (x.starts_at AT TIME ZONE zone)::date=(lo AT TIME ZONE zone)::date AND private.service_period(x.starts_at AT TIME ZONE zone)=private.service_period(lo AT TIME ZONE zone))
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

CREATE FUNCTION public.reservations_service_close(p_est uuid,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.reservation_service_closures; r private.reservation_service_requests; cid uuid:=(p_payload->>'id')::uuid;
BEGIN
 IF NOT private.reservations_can(p_est,'rooms.manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR cid IS NULL THEN RAISE EXCEPTION 'REQUEST_REQUIRED' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_est::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('service-request:'||p_request::text,0));
 SELECT * INTO r FROM private.reservation_service_requests WHERE request_id=p_request;
 IF FOUND THEN IF r.establishment_id<>p_est OR r.actor<>auth.uid() OR r.kind<>'closure' OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT' USING ERRCODE='40001';END IF;RETURN r.result;END IF;
 SELECT * INTO c FROM public.reservation_service_closures WHERE id=cid FOR UPDATE;
 IF FOUND THEN
  IF c.establishment_id<>p_est THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF c.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'CLOSURE_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  UPDATE public.reservation_service_closures SET active=(p_payload->>'active')::boolean,version=version+1,actor=auth.uid(),updated_at=clock_timestamp() WHERE id=cid RETURNING * INTO c;
 ELSE
  IF p_payload->>'version' IS NOT NULL THEN RAISE EXCEPTION 'CLOSURE_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  IF (p_payload->>'active')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'NEW_CLOSURE_MUST_BE_ACTIVE' USING ERRCODE='22023';END IF;
  INSERT INTO public.reservation_service_closures(id,establishment_id,first_day,last_day,service,actor) VALUES(cid,p_est,(p_payload->>'first')::date,(p_payload->>'last')::date,p_payload->>'service',auth.uid()) RETURNING * INTO c;
 END IF;
 INSERT INTO private.reservation_service_requests VALUES(p_request,p_est,auth.uid(),'closure',p_payload,to_jsonb(c),clock_timestamp());RETURN to_jsonb(c);
END $$;
CREATE FUNCTION public.reservations_service_plan_visibility(p_est uuid,p_room uuid,p_hidden boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.reservations_can(p_est,'rooms.manage') OR NOT EXISTS(SELECT FROM public.reservation_rooms WHERE id=p_room AND establishment_id=p_est) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_hidden IS NULL THEN RAISE EXCEPTION 'VISIBILITY_REQUIRED' USING ERRCODE='22023';END IF;
 IF p_hidden THEN INSERT INTO private.reservation_hidden_plans VALUES(p_room,p_est) ON CONFLICT DO NOTHING;ELSE DELETE FROM private.reservation_hidden_plans WHERE room_id=p_room AND establishment_id=p_est;END IF;
END $$;
REVOKE ALL ON FUNCTION private.service_period(timestamp),private.service_placement(uuid,uuid[],timestamptz,timestamptz,integer),private.service_evidence(uuid,uuid,uuid,uuid[],timestamptz,timestamptz,integer),private.service_closed(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reservations_service_state(uuid,date),public.reservations_service_preview(uuid,jsonb),public.reservations_service_confirm(uuid,uuid,jsonb),public.reservations_service_close(uuid,uuid,jsonb),public.reservations_service_plan_visibility(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_service_state(uuid,date),public.reservations_service_preview(uuid,jsonb),public.reservations_service_confirm(uuid,uuid,jsonb),public.reservations_service_close(uuid,uuid,jsonb),public.reservations_service_plan_visibility(uuid,uuid,boolean) TO authenticated;
-- All availability APIs retain the same physical conflict checks and exclude retired choices.
CREATE OR REPLACE FUNCTION private.reservation_choices(p_est uuid,p_start timestamp,p_end timestamp,p_covers integer,p_exclude uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE lo timestamptz;hi timestamptz;zone text;
BEGIN
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 lo:=private.booking_instant(p_start,zone);hi:=private.booking_instant(p_end,zone);
 IF hi<=lo OR p_covers IS NULL OR p_covers NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 RETURN coalesce((WITH choices AS (
  SELECT t.id,'table'::text kind,t.room_id,t.label name,ARRAY[t.id] ids,t.capacity::bigint seats FROM public.reservation_tables t WHERE t.establishment_id=p_est AND t.active
  UNION ALL
  SELECT g.id,'group',g.room_id,g.name,g.table_ids,(SELECT sum(t.capacity) FROM public.reservation_tables t WHERE t.id=ANY(g.table_ids)) FROM public.reservation_table_groups g WHERE g.establishment_id=p_est AND g.active
 ) SELECT jsonb_agg(to_jsonb(c) ORDER BY cardinality(c.ids),c.seats,c.name,c.id) FROM choices c JOIN public.reservation_rooms r ON r.id=c.room_id AND r.establishment_id=p_est AND r.active
 WHERE NOT EXISTS(SELECT FROM private.reservation_hidden_plans hp WHERE hp.room_id=c.room_id) AND c.seats>=p_covers AND (SELECT count(*) FROM public.reservation_tables t WHERE t.id=ANY(c.ids) AND t.establishment_id=p_est AND t.room_id=c.room_id AND t.active)=cardinality(c.ids)
 AND NOT EXISTS(SELECT FROM public.reservation_bookings b WHERE b.establishment_id=p_est AND b.id IS DISTINCT FROM p_exclude AND b.status='confirmed' AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&c.ids AND (b.starts_at AT TIME ZONE zone)::date=(lo AT TIME ZONE zone)::date AND private.service_period(b.starts_at AT TIME ZONE zone)=private.service_period(lo AT TIME ZONE zone)) AND NOT EXISTS(SELECT FROM public.reservation_booking_allocations a WHERE a.table_id=ANY(c.ids) AND a.booking_id IS DISTINCT FROM p_exclude AND a.occupied && tstzrange(lo,hi,'[)'))),'[]'::jsonb);
END $$;
COMMIT;
