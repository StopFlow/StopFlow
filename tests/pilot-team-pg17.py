"""Disposable PG17, simulated Auth identities. Never a live Supabase target."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PG = pathlib.Path('/opt/homebrew/bin')
BASELINE = ROOT.parent.parent.parent / 'socle-local-revue-20261101-defaults/installation.proposed.sql'


def main():
    baseline = BASELINE.read_text()
    if hashlib.sha256(baseline.encode()).hexdigest() != '6ea052139c0eb373bf9046935be21cf5a2dcaa8479b1f8051804698bd69b0913':
        raise RuntimeError('BASELINE_SHA_DIFFERENT')
    with tempfile.TemporaryDirectory(prefix='sf-pilot-team-', dir='/private/tmp') as temporary:
        work = pathlib.Path(temporary)
        os.chmod(work, 0o700)
        data = work / 'cluster'
        env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin', 'LC_ALL': 'C', 'TMPDIR': temporary}
        init = subprocess.run([str(PG / 'initdb'), '-D', str(data), '-U', 'fixture_admin', '--encoding=UTF8',
            '--no-locale', '--auth-local=trust', '--auth-host=reject', '-c', 'shared_memory_type=mmap',
            '-c', 'dynamic_shared_memory_type=mmap'], capture_output=True, env=env, timeout=30)
        if init.returncode:
            cause = 'PERMISSION_REFUSEE' if re.search(rb'Permission denied|Operation not permitted', init.stderr) else 'NON_CLASSEE'
            print(json.dumps({'resultat': 'NON_VERIFIE', 'etape': 'INITDB', 'code': init.returncode,
                              'cause': cause, 'supabase_reel': False, 'nettoyage': 'FIXTURE_SUPPRIMEE'}))
            return 1
        prefix = """
CREATE ROLE postgres LOGIN NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE supabase_admin NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
ALTER DATABASE postgres OWNER TO postgres;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email varchar(255),raw_user_meta_data jsonb DEFAULT '{}',invited_at timestamptz,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false,encrypted_password text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
GRANT USAGE ON SCHEMA auth TO postgres,anon,authenticated,service_role;
GRANT SELECT,REFERENCES ON auth.users TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
CREATE SCHEMA extensions;
CREATE EXTENSION btree_gist WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres,authenticated;
SET SESSION AUTHORIZATION postgres;
"""
        layers = [baseline, (ROOT / 'tools/reservations-local/layout-save.proposed.sql').read_text(),
                  (ROOT / 'tools/reservations-v1/bookings.proposed.sql').read_text(),
                  (ROOT / 'tools/reservations-service/service.proposed.sql').read_text(),
                  (ROOT / 'tools/pilot/fixtures.sql').read_text(),
                  (ROOT / 'supabase/pilot/feedback.sql').read_text(),
                  (ROOT / 'supabase/pilot/team-access.sql').read_text(),
                  (ROOT / 'supabase/pilot/owner-activation.sql').read_text()]
        fixture = json.loads((ROOT / 'tools/pilot/fixture-target.json').read_text())
        est = fixture['establishment_id']
        tail = r"""
SET row_security=on;
RESET SESSION AUTHORIZATION;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('11111111-1111-4111-8111-111111111111','owner-team-fixture@example.invalid',now(),'SIMULATED_HASH_PRESENT'),
 ('22222222-2222-4222-8222-222222222222','staff-team-fixture@example.invalid',now(),'SIMULATED_HASH_PRESENT');
SET SESSION AUTHORIZATION postgres;
INSERT INTO private.pilot_owner_config(owner_email,establishment_id) VALUES('owner-team-fixture@example.invalid','EST');
SELECT public.pilot_complete_owner_bootstrap('11111111-1111-4111-8111-111111111111');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$BEGIN IF private.is_admin() OR private.reservations_can('EST','view') THEN RAISE EXCEPTION 'TEAM_OWNER_BEFORE_ACTIVATION'; END IF; END$$;
SELECT public.pilot_owner_activation_complete();
DO $$BEGIN
 IF NOT private.is_admin() OR NOT private.pilot_is_owner() OR NOT private.reservations_can('EST','layouts.manage')
 OR NOT private.reservations_can('EST','rooms.manage') OR NOT private.reservations_can('EST','tables.manage')
 OR NOT private.bookings_can('EST','manage') OR NOT private.has_permission('settings.manage','global')
 THEN RAISE EXCEPTION 'TEAM_OWNER_INCOMPLETE'; END IF;
