-- Day/service operations only. No seed, no role or membership change.
BEGIN;
SET LOCAL lock_timeout='4s';SET LOCAL statement_timeout='30s';
DO $pre$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.reservations_service_close(uuid,uuid,jsonb)') AND md5(prosrc)='cc37ded55b7095be71635a0199a2e6f3') THEN RAISE EXCEPTION 'PRIOR_CLOSURE_DIFFERENT';END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.reservations_service_close(p_est uuid,p_request uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.reservation_service_closures; r private.reservation_service_requests; cid uuid:=(p_payload->>'id')::uuid; day date; svc text; wanted boolean; expected jsonb; observed jsonb; result jsonb;
BEGIN
 IF NOT private.reservations_can(p_est,'rooms.manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_payload->>'mode'='day' THEN
  day:=(p_payload->>'day')::date;svc:=p_payload->>'service';wanted:=(p_payload->>'active')::boolean;
  IF p_request IS NULL OR day IS NULL OR NOT isfinite(day) OR svc IS NULL OR svc NOT IN ('midi','soir') OR wanted IS NULL OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DAY_CLOSURE_INVALID' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_est::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('service-request:'||p_request::text,0));
  SELECT * INTO r FROM private.reservation_service_requests WHERE request_id=p_request;
  IF FOUND THEN IF r.establishment_id<>p_est OR r.actor<>auth.uid() OR r.kind<>'closure-day' OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT' USING ERRCODE='40001';END IF;RETURN r.result;END IF;
  PERFORM 1 FROM public.reservation_service_closures WHERE establishment_id=p_est AND active AND day BETWEEN first_day AND last_day AND service IN ('tous',svc) ORDER BY id FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) ORDER BY id),'[]'::jsonb) INTO observed FROM public.reservation_service_closures WHERE establishment_id=p_est AND active AND day BETWEEN first_day AND last_day AND service IN ('tous',svc);
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'id')::uuid),'[]'::jsonb) INTO expected FROM jsonb_array_elements(p_payload->'expected') x;
  IF expected IS DISTINCT FROM observed THEN RAISE EXCEPTION 'CLOSURE_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  IF wanted AND jsonb_array_length(observed)=0 THEN
   INSERT INTO public.reservation_service_closures(id,establishment_id,first_day,last_day,service,actor) VALUES(gen_random_uuid(),p_est,day,day,svc,auth.uid());
  ELSIF NOT wanted THEN
   FOR c IN SELECT * FROM public.reservation_service_closures WHERE establishment_id=p_est AND active AND day BETWEEN first_day AND last_day AND service IN ('tous',svc) ORDER BY id LOOP
    -- Keep the original as history; subtract precisely this date and service.
    UPDATE public.reservation_service_closures SET active=false,version=version+1,actor=auth.uid(),updated_at=clock_timestamp() WHERE id=c.id;
    IF c.first_day<day THEN INSERT INTO public.reservation_service_closures(id,establishment_id,first_day,last_day,service,actor) VALUES(gen_random_uuid(),p_est,c.first_day,day-1,c.service,auth.uid());END IF;
    IF c.last_day>day THEN INSERT INTO public.reservation_service_closures(id,establishment_id,first_day,last_day,service,actor) VALUES(gen_random_uuid(),p_est,day+1,c.last_day,c.service,auth.uid());END IF;
    IF c.service='tous' THEN INSERT INTO public.reservation_service_closures(id,establishment_id,first_day,last_day,service,actor) VALUES(gen_random_uuid(),p_est,day,day,CASE svc WHEN 'midi' THEN 'soir' ELSE 'midi' END,auth.uid());END IF;
   END LOOP;
  END IF;
  result:=jsonb_build_object('day',day,'service',svc,'closed',wanted);
  INSERT INTO private.reservation_service_requests VALUES(p_request,p_est,auth.uid(),'closure-day',p_payload,result,clock_timestamp());RETURN result;
 END IF;
 IF p_request IS NULL OR cid IS NULL THEN RAISE EXCEPTION 'REQUEST_REQUIRED' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-est:'||p_est::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('service-request:'||p_request::text,0));
 SELECT * INTO r FROM private.reservation_service_requests WHERE request_id=p_request;
 IF FOUND THEN IF r.establishment_id<>p_est OR r.actor<>auth.uid() OR r.kind<>'closure' OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'REQUEST_IDENTITY_CONFLICT' USING ERRCODE='40001';END IF;RETURN r.result;END IF;
 SELECT * INTO c FROM public.reservation_service_closures WHERE id=cid FOR UPDATE;
 IF FOUND THEN
  IF c.establishment_id<>p_est THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF c.version IS DISTINCT FROM (p_payload->>'version')::bigint THEN RAISE EXCEPTION 'CLOSURE_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  IF c.first_day IS DISTINCT FROM (p_payload->>'first')::date OR c.last_day IS DISTINCT FROM (p_payload->>'last')::date OR c.service IS DISTINCT FROM p_payload->>'service' THEN RAISE EXCEPTION 'CLOSURE_SCOPE_DIFFERENT' USING ERRCODE='22023';END IF;
  UPDATE public.reservation_service_closures SET active=(p_payload->>'active')::boolean,version=version+1,actor=auth.uid(),updated_at=clock_timestamp() WHERE id=cid RETURNING * INTO c;
 ELSE
  IF p_payload->>'version' IS NOT NULL THEN RAISE EXCEPTION 'CLOSURE_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
  IF (p_payload->>'active')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'NEW_CLOSURE_MUST_BE_ACTIVE' USING ERRCODE='22023';END IF;
  INSERT INTO public.reservation_service_closures(id,establishment_id,first_day,last_day,service,actor) VALUES(cid,p_est,(p_payload->>'first')::date,(p_payload->>'last')::date,p_payload->>'service',auth.uid()) RETURNING * INTO c;
 END IF;
 INSERT INTO private.reservation_service_requests VALUES(p_request,p_est,auth.uid(),'closure',p_payload,to_jsonb(c),clock_timestamp());RETURN to_jsonb(c);
END $$;
COMMIT;
