-- SOURCE : définitions effectives Supabase Production via pg_catalog.
-- Référence uniquement : ne pas exécuter dans une base distante.
-- Fonction public.handle_new_user : owner postgres, SECURITY DEFINER,
-- search_path vide, ACL={postgres=X/postgres,service_role=X/postgres}.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (
    id,
    email,
    prenom,
    nom,
    role,
    actif
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'prenom', ''),
    coalesce(new.raw_user_meta_data->>'nom', ''),
    'employe',
    true
  );

  return new;
end;
$function$;

-- DDL exact du trigger renvoyé par pg_get_triggerdef :
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ATTENTION : la référence Auth ne remplace pas le provisionnement Supabase
-- Auth/GoTrue lui-même. Supabase contrôle la table auth.users.
-- Le trigger hérité doit être revu dans l'environnement local isolé.
