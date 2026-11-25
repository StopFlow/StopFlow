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
   for name in ['receipt-control-pdf.sql','receipt-shared-reading.sql','receipt-catalogue-legacy-guard.sql','receipt-delivery-checks.sql','receipt-cordier-workflow.sql','receipt-30-lines.sql','receipt-guided-control.sql','receipt-memory-missing.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/name).read_text(),label=name)
   def read(a,p,req=None,who=owner,dep='cuisine'):return call(a,p,req,who=who,dep=dep,api='pilot_document_reading')
   def document():
    p=dict(id=uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/png',name='bon-fictif.png',kind='delivery');r=call('capture',p,who=owner);sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(r['file']['path'])+")");return r['document_id']
   def product(name,ref):
    p=call('product',dict(id=uid(),name=name,category='Fictif',unit='kg',target='0'),who=owner,api='pilot_operations')
    o=call('offer',dict(id=uid(),product_id=p['id'],supplier_id=supplier,supplier_reference=ref,pack_quantity='1',pack_unit='kg',pack_price='1.20',price_basis='HT'),who=owner,api='pilot_operations')
    return p['id'],o['id']
   def line(n,**kw):return dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='F'+str(n),description='Produit fictif '+str(n),quantity='2.5',unit='kg',unit_price='3.20',line_total='8.00',basis='HT',currency='EUR',received_quantity='',received_unit='',temperature='',temperature_relevant=False,conformity='',packaging_intact='',confirm_catalogue=False,confirm_price=False,create_product=False,product_id='',**kw)
   def reading(ls,number):return dict(kind='delivery',supplier_id=supplier,number=number,date='2026-11-23',received_at='2026-11-23T10:00:00Z',lines=ls,pages=[],orientations={},missing_lines=[dict(supplier_reference='MANQUE',description='Article absent fictif',quantity='1',unit='kg',source_section='missing')],reading_result={'status':'success','recognized':len(ls)})
   stage='MEMOIRE';did=document();ls=[line(1),line(2)];ls[0].update(unit_price='4.5',quantity='6',line_total='27',pack_unit='l',unit='l',pack_quantity='1',price_derivation={'kind':'calculated','net':27,'quantity':6,'unit':'l'});data=reading(ls,'MEMOIRE');d=read('save',dict(id=did,version=1,reading=data));d=read('start',dict(id=did,version=d['revision']))
   ls[0].update(confirm_catalogue=True,create_product=True)
   d=read('save',dict(id=did,version=d['revision'],reading=data));req=uid();r=read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]),req);check('article_seul_sans_prix',r['lines_memorized']==1 and r['prices_recorded']==0)
   ls[0]['confirm_price']=True;ls[1].update(quantity='0',confirm_catalogue=True,confirm_price=True,create_product=True);d=read('save',dict(id=did,version=d['revision'],reading=data));denied('prix_quantite_zero_refuse',lambda:read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[1]['source_line_id']])),'23514');ls[1].update(quantity='2.5',confirm_catalogue=False,confirm_price=False,create_product=False);d=read('save',dict(id=did,version=d['revision'],reading=data));payload=dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]);req=uid()
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:read('catalogue',payload,req),range(2)))
   check('prix_apres_article_et_double_appui',results[0]==results[1] and results[0]['prices_recorded']==1)
   check('un_seul_historique',sql("SELECT count(*) FROM public.pilot_price_history WHERE document_id="+q(did))=='1')
   ls[0]['missing_restore']={'temperature':'3,5'};d=read('save',dict(id=did,version=d['revision'],reading=data));r=read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]));check('secours_humain_ne_duplique_pas_catalogue',r['prices_recorded']==0)
   ls[0].update(packaging_intact='yes',received_quantity='6',received_unit='l',conformity='yes')
   ls[1].update(incident_kind='missing',quantity_diff=True,received_quantity='0',received_unit='kg',temperature='',temperature_relevant=False,packaging_intact='',conformity='no',observations='Produit non livré')
   d=read('save',dict(id=did,version=d['revision'],reading=data));check('manquant_reouvert_sans_mesure',d['receipt_draft']['lines'][1]['packaging_intact']=='' and d['receipt_draft']['lines'][1]['received_quantity']=='0')
   j=call('prepare',dict(id=did,version=d['revision']),who=owner);check('pdf_snapshot_bon_manquant_et_calcul',j['snapshot']['control']['lines'][1]['incident_kind']=='missing' and j['snapshot']['control']['lines'][0]['price_derivation']['net']==27)
   ls[1]['temperature_relevant']=True
   denied('manquant_temperature_contradictoire',lambda:read('save',dict(id=did,version=d['revision'],reading=data)),'23514');ls[1]['temperature_relevant']=False
   stage='FOURNISSEUR';vendor=dict(id=uid(),version=None,name='Maison fictive test',order_email='',departments=['cuisine'],contact_details={'phone':'+32000000000','email':'fixture@example.invalid','address':'Rue fictive','vat_number':'FICTIF','contact_name':'Opérateur fictif'})
   d=call('read',dict(id=did),who=owner,api='pilot_documents');d=read('supplier',dict(id=did,version=d['revision'],vendor=vendor));check('fournisseur_lie',d['supplier_id']==vendor['id']);ctx=call('context',{},who=owner,api='pilot_operations');v=next(v for v in ctx['suppliers'] if v['id']==vendor['id']);check('coordonnees_persistantes',v['phone']=='+32000000000' and v['address']=='Rue fictive')
   denied('employe_sans_gestion_fournisseur',lambda:read('supplier',dict(id=did,version=d['revision'],vendor=vendor),who=staff),'42501')
   denied('doublon_societe_refuse',lambda:call('supplier',dict(vendor,id=uid()),who=owner,api='pilot_operations'),'23514')
   denied('anonyme_refuse',lambda:call('list',{},api='pilot_documents',role='anon'),'42501')
  print(json.dumps(dict(resultat='PASS',tests=len(checks),checks=checks,postgresql='17_JETABLE',auth='SIMULEE',stockage='CONTRAT_SIMULE',supabase_reel=False,nettoyage='ARRET_CONFIRME_REPERTOIRES_SUPPRIMES')))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,sqlstate=getattr(e,'sqlstate',None),type=type(e).__name__,motif=str(e)[:250],diagnostic_fixture=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
