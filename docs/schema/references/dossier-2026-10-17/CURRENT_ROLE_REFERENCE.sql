-- DÉFINITION RETROUVÉE SUR STOPFLOW PRODUCTION (LECTURE SEULE).
-- Référence uniquement, pas une migration à appliquer sans revue complète.
CREATE OR REPLACE FUNCTION private."current_role"()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.actif = true
  limit 1;
$function$;
