"""Targeted follow-up: an informational departure never reassigns a table."""
import importlib.util,json,pathlib,uuid,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ops',ROOT/'tests/service-operations-pg17.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
def main():
 results=[];stage='CLUSTER';u=lambda:str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
 def ok(n,v):
  if not v:raise AssertionError(n)
  results.append(n)
 try:
  with ops.cluster() as sql:
   sql((ROOT/'supabase/pilot/service-presence.sql').read_text(),label='PRESENCE')
   stage='INFORMATION'
   if not os.environ.get('STOPFLOW_TEST_INFO_BASELINE'):sql((ROOT/'supabase/pilot/service-departure-information.sql').read_text(),label=stage)
   actor,est,room,t1,t2=[u() for _ in range(5)]
   sql(f"INSERT INTO profiles VALUES('{actor}',true);INSERT INTO reservation_establishments(id,name,booking_timezone) VALUES('{est}','FICTIF','Europe/Brussels');INSERT INTO reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings) VALUES('{est}','{actor}',true,true,true);INSERT INTO reservation_rooms(id,establishment_id,name) VALUES('{room}','{est}','Restaurant & Taverne');INSERT INTO reservation_tables(id,establishment_id,room_id,label,capacity,shape) VALUES('{t1}','{est}','{room}','1',2,'round'),('{t2}','{est}','{room}','2',2,'round');")
   def rpc(fn,args):
    out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+q(actor)+';SELECT public.'+fn+'('+','.join(args)+');COMMIT;',label=fn)
    return json.loads(next(x for x in out.splitlines() if x.startswith('{')))
   def save(p,req=None):return rpc('reservations_service_confirm',[q(est),q(req or u()),q(json.dumps(p))+'::jsonb'])
   def p(**kw):return dict(dict(id=u(),version=None,room=room,mode='auto',name='FICTIF',phone='+32470000001',email='',start='2027-12-20T12:00',end=None,covers=2,note='',departure_explicit=False),**kw)
   a,b=save(p()),save(p());m=p(id=b['id'],version=b['version'],mode='manual',ids=[a['table_id']]);ev=rpc('reservations_service_preview',[q(est),q(json.dumps(m))+'::jsonb']);b=save(dict(m,confirmation=ev['token'],shared_confirmed=True))
   before=sql(f"SELECT md5(to_jsonb(d)::text) FROM private.reservation_manual_decisions d WHERE id='{b['manual_decision']}'")
   aa=save(p(id=a['id'],version=a['version'],mode='keep',end='2027-12-20T14:30',departure_explicit=True))
   ok('depart_prevu_automatique_conserve_table_partagee',aa['member_table_ids']==a['member_table_ids'] and aa['presence_state']=='expected')
   req=u();pb=p(id=b['id'],version=b['version'],mode='keep',end='2027-12-20T15:00',departure_explicit=True);bb=save(pb,req)
   ok('depart_prevu_manuel_conserve_attribution_decision',bb['member_table_ids']==b['member_table_ids'] and bb['manual_decision']==b['manual_decision'])
   ok('preuve_historique_non_reecrite',before==sql(f"SELECT md5(to_jsonb(d)::text) FROM private.reservation_manual_decisions d WHERE id='{b['manual_decision']}'"))
   ok('reponse_perdue_reprise_identique',save(pb,req)==bb)
   try:save(p(id=bb['id'],version=bb['version'],mode='keep',end='2027-12-20T15:00',departure_explicit=True,covers=3))
   except Exception as e:ok('capacite_reste_a_reconfirmer',getattr(e,'sqlstate',None)=='23514')
   else:raise AssertionError('CAPACITE_ACCEPTEE')
   gone=rpc('reservations_service_presence',[q(est),q(u()),q(bb['id']),str(bb['version']),q('departed')]);edited=save(p(id=gone['id'],version=gone['version'],mode='keep',end='2027-12-20T16:00',departure_explicit=True,note='Note après départ'))
   ok('depart_info_ne_reoccupe_pas_parti',edited['presence_state']=='departed' and sql(f"SELECT count(*) FROM reservation_booking_allocations WHERE booking_id='{edited['id']}'")=='0')
   ok('autre_partage_reste_occupe',sql(f"SELECT count(*) FROM reservation_booking_allocations WHERE booking_id='{aa['id']}'")=='1')
  print(json.dumps(dict(resultat='PASS',groupes=len(results),controles=results,moteur='PG17_JETABLE',auth='SIMULEE',pilote=False)))
 except Exception as e:
  print(json.dumps(dict(resultat='ECHEC',etape=stage,type=type(e).__name__,motif=str(e),sqlstate=getattr(e,'sqlstate',None),detail=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
