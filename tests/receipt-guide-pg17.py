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
   for name in ['receipt-control-pdf.sql','receipt-shared-reading.sql','receipt-catalogue-legacy-guard.sql','receipt-delivery-checks.sql','receipt-cordier-workflow.sql','receipt-30-lines.sql','receipt-guided-control.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/name).read_text(),label=name)
   def read(a,p,req=None,who=owner,dep='cuisine'):return call(a,p,req,who=who,dep=dep,api='pilot_document_reading')
   def document():
    p=dict(id=uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/png',name='bon-fictif.png',kind='delivery');r=call('capture',p,who=owner);sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(r['file']['path'])+")");return r['document_id']
   def product(name,ref):
    p=call('product',dict(id=uid(),name=name,category='Fictif',unit='kg',target='0'),who=owner,api='pilot_operations')
    o=call('offer',dict(id=uid(),product_id=p['id'],supplier_id=supplier,supplier_reference=ref,pack_quantity='1',pack_unit='kg',pack_price='1.20',price_basis='HT'),who=owner,api='pilot_operations')
    return p['id'],o['id']
   def line(n,**kw):return dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='F'+str(n),description='Produit fictif '+str(n),quantity='2.5',unit='kg',unit_price='3.20',line_total='8.00',basis='HT',currency='EUR',received_quantity='',received_unit='',temperature='',temperature_relevant=False,conformity='',packaging_intact='',confirm_catalogue=False,confirm_price=False,create_product=False,product_id='',**kw)
   def reading(ls,number):return dict(kind='delivery',supplier_id=supplier,number=number,date='2026-11-23',received_at='2026-11-23T10:00:00Z',lines=ls,pages=[],orientations={},missing_lines=[dict(supplier_reference='MANQUE',description='Article absent fictif',quantity='1',unit='kg',source_section='missing')],reading_result={'status':'success','recognized':len(ls)})
   stage='PROGRESSION_HUMAINE';did=document();ls=[line(i) for i in range(30)];data=reading(ls,'GUIDE-30');data['workflow_version']='guided1';d=read('save',dict(id=did,version=1,reading=data));d=read('start',dict(id=did,version=d['revision']))
   def confirm(l):
    l.update(packaging_intact='yes',received_quantity=l['quantity'],received_unit=l['unit'],quantity_diff=False,quantity_confirmed_same=True,conformity='yes',incident_kind='')
    keys=['description','supplier_reference','quantity','unit','packaging_intact','quantity_diff','received_quantity','received_unit','temperature_relevant','temperature','observations','incident_kind'];l['physical_reviewed']=True;l['physical_snapshot']={k:('true' if l.get(k)=='BOOLEAN_SENTINEL' else str(l.get(k,'')).lower() if isinstance(l.get(k),bool) else str(l.get(k,''))) for k in keys}
   for l in ls[:8]:confirm(l)
   d=read('save',dict(id=did,version=d['revision'],reading=data));listed=call('list',{},who=owner,api='pilot_documents');item=next(x for x in listed if x['id']==did);check('huit_sur_trente_controles_persistes',item['progress_summary']['checked']==8 and item['progress_summary']['total']==30);check('miniature_privee_metadata_autorisee',item['thumbnail_original']['purpose']=='original');check('controle_et_lecture_separes',item['progress_summary']['reading']==0)
   denied('finalisation_22_non_controles_refusee',lambda:call('prepare',dict(id=did,version=d['revision']),who=owner),'23514')
   ls[0]['temperature_relevant']=True;ls[0]['temperature']='3.2';d=read('save',dict(id=did,version=d['revision'],reading=data));check('modification_invalide_confirmation',not d['receipt_draft']['lines'][0]['physical_reviewed']);confirm(ls[0]);d=read('save',dict(id=did,version=d['revision'],reading=data));check('temperature_et_progres_reouverts',d['receipt_draft']['lines'][0]['temperature']=='3.2' and d['receipt_draft']['lines'][0]['physical_reviewed']);check('auteur_controle_serveur',d['receipt_draft']['lines'][0]['physical_checked_by']==owner and bool(d['receipt_draft']['lines'][0]['physical_checked_at']))
   ls[7].update(incident_kind='missing',quantity_confirmed_same=False,quantity_diff=True,received_quantity='0',observations='Produit non livré',conformity='no');ls[7]['physical_snapshot']['incident_kind']='missing';ls[7]['physical_snapshot']['quantity_diff']='true';ls[7]['physical_snapshot']['received_quantity']='0';ls[7]['physical_snapshot']['observations']='Produit non livré'
   for l in ls[8:]:confirm(l)
   d=read('save',dict(id=did,version=d['revision'],reading=data));j=call('prepare',dict(id=did,version=d['revision']),who=owner);check('trente_controles_snapshot_avec_ecart',all(l['physical_reviewed'] for l in j['snapshot']['control']['lines']) and j['snapshot']['control']['lines'][7]['incident_kind']=='missing' and j['snapshot']['control']['lines'][7]['received_quantity']=='0')
   denied('anonyme_liste_refusee',lambda:call('list',{},api='pilot_documents',role='anon'),'42501');check('autre_departement_sans_document',call('list',{},who=salle,dep='salle',api='pilot_documents')==[])
  print(json.dumps(dict(resultat='PASS',tests=len(checks),checks=checks,postgresql='17_JETABLE',auth='SIMULEE',stockage='CONTRAT_SIMULE',supabase_reel=False,nettoyage='ARRET_CONFIRME_REPERTOIRES_SUPPRIMES')))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,sqlstate=getattr(e,'sqlstate',None),type=type(e).__name__,motif=str(e)[:250],diagnostic_fixture=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
