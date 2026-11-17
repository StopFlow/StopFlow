-- Pilot only. No production migration and no Auth schema changes.
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='2s';
CREATE TABLE public.pilot_ideas (
 id uuid PRIMARY KEY,
 author_id uuid NOT NULL REFERENCES public.profiles(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 4000),
 category text NOT NULL CHECK(length(category) BETWEEN 1 AND 80),
 priority text NOT NULL CHECK(length(priority) BETWEEN 1 AND 40),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pilot_ideas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_ideas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pilot_ideas TO authenticated;
CREATE POLICY pilot_ideas_own_read ON public.pilot_ideas FOR SELECT TO authenticated
 USING(author_id=auth.uid() AND private.has_permission('ideas.share','global'));
CREATE FUNCTION public.pilot_share_idea(p_id uuid,p_title text,p_description text,p_category text,p_priority text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE idea public.pilot_ideas;
BEGIN
 IF auth.uid() IS NULL OR NOT private.has_permission('ideas.share','global') THEN
  RAISE EXCEPTION 'PILOT_IDEA_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.pilot_ideas(id,author_id,title,description,category,priority)
 VALUES(p_id,auth.uid(),btrim(p_title),btrim(p_description),p_category,p_priority)
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT idea FROM public.pilot_ideas WHERE id=p_id;
 IF idea.author_id<>auth.uid() OR idea.title IS DISTINCT FROM btrim(p_title)
 OR idea.description IS DISTINCT FROM btrim(p_description)
 OR idea.category IS DISTINCT FROM p_category OR idea.priority IS DISTINCT FROM p_priority THEN
  RAISE EXCEPTION 'PILOT_IDEA_INTENTION_DIFFERENT' USING ERRCODE='40001';
 END IF;
 RETURN jsonb_build_object('id',idea.id,'created_at',idea.created_at);
END $$;
REVOKE ALL ON FUNCTION public.pilot_share_idea(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pilot_share_idea(uuid,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
