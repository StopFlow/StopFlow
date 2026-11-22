"""Only the initial manual selection extension; no pilot data or real Auth."""
import importlib.util,json,pathlib,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ops',ROOT/'tests/service-operations-pg17.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
def main():
 results=[];stage='CLUSTER';u=lambda:str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
 def ok(n,v):
  if not v:raise AssertionError(n)
  results.append(n)
 try:
  with ops.cluster() as sql:
   for f in ['service-presence.sql','service-departure-information.sql','service-initial-placement.sql']:
    stage=f;sql((ROOT/'supabase/pilot'/f).read_text(),label=f)
   actor,other,est,foreign,room,fr,t1,t2,t3,ft=[u() for _ in range(10)]
   sql(f"INSERT INTO profiles VALUES('{actor}',true),('{other}',true);INSERT INTO reservation_establishments(id,name,booking_timezone) VALUES('{est}','FICTIF','Europe/Brussels'),('{foreign}','AUTRE FICTIF','Europe/Brussels');INSERT INTO reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings) VALUES('{est}','{actor}',true,true,true);INSERT INTO reservation_rooms(id,establishment_id,name) VALUES('{room}','{est}','Restaurant & Taverne'),('{fr}','{foreign}','AUTRE');INSERT INTO reservation_tables(id,establishment_id,room_id,label,capacity,shape) VALUES('{t1}','{est}','{room}','1',2,'round'),('{t2}','{est}','{room}','2',2,'round'),('{t3}','{est}','{room}','3',2,'round'),('{ft}','{foreign}','{fr}','X',2,'round');")
   def rpc(fn,p,request=None,who=actor,role='authenticated'):
    args=q(est)+','+(q(request)+',' if request else '')+q(json.dumps(p))+'::jsonb'
    out=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';SELECT public.'+fn+'('+args+');COMMIT;',label=fn)
    return json.loads(next(x for x in out.splitlines() if x.startswith('{')))
   def reject(name,fn,state):
    try:fn()
    except Exception as e:ok(name,getattr(e,'sqlstate',None)==state)
    else:raise AssertionError(name+'_ACCEPTE')
   def payload(**kw):return dict(dict(id=u(),version=None,room=room,mode='manual',ids=[t1,t2],name='FICTIF',phone='+32470000001',email='',start='2027-12-20T12:00',end=None,covers=4,note='',departure_explicit=False),**kw)
   p=payload();ev=rpc('reservations_service_preview',p);ok('nouvelle_selection_verifiee_sans_creation',ev['capacity']==4 and sql('SELECT count(*) FROM reservation_bookings')=='0')
   req=u();p.update(confirmation=ev['token'],shared_confirmed=False);b=rpc('reservations_service_confirm',p,req);ok('creation_manuelle_atomique_relecture',set(b['member_table_ids'])=={t1,t2} and b['assignment_mode']=='manual' and b['ends_at'] is None)
   ok('auteur_decision_et_preuve_durables',sql(f"SELECT count(*) FROM private.reservation_manual_decisions WHERE booking_id='{b['id']}' AND actor='{actor}'")=='1')
   ok('reponse_perdue_meme_intention_sans_doublon',rpc('reservations_service_confirm',p,req)==b and sql('SELECT count(*) FROM reservation_bookings')=='1')
   p2=payload();ev2=rpc('reservations_service_preview',p2);p2.update(confirmation=ev2['token']);reject('partage_sans_confirmation_refuse',lambda:rpc('reservations_service_confirm',p2,u()),'23514');p2['shared_confirmed']=True;bb=rpc('reservations_service_confirm',p2,u());ok('partage_explicite_conserve_auteur',bb['assignment_mode']=='manual')
   stale=payload(ids=[t3],covers=2);old=rpc('reservations_service_preview',stale);sql(f"UPDATE reservation_tables SET capacity=3 WHERE id='{t3}'");stale.update(confirmation=old['token']);reject('preuve_perimee_refusee',lambda:rpc('reservations_service_confirm',stale,u()),'40001')
   reject('tables_autre_etablissement_refusees',lambda:rpc('reservations_service_preview',payload(ids=[ft])),'22023')
   reject('autre_identite_refusee',lambda:rpc('reservations_service_preview',payload(),who=other),'42501')
   reject('anonyme_refuse',lambda:rpc('reservations_service_preview',payload(),who='',role='anon'),'42501')
   reject('version_absente_pour_existant_refusee',lambda:rpc('reservations_service_preview',payload(id=b['id'])),'40001')
   manual=payload(id=b['id'],version=b['version'],ids=[t2,t3]);ev3=rpc('reservations_service_preview',manual);manual.update(confirmation=ev3['token'],shared_confirmed=True);moved=rpc('reservations_service_confirm',manual,u());ok('deplacement_remplace_source_conserve_autres',set(moved['member_table_ids'])=={t2,t3})
   reject('ancienne_version_refusee',lambda:rpc('reservations_service_confirm',manual,u()),'40001')
   auto=payload(mode='auto',ids=[],start='2027-12-20T19:00',covers=2);aa=rpc('reservations_service_confirm',auto,u());ok('attribution_automatique_inchangee',aa['assignment_mode']=='automatic' and len(aa['member_table_ids'])==1)
  print(json.dumps(dict(resultat='PASS',groupes=len(results),controles=results,moteur='PG17_JETABLE',auth='SIMULEE',pilote=False)))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,type=type(e).__name__,motif=str(e),sqlstate=getattr(e,'sqlstate',None),detail=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
