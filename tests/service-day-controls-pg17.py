"""Targeted day/service reopening. Disposable cluster, synthetic Auth only."""
import importlib.util,json,pathlib,uuid,concurrent.futures,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ops',ROOT/'tests/service-operations-pg17.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
def main():
 checks=[];stage='CLUSTER';u=lambda:str(uuid.uuid4());q=lambda v:"'"+str(v).replace("'","''")+"'"
 def ok(n,v):
  if not v:raise AssertionError(n)
  checks.append(n)
 try:
  with ops.cluster() as sql:
   for f in ['service-presence.sql','service-departure-information.sql','service-initial-placement.sql','service-day-controls.sql']:
    stage=f;sql((ROOT/'supabase/pilot'/f).read_text(),label=f)
   actor,reader,other,est,foreign,room,t1=[u() for _ in range(7)]
   sql(f"INSERT INTO profiles VALUES('{actor}',true),('{reader}',true),('{other}',true);INSERT INTO reservation_establishments(id,name,booking_timezone) VALUES('{est}','FICTIF','Europe/Brussels'),('{foreign}','AUTRE','Europe/Brussels');INSERT INTO reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings,can_manage_rooms) VALUES('{est}','{actor}',true,true,true,true),('{est}','{reader}',true,true,true,false);INSERT INTO reservation_rooms(id,establishment_id,name) VALUES('{room}','{est}','Restaurant & Taverne');INSERT INTO reservation_tables(id,establishment_id,room_id,label,capacity,shape) VALUES('{t1}','{est}','{room}','1',2,'round');")
   def rpc(fn,args,who=actor,role='authenticated',hold=False):
    out=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';'+("SET LOCAL application_name='fixture_closure_race';" if hold else '')+'SELECT public.'+fn+'('+','.join(args)+');'+('SELECT pg_sleep(1);' if hold else '')+'COMMIT;',label=fn)
    return json.loads(next(x for x in out.splitlines() if x.startswith('{')))
   def state(day):return rpc('reservations_service_state',[q(est),q(day)])
   def applicable(day,svc):return [c for c in state(day)['closures'] if c['active'] and c['service'] in ['tous',svc]]
   def shut(day,svc):return bool(applicable(day,svc))
   def direct(day,svc,active,expected=None,request=None,who=actor,hold=False):
    p=dict(mode='day',day=day,service=svc,active=active,expected=expected if expected is not None else [dict(id=c['id'],version=c['version']) for c in applicable(day,svc)])
    return rpc('reservations_service_close',[q(est),q(request or u()),q(json.dumps(p))+'::jsonb'],who=who,hold=hold)
   def period(first,last,svc):
    p=dict(id=u(),version=None,first=first,last=last,service=svc,active=True);return rpc('reservations_service_close',[q(est),q(u()),q(json.dumps(p))+'::jsonb'])
   def booking(start='2027-12-21T12:00',**kw):return dict(dict(id=u(),version=None,room=room,mode='auto',name='FICTIF',phone='+32470000001',email='',start=start,end=None,covers=2,note='',departure_explicit=False),**kw)
   def save(p,who=actor):return rpc('reservations_service_confirm',[q(est),q(u()),q(json.dumps(p))+'::jsonb'],who=who)
   def deny(n,call,code):
    try:call()
    except Exception as e:ok(n,getattr(e,'sqlstate',None)==code)
    else:raise AssertionError(n+'_ACCEPTE')
   b=save(booking());before=sql('SELECT md5(string_agg(to_jsonb(t)::text,\'\' ORDER BY id)) FROM reservation_bookings t')
   old=period('2027-12-20','2027-12-22','tous')
   deny('ancienne_api_refuse_portee_jour_sur_periode',lambda:rpc('reservations_service_close',[q(est),q(u()),q(json.dumps(dict(id=old['id'],version=old['version'],first='2027-12-21',last='2027-12-21',service='midi',active=False)))+'::jsonb']),'22023')
   ok('refus_portee_ne_modifie_pas_periode',sql(f"SELECT active AND version=1 FROM reservation_service_closures WHERE id='{old['id']}'")=='t')
   opened=direct('2027-12-21','midi',False)
   ok('reouverture_unique_jour_service',not opened['closed'] and not shut('2027-12-21','midi') and shut('2027-12-21','soir'))
   ok('jours_avant_apres_restent_fermes',all(shut(day,svc) for day in ['2027-12-20','2027-12-22'] for svc in ['midi','soir']))
   ok('ancienne_periode_conservee_historique',sql(f"SELECT NOT active AND version=2 FROM reservation_service_closures WHERE id='{old['id']}'")=='t')
   req=u();expected=[];r=direct('2027-12-21','midi',True,expected,req);count=sql('SELECT count(*) FROM reservation_service_closures')
   ok('reponse_perdue_reprise_sans_doublon',direct('2027-12-21','midi',True,expected,req)==r and count==sql('SELECT count(*) FROM reservation_service_closures'))
   deny('ancien_etat_refuse_sans_ecriture',lambda:direct('2027-12-21','midi',False,expected=[]),'40001')
   ok('conflit_ne_rouvre_pas',shut('2027-12-21','midi'))
   for name,p in [('automatique',booking()),('sans_table',booking(covers=999)),('manuel',booking(mode='manual',ids=[t1]))]:
    if name=='manuel':ev=rpc('reservations_service_preview',[q(est),q(json.dumps(p))+'::jsonb']);p.update(confirmation=ev['token'],shared_confirmed=True)
    deny('creation_fermee_'+name,lambda p=p:save(p),'23514')
   aa=rpc('reservations_service_presence',[q(est),q(u()),q(b['id']),str(b['version']),q('arrived')]);bb=rpc('reservations_service_presence',[q(est),q(u()),q(b['id']),str(aa['version']),q('departed')]);ok('arrive_parti_restent_possibles_service_ferme',bb['presence_state']=='departed' and bb['status']=='confirmed')
   direct('2027-12-21','midi',False);ok('tous_partiel_autorise_seulement_midi',save(booking())['id'] and shut('2027-12-21','soir'))
   deny('soir_1630_reste_ferme',lambda:save(booking(start='2027-12-21T16:30')),'23514')
   period('2027-12-20','2027-12-22','midi');direct('2027-12-21','midi',False);ok('reouverture_enleve_toutes_fermetures_recouvrantes',not shut('2027-12-21','midi') and shut('2027-12-20','midi') and shut('2027-12-22','midi'))
   deny('gestionnaire_reservations_sans_rooms_manage_refuse',lambda:direct('2027-12-21','midi',True,who=reader),'42501')
   deny('autre_utilisateur_refuse',lambda:direct('2027-12-21','midi',True,who=other),'42501')
   deny('anonyme_refuse',lambda:rpc('reservations_service_close',[q(est),q(u()),q('{}')+'::jsonb'],who='',role='anon'),'42501')
   deny('ecriture_directe_refusee',lambda:sql('BEGIN;SET LOCAL ROLE authenticated;UPDATE reservation_service_closures SET active=false;COMMIT;'),'42501')
   # A closure commits while the independent confirmation waits for the same establishment lock.
   day='2027-12-29'
   with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
    task=pool.submit(direct,day,'soir',True,[],None,actor,True)
    for _ in range(30):
     if sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='fixture_closure_race' AND wait_event='PgSleep')")=='t':break
     time.sleep(.01)
    else:raise AssertionError('BARRIERE_CONCURRENCE_NON_ATTEINTE')
    deny('fermeture_concurrente_bloque_confirmation',lambda:save(booking(start=day+'T18:00')),'23514');task.result()
   ok('aucune_reservation_concurrente_inseree',sql("SELECT count(*) FROM reservation_bookings WHERE starts_at::date='2027-12-29'")=='0')
   ok('geometrie_non_modifiee',sql(f"SELECT label='1' AND capacity=2 FROM reservation_tables WHERE id='{t1}'")=='t')
  print(json.dumps(dict(resultat='PASS',groupes=len(checks),controles=checks,moteur='POSTGRESQL_17_JETABLE',auth='SIMULEE',pilote=False)))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,type=type(e).__name__,motif=str(e),sqlstate=getattr(e,'sqlstate',None),detail=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
