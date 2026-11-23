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
   for name in ['receipt-control-pdf.sql','receipt-shared-reading.sql','receipt-catalogue-legacy-guard.sql','receipt-delivery-checks.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/name).read_text(),label=name)
   def read(a,p,req=None,who=owner,dep='cuisine'):return call(a,p,req,who=who,dep=dep,api='pilot_document_reading')
   def document():
    p=dict(id=uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/png',name='bon-fictif.png',kind='delivery');r=call('capture',p,who=owner);sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(r['file']['path'])+")");return r['document_id']
   did=document();lines=[dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='T01',description='Tomates fictives',quantity='2.5',unit='kg',unit_price='3.20',line_total='8.00',basis='HT',currency='EUR',create_product=True,confirm_catalogue=True,confirm_price=True,received_quantity='',received_unit='',temperature='',conformity=''),dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='T01',description='Tomates fictives',quantity='1',unit='kg',unit_price='3.20',line_total='3.20',basis='HT',currency='EUR',create_product=True,confirm_catalogue=True,confirm_price=True,received_quantity='',received_unit='',temperature='',conformity='')]
   data=dict(kind='delivery',supplier_id=supplier,number='BON-LECTURE-1',date='2026-11-23',received_at='2026-11-23T10:00:00+01:00',pages=[],lines=lines)
   stage='ZERO';data['lines']=[];data['reading_result']={'status':'zero','recognized':0};d=read('save',dict(id=did,version=1,reading=data));denied('zero_produit_refuse_cote_serveur',lambda:read('start',dict(id=did,version=d['revision'])),'23514')
   data['lines']=lines;data['reading_result']={'status':'technical_error','recognized':0};d=read('save',dict(id=did,version=d['revision'],reading=data));denied('echec_technique_refuse_cote_serveur',lambda:read('start',dict(id=did,version=d['revision'])),'23514')
   data['reading_result']={'status':'success','recognized':2};d=read('save',dict(id=did,version=d['revision'],reading=data));d=read('start',dict(id=did,version=d['revision']));check('produits_lus_ouvrent_fiche_sans_mesures_devinees',all(l['received_quantity']=='' and l['temperature']=='' and l.get('packaging_intact','')=='' for l in d['receipt_draft']['lines']))
   for l in data['lines']:l.update(received_quantity='2.5',conformity='yes',quantity_diff=False,quantity_confirmed_same=False,packaging_intact='')
   d=read('save',dict(id=did,version=d['revision'],reading=data));denied('emballage_non_renseigne_refuse',lambda:call('prepare',dict(id=did,version=d['revision']),who=owner),'23514')
   data['lines'][0].update(packaging_intact='yes',quantity_confirmed_same=True);data['lines'][1].update(packaging_intact='no',conformity='no',observations='')
   d=read('save',dict(id=did,version=d['revision'],reading=data));denied('emballage_abime_sans_observation_refuse',lambda:call('prepare',dict(id=did,version=d['revision']),who=owner),'23514')
   data['lines'][1]['observations']='Emballage dechire fictif';d=read('save',dict(id=did,version=d['revision'],reading=data));job=call('prepare',dict(id=did,version=d['revision']),who=owner);check('fiche_pdf_snapshot_conserve_emballage_et_quantite_confirmee',job['snapshot']['control']['lines'][0]['packaging_intact']=='yes' and job['snapshot']['control']['lines'][0]['quantity_confirmed_same'] and job['snapshot']['control']['lines'][1]['observations']=='Emballage dechire fictif')
   data['lines'][0]['received_quantity']='2';d=read('save',dict(id=did,version=d['revision'],reading=data));denied('quantite_identique_fausse_refusee',lambda:call('prepare',dict(id=did,version=d['revision']),who=owner),'23514')
   data['lines'][0].update(quantity_diff=True,quantity_confirmed_same=False);d=read('save',dict(id=did,version=d['revision'],reading=data));job=call('prepare',dict(id=did,version=d['revision']),who=owner);check('ecart_quantite_persistant_et_distinct',job['snapshot']['control']['lines'][0]['quantity']=='2.5' and job['snapshot']['control']['lines'][0]['received_quantity']=='2')
   check('aucun_prix_ou_catalogue_modifie',sql('SELECT count(*) FROM pilot_price_history')=='0')
  print(json.dumps(dict(resultat='PASS',tests=len(checks),checks=checks,postgresql='17_JETABLE',auth='SIMULEE',stockage='CONTRAT_SIMULE',supabase_reel=False)))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,sqlstate=getattr(e,'sqlstate',None),type=type(e).__name__,motif=str(e)[:250])));raise
if __name__=='__main__':main()
