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
   for name in ['receipt-control-pdf.sql','receipt-shared-reading.sql','receipt-catalogue-legacy-guard.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/name).read_text(),label=name)
   def read(a,p,req=None,who=owner,dep='cuisine'):return call(a,p,req,who=who,dep=dep,api='pilot_document_reading')
   def document():
    p=dict(id=uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/png',name='bon-fictif.png',kind='delivery');r=call('capture',p,who=owner);sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(r['file']['path'])+")");return r['document_id']
   did=document();lines=[dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='T01',description='Tomates fictives',quantity='2.5',unit='kg',unit_price='3.20',line_total='8.00',basis='HT',currency='EUR',create_product=True,confirm_catalogue=True,confirm_price=True,received_quantity='',received_unit='',temperature='',conformity=''),dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='T01',description='Tomates fictives',quantity='1',unit='kg',unit_price='3.20',line_total='3.20',basis='HT',currency='EUR',create_product=True,confirm_catalogue=True,confirm_price=True,received_quantity='',received_unit='',temperature='',conformity='')]
   data=dict(kind='delivery',supplier_id=supplier,number='BON-LECTURE-1',date='2026-11-23',received_at='2026-11-23T10:00:00+01:00',pages=[],lines=lines)
   stage='SAVE';doc=read('save',dict(id=did,version=1,reading=data));check('lecture_persistante_deux_lignes_meme_article',len(doc['reading']['lines'])==2);check('pas_fiche_creee_par_lecture',doc['receipt_state']=='awaiting_control')
   stage='CATALOGUE';payload=dict(id=did,version=doc['revision'],human_verified=True);req=uid();out=read('catalogue',payload,req);check('catalogue_sans_fiche',out['lines_memorized']==2 and out['prices_recorded']==2);check('un_article_une_offre_meme_reference',sql('SELECT count(*) FROM pilot_products')=='1' and sql('SELECT count(*) FROM pilot_product_offers')=='1');check('deux_lignes_historiques_source_distincte',sql('SELECT count(*) FROM pilot_price_history')=='2')
   read('catalogue',payload,req);read('catalogue',payload);check('double_memorisation_aucun_doublon',sql('SELECT count(*) FROM pilot_price_history')=='2')
   stage='CONTROL';doc=read('start',dict(id=did,version=doc['revision']));check('fiche_reutilise_ordre_et_quantite_bon',doc['receipt_draft']['lines'][0]['quantity']=='2.5' and len(doc['receipt_draft']['lines'])==2);check('aucune_quantite_recue_temperature_conformite_devinee',doc['receipt_draft']['lines'][0]['received_quantity']=='' and doc['receipt_draft']['lines'][0]['temperature']=='' and doc['receipt_draft']['lines'][0]['conformity']=='')
   data=doc['reading'];data['lines'][0]['received_quantity']='2';data['lines'][0]['received_unit']='kg';data['lines'][0]['conformity']='yes';doc=read('save',dict(id=did,version=doc['revision'],reading=data));check('quantite_bon_distincte_recue_apres_sauvegarde',doc['receipt_draft']['lines'][0]['quantity']=='2.5' and doc['receipt_draft']['lines'][0]['received_quantity']=='2');read('catalogue',dict(id=did,version=doc['revision'],human_verified=True));check('controle_apres_catalogue_pas_double_prix',sql('SELECT count(*) FROM pilot_price_history')=='2')
   denied('conflit_conserve_lecture',lambda:read('save',dict(id=did,version=1,reading=data)),'40001')
   denied('autre_departement_refuse',lambda:read('read',dict(id=did),who=salle,dep='salle'),'42501')
   denied('anonyme_refuse',lambda:call('read',dict(id=did),who=owner,api='pilot_document_reading',role='anon'),'42501')
   denied('employe_sans_droit_catalogue',lambda:read('catalogue',dict(id=did,version=doc['revision'],human_verified=True),who=staff),'42501')
   stage='NO_PRICE';other=document();plain=dict(data,number='SANS-PRIX',lines=[dict(lines[0],source_line_id=uid(),product_id=sql('SELECT id FROM pilot_products'),create_product=False,unit_price='',line_total='',confirm_price=False)])
   d=read('save',dict(id=other,version=1,reading=plain));d=read('start',dict(id=other,version=d['revision']));check('fiche_puis_catalogue_meme_lecture',d['receipt_state']=='draft');before=sql('SELECT pack_price FROM pilot_product_offers');read('catalogue',dict(id=other,version=d['revision'],human_verified=True));check('bon_sans_prix_conserve_prix_connu',sql('SELECT pack_price FROM pilot_product_offers')==before and sql('SELECT count(*) FROM pilot_price_history')=='2')
   stage='CONCURRENCE';raceid=document();rd=dict(data,number='RACE',lines=[dict(lines[0],source_line_id=uid(),supplier_reference='RACE-REF',description='Produit concurrent fictif')]);rr=read('save',dict(id=raceid,version=1,reading=rd));payload=dict(id=raceid,version=rr['revision'],human_verified=True)
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:read('catalogue',payload),range(2)))
   check('deux_memorisations_concurrentes_une_seule_ecriture',sum(r['lines_memorized'] for r in results)==1 and sql('SELECT count(*) FROM pilot_price_history')=='3')
   legacy=document();sql("UPDATE public.pilot_trade_documents SET phase='applied' WHERE id="+q(legacy));denied('ancien_catalogue_applique_pas_nouvelle_memorisation',lambda:read('catalogue',dict(id=legacy,version=1,human_verified=True)),'23514')
   denied('ancien_apply_pas_double_chemin',lambda:call('apply',dict(id=did,version=doc['revision']),who=owner,api='pilot_documents'),'23514')
  print(json.dumps(dict(resultat='PASS',tests=len(checks),checks=checks,postgresql='17_JETABLE',auth='SIMULEE',stockage='CONTRAT_SIMULE',supabase_reel=False)))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,sqlstate=getattr(e,'sqlstate',None),instruction=getattr(e,'instruction',None),type=type(e).__name__,motif=str(e)[:250])));raise
if __name__=='__main__':main()
