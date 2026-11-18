"""Build a rollback-only, schema-isolated PG17 fixture. No network execution."""
import ast
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def prepare():
    baseline = (ROOT.parent.parent.parent / 'socle-local-revue-20261101-defaults/installation.proposed.sql').read_text()
    assert hashlib.sha256(baseline.encode()).hexdigest() == '6ea052139c0eb373bf9046935be21cf5a2dcaa8479b1f8051804698bd69b0913'
    code = ast.parse((ROOT / 'tests/pilot-team-pg17.py').read_text())
    main = next(n for n in code.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
    assignments = [n for n in ast.walk(main) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'tail' for t in n.targets)]
    assert len(assignments) == 1
    tail = ast.literal_eval(assignments[0].value.func.value)
    est = json.loads((ROOT / 'tools/pilot/fixture-target.json').read_text())['establishment_id']
    tail = 'SET LOCAL row_security=on;\n' + tail.replace("'EST'", "'" + est + "'")
    tail = tail.replace('RESET SESSION AUTHORIZATION;', '').replace('SET SESSION AUTHORIZATION postgres;', '')
    tail = tail.replace('SET ROLE authenticated;', 'SET LOCAL ROLE authenticated;')
    paths = ['tools/reservations-local/layout-save.proposed.sql', 'tools/reservations-v1/bookings.proposed.sql',
             'tools/reservations-service/service.proposed.sql', 'tools/pilot/fixtures.sql',
             'supabase/pilot/feedback.sql', 'supabase/pilot/team-access.sql', 'supabase/pilot/owner-activation.sql']
    layers = [baseline] + [(ROOT / p).read_text() for p in paths]
    body = '\n'.join(re.sub(r'(?m)^\\[^\n]*$', '', s) for s in layers) + tail
    body = re.sub(r'(?mi)^(?:BEGIN|COMMIT);\s*$', '', body)
    assert body.count(' OR inet_server_addr() IS NOT NULL') == 1
    body = body.replace(' OR inet_server_addr() IS NOT NULL', '')
    names = {'public': 'sf_pilot_test_public', 'private': 'sf_pilot_test_private', 'auth': 'sf_pilot_test_auth'}
    for old, new in names.items():
        body = re.sub(r'\b' + old + r'\.', new + '.', body)
        body = body.replace("'" + old + "'", "'" + new + "'")
        body = re.sub(r'(\bSCHEMA(?: IF NOT EXISTS)?\s+)' + old + r'\b', lambda m: m[1] + new, body, flags=re.I)
    assert not re.search(r'\b(public|private|auth)\.', body)
    assert not re.search(r'(?mi)^\s*(CREATE|ALTER|DROP)\s+(ROLE|DATABASE)\b', body)
    assert not re.search(r'(?mi)^\s*(BEGIN|COMMIT);', body)
    prefix = """BEGIN;
SET LOCAL statement_timeout='55s'; SET LOCAL lock_timeout='2s';
DO $$BEGIN IF current_database()<>'postgres' OR current_user<>'postgres' OR current_setting('server_version_num')::int/10000<>17 THEN RAISE EXCEPTION 'FIXTURE_TARGET_WRONG'; END IF; END$$;
CREATE SCHEMA sf_pilot_test_public AUTHORIZATION pg_database_owner;
CREATE SCHEMA sf_pilot_test_auth;
CREATE TABLE sf_pilot_test_auth.users(id uuid PRIMARY KEY,email varchar(255),raw_user_meta_data jsonb DEFAULT '{}',invited_at timestamptz,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false,encrypted_password text);
CREATE FUNCTION sf_pilot_test_auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION sf_pilot_test_auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
GRANT USAGE ON SCHEMA sf_pilot_test_auth TO postgres,anon,authenticated,service_role;
GRANT SELECT,REFERENCES ON sf_pilot_test_auth.users TO postgres;
"""
    # The baseline's guards count only the isolated schema after rewriting.
    return prefix + body + "\nROLLBACK;\nSELECT jsonb_build_object('resultat','PASS','groupes',9,'postgresql','17_SCHEMAS_JETABLES','auth','SIMULEE','rollback',true) AS result;\n"


if __name__ == '__main__':
    print(json.dumps(prepare()))
