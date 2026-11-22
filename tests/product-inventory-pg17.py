"""Disposable PG17. Core DDL/functions/triggers captured read-only from the pilot.
Auth identity only is simulated; no network or live target is opened by this test.
"""
import concurrent.futures,contextlib,importlib.util,json,pathlib,re,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('isolated',ROOT/'tests/service-operations-pg17.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
# Reuse only its bounded private-socket cluster lifecycle, not its reservation assertions.
def fixture(sql):
 c=json.loads((ROOT/'tests/fixtures/operations-core-catalog.json').read_text());q=lambda s:"'"+s.replace("'","''")+"'"
 sql('DROP SCHEMA public CASCADE;CREATE SCHEMA public;DROP SCHEMA private CASCADE;CREATE SCHEMA private;DROP TABLE auth.users CASCADE;CREATE TABLE auth.users(id uuid PRIMARY KEY,email varchar(255));CREATE ROLE postgres LOGIN NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;ALTER DATABASE postgres OWNER TO postgres;GRANT ALL ON SCHEMA public,private TO postgres;GRANT USAGE ON SCHEMA public TO authenticated,anon;GRANT USAGE ON SCHEMA auth TO postgres,authenticated,anon;GRANT SELECT,REFERENCES ON auth.users TO postgres;SET check_function_bodies=false;CREATE SEQUENCE public.order_number_seq;')
 sql('SET SESSION AUTHORIZATION postgres;SET check_function_bodies=false;'+''.join('CREATE TYPE public.'+e['name']+' AS ENUM('+','.join(q(v) for v in e['values'])+');' for e in c['enums']))
 for t in c['tables']:
  columns=[]
  for a in t['columns']:
   decl='"'+a['name']+'" '+a['type']
   if a['identity']:decl+=' GENERATED '+('ALWAYS' if a['identity']=='a' else 'BY DEFAULT')+' AS IDENTITY'
   elif a['default']:decl+=' DEFAULT '+a['default']
   if not a['null']:decl+=' NOT NULL'
   columns.append(decl)
  sql('SET SESSION AUTHORIZATION postgres;CREATE TABLE public.'+t['name']+'('+','.join(columns)+');',label='CORE_TABLE_'+t['name'])
 for foreign in [False,True]:
  for t in c['tables']:
   for k in t['constraints'] or []:
    if ('FOREIGN KEY' in k['definition'])==foreign:sql('SET SESSION AUTHORIZATION postgres;ALTER TABLE public.'+t['name']+' ADD CONSTRAINT '+k['name']+' '+k['definition']+';',label='CORE_CONSTRAINT_'+k['name'])
 sql('SET SESSION AUTHORIZATION postgres;'+(ROOT/'supabase/migrations/20261017120000_stopflow_reservations_foundation.sql').read_text(),label='EXISTING_FOUNDATION')
 team=(ROOT/'supabase/pilot/team-access.sql').read_text();start=team.index('CREATE TABLE private.pilot_owner_config');end=team.index('\nREVOKE',start)
 sql('SET SESSION AUTHORIZATION postgres;'+team[start:end]+'ALTER TABLE private.pilot_owner_config ADD COLUMN activation_complete boolean NOT NULL DEFAULT false;SET check_function_bodies=false;'+';\n'.join(c['functions'])+';',label='CORE_FUNCTIONS')
 sql('SET SESSION AUTHORIZATION postgres;'+'\n'.join(t['definition']+';' for t in c['triggers']),label='CORE_TRIGGERS')
 sql('ALTER SEQUENCE public.order_number_seq OWNER TO postgres;GRANT USAGE ON SCHEMA private TO authenticated;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;')
 sql('SET SESSION AUTHORIZATION postgres;SET check_function_bodies=true;'+(ROOT/'supabase/pilot/product-inventory.sql').read_text(),label='ADDITIVE_MIGRATION')

def main():
 tests=[];stage='SETUP';uid=lambda:str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
 def check(name,value=True):
  if not value:raise AssertionError(name)
  tests.append(name)
 try:
  with h.cluster() as sql:
   fixture(sql);stage='FIXTURES';owner,staff,foreign=[uid() for _ in range(3)]
   for who,role in [(owner,'responsable'),(staff,'employe'),(foreign,'employe')]:sql(f"INSERT INTO auth.users VALUES('{who}','{who}@example.invalid');INSERT INTO profiles(id,email,prenom,nom,role,actif) VALUES('{who}','{who}@example.invalid','Fixture','Synthétique','{role}',true);")
   sql(f"INSERT INTO profile_permissions(profile_id,permission_key,scope) VALUES('{owner}','inventory.use','cuisine'),('{owner}','orders.manage','cuisine'),('{owner}','articles.manage','cuisine'),('{owner}','suppliers.manage','cuisine'),('{owner}','history.view','cuisine'),('{staff}','inventory.use','cuisine'),('{foreign}','inventory.use','salle');")
   def call(action,p,request=None,who=owner,role='authenticated'):
    src='BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';SELECT public.pilot_operations('+q(action)+','+q(request or uid())+'::uuid,'+q(json.dumps({'department':'cuisine',**p}))+'::jsonb);COMMIT;'
    out=sql(src,label='RPC_'+action).splitlines();return json.loads(next(x for x in out if x.startswith(('{','['))))
   def denied(name,fn,state):
    try:fn()
    except Exception as e:check(name,getattr(e,'sqlstate',None)==state)
    else:raise AssertionError(name+'_ACCEPTED')
   stage='CATALOGUE';vendor=call('supplier',dict(id=uid(),version=None,name='Fournisseur fictif',order_email='commande@example.invalid'));p=call('product',dict(id=uid(),version=None,name='Produit fictif',category='Épicerie',unit='kg',target='8'));o=call('offer',dict(id=uid(),version=None,product_id=p['id'],supplier_id=vendor['id'],pack_quantity='2.5',pack_unit='kg',pack_price='5.75',price_basis='HT'));check('prix_2_30',float(o['pack_price'])/float(o['pack_quantity'])==2.3)
   call('preference',dict(id=o['id'],product_id=p['id'],version=1));check('preference_reste_explicite',call('context',{})['products'][0]['preferred_offer_id']==o['id'])
   denied('autre_departement',lambda:call('context',{},who=foreign),'42501');denied('anonyme',lambda:call('context',{},role='anon'),'42501');denied('employe_pas_catalogue',lambda:call('product',dict(id=uid()),who=staff),'42501')
   denied('unites_incompatibles',lambda:call('offer',dict(id=uid(),product_id=p['id'],supplier_id=vendor['id'],pack_quantity=1,pack_unit='l',pack_price=2,price_basis='HT')),'22023')
   stage='BROUILLON';rid=uid();payload=dict(id=rid,version=None,lines=[dict(product_id=p['id'],stock='',target='8',offer_id=None)],notes={});req=uid();r=call('inventory_save',payload,req,who=staff);check('brouillon_sans_fournisseur_et_non_compte',r['payload']['lines'][0]['stock']=='' and r['payload']['lines'][0]['offer_id'] is None);check('reprise_meme_intention',call('inventory_save',payload,req,who=staff)==r)
   denied('intention_differente',lambda:call('inventory_save',dict(payload,lines=[]),req,who=staff),'40001');denied('autre_auteur_pas_lecture',lambda:call('inventory_read',dict(id=rid),who=foreign),'42501')
   check('relecture_serveur',call('inventory_read',dict(id=rid),who=staff)['revision']==1)
   denied('non_compte_pas_zero',lambda:call('prepare',dict(payload,version=1),who=staff),'23514')
   payload['lines'][0].update(stock='0',offer_id=o['id']);payload['version']=1;r=call('inventory_save',payload,who=staff);payload['version']=r['revision'];ctx=call('context',{},who=staff);payload['versions']={x['id']:x['version'] for k in ['products','offers','suppliers'] for x in ctx[k]}
   denied('conflit_version',lambda:call('inventory_save',dict(payload,version=1),who=staff),'40001')
   stage='PREPARATION';req=uid();r=call('prepare',payload,req,who=staff);check('quatre_sacs_dix_kg',r['phase']=='prepared' and len(r['order_ids'])==1);docs=call('documents',{},who=staff);d=docs[0];line=d['snapshot']['lines'][0];check('besoin_distinct_commande',line['need']==8 and line['packs']==4 and line['ordered']==10 and line['total']==23)
   check('aucun_envoi_ni_validation',d['order']['status']=='Brouillon' and d['order']['sent_at'] is None);check('preparation_reprise_sans_doublon',call('prepare',payload,req,who=staff)==r and len(call('documents',{},who=staff))==1)
   denied('nouvelle_preparation_refusee',lambda:call('prepare',payload,who=staff),'40001');denied('truncate_refuse',lambda:sql('SET ROLE authenticated;TRUNCATE public.pilot_products;'),'42501')
   stage='VALIDATION_EXISTANTE';order=d['order'];a=call('transition',dict(id=order['id'],version=order['revision'],transition='submit'),who=staff);check('transmission_a_valider',a['status']=='À valider')
   denied('employe_pas_validation',lambda:call('transition',dict(id=a['id'],version=a['revision'],transition='validate'),who=staff),'42501')
   a=call('transition',dict(id=a['id'],version=a['revision'],transition='validate'));check('validation_numero_existant',a['status']=='Validé' and a['number'].startswith('BC-'))
   stage='CONCURRENCE';base=dict(id=uid(),version=None,lines=payload['lines'],notes={});r=call('inventory_save',base,who=staff);base['version']=r['revision']
   def race(i):
    try:call('inventory_save',base,who=staff);return 'ok'
    except Exception as e:return e.sqlstate
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(race,range(2)))
   check('deux_comptages_une_version',sorted(out)==['40001','ok']);
   ctx=call('context',{},who=staff);base=dict(id=uid(),version=None,lines=payload['lines'],notes={},versions={x['id']:x['version'] for k in ['products','offers','suppliers'] for x in ctx[k]});r=call('inventory_save',base,who=staff);base['version']=r['revision'];before=len(call('documents',{},who=staff))
   def concurrent_prepare(i):
    try:call('prepare',base,who=staff);return 'ok'
    except Exception as e:return e.sqlstate
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(concurrent_prepare,range(2)))
   check('preparations_concurrentes_sans_doublon',sorted(out)==['40001','ok'] and len(call('documents',{},who=staff))==before+1)
   denied('catalogue_perime',lambda:call('offer',dict(id=o['id'],version=0,product_id=p['id'],supplier_id=vendor['id'],pack_quantity=1,pack_unit='kg',pack_price=1,price_basis='HT')),'40001')
   denied('nom_fournisseur_ambigu_refuse',lambda:call('supplier',dict(id=uid(),version=None,name='Fournisseur fictif',order_email='autre@example.invalid')),'23514')
   denied('histoire_autre_departement',lambda:call('documents',{},who=foreign),'42501')
   denied('donnees_directes_refusees',lambda:sql('SET ROLE authenticated;SELECT * FROM public.pilot_inventory_runs;'),'42501')
   denied('lecteur_anonyme_recu',lambda:call('receipt',{},role='anon'),'42501')
   check('aucun_droit_global',sql("SELECT NOT rolsuper AND NOT rolcreaterole FROM pg_roles WHERE rolname='postgres'")=='t')
  print(json.dumps(dict(resultat='PASS',tests=len(tests),groupes=tests,postgresql='17_JETABLE',auth='SIMULEE',supabase_reel=False)))
 except Exception as e:print(json.dumps(dict(resultat='ECHEC',etape=stage,instruction=str(e),sqlstate=getattr(e,'sqlstate',None),diagnostic=getattr(e,'safe',None))));return 1
 return 0
if __name__=='__main__':raise SystemExit(main())
