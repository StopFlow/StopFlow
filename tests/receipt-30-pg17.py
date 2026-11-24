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
   for name in ['receipt-control-pdf.sql','receipt-shared-reading.sql','receipt-catalogue-legacy-guard.sql','receipt-delivery-checks.sql','receipt-cordier-workflow.sql','receipt-30-lines.sql']:sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/pilot'/name).read_text(),label=name)
   def read(a,p,req=None,who=owner,dep='cuisine'):return call(a,p,req,who=who,dep=dep,api='pilot_document_reading')
   def document():
    p=dict(id=uid(),file_id=uid(),sha256=hashlib.sha256(uid().encode()).hexdigest(),bytes=20,mime='image/png',name='bon-fictif.png',kind='delivery');r=call('capture',p,who=owner);sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(r['file']['path'])+")");return r['document_id']
   def product(name,ref):
    p=call('product',dict(id=uid(),name=name,category='Fictif',unit='kg',target='0'),who=owner,api='pilot_operations')
    o=call('offer',dict(id=uid(),product_id=p['id'],supplier_id=supplier,supplier_reference=ref,pack_quantity='1',pack_unit='kg',pack_price='1.20',price_basis='HT'),who=owner,api='pilot_operations')
    return p['id'],o['id']
   def line(n,**kw):return dict(department='cuisine',type='product',source_line_id=uid(),supplier_reference='F'+str(n),description='Produit fictif '+str(n),quantity='2.5',unit='kg',unit_price='3.20',line_total='8.00',basis='HT',currency='EUR',received_quantity='',received_unit='',temperature='',temperature_relevant=False,conformity='',packaging_intact='',confirm_catalogue=False,confirm_price=False,create_product=False,product_id='',**kw)
   def reading(ls,number):return dict(kind='delivery',supplier_id=supplier,number=number,date='2026-11-23',received_at='2026-11-23T10:00:00Z',lines=ls,pages=[],orientations={},missing_lines=[dict(supplier_reference='MANQUE',description='Article absent fictif',quantity='1',unit='kg',source_section='missing')],reading_result={'status':'success','recognized':len(ls)})
   stage='TRENTE_LIGNES';did=document();ls=[line(i) for i in range(30)];data=reading(ls,'BL-80958');data['received_at']='2026-11-19T10:00:00Z';data['containers']=[dict(source_line_id=uid(),supplier_reference='BAC-A',description='Bac A',quantity='3',unit='pc',deposit='4.50',received_count='3',returned_count='1',observations='Fictif'),dict(source_line_id=uid(),supplier_reference='BAC-B',description='Bac B',quantity='2',unit='pc',deposit='5.00',received_count='2',returned_count='0')]
   for l in ls:l.update(packaging_intact='yes',quantity_confirmed_same=True,received_quantity=l['quantity'],received_unit=l['unit'],conformity='yes')
   ls[0].update(temperature_relevant=True,temperature='3.2',observations='Remarque conservée',create_product=True,confirm_catalogue=True)
   ls[1].update(create_product=True,confirm_catalogue=True)
   d=read('save',dict(id=did,version=1,reading=data));d=read('start',dict(id=did,version=d['revision']));d=read('save',dict(id=did,version=d['revision'],reading=data));check('trente_lignes_et_deux_bacs_persistes',len(d['receipt_draft']['lines'])==30 and len(d['receipt_draft']['containers'])==2)
   out=read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]));check('memorisation_uniquement_ligne_demandee',out['lines_memorized']==1 and sql('SELECT count(*) FROM pilot_products')=='1');out=read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]));check('reprise_meme_ligne_sans_doublon',out['lines_memorized']==0)
   ls[0].update(temperature_category='cold',confirm_price=True);d=read('save',dict(id=did,version=d['revision'],reading=data));out=read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]));check('prix_ajoute_article_connu_apres_mesure_humaine',out['prices_recorded']==1 and sql('SELECT count(*) FROM pilot_products')=='1');out=read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]));check('reprise_prix_sans_doublon',out['prices_recorded']==0 and sql('SELECT count(*) FROM pilot_price_history')=='1')
   denied('selection_inconnue_refusee',lambda:read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[uid()])), '22023')
   denied('selection_dupliquee_refusee',lambda:read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[0]['source_line_id']]*2)), '22023')
   j=call('prepare',dict(id=did,version=d['revision']),who=owner);c=j['snapshot']['control'];check('snapshot_mesures_prix_bacs',c['lines'][0]['temperature']=='3.2' and c['lines'][0]['unit_price']=='3.20' and c['containers'][0]['returned_count']=='1' and c['containers'][1]['supplier_reference']=='BAC-B')
   fname=sql("SELECT private.pilot_receipt_file_name("+q(json.dumps(dict(control=dict(received_at='2026-11-19T10:00:00Z',number='BL-80958'),supplier_name='Cordier',operator_label='Quentin Pollet')))+"::jsonb,1)");check('nom_lisible_date_fournisseur_operateur_bon_version',fname=='2026-11-19_Cordier_Quentin-Pollet_BL-80958_v1.pdf')
   out=call('register_pdf',dict(id=did,version=d['revision'],control_id=j['id'],sha256='a'*64,bytes=20),who=owner);name=sql('SELECT name FROM pilot_document_files WHERE id='+q(j['id']));check('nom_pdf_metadata_versionne',name.endswith('_BL-80958_v1.pdf') and 'Fournisseur-synthetique' in name)
   sql("INSERT INTO storage.objects VALUES('pilot-receipts-private',"+q(did+'/'+j['id'])+")");call('finalize',dict(id=did,version=d['revision'],control_id=j['id']),who=owner);done=read('read',dict(id=did));check('relecture_pdf_et_bacs',done['receipt_state']=='complete' and done['receipt_draft']['containers'][0]['received_count']=='3')
   d=call('correct',dict(id=did,version=done['revision']),who=owner);check('correction_versionnee_conserve_pdf',len(read('read',dict(id=did))['controls'])==1 and d['receipt_state']=='draft')
   data['pending_rescans']={'page':{'pending':True}};d=read('save',dict(id=did,version=d['revision'],reading=data));denied('comparaison_rescan_non_resolue_refusee',lambda:call('prepare',dict(id=did,version=d['revision']),who=owner),'23514')
   data['pending_rescans']={};data['containers'][0]['received_count']='1.5';denied('nombre_bacs_decimaux_refuse',lambda:read('save',dict(id=did,version=d['revision'],reading=data)),'22023')
   denied('catalogue_sans_habilitation_refuse',lambda:read('catalogue',dict(id=did,version=d['revision'],human_verified=True,selected_line_ids=[ls[1]['source_line_id']]),who=staff),'42501')
   denied('anonyme_refuse',lambda:call('read',dict(id=did),role='anon',api='pilot_document_reading'),'42501')
   check('autre_departement_inaccessible',call('list',{},who=salle,dep='salle',api='pilot_documents')==[])
   stage='BACS_SEULS';did=document();data=reading([],'BACS');data['containers']=[dict(source_line_id=uid(),supplier_reference='BAC-X',description='Bac X',quantity='1',received_count='',returned_count='')];d=read('save',dict(id=did,version=1,reading=data));d=read('start',dict(id=did,version=d['revision']));check('bon_bacs_seuls_ouvrable',d['receipt_state']=='draft' and len(d['receipt_draft']['containers'])==1)
  print(json.dumps(dict(resultat='PASS',tests=len(checks),checks=checks,postgresql='17_JETABLE',auth='SIMULEE',stockage='CONTRAT_SIMULE',supabase_reel=False,nettoyage='ARRET_CONFIRME_REPERTOIRES_SUPPRIMES')))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,sqlstate=getattr(e,'sqlstate',None),type=type(e).__name__,motif=str(e)[:250],diagnostic_fixture=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
