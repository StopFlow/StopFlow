-- New manual selection reuses the existing atomic confirm RPC. No data or grants change.
BEGIN;
SET LOCAL lock_timeout='4s';SET LOCAL statement_timeout='30s';
DO $pre$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.reservations_service_preview(uuid,jsonb)') AND md5(prosrc)='bdb2a8e6b53fa15a8b8117cdadde0140') THEN RAISE EXCEPTION 'PRIOR_PREVIEW_DIFFERENT';END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.reservations_service_preview(p_est uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; evidence jsonb;old public.reservation_bookings; zone text; lo timestamptz;hi timestamptz;
BEGIN
 IF NOT private.bookings_can(p_est,'manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(p_payload->'ids') x;
 IF cardinality(ids) NOT BETWEEN 1 AND 20 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR (SELECT count(*) FROM public.reservation_tables WHERE id=ANY(ids) AND establishment_id=p_est AND room_id=(p_payload->>'room')::uuid AND active)<>cardinality(ids) THEN RAISE EXCEPTION 'PLACEMENT_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO old FROM public.reservation_bookings WHERE id=(p_payload->>'id')::uuid;
 IF old.id IS NOT NULL AND old.establishment_id<>p_est THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF (p_payload->>'id')::uuid IS NULL OR (old.id IS NULL AND (p_payload->>'version') IS NOT NULL) THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT FROM public.reservation_rooms WHERE id=(p_payload->>'room')::uuid AND establishment_id=p_est AND active) OR EXISTS(SELECT FROM private.reservation_hidden_plans WHERE room_id=(p_payload->>'room')::uuid) THEN RAISE EXCEPTION 'PLAN_NOT_CURRENT' USING ERRCODE='22023';END IF;
 IF old.id IS NOT NULL AND old.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 IF old.presence_state='departed' OR old.status<>'confirmed' THEN RAISE EXCEPTION 'BOOKING_NOT_OCCUPYING' USING ERRCODE='23514';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 lo:=private.booking_instant((p_payload->>'start')::timestamp,zone);hi:=CASE WHEN coalesce((p_payload->>'departure_explicit')::boolean,false) THEN private.booking_instant((p_payload->>'end')::timestamp,zone) WHEN NOT old.departure_explicit AND old.starts_at=lo THEN old.ends_at ELSE NULL END;
 IF lo IS NULL OR (p_payload->>'covers')::integer IS NULL OR (p_payload->>'covers')::integer NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'PLACEMENT_INVALID' USING ERRCODE='22023';END IF;
 IF hi IS NOT NULL AND hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
 evidence:=private.service_evidence(p_est,(p_payload->>'id')::uuid,(p_payload->>'room')::uuid,ids,lo,hi,(p_payload->>'covers')::integer);
 IF NOT coalesce((p_payload->>'departure_explicit')::boolean,false) THEN evidence:=jsonb_set(evidence,'{reservations}',coalesce((SELECT jsonb_agg(x||jsonb_build_object('overlap',NULL)) FROM jsonb_array_elements(evidence->'reservations') x),'[]'::jsonb));END IF;
 RETURN evidence||jsonb_build_object('token',md5(evidence::text));
END $$;
COMMIT;
