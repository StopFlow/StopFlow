-- Isolated review migration. Never run by frontend; no membership granted.
BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s';
CREATE TABLE public.reservation_clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), establishment_id uuid NOT NULL REFERENCES public.reservation_establishments(id),
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 email text CHECK(email IS NULL OR (length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 UNIQUE(establishment_id,phone), UNIQUE(establishment_id,id)
);
CREATE TABLE public.reservation_table_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), establishment_id uuid NOT NULL, room_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120), table_ids uuid[] NOT NULL CHECK(cardinality(table_ids) BETWEEN 2 AND 20),
 active boolean NOT NULL DEFAULT true, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(establishment_id,room_id) REFERENCES public.reservation_rooms(establishment_id,id)
);
ALTER TABLE public.reservation_establishments ADD COLUMN online_test_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.reservation_bookings ADD COLUMN member_table_ids uuid[], ADD COLUMN client_id uuid,
 ADD COLUMN contact_phone text, ADD COLUMN contact_email text, ADD COLUMN source text NOT NULL DEFAULT 'staff' CHECK(source IN ('staff','web')),
 ADD FOREIGN KEY(establishment_id,client_id) REFERENCES public.reservation_clients(establishment_id,id);
CREATE UNIQUE INDEX reservation_group_name ON public.reservation_table_groups(establishment_id,room_id,lower(btrim(name))) WHERE active;
CREATE TABLE public.reservation_booking_allocations (
 booking_id uuid NOT NULL REFERENCES public.reservation_bookings(id) ON DELETE CASCADE,
 establishment_id uuid NOT NULL, room_id uuid NOT NULL, table_id uuid NOT NULL,
 occupied tstzrange NOT NULL CHECK(NOT isempty(occupied) AND lower_inc(occupied) AND NOT upper_inc(occupied)),
 PRIMARY KEY(booking_id,table_id),
 FOREIGN KEY(establishment_id,room_id,table_id) REFERENCES public.reservation_tables(establishment_id,room_id,id)
);
DO $block$ DECLARE n text; BEGIN
 SELECT ns.nspname INTO STRICT n FROM pg_extension e JOIN pg_namespace ns ON ns.oid=e.extnamespace WHERE e.extname='btree_gist';
 EXECUTE format('ALTER TABLE public.reservation_booking_allocations ADD CONSTRAINT reservation_allocation_no_overlap EXCLUDE USING gist (table_id %I.gist_uuid_ops WITH =, occupied WITH &&)',n);
END $block$;
INSERT INTO public.reservation_booking_allocations SELECT id,establishment_id,room_id,table_id,tstzrange(starts_at,ends_at,'[)') FROM public.reservation_bookings WHERE status='confirmed';
CREATE OR REPLACE FUNCTION private.booking_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ids uuid[]; seats bigint; found_count integer;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='cancelled' THEN RAISE EXCEPTION 'BOOKING_CANCELLED_IMMUTABLE' USING ERRCODE='22023'; END IF;
 ids:=coalesce(NEW.member_table_ids,ARRAY[NEW.table_id]);
 IF cardinality(ids) NOT BETWEEN 1 AND 20 OR array_position(ids,NULL) IS NOT NULL OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR NOT NEW.table_id=ANY(ids) THEN RAISE EXCEPTION 'BOOKING_MEMBERS_INVALID' USING ERRCODE='22023';END IF;
 IF NEW.status='confirmed' THEN
  PERFORM 1 FROM public.reservation_rooms WHERE id=NEW.room_id AND establishment_id=NEW.establishment_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_ROOM_INACTIVE' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.reservation_tables WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  SELECT count(*),sum(capacity) INTO found_count,seats FROM public.reservation_tables WHERE id=ANY(ids) AND room_id=NEW.room_id AND establishment_id=NEW.establishment_id AND active;
  IF found_count<>cardinality(ids) OR NEW.covers>seats THEN RAISE EXCEPTION 'BOOKING_MEMBERS_INVALID_OR_TOO_SMALL' USING ERRCODE='22023';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION private.reservation_sync_allocations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.reservation_booking_allocations WHERE booking_id=NEW.id;
 IF NEW.status='confirmed' THEN
  INSERT INTO public.reservation_booking_allocations SELECT NEW.id,NEW.establishment_id,NEW.room_id,x,tstzrange(NEW.starts_at,NEW.ends_at,'[)') FROM unnest(coalesce(NEW.member_table_ids,ARRAY[NEW.table_id])) x;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reservation_sync_allocations AFTER INSERT OR UPDATE ON public.reservation_bookings FOR EACH ROW EXECUTE FUNCTION private.reservation_sync_allocations();