END$$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
SELECT public.pilot_request_access('Staff','Fictif');
DO $$BEGIN
 IF private.pilot_account_active(auth.uid()) OR private.is_admin() OR private.reservations_can('EST','view')
 OR private.has_permission('inventory.use','salle') THEN RAISE EXCEPTION 'TEAM_PENDING_RIGHTS'; END IF;
 IF EXISTS(SELECT FROM public.reservation_rooms) OR EXISTS(SELECT FROM public.app_settings)
 OR EXISTS(SELECT FROM public.orders) THEN RAISE EXCEPTION 'TEAM_PENDING_DATA'; END IF;
 IF NOT EXISTS(SELECT FROM public.pilot_registration_requests WHERE profile_id=auth.uid() AND status='pending')
 THEN RAISE EXCEPTION 'TEAM_PENDING_STATUS_INVISIBLE'; END IF;
 BEGIN PERFORM public.reservations_read('EST'); RAISE EXCEPTION 'TEAM_PENDING_RPC_ALLOWED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pilot_complete_owner_bootstrap(auth.uid()); RAISE EXCEPTION 'TEAM_BOOTSTRAP_ALLOWED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.pilot_review_request(auth.uid(),1,'approved','admin','[]','{}'); RAISE EXCEPTION 'TEAM_SELF_APPROVAL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
SELECT public.pilot_review_request('22222222-2222-4222-8222-222222222222',1,'rejected','employe','[]','{}');
DO $$BEGIN IF (SELECT status FROM public.pilot_registration_requests WHERE profile_id='22222222-2222-4222-8222-222222222222')<>'rejected' THEN RAISE EXCEPTION 'TEAM_REJECTION'; END IF; END$$;
SELECT public.pilot_review_request('22222222-2222-4222-8222-222222222222',2,'approved','employe','[{"permission_key":"inventory.use","scope":"salle"},{"permission_key":"ideas.share","scope":"global"}]','{"can_view":true,"can_view_bookings":true,"can_manage_bookings":true}');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $$BEGIN
 IF NOT private.pilot_account_active(auth.uid()) OR NOT private.has_permission('inventory.use','salle')
 OR private.has_permission('inventory.use','cuisine') OR private.is_admin() OR NOT private.bookings_can('EST','manage')
 OR private.reservations_can('EST','layouts.manage') OR private.reservations_can('EST','tables.manage') OR private.reservations_can('EST','rooms.manage')
 THEN RAISE EXCEPTION 'TEAM_TARGETED_ACCESS'; END IF;
 PERFORM public.reservations_read('EST');
 IF EXISTS(SELECT FROM public.profiles WHERE id<>auth.uid()) THEN RAISE EXCEPTION 'TEAM_PROFILE_LEAK'; END IF;
END$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$BEGIN
 BEGIN PERFORM public.pilot_review_request('22222222-2222-4222-8222-222222222222',2,'revoked','employe','[]','{}'); RAISE EXCEPTION 'TEAM_STALE_WRITE'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM public.pilot_review_request('22222222-2222-4222-8222-222222222222',3,'approved','admin','[]','{}'); RAISE EXCEPTION 'TEAM_ADMIN_ESCALATION'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.pilot_review_request('22222222-2222-4222-8222-222222222222',3,'approved','employe','[]','{"can_manage_bookings":true}'); RAISE EXCEPTION 'TEAM_BAD_FLAGS_ACCEPTED'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT version FROM public.pilot_registration_requests WHERE profile_id='22222222-2222-4222-8222-222222222222')<>3 THEN RAISE EXCEPTION 'TEAM_NONATOMIC_FAILURE'; END IF;
END$$;
SELECT public.pilot_review_request('22222222-2222-4222-8222-222222222222',3,'revoked','employe','[]','{}');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $$BEGIN
 IF private.pilot_account_active(auth.uid()) OR private.has_permission('inventory.use','salle')
 OR private.reservations_can('EST','view') OR EXISTS(SELECT FROM public.reservation_rooms)
 THEN RAISE EXCEPTION 'TEAM_REVOKED_STILL_ALLOWED'; END IF;
 IF (public.pilot_team_context()->>'status')<>'revoked' THEN RAISE EXCEPTION 'TEAM_REVOKED_STATUS'; END IF;
END$$;
RESET ROLE;
SELECT 'PILOT_TEAM_COMPLETE';
""".replace('EST', est)
        sql = prefix + '\n'.join(re.sub(r'^\\[^\n]*$', '', x, flags=re.M) for x in layers) + tail
        command = subprocess.run([str(PG / 'postgres'), '--single', '-j', '-D', str(data), 'postgres'],
                                 input=sql.encode(), capture_output=True, env=env, timeout=90)
        combined = command.stdout + command.stderr
        if command.returncode or re.search(rb'\b(ERROR|FATAL|PANIC):', combined) or b'PILOT_TEAM_COMPLETE' not in combined:
            error = re.search(rb'\b(ERROR|FATAL|PANIC):\s+([^\n]+)', combined)
            message = error[2] if error else b''
            label = re.search(rb'\bTEAM_[A-Z_]+\b', message)
            cause = label[0].decode() if label else 'SQL_FIXTURE_REFUSE'
            print(json.dumps({'resultat': 'ECHEC', 'etape': 'SQL', 'motif': cause,
                              'code': command.returncode, 'supabase_reel': False, 'nettoyage': 'FIXTURE_SUPPRIMEE'}))
            return 1
        print(json.dumps({'resultat': 'PASS', 'groupes': 9, 'auth': 'SIMULEE', 'postgresql': '17_MONOUTILISATEUR',
                          'supabase_reel': False, 'nettoyage': 'FIXTURE_SUPPRIMEE'}))
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
