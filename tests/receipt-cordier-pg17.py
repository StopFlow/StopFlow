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
   for name in ['receipt-control-pdf.sql','receipt-shared-reading.sql','receipt-catalogue-legacy-guard.sql','receipt-delivery-checks.sql','receipt-cordier-workflow.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/name).read_text(),label=name)
   def read(a,p,req=None,who=owner,dep='cuisine'):return call(a,p,req,who=who,dep=dep,api='pilot_document_reading')
   def document():
    p=dict(id=uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/png',name='bon-fictif.png',kind='delivery');r=call('capture',p,who=owner);sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(r['file']['path'])+")");return r['document_id']
   def product(name,ref):
    p=call('product',dict(id=uid(),name=name,category='Fictif',unit='kg',target='0'),who=owner,api='pilot_operations')
    o=call('offer',dict(id=uid(),product_id=p['id'],supplier_id=supplier,supplier_reference=ref,pack_quantity='1',pack_unit='kg',pack_price='1.20',price_basis='HT'),who=owner,api='pilot_operations')
    return p['id'],o['id']
   def line(n,**kw):return dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='F'+str(n),description='Produit fictif '+str(n),quantity='2.5',unit='kg',unit_price='3.20',line_total='8.00',basis='HT',currency='EUR',received_quantity='',received_unit='',temperature='',temperature_relevant=False,conformity='',packaging_intact='',confirm_catalogue=False,confirm_price=False,create_product=False,product_id='',**kw)
   def reading(ls,number):return dict(kind='delivery',supplier_id=supplier,number=number,date='2026-11-23',received_at='2026-11-23T10:00:00Z',lines=ls,pages=[],orientations={},missing_lines=[dict(supplier_reference='MANQUE',description='Article absent fictif',quantity='1',unit='kg',source_section='missing')],reading_result={'status':'success','recognized':len(ls)})
   stage='CATALOGUE_VIDE';did=document();data=reading([line(1),line(2)],'FICTIF-VIDE');d=read('save',dict(id=did,version=1,reading=data));d=read('start',dict(id=did,version=d['revision']));check('catalogue_vide_produits_presents',len(d['reading']['lines'])==2 and sql('SELECT count(*) FROM pilot_products')=='0')
   for l in data['lines']:l.update(packaging_intact='yes',received_quantity='2.5',received_unit='kg',quantity_confirmed_same=True,conformity='yes')
   data['lines'][0].update(temperature_relevant=True,temperature='4.2')
   d=read('save',dict(id=did,version=d['revision'],reading=data));j=call('prepare',dict(id=did,version=d['revision']),who=owner);check('controle_sans_catalogue_conserve_manquants_temperature',len(j['snapshot']['control']['missing_lines'])==1 and j['snapshot']['control']['lines'][0]['temperature']=='4.2');check('aucun_catalogue_cree_pour_controler',sql('SELECT count(*) FROM pilot_products')=='0' and sql('SELECT count(*) FROM pilot_price_history')=='0')
   data['lines'][0]['uncertain_fields']=['reread_unmatched'];d=read('save',dict(id=did,version=d['revision'],reading=data));denied('ancienne_ligne_controlee_a_rapprocher_refusee',lambda:call('prepare',dict(id=did,version=d['revision']),who=owner),'23514')
   stage='RAPPROCHEMENTS';p1,o1=product('Produit connu fictif','F1');p2,o2=product('Produit similaire fictif','AUTRE');sql("UPDATE pilot_product_offers SET price_date='2026-11-23' WHERE id="+q(o1))
   did=document();ls=[line(1),line(2),line(3)];ls[0].update(product_id=p1,confirm_catalogue=True,confirm_price=True);ls[1].update(product_id=p2,confirm_catalogue=True);ls[2].update(create_product=True,confirm_catalogue=True);data=reading(ls,'FICTIF-CATALOGUE');d=read('save',dict(id=did,version=1,reading=data));req=uid();payload=dict(id=did,version=d['revision'],human_verified=True);out=read('catalogue',payload,req);check('connu_similaire_choisi_nouveau',out['lines_memorized']==3 and out['prices_recorded']==1 and sql('SELECT count(*) FROM pilot_products')=='3')
   check('prix_connu_actualise_meme_date',sql('SELECT pack_price::text FROM pilot_product_offers WHERE id='+q(o1))=='3.20' or float(sql('SELECT pack_price FROM pilot_product_offers WHERE id='+q(o1)))==3.2)
   read('catalogue',payload,req);out=read('catalogue',payload);check('double_memorisation_sans_doublon',out['lines_memorized']==0 and sql('SELECT count(*) FROM pilot_price_history')=='1')
   stage='AJOUT_PRIX_APRES_MEMORISATION';data['lines'][2]['confirm_price']=True;d=read('save',dict(id=did,version=d['revision'],reading=data));
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:race=list(pool.map(lambda _:read('catalogue',dict(id=did,version=d['revision'],human_verified=True)),range(2)))
   check('prix_ajoute_sans_seconde_fiche_article',sum(x['prices_recorded'] for x in race)==1 and sql('SELECT count(*) FROM pilot_products')=='3' and sql('SELECT count(*) FROM pilot_price_history')=='2')
   d=read('start',dict(id=did,version=d['revision']));data['lines'][0].update(corrected_fields=['supplier_reference'],source_rows=[7],uncertain_fields=[],packaging_intact='no',quantity_diff=True,quantity_confirmed_same=False,received_quantity='2',observations='Emballage fictif abime',conformity='no');d=read('save',dict(id=did,version=d['revision'],reading=data));out=read('catalogue',dict(id=did,version=d['revision'],human_verified=True));check('mesures_humaines_ne_recreent_pas_memoire',out['lines_memorized']==0 and sql('SELECT count(*) FROM pilot_price_history')=='2')
   data['lines'][0]['product_id']=p2;d=read('save',dict(id=did,version=d['revision'],reading=data));denied('rattachement_memoire_modifie_refuse',lambda:read('catalogue',dict(id=did,version=d['revision'],human_verified=True)),'40001')
   stage='RECHERCHE';listed=call('list',{},who=owner,api='pilot_documents');check('recherche_article_et_manquants_sur_document_autorise',any('Article absent fictif' in ' '.join(x.get('search_articles',[])) for x in listed));check('recherche_departement_etranger_sans_documents',call('list',{},who=salle,dep='salle',api='pilot_documents')==[])
   denied('anonyme_recherche_refusee',lambda:call('list',{},who=owner,api='pilot_documents',role='anon'),'42501')
   denied('pas_catalogue_sans_permission',lambda:read('catalogue',dict(id=did,version=d['revision'],human_verified=True),who=staff),'42501')
   stage='ORIENTATION';data['lines'][0]['product_id']=p1;data['orientations']={'page-fictive':90};d=read('save',dict(id=did,version=d['revision'],reading=data));check('orientation_persistante_apres_relecture',read('read',dict(id=did))['reading']['orientations']['page-fictive']==90)
  print(json.dumps(dict(resultat='PASS',tests=len(checks),checks=checks,postgresql='17_JETABLE',auth='SIMULEE',stockage='CONTRAT_SIMULE',supabase_reel=False)))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,sqlstate=getattr(e,'sqlstate',None),type=type(e).__name__,motif=str(e)[:250])));raise
if __name__=='__main__':main()
