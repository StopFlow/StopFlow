"""UI only: current module + fictitious day vs supplied reference, same viewports.
One pinned local Chromium helper; no SQL, Auth provisioning or old PG tests.
"""
import base64,hashlib,importlib.util,json,os,pathlib,re,signal,struct,sys,time,urllib.request,urllib.error
R=pathlib.Path(__file__).resolve().parents[2];H=R/'tools/reservations-service';D=H/'design-r2';V=R/'tools/reservations-v1'
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def served(summary):
 for alias,path in (('page','/'),('css_module','/stopflow-093-service.css')):
  # Explicit local origin only, no redirect, no cookie/login, no private output.
  try:
   class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect());response=opener.open('http://127.0.0.1:8097'+path,timeout=3);raw=response.read(250001)
   item={'code_http':response.status,'lecture_bornee':len(raw)<=250000}
   if alias=='css_module' and len(raw)<=250000:item['sha256']=hashlib.sha256(raw).hexdigest();item['conforme_fichier_corrige']=raw==(R/'stopflow-093-service.css').read_bytes()
   if alias=='page' and len(raw)<=250000:
    item['reference_css_presente']=b'stopflow-093-service.css' in raw
   summary[alias]=item
  except urllib.error.HTTPError as e:summary[alias]={'code_http':e.code,'lecture':'REFUSEE_OU_NON_DISPONIBLE'}
  except Exception as e:summary[alias]={'lecture':'NON_CONFIRMEE','type':type(e).__name__,'errno':getattr(e,'errno',None)}

