"""New service/groups/public race tests. Native disposable PG17, never application DB."""
import signal,threading,os,concurrent.futures,hashlib,importlib.util,json,pathlib,threading,uuid
R=pathlib.Path(__file__).resolve().parents[1]
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
q=lambda v:"'"+str(v).replace("'","''")+"'"
def main():
 def interrupted(*args):raise KeyboardInterrupt()
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted)
 timer=threading.Timer(180,lambda:os.kill(os.getpid(),signal.SIGINT));timer.daemon=True;timer.start()
 h=load('service_native_fixture',R/'tests/bookings-v1-pg17.py');report={'resultat':'NON_VERIFIE','tests':{},'base_active':False,'auth':'SIMULEE','concurrence':'DEUX_CONNEXIONS_POSTGRESQL_INDEPENDANTES'};stage='INITDB'
 def check(n,ok):
  report['controle_en_cours']=n
  if not ok:raise AssertionError(n)
  report['tests'][n]='PASS'
 try:
  with h.cluster() as sql:
   stage='CONTRAT_AUTH_JETABLE';sql("CREATE ROLE postgres LOGIN NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;ALTER DATABASE postgres OWNER TO postgres;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE supabase_admin NOLOGIN;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO postgres,anon,authenticated,service_role;GRANT SELECT,REFERENCES ON auth.users TO postgres;",'fixture_admin')
   stage='SOCLE_ET_MIGRATIONS';base=R.parent/'socle-local-revue-20261101-defaults/installation.proposed.sql';assert hashlib.sha256(base.read_bytes()).hexdigest()=='6ea052139c0eb373bf9046935be21cf5a2dcaa8479b1f8051804698bd69b0913';sql(base.read_text(),source='SOCLE_QUALIFIE_INCHANGE');sql((R/'tools/reservations-local/layout-save.proposed.sql').read_text(),source='RPC_LAYOUT_INCHANGEE');sql('CREATE SCHEMA IF NOT EXISTS extensions;CREATE EXTENSION btree_gist WITH SCHEMA extensions;GRANT USAGE ON SCHEMA extensions TO postgres;','fixture_admin');sql((R/'tools/reservations-v1/bookings.proposed.sql').read_text(),source='V1_INCHANGEE');sql((R/'tools/reservations-service/service.proposed.sql').read_text(),source='NOUVELLE_MIGRATION_SERVICE')
   stage='FIXTURES_FICTIVES';team,manager,est,foreign=[str(uuid.uuid4()) for _ in range(4)];sql(f"INSERT INTO auth.users VALUES('{team}','equipe@example.invalid'),('{manager}','gestionnaire@example.invalid')",'fixture_admin');sql(f"INSERT INTO public.profiles(id,email,role,actif,departement) VALUES('{team}','equipe@example.invalid','employe',true,'salle'),('{manager}','gestionnaire@example.invalid','employe',true,'salle');INSERT INTO public.reservation_establishments(id,name,booking_timezone,online_test_enabled) VALUES('{est}','FICTIF TEST','Europe/Brussels',true),('{foreign}','Autre fictif','Europe/Brussels',false);INSERT INTO public.reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings,can_manage_layouts,can_manage_rooms,can_manage_tables) VALUES('{est}','{team}',true,true,true,false,false,false),('{est}','{manager}',true,true,true,true,true,true);")
   def actor(text,who=team):return sql(h.actor_source(text,who),'authenticated',source='SERVICE:ACTEUR_NON_PRIVILEGIE')
   def call(text,who=team):return json.loads(actor('SELECT '+text,who))
   def anon(text):return sql('BEGIN;SET LOCAL ROLE anon;'+text+';COMMIT;','fixture_admin',source='SERVICE:FORMULAIRE_ANONYME')
   def denied(name,text,state='42501',anonymous=False):
    try:anon(text) if anonymous else actor(text)
    except h.Failure as e:check(name,e.sqlstate==state)
    else:raise AssertionError(name+'_ACCEPTE')
   rooms=[call(f"public.reservations_save_room('{est}',NULL,NULL,{q(n)},'',0,true)",manager)['id'] for n in ('Salle arrière','Premier étage')];tables=sorted(call(f"public.reservations_save_table('{est}','{rooms[0]}',NULL,NULL,{q('FICTIF '+str(i))},2,'round',true)",manager)['id'] for i in range(3));other=call(f"public.reservations_save_table('{est}','{rooms[1]}',NULL,NULL,'FICTIF 1',2,'round',true)",manager)['id'];sql(f"UPDATE public.reservation_layout_elements SET x=50,y=50 WHERE establishment_id='{est}' AND kind='table'")
   def group(ids,name):return call(f"public.reservations_service_group_save('{est}','{uuid.uuid4()}',NULL,'{rooms[0]}',{q(name)},ARRAY[{','.join(q(x) for x in ids)}]::uuid[])",manager)['id']
   g1,g2=group(tables[:2],'A+B'),group(tables[1:],'B+C');check('deux_jumelages_partagent_table_identifiee',g1!=g2)
   denied('equipe_ne_modifie_pas_jumelages',f"SELECT public.reservations_service_group_save('{est}','{uuid.uuid4()}',NULL,'{rooms[0]}','Interdit',ARRAY['{tables[0]}','{tables[1]}']::uuid[])")
   try:call(f"public.reservations_service_group_save('{est}','{uuid.uuid4()}',NULL,'{rooms[0]}','Etages',ARRAY['{tables[0]}','{other}']::uuid[])",manager)
   except h.Failure as e:check('jumelage_inter_etages_refuse',e.sqlstate=='22023')
   else:raise AssertionError('INTER_ETAGES_ACCEPTE')
   def expr(bid,resource,kind='group',start='12:00',end='14:00',version='NULL',covers=4,source='staff'):
    members={g1:tables[:2],g2:tables[1:]}.get(resource,[resource]);member_sql='ARRAY['+','.join(q(x) for x in members)+']::uuid[]';name='reservations_service_save' if source=='staff' else 'reservations_public_book';v=','+version if source=='staff' else '';return f"public.{name}('{est}','{bid}'{v},'{resource}','{kind}','Client fictif','+32470000001',NULL,'2027-12-10 {start}','2027-12-10 {end}',{covers},{member_sql})"
   single=call(expr(str(uuid.uuid4()),other,'table','08:00','10:00',covers=2));check('reservation_classique',single['member_table_ids']==[other])
   available=f"public.reservations_public_available('{est}','2027-12-10 12:00','2027-12-10 14:00',4)";check('deux_choix_avant_course',len(json.loads(anon('SELECT '+available)))==2)
   before=call(f"public.reservations_read('{est}')");stage='COURSE_EQUIPE_CONTRE_EN_LIGNE';barrier=threading.Barrier(2);bids=[str(uuid.uuid4()),str(uuid.uuid4())]
   def race(i):
    barrier.wait();text='SELECT '+expr(bids[i],[g1,g2][i],source='staff' if i==0 else 'web')
    try:output=actor(text+';SELECT pg_sleep(0.2)') if i==0 else anon(text+';SELECT pg_sleep(0.2)');return {'ok':True,'index':i}
    except h.Failure as e:return {'ok':False,'state':e.sqlstate,'index':i}
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(race,(0,1)))
   check('une_confirmation_simultanee',sum(o['ok'] for o in outcomes)==1);check('conflit_table_commune_23P01',next(o['state'] for o in outcomes if not o['ok'])=='23P01');winner=bids[next(o['index'] for o in outcomes if o['ok'])]
   check('aucune_occupation_partielle',json.loads(sql(f"SELECT json_build_object('bookings',(SELECT count(*) FROM public.reservation_bookings WHERE id IN ('{bids[0]}','{bids[1]}')),'allocations',(SELECT count(*) FROM public.reservation_booking_allocations WHERE booking_id IN ('{bids[0]}','{bids[1]}')) )"))=={'bookings':1,'allocations':2})
   check('complet_retire_en_ligne',json.loads(anon('SELECT '+available))==[])
   other_booking=call(expr(str(uuid.uuid4()),g2,start='16:00',end='18:00'));denied('deplacement_en_conflit_refuse','SELECT '+expr(winner,g1,start='16:00',end='18:00',version='1'),state='23P01');check('ancien_creneau_conserve',sql(f"SELECT starts_at=('2027-12-10 12:00'::timestamp AT TIME ZONE 'Europe/Brussels') FROM public.reservation_bookings WHERE id='{winner}'")=='t')
   call(f"public.reservations_cancel_booking('{est}','{winner}',1)");check('annulation_libere_tous_les_membres',sql(f"SELECT count(*) FROM public.reservation_booking_allocations WHERE booking_id='{winner}'")=='0');check('annulation_rouvre_en_ligne',len(json.loads(anon('SELECT '+available)))==2)
   denied('autre_etablissement_refuse',f"SELECT public.reservations_service_day('{foreign}','2027-12-10')");denied('annuaire_inaccessible_public',f"SELECT public.reservations_service_clients('{est}','+32470000001')",anonymous=True);denied('table_clients_inaccessible_public','SELECT * FROM public.reservation_clients',anonymous=True);denied('public_non_active_refuse',f"SELECT public.reservations_public_available('{foreign}','2027-12-10 12:00','2027-12-10 14:00',2)",anonymous=True)
   denied('equipe_ne_modifie_pas_le_plan',f"SELECT public.reservations_service_plan_save('{est}','{rooms[0]}','{uuid.uuid4()}',1,'[]','[]')");denied('pas_de_truncate','TRUNCATE public.reservation_booking_allocations')
   check('fiche_telephone_normalise',call(f"public.reservations_service_clients('{est}','0470 00 00 01')")['client']['phone']=='+32470000001');check('historique_lie',len(call(f"public.reservations_service_clients('{est}','0470000001')")['history'])==3)
   check('identites_positions_inchangees',call(f"public.reservations_read('{est}')")==before)
   report['resultat']='PASS_POSTGRESQL_SERVICE_JUMELAGES'
 except BaseException as e:report['erreur']={'etape':stage,'type':type(e).__name__,'sqlstate':getattr(e,'sqlstate',None),'diagnostic':getattr(e,'diagnostic',None),'categories':getattr(e,'flags',None)}
 report['nettoyage']=h.D.get('nettoyage');report['arret_cluster']=h.D.get('arret_cluster');report['repertoires_conserves']=h.D.get('repertoires_fixture',[]);clean=report['arret_cluster']=='CONFIRME' and report['nettoyage']=='REPERTOIRES_CREES_SUPPRIMES'
 if report['resultat']=='PASS_POSTGRESQL_SERVICE_JUMELAGES' and not clean:report['resultat']='TEST_PASS_NETTOYAGE_NON_CONFIRME'
 timer.cancel();print(json.dumps(report));return 0 if report['resultat']=='PASS_POSTGRESQL_SERVICE_JUMELAGES' and clean else 1
if __name__=='__main__':raise SystemExit(main())
