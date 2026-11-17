"""Qualify native PG17, then a new disposable real-Auth Service trial on localhost.
No originals, image pull, external service, deployment or global cleanup.
"""
import hashlib,importlib.util,json,pathlib,secrets,signal,subprocess,sys,threading,time,uuid
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
R=pathlib.Path(__file__).resolve().parents[2];H=R/'tools/reservations-service'
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
if __name__=='__main__':print(json.dumps({'etape':'CHARGEMENT_LANCEUR_SERVICE','base_active':False}),flush=True)
pmod=load('service_phone_primitives',R/'tools/reservations-v1/iphone-tryout.py')
# Exact signatures; neither arbitrary SQL nor arbitrary REST paths accepted.
SPEC={
 'reservations_service_available':{'p_est','p_start','p_end','p_covers','p_exclude'},
 'reservations_service_save':{'p_est','p_id','p_version','p_resource','p_kind','p_name','p_phone','p_email','p_start','p_end','p_covers','p_members'},
 'reservations_service_clients':{'p_est','p_phone'},'reservations_service_day':{'p_est','p_day'},'reservations_service_groups':{'p_est'},
 'reservations_service_group_save':{'p_est','p_id','p_version','p_room','p_name','p_tables','p_active'},
 'reservations_service_plan_save':{'p_est','p_room','p_layout','p_version','p_tables','p_marks'},
}
PUBLIC={'reservations_public_available':{'p_start','p_end','p_covers'},'reservations_public_book':{'p_id','p_resource','p_kind','p_name','p_phone','p_email','p_start','p_end','p_covers','p_members'}}
class ServicePhone(pmod.Phone):
 def __init__(self):
  super().__init__('192.168.1.24');self.ip='127.0.0.1';self.host='127.0.0.1:8097';self.origin='http://'+self.host
 def rpc(self,name,args):
  if name not in SPEC:return super().rpc(name,args)
  pmod.need(isinstance(args,dict) and set(args)==SPEC[name] and args.get('p_est')==self.est,'RPC_SERVICE_REFUSEE')
  return self.call(name,args,self.t.token)
 def call(self,name,args,token):
  with self.lock:code,value=self.t.request('rest','/rpc/'+name,'POST',args,token)
  if code==200:return {'data':value,'error':None}
  safe=value.get('code') if isinstance(value,dict) else None
  return {'data':None,'error':{'code':safe if safe in ('23P01','40001','42501','22023','23514','23505','22P02') else 'RESULTAT_NON_CONFIRME'}}
 def make_assets(self):
  self.assets={n:(R/n).read_bytes() for n in ('stopflow-091-reservations.js','stopflow-091-reservations.css','stopflow-092-bookings.js','stopflow-093-service-model.js','stopflow-093-service.js','stopflow-093-service.css')};self.assets['demo.css']=pmod.demo.STYLE.encode();self.assets['demo.js']=(pmod.UUID_FALLBACK+pmod.demo.BOOT.replace('USER',self.uid).replace('TOKEN',self.csrf).replace("document.querySelector('[data-action=view-agenda]')?.click();",'')).encode()
  self.assets['index.html']=b'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StopFlow Service TEST</title><link rel="stylesheet" href="/demo.css"><link rel="stylesheet" href="/stopflow-091-reservations.css"><link rel="stylesheet" href="/stopflow-093-service.css"></head><body><header><strong>StopFlow Service - TEST ISOLE</strong><p>Compte equipe fictif. Aucun lien avec les donnees actives.</p><a href="/online" target="_blank" rel="noopener">Formulaire client fictif</a></header><div id="app"><span id="pageTitle" hidden></span><span id="sf52MobileTitle" hidden></span><main class="main"></main></div><script src="/demo.js"></script><script src="/stopflow-091-reservations.js"></script><script src="/stopflow-092-bookings.js"></script><script src="/stopflow-093-service-model.js"></script><script src="/stopflow-093-service.js"></script></body></html>'''
  self.assets['online.html']=(H/'online.html').read_text().replace('<head>','<head><meta name="trial-scope" content="'+self.t.op+'">').encode();self.assets['online.js']=(H/'online.js').read_bytes()
 def provision(self):
  super().provision();self.t.stage('MIGRATION_SERVICE_BASE_NEUVE');self.t.sql((H/'service.proposed.sql').read_text(),'postgres',reference='MIGRATION_SERVICE_ISOLEE');self.t.sql("UPDATE public.reservation_establishments SET online_test_enabled=true WHERE id='"+self.est+"';NOTIFY pgrst, 'reload schema';",'postgres',reference='ACTIVATION_FORMULAIRE_FICTIF_SEULEMENT')
  rows=self.rpc('reservations_read',{'p_establishment_id':self.est})['data'];tables=sorted((t for t in rows['tables'] if t['active']),key=lambda t:t['id']);group_room=next((r['id'] for r in rows['rooms'] if sum(t['room_id']==r['id'] for t in tables)>=3),None)
  if group_room:
   members=[t['id'] for t in tables if t['room_id']==group_room][:3]
   for name,ids in (('Jumelage fictif A+B',members[:2]),('Jumelage fictif B+C',members[1:])):
    self.t.sql("INSERT INTO public.reservation_table_groups(id,establishment_id,room_id,name,table_ids) VALUES('"+str(uuid.uuid4())+"','"+self.est+"','"+group_room+"','"+name+"',ARRAY["+','.join("'"+x+"'" for x in ids)+"]::uuid[]);",'postgres',reference='JUMELAGES_FIXTURE_NOUVELLE_BASE')
  end=time.monotonic()+10
  while True:
   result=self.rpc('reservations_service_groups',{'p_est':self.est})
   if result['error'] is None:break
   pmod.need(time.monotonic()<end,'CACHE_RPC_SERVICE_NON_CONFIRME');time.sleep(.3)
  ctx=self.rpc('reservations_context',{})['data']['establishments'][0];pmod.need(not any(ctx[x] for x in ('can_manage_layouts','can_manage_rooms','can_manage_tables')),'DROITS_EQUIPE_ELARGIS')
  # Actual new HTTP permission checks, no replay of the old 20 checks.
  anon=self.call('reservations_service_clients',{'p_est':self.est,'p_phone':'+32470000001'},None);pmod.need(anon['error'] and anon['error']['code']=='42501','ANNUAIRE_EXPOSE_PUBLIC')
  self.t.result['service_annuaire_public_refuse']=True;self.t.save();self.make_assets()
 def handler(self):
  phone=self;base=super().handler()
  class Handler(base):
   def do_GET(self):
    path=urlsplit(self.path).path
    if self.headers.get('Host')!=phone.host or time.monotonic()>=phone.expires:return self.send(403)
    if path=='/online':return self.send(200,phone.assets['online.html'],'text/html; charset=utf-8')
    if path in ('/online.js','/stopflow-093-service-model.js','/demo.css','/stopflow-093-service.css'):
     return self.send(200,phone.assets[path[1:]],'text/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8')
    return super().do_GET()
   def do_POST(self):
    if self.path!='/public-rpc':return super().do_POST()
    if self.headers.get('Host')!=phone.host or self.headers.get('Origin')!=phone.origin or self.headers.get('Content-Type')!='application/json' or time.monotonic()>=phone.expires:return self.send(403)
    try:
     size=int(self.headers.get('Content-Length','0'));pmod.need(0<size<=12000,'REQUETE_PUBLIQUE_TROP_LONGUE');body=json.loads(self.rfile.read(size));pmod.need(set(body)=={'name','args'} and body['name'] in PUBLIC and isinstance(body['args'],dict) and set(body['args'])==PUBLIC[body['name']],'RPC_PUBLIQUE_REFUSEE');args={**body['args'],'p_est':phone.est};value=phone.call(body['name'],args,None);return self.send(200,json.dumps(value).encode())
    except Exception:return self.send(400,b'{"error":{"code":"REQUETE_NON_CONFIRMEE"}}')
  return Handler

