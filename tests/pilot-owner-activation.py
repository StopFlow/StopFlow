"""Transport simulation only; no email, Auth account or cloud request."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest.mock as mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('owner_activation', ROOT / 'tools/pilot/activate-owner.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Response:
    def __init__(self, value): self.raw = json.dumps(value).encode()
    def read(self, limit): return self.raw[:limit]
    def __enter__(self): return self
    def __exit__(self, *args): pass


with tempfile.TemporaryDirectory(prefix='sf-owner-') as directory:
    root = Path(directory)
    folder = root / '.pilot-private'
    folder.mkdir(mode=0o700)
    request = folder / 'OWNER-REQUEST.json'
    request.write_text(json.dumps({'email': 'owner@example.invalid', 'project_ref': module.REF, 'app_origin': module.APP}))
    os.chmod(request, 0o600)
    calls = []
    user = {'id': '11111111-1111-4111-8111-111111111111', 'email': 'owner@example.invalid'}
    created, fail_bootstrap = False, True

    class Opener:
        def open(self, req, timeout):
            global created, fail_bootstrap
            assert req.full_url.startswith(module.ORIGIN + '/') and 0 < timeout <= 20
            calls.append(req.full_url.split(module.ORIGIN)[1])
            if '/admin/users?' in req.full_url: return Response({'users': [user] if created else []})
            if req.full_url.endswith('/generate_link'):
                created = True
                body = json.loads(req.data)
                assert 'password' not in body and body['type'] == 'invite'
                return Response({**user, 'hashed_token': 'a' * 64})
            assert req.full_url.endswith('/rpc/pilot_complete_owner_bootstrap')
            if fail_bootstrap:
                fail_bootstrap = False
                raise module.Refus('SIMULATED_RESPONSE_LOSS')
            return Response({'owner_ready': True, 'reservations_complete': True})

    output = io.StringIO()
    with mock.patch.object(module, 'ROOT', root), mock.patch.object(module.sys, 'argv', ['activate-owner.py', '--execute']), \
         mock.patch.object(module.sys.stdin, 'isatty', return_value=True), \
         mock.patch.object(module.getpass, 'getpass', return_value='sb_secret_SYNTHETIC_ONLY_NOT_A_REAL_KEY'), \
         mock.patch.object(module.urllib.request, 'build_opener', return_value=Opener()), contextlib.redirect_stdout(output):
        try:
            module.main()
            raise AssertionError('Expected simulated interruption')
        except module.Refus as error:
            assert str(error) == 'SIMULATED_RESPONSE_LOSS'
        assert (folder / 'ACTIVATION-PROPRIETAIRE.json').exists()
        assert module.main() == 0
    assert sum('/generate_link' in path for path in calls) == 1
    activation = folder / 'ACTIVATION-QUENTIN.html'
    assert activation.stat().st_mode & 0o077 == 0
    assert 'pilot_activation=' + 'a' * 64 in activation.read_text()
    assert 'a' * 64 not in output.getvalue()
    assert 'sb_secret_' not in output.getvalue()
    assert 'owner@example.invalid' not in output.getvalue()
print(json.dumps({'resultat': 'PASS', 'groupes': 3, 'auth_reelle': False, 'type': 'SIMULATION_ACTIVATION_ET_REPRISE'}))