def main():
 print(json.dumps({'etape':'DEMARRAGE_REVUE_UI_SERVICE_R2','sql':False,'tests_pg22_rejoues':False}),flush=True);r=None;result={'resultat':'NON_VERIFIE','rpc':'SIMULEES','base_active':False,'zenchef':False};stage='PRECONTROLES'
 def step(n):
  nonlocal stage
  stage=n;print(json.dumps({'etape':n}),flush=True)
 try:
  if sys.argv[1:] not in (['--execute'],['--execute','--tablet-list']):raise ValueError('MODE_EXPLICITE_REQUIS')
  tablet_only='--tablet-list' in sys.argv
  tr=load('service_r2_transfer',V/'transfer-ui-docker.py');m=tr.m;pins=json.loads((H/'design-r2-manifest.json').read_text())
  m.need(all(hashlib.sha256((R/n).read_bytes()).hexdigest()==sha for n,sha in pins['files'].items()),'SOURCE_UI_MODIFIEE');ref=pathlib.Path(pins['reference']['path']);m.need(hashlib.sha256(ref.read_bytes()).hexdigest()==pins['reference']['sha256'],'REFERENCE_MODIFIEE')
  r=m.Run();result['rapports']=str(r.folder);print(json.dumps({'etape':'RAPPORT_CREE','chemin':str(r.folder)}),flush=True);result['service_8097']={};served(result['service_8097']);print(json.dumps({'etape':'LECTURE_8097','constats':result['service_8097']}),flush=True)
  step('IMAGE_CHROMIUM_LOCALE');r.call(['version','--format','{{.Server.Version}}']);image=json.loads(r.call(['image','inspect',tr.IMAGE])[1])[0];m.need(image['Id']==tr.IMAGE and image['Os']=='linux' and image['Architecture']=='arm64' and not image['Config'].get('Volumes'),'IMAGE_DIFFERENTE');module=m.env_map(image['Config'].get('Env')).get('NODE_PATH');m.need(module=='/opt/stopflow-ui/node_modules','NODE_PATH_DIFFERENT')
  files={n:(D/n).read_bytes() for n in ('index.html','bootstrap.js','fixtures.json','scenario.cjs')};files.update({n:(R/n).read_bytes() for n in ('stopflow-093-service-model.js','stopflow-093-service.js','stopflow-093-service.css')});files['reference.html']=ref.read_bytes();files['manifest.json']=json.dumps({'files':tr.hashes(files)}).encode();m.need(len(files)==9,'NEUF_FICHIERS_REQUIS')
  step('CREATION_HELPER_UI_UNIQUE');item=r.create(image,'SERVICE-R2');cid=item['Id'];m.need(item['State']['Running'] is True,'HELPER_NON_DEMARRE');_,raw=r.call(['exec',cid,'/bin/sh','-c','command -v node && command -v python3']);paths=raw.decode().splitlines();m.need(len(paths)==2 and all(re.fullmatch('/[A-Za-z0-9_./+-]+',x) for x in paths),'OUTILS_NON_CONFIRMES');node,python=paths;t=tr.Transfer(r,cid,python);t.program(tr.PREPARE,check=True)
  step('TRANSFERT_STDIN_EMPREINTES');proof=t.stdin(files,'app-stdin');m.need(proof.get('ok') is True and proof.get('nombre')==9,'TRANSFERT_NON_CONFIRME');app='/tmp/stopflow-ui/app-stdin';r.inspect();step('RENDU_TABLETTE_1024_768' if tablet_only else 'RENDU_TABLETTE_ET_MACBOOK');code,_=r.call(['exec','--env','NODE_PATH='+module,'--workdir='+app,cid,node,'scenario.cjs']+(['--tablet-list'] if tablet_only else []),check=False,timeout=150)
  _,raw=r.call(['exec',cid,'/bin/cat',app+'/report.json'],limit=100000);report=json.loads(raw);result.update(report);result['code_scenario']=code
  step('RECUPERATION_CAPTURE_TABLETTE' if tablet_only else 'RECUPERATION_CAPTURES_COMPARAISONS');allowed=['service-tablette-r3.png','service-tablette.png','reference-tablette.png','comparaison-tablette.png','service-macbook.png','reference-macbook.png','comparaison-macbook.png','service-echec.png'];program="import pathlib,json,base64;p=pathlib.Path('"+app+"');print(json.dumps({n:base64.b64encode((p/n).read_bytes()).decode() for n in "+repr(allowed)+" if (p/n).is_file()}))";r.inspect();_,raw=t.program(program,check=True,limit=20000000);images=json.loads(raw);m.need(set(images)<=set(allowed),'CAPTURE_INATTENDUE');result['captures']=[]
  for name,encoded in images.items():
   data=base64.b64decode(encoded,validate=True);m.need(len(data)<=2500000 and data.startswith(b'\x89PNG\r\n\x1a\n'),'PNG_INVALIDE');w,h=struct.unpack('>II',data[16:24]);expected=(2048,808) if name=='comparaison-tablette.png' else (2880,940) if name=='comparaison-macbook.png' else (1024,768) if 'tablette' in name else (1440,900) if 'macbook' in name else None
   if expected:m.need((w,h)==expected,'TAILLE_CAPTURE_DIFFERENTE')
   p=r.folder/name;fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb') as out:out.write(data)
   result['captures'].append(str(p))
  if code!=0 or result.get('resultat')!='PASS_RENDU_MODULE_SERVICE_FIXTURES':result['resultat']='ECHEC_OU_NON_VERIFIE'
  elif not ({'service-tablette-r3.png'} if tablet_only else {'comparaison-tablette.png','comparaison-macbook.png'})<=set(images):result['resultat']='CAPTURES_NON_CONFIRMEES'
 except BaseException as e:result.update(resultat='BLOQUE_OU_ECHEC',erreur={'etape':stage,'type':type(e).__name__,'code_client':getattr(e,'code',None),'diagnostic':getattr(e,'diagnostic',None)})
 finally:
  if r:
   r.end=time.monotonic()+90;result['nettoyage_confirme']=r.cleanup() and r.current is None;r.summary.update(result)
   try:r.save()
   except Exception:result['rapport_final']='NON_CONFIRME'
  print(json.dumps({'etape':'BILAN_FINAL',**result},ensure_ascii=False),flush=True)
 return 0 if result['resultat']=='PASS_RENDU_MODULE_SERVICE_FIXTURES' and result.get('nettoyage_confirme') else 1
if __name__=='__main__':
 def interrupt(*args):raise KeyboardInterrupt()
 for sig in (signal.SIGTERM,signal.SIGHUP):signal.signal(sig,interrupt)
 raise SystemExit(main())
