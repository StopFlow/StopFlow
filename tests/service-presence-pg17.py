"""New service/presence rules, real disposable PG17, simulated Auth only."""
import concurrent.futures, importlib.util, json, pathlib, threading, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ops',ROOT/'tests/service-operations-pg17.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
def main():
    results=[];stage='CLUSTER';uid=lambda:str(uuid.uuid4());q=lambda x:"'"+str(x).replace("'","''")+"'"
    def check(name,value):
        if not value:raise AssertionError(name)
        results.append(name)
    try:
        with ops.cluster() as sql:
            stage='FIXTURES';actor,reader,other_actor,est,other,room,*tables=[uid() for _ in range(11)]
            sql(f"INSERT INTO profiles VALUES('{actor}',true),('{reader}',true),('{other_actor}',true);INSERT INTO reservation_establishments(id,name,booking_timezone) VALUES('{est}','FICTIF','Europe/Brussels'),('{other}','AUTRE','Europe/Brussels');INSERT INTO reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings,can_manage_rooms) VALUES('{est}','{actor}',true,true,true,true),('{est}','{reader}',true,true,false,false),('{other}','{other_actor}',true,true,true,false);INSERT INTO reservation_rooms(id,establishment_id,name) VALUES('{room}','{est}','Restaurant & Taverne');"+''.join(f"INSERT INTO reservation_tables(id,establishment_id,room_id,label,capacity,shape) VALUES('{t}','{est}','{room}','{i+1}',2,'round');" for i,t in enumerate(tables)))
            def call(fn,args,who=actor,role='authenticated',hold=0):
                out=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';SELECT public.'+fn+'('+','.join(args)+');'+(f'SELECT pg_sleep({hold});' if hold else '')+'COMMIT;',label=fn)
                return json.loads(next(x for x in out.splitlines() if x.startswith(('{','['))))
            def payload(day='2027-12-10',**kw):
                return dict(dict(id=uid(),version=None,room=room,mode='auto',name='FICTIF',phone='+32470000001',email='',start=day+'T12:00',end=None,covers=2,note='Note fictive',departure_explicit=False),**kw)
            def save(p,req=None,who=actor,hold=0):return call('reservations_service_confirm',[q(est),q(req or uid()),q(json.dumps(p))+'::jsonb'],who,hold=hold)
            def denied(name,action,state):
                try:action()
                except Exception as e:check(name,getattr(e,'sqlstate',None)==state)
                else:raise AssertionError(name+'_ACCEPTE')
            # Install after an actual legacy record; prove historical bytes stay intact.
            old=payload(end='2027-12-10T14:00');historical=save(old)
            digest=sql("SELECT md5(jsonb_agg(to_jsonb(b) ORDER BY id)::text) FROM reservation_bookings b")
            stage='MIGRATION';sql((ROOT/'supabase/pilot/service-presence.sql').read_text(),label=stage)
            check('historique_inchange',digest==sql("SELECT md5(jsonb_agg(to_jsonb(b)-ARRAY['presence_state','arrived_at','departed_at','arrived_by','departed_by'] ORDER BY id)::text) FROM reservation_bookings b"))
            preserved=save(dict(old,version=historical['version'],mode='keep',end=None,note='Note historique modifiée'))
            check('ancien_horaire_conserve_apres_note',preserved['starts_at']==historical['starts_at'] and preserved['ends_at']==historical['ends_at'])
            stage='OCCUPATION';a=save(payload('2027-12-11'));check('depart_inconnu_NULL',a['ends_at'] is None and not a['departure_explicit'])
            later=save(payload('2027-12-11',start='2027-12-11T15:30'));check('apres_plus_de_deux_heures_reste_occupe',later['table_id']!=a['table_id'])
            evening=save(payload('2027-12-11',start='2027-12-11T16:30'));check('separation_midi_soir',evening['table_id']==a['table_id'])
            def presence(b,state,req=None,who=actor):return call('reservations_service_presence',[q(est),q(req or uid()),q(b['id']),str(b['version']),q(state)],who)
            req=uid();arrived=presence(a,'arrived',req);check('arrive_auteur_horodatage',arrived['presence_state']=='arrived' and arrived['arrived_by']==actor and arrived['arrived_at'])
            check('double_clic_idempotent',presence(a,'arrived',req)==arrived)
            denied('lecteur_presence_refuse',lambda:presence(arrived,'departed',who=reader),'42501')
            denied('autre_etablissement_presence_refuse',lambda:presence(arrived,'departed',who=other_actor),'42501')
            denied('version_perimee_refusee',lambda:presence(a,'departed'),'40001')
            gone=presence(arrived,'departed');check('parti_conserve_historique',gone['status']=='confirmed' and gone['member_table_ids']==a['member_table_ids'] and gone['departed_by']==actor and gone['departed_at'])
            reuse=save(payload('2027-12-11'));check('parti_libere_table',reuse['table_id']==a['table_id'])
            edited=save(dict(payload('2027-12-11'),id=gone['id'],version=gone['version'],mode='keep',note='Note après départ'))
            check('note_ne_reoccupe_pas',edited['presence_state']=='departed' and sql(f"SELECT count(*) FROM reservation_booking_allocations WHERE booking_id='{gone['id']}'")=='0')
            day=call('reservations_service_day',[q(est),q('2027-12-11')]);check('totaux_historique_conserves',len(day)==4 and sum(b['covers'] for b in day)==8)
            def place(b,ids,confirm=True,evidence=None):
                p=dict(payload(b['starts_at'][:10]),id=b['id'],version=b['version'],start=ops.datetime.datetime.fromisoformat(b['starts_at']).astimezone(ops.zoneinfo.ZoneInfo('Europe/Brussels')).strftime('%Y-%m-%dT%H:%M'),mode='manual',ids=ids)
                ev=evidence or call('reservations_service_preview',[q(est),q(json.dumps(p))+'::jsonb'])
                return save(dict(p,confirmation=ev['token'],shared_confirmed=confirm)),ev
            stage='PARTAGE';shared,ev=place(later,[reuse['table_id']]);check('partage_meme_service_preuve',len(ev['reservations'])==1 and ev['reservations'][0]['overlap'] is None)
            presence(reuse,'departed');another=save(payload('2027-12-11'));check('depart_un_partage_ne_libere_pas_autre',another['table_id']!=shared['table_id'])
            stage='REMPLACEMENT';r=save(payload('2027-12-12'));r,_=place(r,tables[:3]);r,_=place(r,[tables[0],tables[2],tables[4]])
            check('remplacement_exact_123_135',set(r['member_table_ids'])=={tables[0],tables[2],tables[4]} and sql(f"SELECT count(*) FROM reservation_booking_allocations WHERE booking_id='{r['id']}'")=='3')
            pp=dict(payload('2027-12-12'),id=r['id'],version=r['version'],mode='manual',ids=[tables[1]])
            proof=call('reservations_service_preview',[q(est),q(json.dumps(pp))+'::jsonb']);presence(r,'arrived')
            denied('placement_concurrent_refuse',lambda:save(dict(pp,confirmation=proof['token'],shared_confirmed=True)),'40001')
            stage='CONCURRENCE';barrier=threading.Barrier(2)
            # Only one physical table has enough seats; second becomes À placer.
            sql(f"UPDATE reservation_tables SET capacity=10 WHERE id='{tables[0]}'")
            def race(i):barrier.wait();return save(payload('2027-12-13',covers=8),hold=.1)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rr=list(pool.map(race,[0,1]))
            check('confirmations_concurrentes_une_attribution',sum(bool(x['table_id']) for x in rr)==1 and sum(x['placement_state']=='unplaced' for x in rr)==1)
            unplaced=next(x for x in rr if not x['table_id']);au=presence(unplaced,'arrived');check('arrive_reste_a_placer',au['presence_state']=='arrived' and au['placement_state']=='unplaced')
            stage='DROITS_ET_FERMETURES'
            denied('anonyme_presence_refusee',lambda:call('reservations_service_presence',[q(est),q(uid()),q(r['id']),str(r['version']),q('departed')],role='anon'),'42501')
            denied('ecriture_directe_refusee',lambda:sql("BEGIN;SET LOCAL ROLE authenticated;UPDATE reservation_bookings SET presence_state='departed';COMMIT;"),'42501')
            cl=dict(id=uid(),version=None,first='2027-12-14',last='2027-12-14',service='soir',active=True)
            call('reservations_service_close',[q(est),q(uid()),q(json.dumps(cl))+'::jsonb'])
            denied('fermeture_sans_table_refusee',lambda:save(payload('2027-12-14',start='2027-12-14T19:00',covers=999)),'23514')
            unknown=save(payload('2027-12-16',end='2027-12-16T09:00'))
            check('aucune_fin_cachee_acceptee',unknown['ends_at'] is None)
            stage='COMPATIBILITE';legacy=call('reservations_save_booking',[q(est),q(uid()),'NULL',q(room),q(tables[1]),q('FICTIF'),q('2027-12-15 12:00'),'NULL','2'])
            check('ancienne_rpc_sans_faux_depart',legacy['ends_at'] is None and legacy['departure_explicit'] is False)
            choices=call('reservations_service_available',[q(est),q('2027-12-15 15:00'),'NULL','2','NULL']);check('disponibilites_anciennes_meme_service',all(tables[1] not in c['ids'] for c in choices))
            check('aucun_nouveau_range_artificiel',sql("SELECT count(*) FROM reservation_booking_allocations a JOIN reservation_bookings b ON b.id=a.booking_id WHERE b.id<>"+q(historical['id'])+" AND a.occupied IS NOT NULL")=='0')
        print(json.dumps(dict(resultat='PASS',groupes=len(results),controles=results,moteur='PG17_JETABLE',auth='SIMULEE',pilote=False)))
    except Exception as e:
        print(json.dumps(dict(resultat='ECHEC',etape=stage,type=type(e).__name__,motif=str(e),sqlstate=getattr(e,'sqlstate',None),detail=getattr(e,'safe',None))));raise
if __name__=='__main__':main()
