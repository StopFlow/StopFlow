"""Targeted new receipt/PDF lifecycle. Real PG17; Auth and Storage service contract simulated."""
import concurrent.futures,importlib.util,json,pathlib,uuid,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('base',ROOT/'tests/product-inventory-pg17.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
def main():
 checks=[];stage='SETUP';uid=lambda:str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
 def check(n,b=True):
  if not b:raise AssertionError(n)
  checks.append(n)
 try:
  with base.h.cluster() as sql:
   base.fixture(sql)
   for p in json.loads((ROOT/'tests/fixtures/receipt-existing-policies.json').read_text()):
    src='CREATE POLICY '+p['policyname']+' ON public.'+p['tablename']+' AS '+p['permissive']+' FOR '+p['cmd']+' TO '+','.join(p['roles'])
    if p['qual']:src+=' USING ('+p['qual']+')'
    if p['with_check']:src+=' WITH CHECK ('+p['with_check']+')'
    sql(src)
   sql("CREATE SCHEMA storage;GRANT USAGE,CREATE ON SCHEMA storage TO postgres;GRANT USAGE ON SCHEMA storage TO authenticated;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);ALTER TABLE storage.buckets OWNER TO postgres;CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects OWNER TO postgres;ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT ON storage.objects TO authenticated;")
   for f in ['receipts-supplier-scopes.sql','receipts-documents.sql','receipts-supplier-edit-scope.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/f).read_text(),label=f)
   owner,staff,salle,outsider=[uid() for _ in range(4)]
   for u in [owner,staff,salle,outsider]:sql(f"INSERT INTO auth.users VALUES('{u}','{u}@example.invalid');INSERT INTO profiles(id,email,prenom,nom,role,actif) VALUES('{u}','{u}@example.invalid','Opérateur','Fictif','employe',true)")
   for u,deps,keys in [(owner,['cuisine','salle'],['inventory.use','articles.manage','suppliers.manage','orders.manage','history.view']),(staff,['cuisine'],['inventory.use']),(salle,['salle'],['inventory.use'])]:
    for d in deps:
     for k in keys:sql(f"INSERT INTO profile_permissions(profile_id,permission_key,scope) VALUES('{u}','{k}','{d}')")
   def call(action,p,request=None,who=staff,dep='cuisine',api='pilot_receipt_controls',role='authenticated'):
    src='BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';SELECT public.'+api+'('+q(action)+','+q(request or uid())+'::uuid,'+q(json.dumps({'department':dep,**p}))+'::jsonb);COMMIT;'
    out=sql(src,label=api+'_'+action).splitlines();return json.loads(next(x for x in out if x.startswith(('{','['))))
   def denied(n,fn,state):
    try:fn()
    except Exception as e:check(n,getattr(e,'sqlstate',None)==state)
    else:raise AssertionError(n+'_ACCEPTED')
   supplier=call('supplier',dict(id=uid(),name='Fournisseur synthétique',order_email='',departments=['cuisine','salle']),who=owner,api='pilot_operations')['id']
   # A completed pre-existing control is preserved as a legacy snapshot, without inventing a PDF.
   legacy=call('create',dict(id=uid(),kind='delivery'),api='pilot_documents');data=dict(kind='delivery',supplier_id=supplier,number='LEGACY-FICTIF',date='2026-11-23',received_at='2026-11-23T10:00:00+01:00',lines=[dict(department='cuisine',type='product',description='Produit ancien fictif',received_quantity='1',temperature='',conformity='yes')]);legacy=call('save',dict(id=legacy['id'],version=1,departments=['cuisine'],document=data),api='pilot_documents');legacy=call('receive',dict(id=legacy['id'],version=legacy['revision']),api='pilot_documents')
   stage='NEW_MIGRATION';sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot/receipt-control-pdf.sql').read_text(),label='RECEIPT_PDF_MIGRATION')
   old=call('read',dict(id=legacy['id']));check('ancien_controle_conserve_sans_pdf_invente',old['receipt_state']=='legacy_received' and old['controls'][0]['status']=='legacy' and old['controls'][0]['pdf_file_id'] is None)
   stage='CAPTURE'
   def metadata(did=None):return dict(id=did or uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/jpeg',name='document-fictif.jpg',kind='delivery')
   p=metadata();req=uid();r=call('capture',p,req);did=r['document_id'];check('un_document_un_dossier',r['document']['id']==p['id'] and r['document']['receipt_state']=='awaiting_control' and len(r['document']['controls'])==0)
   check('double_clic_meme_capture',call('capture',p,req)['document_id']==did)
   other=call('capture',metadata());check('autre_photo_autre_dossier',other['document_id']!=did)
   check('meme_photo_retrouve_dossier_existant',call('capture',dict(p,id=uid(),file_id=uid()))['document_id']==did)
   denied('fiche_sans_upload_refusee',lambda:call('start',dict(id=did,version=1)),'23514')
   def upload(file,who=staff):sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+q(who)+";INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(file['path'])+');COMMIT;')
   upload(r['file']);saved=call('read',dict(id=did));check('historique_nom_original_et_statut',next(x for x in call('list',{},api='pilot_documents') if x['id']==did)['original_name']=='document-fictif.jpg');check('enregistrer_seulement_reste_a_controler',saved['receipt_state']=='awaiting_control' and not saved['controls'])
   started=call('start',dict(id=did,version=1));check('creer_fiche_ne_termine_pas',started['receipt_state']=='draft' and started['received_at'] is None)
   d=dict(supplier_id=supplier,number='FICTIF-CONTROLE',date='',received_at='2026-11-23T11:12:00+01:00',observations='Réserves fictives',lines=[dict(department='cuisine',type='product',description='Produit fictif',received_quantity='2.5',received_unit='kg',temperature='',temperature_relevant=True,conformity='',observations='Observation fictive')])
   draft=call('save',dict(id=did,version=started['revision'],control=d));read=call('read',dict(id=did));check('brouillon_repris_temperature_vide_conformite_vide',read['receipt_draft']['lines'][0]['temperature']=='' and read['receipt_draft']['lines'][0]['conformity']=='')
   denied('controle_humain_incomplet_refuse',lambda:call('prepare',dict(id=did,version=draft['revision'])),'23514')
   d['lines'][0].update(conformity='yes',temperature='0');draft=call('save',dict(id=did,version=draft['revision'],control=d))
   ap=metadata(did);ap['version']=draft['revision'];appended=call('append',ap);upload(appended['file']);draft=call('read',dict(id=did));check('page_ajoutee_explicitement_meme_dossier',len(draft['files'])==2 and appended['document_id']==did)
   stage='PDF';request=uid();job=call('prepare',dict(id=did,version=draft['revision']),request);check('acteur_de_reprise_courant',job['request_actor']==staff);check('snapshot_fiche_originaux_associes',len(job['originals'])==2 and job['snapshot']['control']['lines'][0]['temperature']=='0' and job['operator_id']==staff)
   check('preparation_pas_controle_termine',call('read',dict(id=did))['receipt_state']=='pdf_pending')
   denied('ancien_chemin_receive_refuse',lambda:call('receive',dict(id=did,version=draft['revision']),api='pilot_documents'),'23514')
   denied('autre_departement_refuse',lambda:call('read',dict(id=did),who=salle,dep='salle'),'42501');denied('anonyme_refuse',lambda:call('prepare',dict(id=did,version=draft['revision']),role='anon'),'42501');denied('sans_permission_refuse',lambda:call('prepare',dict(id=did,version=draft['revision']),who=outsider),'42501')
   registered=call('register_pdf',dict(id=did,control_id=job['id'],sha256='a'*64,bytes=40));pdf=next(f for f in call('read',dict(id=did))['files'] if f['purpose']=='control_pdf');check('pdf_associe_a_version_et_dossier',registered['pdf_file_id']==job['id'] and pdf['path']==did+'/'+job['id'])
   denied('pas_termine_avant_stockage_pdf',lambda:call('finalize',dict(id=did,control_id=job['id'])),'23514');upload(pdf)
   finish_request=uid();done=call('finalize',dict(id=did,control_id=job['id']),finish_request);check('termine_apres_pdf_present',done['status']=='completed' and call('read',dict(id=did))['receipt_state']=='complete')
   check('reponse_perdue_finalisation_reprise',call('finalize',dict(id=did,control_id=job['id']),finish_request)['id']==job['id'] and len(call('read',dict(id=did))['controls'])==1)
   check('reponse_perdue_prepare_retrouve_complete',call('prepare',dict(id=did,version=draft['revision']),request)['status']=='completed')
   denied('pdf_autre_departement_refuse',lambda:sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+q(salle)+";SELECT 1/CASE WHEN count(*)=0 THEN 0 ELSE 1 END FROM storage.objects WHERE name="+q(pdf['path'])+';COMMIT;'),'22012')
   denied('snapshot_immuable_meme_gestionnaire',lambda:sql('UPDATE pilot_receipt_control_versions SET snapshot=\'{}\' WHERE id='+q(job['id'])),'23514')
   stage='CORRECTION';before=call('read',dict(id=did));corrected=call('correct',dict(id=did,version=before['revision']));d['lines'][0].update(received_quantity='3',conformity='no');corrected=call('save',dict(id=did,version=corrected['revision'],control=d));check('ancienne_version_et_pdf_conserves',call('read',dict(id=did))['controls'][0]['pdf_file_id']==pdf['id'])
   def race(i):return call('prepare',dict(id=did,version=corrected['revision']))
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:jobs=list(pool.map(race,range(2)))
   check('confirmations_concurrentes_une_version',jobs[0]['id']==jobs[1]['id'] and jobs[0]['version']==2)
   j2=jobs[0];call('register_pdf',dict(id=did,control_id=j2['id'],sha256='b'*64,bytes=50));f2=next(f for f in call('read',dict(id=did))['files'] if f['id']==j2['id']);upload(f2);call('finalize',dict(id=did,control_id=j2['id']));v2=call('read',dict(id=did));check('deux_controles_termines_deux_pdf_conserves',len([v for v in v2['controls'] if v['status']=='completed'])==2 and v2['completed_control_id']==j2['id'])
   next_draft=call('correct',dict(id=did,version=v2['revision']));jobs=[call('prepare',dict(id=did,version=next_draft['revision']))];corrected=next_draft
   changed=call('save',dict(id=did,version=corrected['revision'],control=dict(d,observations='Correction concurrente fictive')));denied('pdf_perime_ne_termine_pas_nouveau_brouillon',lambda:call('finalize',dict(id=did,control_id=jobs[0]['id'])),'40001')
   check('preuve_obsolescence_et_ancien_pdf_intact',call('job',dict(id=did,control_id=jobs[0]['id']))['status']=='obsolete' and call('job',dict(id=did,control_id=job['id']))['status']=='completed')
   denied('acces_table_direct_refuse',lambda:sql('SET ROLE authenticated;SELECT * FROM pilot_receipt_control_versions'),'42501');denied('truncate_refuse',lambda:sql('SET ROLE authenticated;TRUNCATE pilot_receipt_control_versions'),'42501')
   check('ni_stocks_ni_prix_modifies',sql('SELECT (SELECT count(*) FROM pilot_inventory_runs)=0 AND (SELECT count(*) FROM pilot_price_history)=0')=='t')
  print(json.dumps(dict(resultat='PASS',tests=len(checks),groupes=checks,postgresql='17_JETABLE',auth='SIMULEE',storage='CONTRAT_SIMULE',supabase_reel=False)))
 except Exception as e:print(json.dumps(dict(resultat='ECHEC',etape=stage,instruction=str(e),sqlstate=getattr(e,'sqlstate',None),diagnostic=getattr(e,'safe',None))));return 1
 return 0
if __name__=='__main__':raise SystemExit(main())
