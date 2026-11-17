"""Offline launcher/HTTP self-check tests. No Docker, listener or data writes."""
import importlib.util,io,json,pathlib,types,unittest
from unittest.mock import Mock,patch
R=pathlib.Path(__file__).resolve().parents[1]
def module(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=module('r3_lan',R/'tools/reservations-service/lan-r3.py');base=module('r3_base',R/'tools/reservations-service/trial.py')
class Checks(unittest.TestCase):
 def phone(self):
  p=m.build_phone(base,'192.168.1.23');p.uid='10000000-0000-4000-8000-000000000001';p.est='20000000-0000-4000-8000-000000000001';p.t=types.SimpleNamespace(op='fictif',token='SECRET_TOKEN_NE_JAMAIS_SERVIR');p.make_assets();return p
 def test_r3_assets_and_private_exact_address(self):
  p=self.phone();self.assertEqual(p.origin,'http://192.168.1.23:8098');self.assertIn(b'Service R3',p.assets['index.html']);self.assertIn(b'service-r3',p.assets['index.html']);self.assertIn(b'service-list-r3',p.assets['stopflow-093-service.css']);self.assertNotIn(b'SECRET_TOKEN_NE_JAMAIS_SERVIR',b''.join(p.assets.values()))
 def test_verified_http_does_not_consume_join(self):
  p=self.phone();join=p.join;names=iter(['index.html','stopflow-093-service.css','stopflow-093-service.js','stopflow-093-service-model.js']);opener=Mock()
  def response(*args,**kw):
   data=p.assets[next(names)]
   return types.SimpleNamespace(__enter__=lambda s:s,__exit__=lambda *a:None)
  class Reply:
   status=200
   def __init__(self,data):self.data=data
   def read(self,n):return self.data[:n]
   def __enter__(self):return self
   def __exit__(self,*args):pass
  opener.open.side_effect=lambda *a,**kw:Reply(p.assets[next(names)])
  with patch.object(m.urllib.request,'build_opener',return_value=opener):v=m.verify_http(p)
  self.assertTrue(v['page_et_trois_assets_conformes']);self.assertEqual(p.join,join);self.assertEqual(len(opener.open.call_args_list),4);self.assertTrue(all('/join/' not in c.args[0].full_url for c in opener.open.call_args_list))
 def test_mismatched_served_bytes_refused(self):
  p=self.phone()
  class Wrong:
   status=200
   def read(self,n):return b'OLD_VERSION'
   def __enter__(self):return self
   def __exit__(self,*args):pass
  with patch.object(m.urllib.request,'build_opener',return_value=types.SimpleNamespace(open=lambda *a,**kw:Wrong())):
   with self.assertRaisesRegex(ValueError,'HTTP_R3_NON_CONFORME'):m.verify_http(p)
 def test_wifi_must_be_physical_private_and_on(self):
  outputs=[types.SimpleNamespace(returncode=0,stdout='Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: OMITTED\n'),types.SimpleNamespace(returncode=0,stdout='Wi-Fi Power (en0): On\n'),types.SimpleNamespace(returncode=0,stdout='192.168.1.23\n')]
  with patch.object(m.subprocess,'run',side_effect=outputs):self.assertEqual(m.wifi_address(),'192.168.1.23')
  outputs[-1]=types.SimpleNamespace(returncode=0,stdout='8.8.8.8\n')
  with patch.object(m.subprocess,'run',side_effect=outputs):
   with self.assertRaisesRegex(ValueError,'IP_PRIVEE_WIFI_REQUISE'):m.wifi_address()
 def test_no_old_test_campaign(self):
  source=(R/'tools/reservations-service/lan-r3.py').read_text();self.assertNotIn('reservations-service-pg17.py',source);self.assertNotIn('chromium.launch',source)
if __name__=='__main__':unittest.main()
