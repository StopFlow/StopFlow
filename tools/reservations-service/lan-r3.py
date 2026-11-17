"""Temporary R3 LAN trial: new fictitious Auth/DB only, no old qualification replay.
No production connection, image pull/build, original demo change or public tunnel.
"""
import copy,datetime,hashlib,importlib.util,ipaddress,json,pathlib,secrets,signal,subprocess,sys,threading,time,urllib.request,uuid
from http.server import ThreadingHTTPServer
from zoneinfo import ZoneInfo
R=pathlib.Path(__file__).resolve().parents[2];H=R/'tools/reservations-service';PORT=8098

def say(stage,**data):print(json.dumps({'etape':stage,**data},ensure_ascii=False),flush=True)
def need(value,code):
 if not value:raise ValueError(code)
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def sources():
 pins=json.loads((H/'lan-r3-manifest.json').read_text())
 for name,digest in pins['files'].items():need(hashlib.sha256((R/name).read_bytes()).hexdigest()==digest,'SOURCE_R3_MODIFIEE')
 need(pins['qualification_postgresql']=='22_CONTROLES_ACQUIS_NON_REJOUES','QUALIFICATION_SOURCE_NON_CONFIRMEE')
 return pins

def wifi_address():
 env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LC_ALL':'C'}
 # Find an actual Wi-Fi device, not an arbitrary route/VPN adapter.
 p=subprocess.run(['/usr/sbin/networksetup','-listallhardwareports'],capture_output=True,text=True,timeout=5,env=env);need(p.returncode==0,'LECTURE_INTERFACE_WIFI_REFUSEE');import re
 matches=re.findall(r'Hardware Port: (?:Wi-Fi|AirPort)\nDevice: (en\d+)\n',p.stdout);need(len(matches)==1,'INTERFACE_WIFI_NON_CONFIRMEE');device=matches[0]
 p=subprocess.run(['/usr/sbin/networksetup','-getairportpower',device],capture_output=True,text=True,timeout=5,env=env);need(p.returncode==0 and p.stdout.strip().endswith(': On'),'WIFI_NON_ACTIF')
 p=subprocess.run(['/usr/sbin/ipconfig','getifaddr',device],capture_output=True,text=True,timeout=4,env=env);need(p.returncode==0,'IP_WIFI_NON_CONFIRMEE');address=ipaddress.IPv4Address(p.stdout.strip());need(any(address in ipaddress.IPv4Network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')),'IP_PRIVEE_WIFI_REQUISE');return str(address)

def build_phone(base,ip):
 class R3Phone(base.ServicePhone):
  def __init__(self):
   super().__init__();self.ip=ip;self.host=ip+':'+str(PORT);self.origin='http://'+self.host;self.notes={};self.fixture_day=''
  def make_assets(self):
   super().make_assets()
   html=self.assets['index.html'].decode().replace('StopFlow Service TEST','StopFlow — Service R3 · Test fictif').replace('StopFlow Service - TEST ISOLE','StopFlow Service R3 — Équipe fictive')
   for name in ('stopflow-093-service.css','stopflow-093-service-model.js','stopflow-093-service.js'):html=html.replace('"/'+name+'"','"/'+name+'?v=20261117-service-r3"')
   html=html.replace('Aucun lien avec les donnees actives.','Données fictives uniquement · Session temporaire de 30 minutes.');self.assets['index.html']=html.encode()
  def rpc(self,name,args):
   result=super().rpc(name,args)
   if name=='reservations_service_day' and result.get('error') is None:
    for row in result['data']:row['note']=self.notes.get(row['id'],'')
   return result
  def provision(self):
   # Reuse the qualified fresh Auth/PostgREST stack, never an existing DB target.
   self.t=base.pmod.team.Test();t=self.t;say('RECU_ESSAI_CREE',chemin=str(t.folder/'RECUPERATION.json'));t.result.update(mode='ESSAI_R3_WIFI_FICTIF',tests_pg22_rejoues=False,chromium_rejoue=False);t.prepare();t.stage('COMPTE_EQUIPE_R3_FICTIF');email='equipe-r3-'+t.op[:12]+'@example.invalid'
   code,user=t.request('auth','/admin/users','POST',{'email':email,'password':t.userpassword,'email_confirm':True},t.admin_token());need(code in (200,201) and isinstance(user,dict),'CREATION_AUTH_NON_CONFIRMEE');self.uid=str(uuid.UUID(user['id']));t.state['user_id']=self.uid;t.save()
   code,session=t.request('auth','/token?grant_type=password','POST',{'email':email,'password':t.userpassword});need(code==200 and session.get('user',{}).get('id')==self.uid,'CONNEXION_AUTH_NON_CONFIRMEE');t.token=session['access_token'];need(t.crypto({'mode':'verify','secret':t.secret,'token':t.token,'subject':self.uid,'issuer':'http://auth:9999'}).get('valid') is True,'JWT_EQUIPE_REFUSE')
   t.stage('MIGRATION_QUALIFIEE_BASE_NEUVE');t.sql((H/'service.proposed.sql').read_text(),'postgres',reference='SERVICE_QUALIFIE_BASE_JETABLE_SEULEMENT');self.est=str(uuid.uuid4());t.state['establishment_id']=self.est;t.save()
   fixture=json.loads((H/'design-r2/fixtures.json').read_text());self.fixture_day=datetime.datetime.now(ZoneInfo('Europe/Brussels')).date().isoformat();mapping={}
   def mapped(value):
    if value not in mapping:mapping[value]=str(uuid.uuid5(uuid.UUID(t.op),value))
    return mapping[value]
   quote=base.pmod.demo.quote
   sql="BEGIN;INSERT INTO public.profiles(id,email,prenom,nom,role,actif,departement) VALUES('"+self.uid+"','"+email+"','Equipe','Fictive R3','employe',true,'salle');INSERT INTO public.reservation_establishments(id,name,booking_timezone,online_test_enabled) VALUES('"+self.est+"','Essai R3 fictif','Europe/Brussels',true);INSERT INTO public.reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings,can_manage_layouts,can_manage_rooms,can_manage_tables) VALUES('"+self.est+"','"+self.uid+"',true,true,true,false,false,false);"
   fields={'rooms':['id','name','active'],'tables':['id','room_id','label','capacity','shape','active'],'layouts':['id','room_id','status','width','height','version'],'elements':['id','room_id','layout_id','table_id','kind','x','y','width','height','rotation','properties']};names={'rooms':'reservation_rooms','tables':'reservation_tables','layouts':'reservation_layouts','elements':'reservation_layout_elements'}
   for key in ('rooms','tables','layouts','elements'):
    for original in fixture['data'][key]:
     row=copy.deepcopy(original)
     for k in ('id','room_id','layout_id','table_id'):
      if row.get(k) is not None:row[k]=mapped(row[k])
     if key=='layouts':row['name']='Plan fictif R3';keys=fields[key]+['name']
     else:keys=fields[key]
     values=[]
     for k in keys:
      v=row.get(k)
      if isinstance(v,dict):values.append(quote(json.dumps(v))+'::jsonb')
      elif isinstance(v,bool):values.append('true' if v else 'false')
      else:values.append(quote(v))
     sql+='INSERT INTO public.'+names[key]+'(establishment_id,'+','.join(keys)+') VALUES('+quote(self.est)+','+','.join(values)+');'
   for group in fixture['groups']:
    sql+="INSERT INTO public.reservation_table_groups(id,establishment_id,room_id,name,table_ids,active) VALUES("+','.join(quote(x) for x in (mapped(group['id']),self.est,mapped(group['room_id']),group['name']))+',ARRAY['+','.join(quote(mapped(x)) for x in group['table_ids'])+']::uuid[],true);'
   t.sql(sql+'COMMIT;NOTIFY pgrst, \'reload schema\';','postgres',reference='JOURNEE_R3_NOUVELLE_BASE_FICTIVE');deadline=time.monotonic()+10
   while True:
    result=self.rpc('reservations_service_groups',{'p_est':self.est})
    if result['error'] is None:break
    need(time.monotonic()<deadline,'CACHE_RPC_R3_NON_CONFIRME');time.sleep(.3)
   t.stage('JOURNEE_FICTIVE_R3')
   for index,row in enumerate(fixture['records']):
    t.result['fixture_en_cours']=row['id'];t.save();ids=[mapped(x) for x in row['ids']];group=next((g for g in fixture['groups'] if set(g['table_ids'])==set(row['ids'])),None);bid=mapped('booking-'+row['id']);args={'p_est':self.est,'p_id':bid,'p_resource':mapped(group['id']) if group else ids[0],'p_kind':'group' if group else 'table','p_members':ids,'p_name':row['name'],'p_phone':'+9990000'+str(index+1).zfill(4),'p_email':None,'p_start':self.fixture_day+'T'+row['start'],'p_end':self.fixture_day+'T'+row['end'],'p_covers':row['covers']}
    if row['id']=='soir-a':result=self.call('reservations_public_book',args,None)
    else:result=self.rpc('reservations_service_save',{**args,'p_version':None})
    need(result['error'] is None,'RESERVATION_FICTIVE_NON_CONFIRMEE')
    if row['status']=='cancelled':need(self.rpc('reservations_cancel_booking',{'p_establishment_id':self.est,'p_id':bid,'p_expected_version':1})['error'] is None,'ANNULATION_FICTIVE_NON_CONFIRMEE')
    if row.get('note'):self.notes[bid]=row['note']
   context=self.rpc('reservations_context',{})['data']['establishments'];need(len(context)==1 and context[0]['id']==self.est and all(context[0][k] is False for k in ('can_manage_layouts','can_manage_rooms','can_manage_tables')),'DROITS_EQUIPE_NON_CONFORMES')
   actual=self.rpc('reservations_service_day',{'p_est':self.est,'p_day':self.fixture_day});need(actual['error'] is None and len(actual['data'])==len(fixture['records']),'JOURNEE_FICTIVE_NON_RELUE');need(sum(base.pmod.datetime.fromisoformat(x['starts_at']).astimezone(ZoneInfo('Europe/Brussels')).hour<17 for x in actual['data'])==5,'CINQ_RESERVATIONS_MIDI_NON_CONFIRMEES')
   self.make_assets();need(b'--sf93-list-skin:service-list-r3' in self.assets['stopflow-093-service.css'] and b'function detail()' in self.assets['stopflow-093-service.js'],'ASSETS_NON_R3');self.expires=time.monotonic()+1800;t.d.end=self.expires+30;t.result.update(resultat='R3_WIFI_PREPAREE',auth_reelle=True,reservations_fictives=len(actual['data']),midi=5,jour=self.fixture_day,droits_physiques=False,note_fictive_en_memoire=True);t.save()
 return R3Phone()

def verify_http(phone):
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args):return None
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
 for path,name in (('/','index.html'),('/stopflow-093-service.css?v=20261117-service-r3','stopflow-093-service.css'),('/stopflow-093-service.js?v=20261117-service-r3','stopflow-093-service.js'),('/stopflow-093-service-model.js?v=20261117-service-r3','stopflow-093-service-model.js')):
  req=urllib.request.Request(phone.origin+path,headers={'Cookie':phone.cookie_name+'='+phone.cookie})
  with opener.open(req,timeout=5) as response:
   raw=response.read(524289);need(response.status==200 and len(raw)<=524288 and hashlib.sha256(raw).digest()==hashlib.sha256(phone.assets[name]).digest(),'HTTP_R3_NON_CONFORME')
 need(phone.join is not None,'LIEN_DEJA_CONSOMME');return {'version':'R3','page_et_trois_assets_conformes':True,'lien_non_consomme':True,'navigateur_rejoue':False}

def main():
 say('DEMARRAGE_R3_WIFI',sql_tests_rejoues=False,chromium_rejoue=False);phone=None;server=None;thread=None;result={'base_active':False,'zenchef':False,'publication':False};stage='PRECONTROLES'
 def interrupted(*args):raise KeyboardInterrupt()
 for sig in (signal.SIGTERM,signal.SIGHUP):signal.signal(sig,interrupted)
 try:
  need(sys.argv[1:]==['--start'],'MODE_EXPLICITE_REQUIS');sources();stage='ADRESSE_WIFI';say(stage);ip=wifi_address();base=load('r3_trial_primitives',H/'trial.py');phone=build_phone(base,ip);stage='RESERVATION_PORT_WIFI';say(stage);server=ThreadingHTTPServer((ip,PORT),phone.handler());stage='BASE_EQUIPE_FICTIVES';phone.provision();thread=threading.Thread(target=server.serve_forever);thread.start();stage='VERIFICATION_HTTP_R3';say(stage);proof=verify_http(phone)
  say('R3_VERIFIEE',**proof,jour=phone.fixture_day,midi=5);say('ESSAI_R3_PRET',lien=phone.origin+'/join/'+phone.join,duree_minutes=30,compte='EQUIPE_FICTIVE',editeur_plan=False);print(phone.origin+'/join/'+phone.join,flush=True);say('CONSERVER_TERMINAL_OUVERT',arret='Ctrl+C')
  while thread.is_alive() and time.monotonic()<phone.expires:thread.join(.5)
  result['resultat']='ESSAI_TERMINE'
 except KeyboardInterrupt:result['resultat']='ARRET_UTILISATEUR'
 except Exception as e:result.update(resultat='BLOQUE_OU_ECHEC',erreur={'etape':stage,'etape_base':phone.t.result.get('etape') if phone and phone.t else None,'type':type(e).__name__,'errno':getattr(e,'errno',None),'code_technique':str(e) if isinstance(e,ValueError) and str(e).replace('_','').isalnum() else None})
 finally:
  if server:
   if thread and thread.is_alive():server.shutdown();thread.join(10)
   server.server_close()
  if phone:
   try:result.update(phone.close())
   except Exception:result['nettoyage_confirme']=False
  say('BILAN_FINAL',**result)
 return 0 if result.get('resultat') in ('ESSAI_TERMINE','ARRET_UTILISATEUR') and result.get('nettoyage_confirme',True) else 1
if __name__=='__main__':raise SystemExit(main())
