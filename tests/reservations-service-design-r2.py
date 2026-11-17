"""Offline guard checks for the UI-only review command. Never Docker/SQL."""
import importlib.util,pathlib,sys,types,unittest,io,json
from unittest.mock import patch,Mock
R=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('design_review',R/'tools/reservations-service/review-design-r2.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Checks(unittest.TestCase):
 def test_invalid_mode_prints_start_and_final_without_importing_docker(self):
  out=io.StringIO()
  with patch.object(sys,'argv',['review','--invalid']),patch('sys.stdout',out),patch.object(m,'load') as loader:
   self.assertEqual(m.main(),1);loader.assert_not_called()
  lines=[json.loads(x) for x in out.getvalue().splitlines()];self.assertEqual(lines[0]['etape'],'DEMARRAGE_REVUE_UI_SERVICE_R2');self.assertEqual(lines[-1]['etape'],'BILAN_FINAL')
 def test_served_probe_is_local_and_filtered(self):
  fake=types.SimpleNamespace(status=200,read=Mock(return_value=(R/'stopflow-093-service.css').read_bytes()));opener=types.SimpleNamespace(open=Mock(return_value=fake));result={}
  with patch.object(m.urllib.request,'build_opener',return_value=opener):m.served(result)
  self.assertTrue(result['css_module']['conforme_fichier_corrige']);self.assertEqual([a.args[0] for a in opener.open.call_args_list],['http://127.0.0.1:8097/','http://127.0.0.1:8097/stopflow-093-service.css']);self.assertNotIn('--sf93-skin',json.dumps(result))
 def test_missing_endpoint_never_claims_styles_loaded(self):
  opener=types.SimpleNamespace(open=Mock(side_effect=PermissionError(1,'private message never printed')));result={}
  with patch.object(m.urllib.request,'build_opener',return_value=opener):m.served(result)
  self.assertEqual(result['css_module']['lecture'],'NON_CONFIRMEE');self.assertNotIn('private message',json.dumps(result))
if __name__=='__main__':unittest.main()