CREATE OR REPLACE FUNCTION private.booking_resource_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='reservation_tables' THEN
  IF (NOT NEW.active OR NEW.capacity<OLD.capacity) AND EXISTS(SELECT FROM public.reservation_booking_allocations a WHERE a.table_id=OLD.id AND upper(a.occupied)>clock_timestamp()) THEN RAISE EXCEPTION 'BOOKING_RESOURCE_IN_USE' USING ERRCODE='23514';END IF;
 ELSIF NOT NEW.active AND EXISTS(SELECT FROM public.reservation_bookings b WHERE b.room_id=OLD.id AND b.status='confirmed' AND b.ends_at>clock_timestamp()) THEN RAISE EXCEPTION 'BOOKING_RESOURCE_IN_USE' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION private.reservation_phone(p text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n text;
BEGIN
 IF p IS NULL OR p !~ '^[+0-9 ()/.-]+$' THEN RAISE EXCEPTION 'PHONE_REQUIRED' USING ERRCODE='22023';END IF;
 n:=regexp_replace(p,'[^0-9]','','g');IF n LIKE '00%' THEN n:=substr(n,3);ELSIF n LIKE '0%' THEN n:='32'||substr(n,2);END IF;
 IF n !~ '^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'PHONE_INVALID' USING ERRCODE='22023';END IF;RETURN '+'||n;
END $$;
CREATE FUNCTION private.reservation_choices(p_est uuid,p_start timestamp,p_end timestamp,p_covers integer,p_exclude uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
 WHERE c.seats>=p_covers AND (SELECT count(*) FROM public.reservation_tables t WHERE t.id=ANY(c.ids) AND t.establishment_id=p_est AND t.room_id=c.room_id AND t.active)=cardinality(c.ids)
 AND NOT EXISTS(SELECT FROM public.reservation_booking_allocations a WHERE a.table_id=ANY(c.ids) AND a.booking_id IS DISTINCT FROM p_exclude AND a.occupied && tstzrange(lo,hi,'[)'))),'[]'::jsonb);
