-- Expected departure is information, not an allocation dimension.
-- Keep immutable manual-decision records; compare only their binding fields.
BEGIN;
SET LOCAL lock_timeout='4s';SET LOCAL statement_timeout='30s';
DO $pre$ BEGIN IF EXISTS(SELECT FROM (VALUES ('private','booking_guard','d7802d4745b485dbc4d43a616083ccff'),('public','reservations_service_confirm','e96562f3182dcf1758b725311b4dc2a3')) AS x(nsp,name,hash) WHERE (SELECT count(*)=1 AND bool_and(md5(p.prosrc)=x.hash) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=x.nsp AND p.proname=x.name) IS NOT TRUE) THEN RAISE EXCEPTION 'PRESENCE_DEFINITION_DIFFERENT';END IF;END $pre$;
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
 IF NEW.assignment_mode='legacy' AND (TG_OP='INSERT' OR (private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) - 'end') IS DISTINCT FROM (private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers) - 'end')) THEN NEW.assignment_mode:='automatic';END IF;
 IF EXISTS(SELECT FROM private.reservation_hidden_plans WHERE room_id=NEW.room_id) AND (TG_OP='INSERT' OR (private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) - 'end') IS DISTINCT FROM (private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers) - 'end')) THEN RAISE EXCEPTION 'PLAN_NOT_CURRENT' USING ERRCODE='22023';END IF;
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
  IF NOT FOUND OR (proof.placement - 'end') IS DISTINCT FROM (private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) - 'end') THEN RAISE EXCEPTION 'MANUAL_DECISION_REQUIRED' USING ERRCODE='42501';END IF;
 ELSE
  IF NEW.covers>seats THEN RAISE EXCEPTION 'BOOKING_MEMBERS_INVALID_OR_TOO_SMALL' USING ERRCODE='22023';END IF;
  SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=NEW.establishment_id;
  IF (TG_OP='INSERT' OR NEW.assignment_mode IS DISTINCT FROM OLD.assignment_mode OR (private.service_placement(NEW.room_id,ids,NEW.starts_at,NEW.ends_at,NEW.covers) - 'end') IS DISTINCT FROM (private.service_placement(OLD.room_id,coalesce(OLD.member_table_ids,ARRAY[OLD.table_id]),OLD.starts_at,OLD.ends_at,OLD.covers) - 'end')) AND EXISTS(SELECT FROM public.reservation_bookings b WHERE b.establishment_id=NEW.establishment_id AND b.id<>NEW.id AND b.status='confirmed' AND b.presence_state<>'departed' AND coalesce(b.member_table_ids,ARRAY[b.table_id])&&ids AND
   (b.starts_at AT TIME ZONE zone)::date=(NEW.starts_at AT TIME ZONE zone)::date AND private.service_period(b.starts_at AT TIME ZONE zone)=private.service_period(NEW.starts_at AT TIME ZONE zone)) THEN RAISE EXCEPTION 'TABLE_ALREADY_ASSIGNED' USING ERRCODE='23P01';END IF;
 END IF;
 RETURN NEW;
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
  IF old.assignment_mode='manual' AND (lo<>old.starts_at OR (p_payload->>'covers')::integer<>old.covers) THEN RAISE EXCEPTION 'MANUAL_RECONFIRM_REQUIRED' USING ERRCODE='23514';END IF;
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
COMMIT;