def main():
 print(json.dumps({'etape':'DEMARRAGE_ESSAI_SERVICE','base_active':False}),flush=True);pmod.need(sys.argv[1:]==['--start'],'MODE_EXPLICITE_REQUIS');pins=json.loads((H/'manifest.json').read_text())
 for name,sha in pins['files'].items():pmod.need(hashlib.sha256((R/name).read_bytes()).hexdigest()==sha,'SOURCE_SERVICE_MODIFIEE')
 # Always qualify the new race on a NEW native cluster first, no production path.
 print(json.dumps({'etape':'RECETTE_POSTGRESQL_JETABLE'}),flush=True);p=subprocess.run([sys.executable,'-I','-B',str(R/'tests/reservations-service-pg17.py')],timeout=240)
 if p.returncode:return 1
 phone=ServicePhone();server=None;thread=None;result={}
 def interrupted(*args):raise KeyboardInterrupt()
 for sig in (signal.SIGTERM,signal.SIGHUP):signal.signal(sig,interrupted)
 try:
  server=ThreadingHTTPServer(('127.0.0.1',8097),phone.handler());phone.provision();thread=threading.Thread(target=server.serve_forever);thread.start();print(json.dumps({'etape':'ESSAI_PRET','url':phone.origin+'/join/'+phone.join,'formulaire_client':phone.origin+'/online','duree_minutes':30,'droits_physiques_equipe':False}),flush=True)
  while thread.is_alive() and time.monotonic()<phone.expires:thread.join(.5)
 except KeyboardInterrupt:result['fin']='ARRET_UTILISATEUR'
 except Exception as e:result['erreur']={'type':type(e).__name__,'etape':phone.t.result.get('etape') if phone.t else 'AVANT_CREATION','errno':getattr(e,'errno',None)}
 finally:
  if server:
   if thread and thread.is_alive():server.shutdown();thread.join(10)
   server.server_close()
  try:result.update(phone.close())
  except Exception:result['nettoyage_confirme']=False
 print(json.dumps(result),flush=True);return 0 if result.get('nettoyage_confirme') and not result.get('erreur') else 1
if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as e:print(json.dumps({'etape':'BLOCAGE_AVANT_ESSAI','type':type(e).__name__,'errno':getattr(e,'errno',None)}),flush=True);raise SystemExit(1)
