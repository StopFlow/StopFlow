-- SOURCE : Supabase StopFlow PRODUCTION, 2026-10-17.
-- Référence reconstruite des colonnes et contraintes de l'état actuel,
-- vérifiées directement dans pg_catalog ; ce fichier n'est PAS une migration
-- automatiquement exécutable. Vérifier ordre des dépendances, ACL et routines.
-- Aucune donnée d'utilisateur n'est incluse.

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    prenom text,
    nom text,
    role text DEFAULT 'employe'::text NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    departement text,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_email_key UNIQUE (email),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'responsable'::text, 'employe'::text])),
    CONSTRAINT profiles_departement_check CHECK (departement IS NULL OR (departement = ANY (ARRAY['nettoyage'::text, 'salle'::text, 'cuisine'::text, 'bureau'::text]))),
    CONSTRAINT profiles_department_known_check CHECK (departement IS NULL OR (departement = ANY (ARRAY['salle'::text, 'cuisine'::text, 'nettoyage'::text, 'bureau'::text])))
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- RLS non forcée en Production ; propriétaire : postgres.

CREATE POLICY profiles_select_self_or_admin ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = (SELECT auth.uid() AS uid)) OR (SELECT private.is_admin() AS is_admin));

CREATE POLICY profiles_update_admin_only ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin() AS is_admin))
  WITH CHECK ((SELECT private.is_admin() AS is_admin));

-- ACL pg_catalog public.profiles :
-- {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
-- Interprétation : tous les droits table pour postgres, authenticated,
-- service_role ; l'accès par utilisateur dépend de RLS et des fonctions privées.
-- Revoir les grants de toutes les fonctions, schémas et séquences avant installation.

CREATE TRIGGER protect_core_accounts_update
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION private.protect_core_accounts();

CREATE TRIGGER stopflow_060_audit_profile_delete
  AFTER DELETE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION private.stopflow_060_audit_profile_delete();

CREATE TRIGGER stopflow_060_sync_primary_assignment
  AFTER INSERT OR UPDATE OF departement, role, actif ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.stopflow_060_sync_primary_assignment();

-- Deux index observés : le système les crée automatiquement avec
-- les contraintes PK/UNIQUE ; NE PAS créer de doublons manuellement.
-- CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)
-- CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email)
