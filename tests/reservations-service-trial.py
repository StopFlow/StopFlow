"""Pure gateway tests; never creates Auth account, socket, helper or database."""
import ast,importlib.util,pathlib,types,json,unittest
from unittest.mock import Mock
R=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('service_gateway',R/'tools/reservations-service/trial.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Checks(unittest.TestCase):
 def phone(self):
  p=m.ServicePhone();p.est='10000000-0000-4000-8000-000000000001';p.uid='20000000-0000-4000-8000-000000000001';p.t=types.SimpleNamespace(token='PRIVEE_JWT_FICTIVE_NE_PAS_SERVIR',op='op_fictive',request=Mock(return_value=(200,[])));p.make_assets();return p
 def test_loopback_only_and_assets_no_token(self):
  p=self.phone();self.assertEqual(p.origin,'http://127.0.0.1:8097');self.assertNotIn(b'PRIVEE_JWT_FICTIVE_NE_PAS_SERVIR',b''.join(p.assets.values()));self.assertIn(b'stopflow-093-service.js',p.assets['index.html']);self.assertIn(b'Fiches clients',p.assets['stopflow-093-service.js']);self.assertIn(b'trial-scope',p.assets['online.html'])
 def test_trial_references_and_serves_current_module_styles(self):
  p=self.phone();self.assertIn(b'href="/stopflow-093-service.css"',p.assets['index.html']);self.assertEqual(p.assets['stopflow-093-service.css'],(R/'stopflow-093-service.css').read_bytes());self.assertIn(b'--sf93-skin:service-tablet-r2',p.assets['stopflow-093-service.css'])
 def test_foreign_or_unknown_args_refused(self):
  p=self.phone()
  for name,args in [('reservations_service_clients',{'p_est':'foreign','p_phone':'+32470000001'}),('reservations_service_day',{'p_est':p.est,'p_day':'2027-12-10','sql':'bad'})]:
   with self.assertRaises(ValueError):p.rpc(name,args)
  p.t.request.assert_not_called()
 def test_staff_token_used_only_server_side(self):
  p=self.phone();p.rpc('reservations_service_day',{'p_est':p.est,'p_day':'2027-12-10'});self.assertEqual(p.t.request.call_args.args[-1],p.t.token);self.assertEqual(p.t.request.call_args.args[1],'/rpc/reservations_service_day')
 def test_public_whitelist_cannot_query_directory_or_edit_plan(self):
  self.assertEqual(set(m.PUBLIC),{'reservations_public_available','reservations_public_book'});self.assertNotIn('p_est',m.PUBLIC['reservations_public_available']);self.assertIn('p_members',m.PUBLIC['reservations_public_book'])
 def test_filtered_error(self):
  p=self.phone();p.t.request.return_value=(409,{'code':'23P01','message':'PRIVATE_SQL_AND_CONTACT'});v=p.rpc('reservations_service_day',{'p_est':p.est,'p_day':'2027-12-10'});self.assertEqual(v,{'data':None,'error':{'code':'23P01'}})
if __name__=='__main__':unittest.main()