END $$;
CREATE FUNCTION public.reservations_service_available(p_est uuid,p_start timestamp,p_end timestamp,p_covers integer,p_exclude uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;b public.reservation_bookings;zone text;
BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_exclude IS NOT NULL AND NOT EXISTS(SELECT FROM public.reservation_bookings WHERE id=p_exclude AND establishment_id=p_est) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 result:=private.reservation_choices(p_est,p_start,p_end,p_covers,p_exclude);
 IF p_exclude IS NOT NULL THEN
  SELECT * INTO b FROM public.reservation_bookings WHERE id=p_exclude AND establishment_id=p_est AND status='confirmed';
  IF FOUND AND (SELECT sum(capacity) FROM public.reservation_tables WHERE id=ANY(coalesce(b.member_table_ids,ARRAY[b.table_id])) AND active)>=p_covers AND NOT EXISTS(SELECT FROM public.reservation_booking_allocations a WHERE a.table_id=ANY(coalesce(b.member_table_ids,ARRAY[b.table_id])) AND a.booking_id<>p_exclude AND a.occupied && tstzrange(private.booking_instant(p_start,zone),private.booking_instant(p_end,zone),'[)')) THEN
   result:=result||jsonb_build_array(jsonb_build_object('id',b.id,'kind','booking','room_id',b.room_id,'name','Attribution actuelle','ids',coalesce(b.member_table_ids,ARRAY[b.table_id]),'seats',(SELECT sum(capacity) FROM public.reservation_tables WHERE id=ANY(coalesce(b.member_table_ids,ARRAY[b.table_id])))));
  END IF;
 END IF;RETURN result;
END $$;
CREATE FUNCTION private.reservation_service_commit(p_est uuid,p_id uuid,p_version bigint,p_resource uuid,p_kind text,p_name text,p_phone text,p_email text,p_start timestamp,p_end timestamp,p_covers integer,p_source text,p_expected_members uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];room uuid;zone text;lo timestamptz;hi timestamptz;cid uuid;ph text;b public.reservation_bookings;
BEGIN
 IF p_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_source NOT IN ('staff','web') THEN RAISE EXCEPTION 'BOOKING_INVALID' USING ERRCODE='22023';END IF;
 ph:=private.reservation_phone(p_phone);
 IF nullif(btrim(p_email),'') IS NOT NULL AND (length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'EMAIL_INVALID' USING ERRCODE='22023';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;lo:=private.booking_instant(p_start,zone);hi:=private.booking_instant(p_end,zone);
 IF hi<=lo THEN RAISE EXCEPTION 'SLOT_INVALID' USING ERRCODE='22023';END IF;
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
  IF b.status='confirmed' AND b.contact_name=btrim(p_name) AND b.starts_at=lo AND b.ends_at=hi AND b.covers=p_covers AND coalesce(b.member_table_ids,ARRAY[b.table_id])=ids AND b.contact_phone=ph AND coalesce(b.contact_email,'')=coalesce(nullif(btrim(p_email),''),'') AND ((p_version IS NULL AND b.version=1) OR b.version=p_version+1) THEN RETURN to_jsonb(b);END IF;
  IF p_version IS NULL OR b.version<>p_version OR p_source='web' THEN RAISE EXCEPTION 'BOOKING_VERSION_CONFLICT' USING ERRCODE='40001';END IF;
 ELSIF p_version IS NOT NULL THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 INSERT INTO public.reservation_clients(establishment_id,phone,name,email) VALUES(p_est,ph,btrim(p_name),nullif(btrim(p_email),'')) ON CONFLICT(establishment_id,phone) DO NOTHING;
 SELECT id INTO cid FROM public.reservation_clients WHERE establishment_id=p_est AND phone=ph;
 IF b.id IS NULL THEN
  INSERT INTO public.reservation_bookings(id,establishment_id,room_id,table_id,member_table_ids,client_id,contact_phone,contact_email,source,contact_name,starts_at,ends_at,covers) VALUES(p_id,p_est,room,ids[1],ids,cid,ph,nullif(btrim(p_email),''),p_source,btrim(p_name),lo,hi,p_covers) RETURNING * INTO b;
 ELSE
  UPDATE public.reservation_bookings SET room_id=room,table_id=ids[1],member_table_ids=ids,client_id=cid,contact_phone=ph,contact_email=nullif(btrim(p_email),''),contact_name=btrim(p_name),starts_at=lo,ends_at=hi,covers=p_covers WHERE id=p_id RETURNING * INTO b;
 END IF;
 RETURN to_jsonb(b);
END $$;
CREATE FUNCTION public.reservations_service_save(p_est uuid,p_id uuid,p_version bigint,p_resource uuid,p_kind text,p_name text,p_phone text,p_email text,p_start timestamp,p_end timestamp,p_covers integer,p_members uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.bookings_can(p_est,'manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN private.reservation_service_commit(p_est,p_id,p_version,p_resource,p_kind,p_name,p_phone,p_email,p_start,p_end,p_covers,'staff',p_members);
END $$;
CREATE FUNCTION public.reservations_service_clients(p_est uuid,p_phone text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.reservation_clients;
BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO c FROM public.reservation_clients WHERE establishment_id=p_est AND phone=private.reservation_phone(p_phone);
 IF NOT FOUND THEN RETURN jsonb_build_object('client',NULL,'history','[]'::jsonb);END IF;
 RETURN jsonb_build_object('client',to_jsonb(c),'history',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.starts_at DESC) FROM public.reservation_bookings b WHERE b.client_id=c.id AND b.establishment_id=p_est),'[]'::jsonb));
END $$;
CREATE FUNCTION public.reservations_service_day(p_est uuid,p_day date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;zone text;
BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT booking_timezone INTO zone FROM public.reservation_establishments WHERE id=p_est;
 SELECT coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('phone',coalesce(b.contact_phone,c.phone),'email',coalesce(b.contact_email,c.email)) ORDER BY b.starts_at,b.id),'[]'::jsonb) INTO result FROM public.reservation_bookings b LEFT JOIN public.reservation_clients c ON c.id=b.client_id AND c.establishment_id=b.establishment_id WHERE b.establishment_id=p_est AND b.starts_at<(p_day+1)::timestamp AT TIME ZONE zone AND b.ends_at>p_day::timestamp AT TIME ZONE zone;
 RETURN result;
END $$;
CREATE FUNCTION public.reservations_service_groups(p_est uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT private.bookings_can(p_est,'view') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM public.reservation_table_groups g WHERE g.establishment_id=p_est),'[]'::jsonb);
END $$;
CREATE FUNCTION public.reservations_service_group_save(p_est uuid,p_id uuid,p_version bigint,p_room uuid,p_name text,p_tables uuid[],p_active boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.reservation_table_groups;ids uuid[];
BEGIN
 IF NOT private.reservations_can(p_est,'layouts.manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(p_tables) x;
 IF p_active IS NULL THEN RAISE EXCEPTION 'GROUP_ACTIVE_REQUIRED' USING ERRCODE='22023';END IF;
 IF cardinality(ids) IS NULL OR cardinality(ids) NOT BETWEEN 2 AND 20 OR cardinality(ids)<>cardinality(p_tables) OR array_position(ids,NULL) IS NOT NULL OR (SELECT count(*) FROM public.reservation_tables WHERE id=ANY(ids) AND room_id=p_room AND establishment_id=p_est AND active)<>cardinality(ids) THEN RAISE EXCEPTION 'GROUP_INVALID_OR_CROSS_FLOOR' USING ERRCODE='22023';END IF;
 SELECT * INTO g FROM public.reservation_table_groups WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF g.establishment_id<>p_est THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF g.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'GROUP_VERSION' USING ERRCODE='40001';END IF;
  UPDATE public.reservation_table_groups SET room_id=p_room,name=btrim(p_name),table_ids=ids,active=p_active,version=version+1 WHERE id=p_id RETURNING * INTO g;
 ELSE
  IF p_version IS NOT NULL THEN RAISE EXCEPTION 'GROUP_VERSION' USING ERRCODE='40001';END IF;
  INSERT INTO public.reservation_table_groups(id,establishment_id,room_id,name,table_ids,active) VALUES(p_id,p_est,p_room,btrim(p_name),ids,p_active) RETURNING * INTO g;
 END IF;RETURN to_jsonb(g);
END $$;
CREATE FUNCTION public.reservations_public_available(p_est uuid,p_start timestamp,p_end timestamp,p_covers integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.reservation_establishments WHERE id=p_est AND online_test_enabled) THEN RAISE EXCEPTION 'ONLINE_TEST_DISABLED' USING ERRCODE='42501';END IF;
 RETURN private.reservation_choices(p_est,p_start,p_end,p_covers,NULL);
END $$;
CREATE FUNCTION public.reservations_public_book(p_est uuid,p_id uuid,p_resource uuid,p_kind text,p_name text,p_phone text,p_email text,p_start timestamp,p_end timestamp,p_covers integer,p_members uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM public.reservation_establishments WHERE id=p_est AND online_test_enabled) THEN RAISE EXCEPTION 'ONLINE_TEST_DISABLED' USING ERRCODE='42501';END IF;
 b:=private.reservation_service_commit(p_est,p_id,NULL,p_resource,p_kind,p_name,p_phone,p_email,p_start,p_end,p_covers,'web',p_members);
 RETURN jsonb_build_object('id',b->'id','status',b->'status','starts_at',b->'starts_at','ends_at',b->'ends_at');
END $$;
-- No direct writes, no global defaults modified, no access to directory from anon.
ALTER TABLE public.reservation_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_table_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_booking_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_client_read ON public.reservation_clients FOR SELECT TO authenticated USING(private.bookings_can(establishment_id,'view'));
CREATE POLICY service_group_read ON public.reservation_table_groups FOR SELECT TO authenticated USING(private.bookings_can(establishment_id,'view'));
CREATE POLICY service_allocation_read ON public.reservation_booking_allocations FOR SELECT TO authenticated USING(private.bookings_can(establishment_id,'view'));
REVOKE ALL ON public.reservation_clients,public.reservation_table_groups,public.reservation_booking_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reservation_clients,public.reservation_table_groups,public.reservation_booking_allocations TO authenticated;
REVOKE ALL ON FUNCTION private.reservation_sync_allocations(),private.reservation_phone(text),private.reservation_choices(uuid,timestamp,timestamp,integer,uuid),private.reservation_service_commit(uuid,uuid,bigint,uuid,text,text,text,text,timestamp,timestamp,integer,text,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reservations_service_available(uuid,timestamp,timestamp,integer,uuid),public.reservations_service_save(uuid,uuid,bigint,uuid,text,text,text,text,timestamp,timestamp,integer,uuid[]),public.reservations_service_clients(uuid,text),public.reservations_service_day(uuid,date),public.reservations_service_groups(uuid),public.reservations_service_group_save(uuid,uuid,bigint,uuid,text,uuid[],boolean),public.reservations_public_available(uuid,timestamp,timestamp,integer),public.reservations_public_book(uuid,uuid,uuid,text,text,text,text,timestamp,timestamp,integer,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_service_available(uuid,timestamp,timestamp,integer,uuid),public.reservations_service_save(uuid,uuid,bigint,uuid,text,text,text,text,timestamp,timestamp,integer,uuid[]),public.reservations_service_clients(uuid,text),public.reservations_service_day(uuid,date),public.reservations_service_groups(uuid),public.reservations_service_group_save(uuid,uuid,bigint,uuid,text,uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_public_available(uuid,timestamp,timestamp,integer),public.reservations_public_book(uuid,uuid,uuid,text,text,text,text,timestamp,timestamp,integer,uuid[]) TO anon;

-- The old one-table availability API also observes every physical allocation.
CREATE OR REPLACE FUNCTION public.reservations_booking_available(p_establishment_id uuid,p_start timestamp,p_end timestamp,p_covers integer,p_room_id uuid DEFAULT NULL,p_exclude_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE choices jsonb;
BEGIN
 choices:=public.reservations_service_available(p_establishment_id,p_start,p_end,p_covers,p_exclude_id);
 RETURN jsonb_build_object('tables',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.reservation_tables t WHERE (p_room_id IS NULL OR t.room_id=p_room_id) AND EXISTS(SELECT FROM jsonb_array_elements(choices) c WHERE c->>'kind'='table' AND (c->>'id')::uuid=t.id)),'[]'::jsonb));
END $$;
CREATE FUNCTION public.reservations_service_plan_save(p_est uuid,p_room uuid,p_layout uuid,p_version bigint,p_tables jsonb,p_marks jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.reservation_layouts; item jsonb; v jsonb; ids uuid[]:=ARRAY[]::uuid[]; mark uuid;x numeric;y numeric;w numeric;h numeric;r numeric;k text;
BEGIN
 IF NOT private.reservations_can(p_est,'layouts.manage') THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_marks IS NULL OR jsonb_typeof(p_marks)<>'array' OR jsonb_array_length(p_marks)>200 THEN RAISE EXCEPTION 'MARKS_INVALID' USING ERRCODE='22023';END IF;
 -- Reuse existing complete-table validation, room/layout locking and version stamp.
 v:=public.reservations_save_layout(p_est,p_room,p_layout,p_version,p_tables);
 SELECT * INTO STRICT l FROM public.reservation_layouts WHERE id=p_layout AND room_id=p_room AND establishment_id=p_est;
 FOR item IN SELECT value FROM jsonb_array_elements(p_marks) LOOP
  mark:=(item->>'id')::uuid;k:=item->>'kind';x:=(item->>'x')::numeric;y:=(item->>'y')::numeric;w:=(item->>'width')::numeric;h:=(item->>'height')::numeric;r:=(item->>'rotation')::numeric;
  IF mark IS NULL OR mark=ANY(ids) OR k NOT IN ('wall','door','window','bar','stairs','plant','label') OR k IS NULL OR x IS NULL OR y IS NULL OR w IS NULL OR h IS NULL OR r IS NULL OR x::text IN ('NaN','Infinity','-Infinity') OR y::text IN ('NaN','Infinity','-Infinity') OR w::text IN ('NaN','Infinity','-Infinity') OR h::text IN ('NaN','Infinity','-Infinity') OR r::text IN ('NaN','Infinity','-Infinity') OR x<0 OR y<0 OR w<=0 OR h<=0 OR x+w>l.width OR y+h>l.height OR r<0 OR r>=360 OR NOT private.reservation_properties_valid(item->'properties') THEN RAISE EXCEPTION 'MARK_INVALID' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT FROM public.reservation_layout_elements WHERE id=mark AND (layout_id<>p_layout OR room_id<>p_room OR establishment_id<>p_est OR kind='table')) THEN RAISE EXCEPTION 'MARK_IDENTITY_INVALID' USING ERRCODE='42501';END IF;
  ids:=array_append(ids,mark);
  INSERT INTO public.reservation_layout_elements(id,establishment_id,room_id,layout_id,kind,x,y,width,height,rotation,properties) VALUES(mark,p_est,p_room,p_layout,k,x,y,w,h,r,item->'properties') ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,x=EXCLUDED.x,y=EXCLUDED.y,width=EXCLUDED.width,height=EXCLUDED.height,rotation=EXCLUDED.rotation,properties=EXCLUDED.properties;
 END LOOP;
 DELETE FROM public.reservation_layout_elements WHERE layout_id=p_layout AND establishment_id=p_est AND kind<>'table' AND NOT(id=ANY(ids));
 RETURN jsonb_build_object('id',p_layout,'version',(SELECT version FROM public.reservation_layouts WHERE id=p_layout));
END $$;
REVOKE ALL ON FUNCTION public.reservations_service_plan_save(uuid,uuid,uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_service_plan_save(uuid,uuid,uuid,bigint,jsonb,jsonb) TO authenticated;
COMMIT;
