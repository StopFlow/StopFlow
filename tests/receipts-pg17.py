"""Isolated PG17, actual core contracts and new migration. Auth/Storage service contracts simulated."""
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
   for policy in json.loads((ROOT/'tests/fixtures/receipt-existing-policies.json').read_text()):
    src='CREATE POLICY '+policy['policyname']+' ON public.'+policy['tablename']+' AS '+policy['permissive']+' FOR '+policy['cmd']+' TO '+','.join(policy['roles'])
    if policy['qual']:src+=' USING ('+policy['qual']+')'
    if policy['with_check']:src+=' WITH CHECK ('+policy['with_check']+')'
    sql(src)
   sql('ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE ON public.suppliers,public.articles TO authenticated;')
   sql("CREATE SCHEMA storage;GRANT USAGE,CREATE ON SCHEMA storage TO postgres;GRANT USAGE ON SCHEMA storage TO authenticated;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);ALTER TABLE storage.buckets OWNER TO postgres;CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects OWNER TO postgres;ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT ON storage.objects TO authenticated;")
   for f in ['receipts-supplier-scopes.sql','receipts-documents.sql','receipts-supplier-edit-scope.sql']:stage=f;sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/f).read_text(),label=f)
   owner,cuisine,salle,outsider=[uid() for _ in range(4)]
   for u in [owner,cuisine,salle,outsider]:sql(f"INSERT INTO auth.users VALUES('{u}','{u}@example.invalid');INSERT INTO public.profiles(id,email,prenom,nom,role,actif) VALUES('{u}','{u}@example.invalid','Fictif','Fixture','employe',true)")
   for u,deps,keys in [(owner,['cuisine','salle','nettoyage'],['inventory.use','articles.manage','suppliers.manage','orders.manage','history.view']),(cuisine,['cuisine'],['inventory.use']),(salle,['salle'],['inventory.use'])]:
    for d in deps:
     for k in keys:sql(f"INSERT INTO public.profile_permissions(profile_id,permission_key,scope) VALUES('{u}','{k}','{d}')")
   def call(action,p,request=None,who=owner,department='cuisine',api='pilot_documents',role='authenticated'):
    src='BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';SELECT public.'+api+'('+q(action)+','+q(request or uid())+'::uuid,'+q(json.dumps({'department':department,**p}))+'::jsonb);COMMIT;'
    out=sql(src,label=api+'_'+action).splitlines();return json.loads(next(x for x in out if x.startswith(('{','['))))
   def op(a,p,**kw):return call(a,p,api='pilot_operations',**kw)
   def denied(n,fn,state):
    try:fn()
    except Exception as e:check(n,e.sqlstate==state)
    else:raise AssertionError(n+'_ACCEPTED')
   stage='SUPPLIERS';vs=[]
   for dep,scopes in [('cuisine',['cuisine']),('salle',['salle']),('cuisine',['cuisine','salle']),('nettoyage',['nettoyage'])]:vs.append(op('supplier',dict(id=uid(),name='Fournisseur fictif '+str(len(vs)),order_email='commande@example.invalid',departments=scopes),department=dep)['id'])
   vendor=vs[2];c=op('context',{});s=op('context',{},department='salle');check('fournisseurs_cuisine_salle_partage',len(c['suppliers'])==2 and len(s['suppliers'])==2 and set(next(v for v in c['suppliers'] if v['id']==vendor)['departments'])=={'cuisine','salle'})
   denied('employe_pas_extension_fournisseur',lambda:op('supplier',dict(id=vendor,version=1,name='Fictif',departments=['cuisine','salle']),who=cuisine),'42501')
   p=op('product',dict(id=uid(),name='Produit frais fictif',category='Fixture',unit='kg',target='8'));ps=op('product',dict(id=uid(),name='Produit salle fictif',category='Fixture',unit='kg',target='4'),department='salle')
   offer=op('offer',dict(id=uid(),product_id=ps['id'],supplier_id=vendor,supplier_reference='S-1',pack_quantity=2.5,pack_unit='kg',pack_price=5.75,price_basis='HT',characteristics={'condition':'frais'}),department='salle');check('offre_fournisseur_partage_salle',offer['supplier_id']==vendor)
   denied('offre_fournisseur_autre_scope',lambda:op('offer',dict(id=uid(),product_id=ps['id'],supplier_id=vs[0],pack_quantity=1,pack_unit='kg',pack_price=1,price_basis='HT'),department='salle'),'42501')
   check('aucun_melange_produits',len(op('context',{},who=cuisine)['products'])==1 and len(op('context',{},department='salle',who=salle)['products'])==1)
   r=op('inventory_save',dict(id=uid(),lines=[dict(product_id=ps['id'],stock='0',target='8',offer_id=offer['id'])],notes={}),department='salle',who=salle)
   ctx=op('context',{},department='salle',who=salle);r=op('prepare',dict(id=r['id'],version=r['revision'],lines=r['payload']['lines'],notes={},versions={x['id']:x['version'] for key in ['products','offers','suppliers'] for x in ctx[key]}),department='salle',who=salle);check('commande_partagee_conserve_salle',op('documents',{},department='salle',who=salle)[0]['order']['department']=='salle')
   denied('rattachement_utilise_non_supprime',lambda:op('supplier',dict(id=vendor,version=1,name='Fournisseur fictif 2',order_email='commande@example.invalid',departments=['cuisine'])),'23514')
   detachable=op('supplier',dict(id=uid(),name='Rattachement modifiable fictif',order_email='fixture@example.invalid',departments=['cuisine','salle']))
   detached=op('supplier',dict(id=detachable['id'],version=detachable['version'],name='Rattachement modifiable fictif',order_email='fixture@example.invalid',departments=['salle']),department='salle')
   edited=op('supplier',dict(id=detachable['id'],version=detached['version'],name='Identité préservée fictive',order_email='fixture@example.invalid',departments=['salle']),department='salle')
   check('retrait_scope_inutilise_fiche_toujours_modifiable',edited['id']==detachable['id'])
   sql(f"INSERT INTO public.profile_permissions(profile_id,permission_key,scope) VALUES('{salle}','suppliers.manage','salle')")
   sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+q(salle)+";UPDATE public.suppliers SET contact_name='Contact fictif' WHERE id="+q(detachable['id'])+";COMMIT;")
   check('contact_legacy_modifiable_selon_scopes_actuels',sql('SELECT contact_name FROM public.suppliers WHERE id='+q(detachable['id']))=='Contact fictif')
   stage='RECEIPT';doc=call('create',dict(id=uid(),kind='delivery'),who=cuisine)
   line=dict(department='cuisine',type='product',product_id=p['id'],description='Produit fictif',supplier_reference='C-1',received_quantity='2',temperature='',conformity='',pack_price='')
   def save(d,lines,**values):return call('save',dict(id=d['id'],version=d['revision'],departments=values.pop('departments',['cuisine']),document={'kind':d['kind'],'supplier_id':vendor,'number':'F-'+d['id'],'date':'2026-11-23','received_at':'2026-11-23T10:00:00+01:00','lines':lines,**values}))
   doc=save(doc,[line]);denied('conformite_non_preselectionnee',lambda:call('receive',dict(id=doc['id'],version=doc['revision']),who=cuisine),'23514')
   line.update(conformity='yes',temperature_relevant=True);doc=save(doc,[line]);denied('temperature_vide_pas_zero',lambda:call('receive',dict(id=doc['id'],version=doc['revision']),who=cuisine),'23514')
   line.update(temperature='0');doc=save(doc,[line]);doc=call('receive',dict(id=doc['id'],version=doc['revision']),who=cuisine);check('controle_humain_et_operateur',doc['received_by']==cuisine and doc['payload']['lines'][0]['temperature']=='0')
   check('bon_sans_prix_ne_change_pas_offres',sql('SELECT count(*) FROM public.pilot_price_history')=='0');denied('bon_pas_facture',lambda:call('review',dict(id=doc['id'],version=doc['revision'],human_verified=True)),'23514')
   denied('autre_departement_doc_refuse',lambda:call('read',dict(id=doc['id']),who=salle,department='salle'),'42501');denied('anonyme_refuse',lambda:call('list',{},role='anon'),'42501');denied('sans_droit_refuse',lambda:call('list',{},who=outsider),'42501')
   check('stock_physique_inchange',sql('SELECT count(*) FROM public.pilot_inventory_runs')=='1')
   def attach(d,who=owner):
    file=call('file',dict(id=d['id'],version=d['revision'],file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='application/pdf',name='fixture.pdf'),who=who)
    sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+q(who)+";INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(file['path'])+');COMMIT;');return file
   stage='PRICES'
   def invoice(date,price,number=None,kind='invoice',product=p,ref='C-1',dept='cuisine'):
    d=call('create',dict(id=uid(),kind=kind),department=dept);l=dict(line,department=dept,product_id=product['id'],quantity='3',pack_quantity='2.5',pack_unit='kg',pack_price=price,discount='0',basis='HT',currency='EUR',supplier_reference=ref,characteristics={'condition':'frais'});d=save(d,[l],date=date,number=number or 'INV-'+uid(),departments=[dept]);attach(d);d=call('review',dict(id=d['id'],version=d['revision'],human_verified=True));return d,l
   inv,l=invoice('2026-11-22','5.75');request=uid();payload=dict(id=inv['id'],version=inv['revision']);done=call('apply',payload,request);check('facture_appliquee',done['phase']=='applied');check('prix_source',sql('SELECT count(*) FROM pilot_price_history')=='1');check('reponse_perdue_reprise_sans_doublon',call('apply',payload,request)==done and sql('SELECT count(*) FROM pilot_price_history')=='1')
   old,_=invoice('2026-10-01','9');call('apply',dict(id=old['id'],version=old['revision']));o=next(x for x in op('context',{})['offers'] if x['product_id']==p['id']);check('ancienne_facture_historique_seulement',float(o['pack_price'])==5.75 and o['price_date']=='2026-11-22');hist=call('history',dict(id=o['id']));check('graphe_sources_reelles',len(hist['history'])==2 and all(x['document_id'] for x in hist['history']))
   duplicate,_=invoice('2026-11-22','5.75',number=inv['document_number']);denied('doublon_facture_refuse',lambda:call('apply',dict(id=duplicate['id'],version=duplicate['revision'])),'23505')
   credit,_=invoice('2026-11-23','-5',kind='credit');call('apply',dict(id=credit['id'],version=credit['revision']));check('avoir_pas_prix_negatif',sql('SELECT count(*) FROM pilot_price_history')=='2')
   check('normalisation_2_30',float(o['pack_price'])/float(o['pack_quantity'])==2.3)
   new=call('create',dict(id=uid(),kind='invoice'));new=save(new,[l]);denied('application_sans_validation_humaine',lambda:call('apply',dict(id=new['id'],version=new['revision'])),'23514');denied('validation_sans_original',lambda:call('review',dict(id=new['id'],version=new['revision'],human_verified=True)),'23514')
   mixed=call('create',dict(id=uid(),kind='invoice'));mixed=save(mixed,[l,dict(l,department='salle',product_id=ps['id'])],departments=['cuisine','salle']);denied('original_mixte_pas_un_seul_departement',lambda:call('read',dict(id=mixed['id']),who=cuisine),'42501');check('document_mixte_gestionnaire',len(call('read',dict(id=mixed['id']))['departments'])==2)
   f=attach(new);denied('original_prive_salle_refuse',lambda:sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+q(salle)+";SELECT 1/CASE WHEN count(*)=0 THEN 0 ELSE 1 END FROM storage.objects WHERE name="+q(f['path'])+';COMMIT;'),'22012')
   stage='EQUIVALENCES';fresh=op('product',dict(id=uid(),name='Produit frais fictif autre',unit='kg',target=0));other=op('offer',dict(id=uid(),product_id=fresh['id'],supplier_id=vs[0],supplier_reference='ALT',pack_quantity=1,pack_unit='kg',pack_price=2,price_basis='HT',characteristics={'condition':'frais'}))
   eq=dict(id=uid(),source_offer=other['id'],target_offer=o['id'],source_version=other['version'],target_version=o['version'],decision='approved',reason='Caractéristiques vérifiées sur documents fictifs',attributes_reviewed=True)
   denied('employe_pas_equivalence',lambda:call('equivalence',eq,who=cuisine),'42501');call('equivalence',dict(eq,decision='separate'));check('separer_ne_fusionne_pas',next(x for x in op('context',{})['products'] if x['id']==fresh['id'])['active'])
   call('equivalence',dict(eq,id=uid()));ctx=op('context',{});check('equivalence_confirmee_un_compte_physique',not next(x for x in ctx['products'] if x['id']==fresh['id'])['active'] and next(x for x in ctx['offers'] if x['id']==other['id'])['product_id']==p['id'])

   stage='CONCURRENT_INVOICES';one,_=invoice('2026-11-23','6',number='CONCURRENT-FAKE');two,_=invoice('2026-11-23','6',number='CONCURRENT-FAKE')
   def race(d):
    try:call('apply',dict(id=d['id'],version=d['revision']));return 'ok'
    except Exception as e:return e.sqlstate
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(race,[one,two]))
   check('factures_concurrentes_une_seule_application',sorted(out)==['23505','ok'])
   counted=op('product',dict(id=uid(),name='Produit déjà compté fictif',unit='kg',target=0));co=op('offer',dict(id=uid(),product_id=counted['id'],supplier_id=vs[0],supplier_reference='COUNTED',pack_quantity=1,pack_unit='kg',pack_price=2,price_basis='HT',characteristics={'condition':'frais'}));op('inventory_save',dict(id=uid(),lines=[dict(product_id=counted['id'],stock='2',target='4',offer_id=co['id'])],notes={}))
   current=next(x for x in op('context',{})['offers'] if x['id']==o['id']);e=dict(id=uid(),source_offer=co['id'],target_offer=current['id'],source_version=co['version'],target_version=current['version'],decision='approved',reason='Fixture explicite',attributes_reviewed=True)
   denied('stocks_deja_comptes_pas_fusionnes',lambda:call('equivalence',e),'23514')
   frozen=op('product',dict(id=uid(),name='Produit surgelé fictif',unit='kg',target=0));fo=op('offer',dict(id=uid(),product_id=frozen['id'],supplier_id=vs[0],supplier_reference='FROZEN',pack_quantity=1,pack_unit='kg',pack_price=2,price_basis='HT',characteristics={'condition':'surgele'}));denied('frais_surgele_pas_equivalents',lambda:call('equivalence',dict(e,id=uid(),source_offer=fo['id'],source_version=fo['version'])),'23514')
   check('entretien_preserve',op('context',{},department='nettoyage')['suppliers'][0]['id']==vs[3])
   denied('tables_directes_refusees',lambda:sql('SET ROLE authenticated;SELECT * FROM public.pilot_trade_documents'),'42501');check('aucune_permission_ajoutee',sql("SELECT NOT rolsuper AND NOT rolcreaterole FROM pg_roles WHERE rolname='postgres'")=='t')
  print(json.dumps(dict(resultat='PASS',tests=len(checks),groupes=checks,postgresql='17_JETABLE',auth='SIMULEE',storage='CONTRAT_SIMULE',supabase_reel=False)))
 except Exception as e:print(json.dumps(dict(resultat='ECHEC',etape=stage,instruction=str(e),sqlstate=getattr(e,'sqlstate',None),diagnostic=getattr(e,'safe',None))));return 1
 return 0
if __name__=='__main__':raise SystemExit(main())
