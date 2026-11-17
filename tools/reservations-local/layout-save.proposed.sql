-- REVIEW ONLY. No existing objects replaced, no membership changed here.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
CREATE FUNCTION public.reservations_save_layout(p_establishment_id uuid,p_room_id uuid,p_layout_id uuid,p_expected_version bigint,p_elements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE l public.reservation_layouts; el public.reservation_layout_elements; item jsonb;
 tx numeric;ty numeric;tw numeric;th numeric;tr numeric;ex double precision;ey double precision;k text;
BEGIN
 IF NOT private.reservations_can(p_establishment_id,'layouts.manage') THEN RAISE EXCEPTION 'Gestion du plan non autorisée.' USING ERRCODE='42501'; END IF;
 -- Same lock order as table writes: room, layout, elements.
 PERFORM 1 FROM public.reservation_rooms WHERE id=p_room_id AND establishment_id=p_establishment_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Salle inaccessible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.reservation_layouts WHERE id=p_layout_id AND room_id=p_room_id AND establishment_id=p_establishment_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Plan inaccessible.' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS DISTINCT FROM l.version THEN RAISE EXCEPTION 'CONFLIT_VERSION' USING ERRCODE='40001'; END IF;
 IF p_elements IS NULL OR jsonb_typeof(p_elements)<>'array' THEN RAISE EXCEPTION 'Liste requise.' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_elements)>500 THEN RAISE EXCEPTION 'Trop de tables.' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_elements)<>(SELECT count(*) FROM public.reservation_tables WHERE establishment_id=p_establishment_id AND room_id=p_room_id AND active) THEN RAISE EXCEPTION 'CONFLIT_TABLES_ACTIVES' USING ERRCODE='40001'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_elements) LOOP
  IF jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'Objet requis.' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>8 OR EXISTS(SELECT FROM jsonb_object_keys(item) AS q(key) WHERE key NOT IN ('element_id','table_id','expected_version','x','y','width','height','rotation')) THEN RAISE EXCEPTION 'Champs invalides.' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(item->'element_id')<>'string' OR jsonb_typeof(item->'table_id')<>'string' THEN RAISE EXCEPTION 'Identités invalides.' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['expected_version','x','y','width','height','rotation'] LOOP
   IF jsonb_typeof(item->k)<>'number' THEN RAISE EXCEPTION 'Nombre requis.' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_elements) AS v WHERE v->>'table_id'=item->>'table_id')<>1 THEN RAISE EXCEPTION 'Table répétée.' USING ERRCODE='22023'; END IF;
  SELECT e.* INTO el FROM public.reservation_layout_elements e JOIN public.reservation_tables t ON t.id=e.table_id AND t.establishment_id=e.establishment_id AND t.room_id=e.room_id AND t.active
   WHERE e.id=(item->>'element_id')::uuid AND e.table_id=(item->>'table_id')::uuid AND e.layout_id=l.id AND e.establishment_id=p_establishment_id AND e.room_id=p_room_id AND e.kind='table' FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'Élément incohérent.' USING ERRCODE='42501'; END IF;
  IF (item->>'expected_version')::numeric<>el.version THEN RAISE EXCEPTION 'CONFLIT_ELEMENT' USING ERRCODE='40001'; END IF;
  tx:=(item->>'x')::numeric;ty:=(item->>'y')::numeric;tw:=(item->>'width')::numeric;th:=(item->>'height')::numeric;tr:=(item->>'rotation')::numeric;
  IF tx<0 OR ty<0 OR tw<20 OR th<20 OR tw>l.width OR th>l.height OR tr<0 OR tr>=360 THEN RAISE EXCEPTION 'Géométrie invalide.' USING ERRCODE='22023'; END IF;
  ex:=abs(cos(radians(tr::double precision)))*tw/2+abs(sin(radians(tr::double precision)))*th/2;
  ey:=abs(sin(radians(tr::double precision)))*tw/2+abs(cos(radians(tr::double precision)))*th/2;
  IF tx+tw/2-ex < -0.000001 OR ty+th/2-ey < -0.000001 OR tx+tw/2+ex>l.width+0.000001 OR ty+th/2+ey>l.height+0.000001 THEN RAISE EXCEPTION 'Table hors du plan.' USING ERRCODE='22023'; END IF;
  UPDATE public.reservation_layout_elements SET x=tx,y=ty,width=tw,height=th,rotation=tr WHERE id=el.id;
 END LOOP;
 UPDATE public.reservation_layouts SET updated_at=now() WHERE id=l.id RETURNING * INTO l;
 RETURN jsonb_build_object('id',l.id,'version',l.version);
END $fn$;
REVOKE ALL ON FUNCTION public.reservations_save_layout(uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservations_save_layout(uuid,uuid,uuid,bigint,jsonb) TO authenticated;
COMMIT;
