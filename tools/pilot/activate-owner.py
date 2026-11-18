"""Private owner invitation. Only the fixed pilot, no password generation.

The Auth admin key lives in memory. The one-time link is written 0600 under
.pilot-private and never printed. Email is supplied by that private request.
"""
import base64
import getpass
import html
import json
import os
from pathlib import Path
import re
import ssl
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REF = 'mmrdpyhoawwoplbzqwag'
ORIGIN = 'https://' + REF + '.supabase.co'
APP = 'https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app'


class Refus(Exception):
    pass


def need(value, label):
    if not value:
        raise Refus(label)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise Refus('REDIRECTION_REFUSEE')


def private_write(path, value):
    need(not path.is_symlink(), 'FICHIER_PRIVE_LIEN_REFUSE')
    fd, name = tempfile.mkstemp(prefix='.owner-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    need(sys.argv[1:] == ['--execute'], 'EXECUTION_EXPLICITE_REQUISE')
    folder = ROOT / '.pilot-private'
    need(folder.is_dir() and not folder.is_symlink() and folder.stat().st_uid == os.getuid()
         and folder.stat().st_mode & 0o077 == 0, 'DOSSIER_PRIVE_NON_PROTEGE')
    request_file = folder / 'OWNER-REQUEST.json'
    need(not request_file.is_symlink() and request_file.stat().st_mode & 0o077 == 0, 'DEMANDE_NON_PROTEGEE')
    request = json.loads(request_file.read_text())
    need(request.get('project_ref') == REF and request.get('app_origin') == APP, 'CIBLE_DIFFERENTE')
    email = request.get('email', '')
    need(isinstance(email, str) and re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email), 'ADRESSE_REFUSEE')
    need(sys.stdin.isatty(), 'SAISIE_PRIVEE_TERMINAL_REQUISE')
    print(json.dumps({'etape': 'ACTIVATION_PRIVEE_PROPRIETAIRE', 'projet': REF,
                      'mot_de_passe_genere': False, 'cle_conservee': False}), flush=True)
    key = getpass.getpass('Clé serveur du SEUL projet Supabase pilote (saisie masquée) : ')
    if key.startswith('eyJ'):
        claims = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        need(claims.get('ref') == REF and claims.get('role') == 'service_role', 'CLE_AUTRE_PROJET_OU_ROLE')
    else:
        need(key.startswith('sb_secret_') and len(key) > 30, 'CLE_SERVEUR_FORMAT_REFUSE')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
        urllib.request.HTTPSHandler(context=ssl.create_default_context()))

    def call(method, path, body=None):
        need(path.startswith(('/auth/v1/admin/', '/rest/v1/rpc/')) and '..' not in path, 'CHEMIN_REFUSE')
        req = urllib.request.Request(ORIGIN + path, method=method,
            headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
            data=None if body is None else json.dumps(body).encode())
        try:
            response = opener.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
            raise Refus('HTTP_' + str(code)) from None
        with response:
            raw = response.read(2_000_001)
            need(len(raw) <= 2_000_000, 'REPONSE_TROP_LONGUE')
            return json.loads(raw)

    # The dedicated RPC refuses any email/id different from the DB owner config.
    users = call('GET', '/auth/v1/admin/users?page=1&per_page=1000').get('users')
    need(isinstance(users, list) and len(users) < 1000, 'LISTE_AUTH_NON_CONFIRMEE')
    matches = [u for u in users if str(u.get('email', '')).casefold() == email.casefold()]
    need(len(matches) <= 1, 'IDENTITE_AMBIGUE')
    receipt = folder / 'ACTIVATION-PROPRIETAIRE.json'
    if receipt.exists():
        need(not receipt.is_symlink() and receipt.stat().st_mode & 0o077 == 0, 'RECU_NON_PROTEGE')
        saved = json.loads(receipt.read_text())
        need(saved.get('project_ref') == REF and saved.get('email') == email and len(matches) == 1
             and saved.get('user_id') == matches[0].get('id'), 'RECU_AUTRE_IDENTITE')
        need(saved.get('token_type') in ('invite', 'recovery') and re.fullmatch(r'[A-Za-z0-9_-]{32,256}', saved.get('token_hash', '')), 'RECU_INCOMPLET')
    else:
        # Write intent before the Auth creation; a later retry reconciles by exact email.
        intent = folder / 'INTENTION-PROPRIETAIRE.json'
        if matches:
            need(intent.is_file() and not intent.is_symlink() and intent.stat().st_mode & 0o077 == 0,
                 'COMPTE_PROPRIETAIRE_EXISTANT_SANS_PREUVE_PRIVEE')
            previous = json.loads(intent.read_text())
            need(previous.get('project_ref') == REF and previous.get('email') == email
                 and previous.get('creation_demandee') is True, 'INTENTION_AUTRE_CIBLE')
        else:
            private_write(intent, json.dumps({'project_ref': REF, 'email': email, 'creation_demandee': True}))
        token_type = 'recovery' if matches else 'invite'
        generated = call('POST', '/auth/v1/admin/generate_link',
                         {'type': token_type, 'email': email, 'redirect_to': APP + '/'})
        user = generated.get('user') or generated
        properties = generated.get('properties') or generated
        need(str(user.get('email', '')).casefold() == email.casefold()
             and re.fullmatch(r'[a-fA-F0-9-]{36}', user.get('id', '')), 'IDENTITE_AUTH_NON_CONFIRMEE')
        token_hash = properties.get('hashed_token', '')
        need(re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token_hash), 'LIEN_PRIVE_NON_CONFIRME')
        saved = {'project_ref': REF, 'email': email, 'user_id': user['id'],
                 'token_type': token_type, 'token_hash': token_hash}
        private_write(receipt, json.dumps(saved))
    result = call('POST', '/rest/v1/rpc/pilot_complete_owner_bootstrap', {'p_user': saved['user_id']})
    need(result.get('owner_ready') is True and result.get('reservations_complete') is True, 'PROFIL_NON_CONFIRME')
    url = APP + '/#pilot_activation=' + saved['token_hash'] + '&type=' + saved['token_type']
    output = folder / 'ACTIVATION-QUENTIN.html'
    private_write(output, '<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">'
        '<title>Activation privée StopFlow</title><h1>Activation privée</h1>'
        '<p>Choisissez votre mot de passe dans StopFlow. Ne partagez pas ce fichier.</p>'
        '<a rel="noreferrer" href="' + html.escape(url, quote=True) + '">Activer mon compte</a>')
    print(json.dumps({'resultat': 'ACTIVATION_PRIVEE_PREPAREE', 'role': 'admin',
        'reservations_completes': True, 'acces_avant_choix_mot_de_passe': False,
        'fichier_prive': str(output), 'mot_de_passe': 'A_CHOISIR_PAR_QUENTIN'}), flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Refus as error:
        print(json.dumps({'resultat': 'NON_CONFIRME', 'motif': str(error)}), flush=True)
        raise SystemExit(1)
    except Exception as error:
        reason = error.reason if isinstance(error, urllib.error.URLError) else error
        print(json.dumps({'resultat': 'NON_CONFIRME', 'type': type(error).__name__,
                          'cause_type': type(reason).__name__, 'errno': getattr(reason, 'errno', None)}), flush=True)
        raise SystemExit(1)
