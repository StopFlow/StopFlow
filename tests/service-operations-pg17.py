"""Disposable PG17 only. Real reservation migrations, simulated Auth contract."""
import datetime,zoneinfo,concurrent.futures,contextlib,json,os,pathlib,re,shutil,subprocess,tempfile,threading,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
@contextlib.contextmanager
def cluster():
    bindir=pathlib.Path(os.environ.get('STOPFLOW_TEST_PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
    base=pathlib.Path(tempfile.mkdtemp(prefix='sf-ops-',dir='/private/tmp' if pathlib.Path('/private/tmp').exists() else '/tmp'))
    sock=base/'s';sock.mkdir(mode=0o700);data=base/'data';started=False;report={}
    assert len(os.fsencode(str(sock/' .s.PGSQL.55489').replace('/ ','/')))<104
    def command(args,source='CLUSTER'):
        p=subprocess.run(args,input=None,text=True,capture_output=True,timeout=45)
        if p.returncode:raise RuntimeError(source+':'+str(p.returncode)+':'+re.sub(r'[^a-zA-Z0-9_ ]',' ',p.stderr[-300:]))
        return p.stdout
    def sql(source,role='fixture_admin',label='ASSERTION'):
        p=subprocess.run([str(bindir/'psql'),'-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',str(sock),'-p','55489','-U',role,'-d','postgres','-At'],input=source,text=True,capture_output=True,timeout=40,env={k:v for k,v in os.environ.items() if not k.startswith('PG')})
        if p.returncode:
            state=re.search(r'(?:ERROR|FATAL):\s+([A-Z0-9]{5}):',p.stderr);err=RuntimeError(label);err.sqlstate=state.group(1) if state else None;err.safe=re.sub(r'\b[0-9a-f]{8}-[0-9a-f-]{27,}\b','UUID',p.stderr[-900:]);raise err
        return p.stdout.strip()
    try:
        command([str(bindir/'initdb'),'-D',str(data),'-U','fixture_admin','-A','trust','--no-locale','--encoding=UTF8'],'INITDB')
        command([str(bindir/'pg_ctl'),'-D',str(data),'-l',str(base/'pg.log'),'-o',f"-k {sock} -p 55489 -c listen_addresses=''",'-w','start'],'START');started=True
        sql("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA private;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE public.profiles(id uuid PRIMARY KEY,actif boolean NOT NULL);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth,private TO authenticated,anon;")
        for file in ['supabase/migrations/20261017120000_stopflow_reservations_foundation.sql','tools/reservations-local/layout-save.proposed.sql']:
            sql((ROOT/file).read_text(),label=file)
        sql('CREATE SCHEMA extensions;CREATE EXTENSION btree_gist WITH SCHEMA extensions;')
        for file in ['tools/reservations-v1/bookings.proposed.sql','tools/reservations-service/service.proposed.sql','supabase/pilot/service-operations.sql']:
            sql((ROOT/file).read_text(),label=file)
        yield sql
    finally:
        if started:
            p=subprocess.run([str(bindir/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],capture_output=True,text=True,timeout=35)
            stopped=p.returncode==0
        else:stopped=True
        if stopped:shutil.rmtree(base);report['nettoyage']='CLUSTER_ARRETE_REPERTOIRE_SUPPRIME'
        else:report['nettoyage']='ARRET_NON_CONFIRME_REPERTOIRE_CONSERVE'
        print(json.dumps(report),flush=True)

def main():
    results=[];stage='PREPARATION';q=lambda s:"'"+str(s).replace("'","''")+"'";uid=lambda:str(uuid.uuid4())
    def check(n,b):
        if not b:raise AssertionError(n)
        results.append(n)
    try:
        with cluster() as sql:
            stage='FIXTURES';actor,reader,outsider,est,other,room,tid,t2,t3,group=[uid() for _ in range(10)]
            sql(f"INSERT INTO profiles VALUES('{actor}',true),('{reader}',true),('{outsider}',true);INSERT INTO reservation_establishments(id,name,booking_timezone) VALUES('{est}','Synthétique','Europe/Brussels'),('{other}','Autre','Europe/Brussels');INSERT INTO reservation_memberships(establishment_id,profile_id,can_view,can_view_bookings,can_manage_bookings,can_manage_rooms) VALUES('{est}','{actor}',true,true,true,true),('{est}','{reader}',true,true,false,false),('{other}','{outsider}',true,true,true,false);INSERT INTO reservation_rooms(id,establishment_id,name) VALUES('{room}','{est}','Restaurant & Taverne');INSERT INTO reservation_tables(id,establishment_id,room_id,label,capacity,shape) VALUES('{tid}','{est}','{room}','1',2,'round'),('{t2}','{est}','{room}','2',2,'round'),('{t3}','{est}','{room}','3',2,'round');INSERT INTO reservation_table_groups(id,establishment_id,room_id,name,table_ids) VALUES('{group}','{est}','{room}','1 + 2',ARRAY['{tid}','{t2}']::uuid[]);")
            def run(expr,who=actor,role='authenticated',hold=0):
                lines=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+q(who)+';SELECT '+expr+';'+('SELECT pg_sleep('+str(hold)+');' if hold else '')+'COMMIT;',label='RPC_'+expr.split('(')[0]).splitlines()
                return next((x for x in lines if x.startswith(('{','['))),lines[-2] if len(lines)>1 else '')
            def call(fn,args,who=actor,role='authenticated',hold=0):return json.loads(run('public.'+fn+'('+','.join(args)+')',who,role,hold))
            def payload(**kw):return dict(id=uid(),version=None,room=room,mode='auto',name='FICTIF',phone='+32470000001',email='',start='2027-12-10T12:00',end='2027-12-10T14:00',covers=2,note='Note synthétique',departure_explicit=False,**kw)
            def save(p,request=None,who=actor,hold=0):return call('reservations_service_confirm',[q(est),q(request or uid()),q(json.dumps(p))+'::jsonb'],who,hold=hold)
            def denied(n,fn,state):
                try:fn()
                except Exception as e:check(n,getattr(e,'sqlstate',None)==state)
                else:raise AssertionError(n+'_ACCEPTE')
            stage='AUTOMATIQUE';p=payload();req=uid();a=save(p,req);check('simple_et_note',a['table_id'] and a['note']==p['note']);check('reprise_identique',save(p,req)==a)
            denied('recu_autre_payload',lambda:save(dict(p,note='Autre'),req),'40001')
            b=save(dict(payload(),start='2027-12-10T14:00',end='2027-12-10T16:00'));check('auto_pas_reemploi_meme_service',b['table_id']!=a['table_id'])
            c=save(payload());u=save(payload());check('a_placer_sans_table',u['placement_state']=='unplaced' and u['table_id'] is None and u['member_table_ids']==[])
            check('lecture_a_placer',any(x['id']==u['id'] for x in call('reservations_service_day',[q(est),q('2027-12-10')])))
            stage='MANUEL';mp=dict(payload(),id=u['id'],version=u['version'],mode='manual',ids=[a['table_id']]);e=call('reservations_service_preview',[q(est),q(json.dumps(mp))+'::jsonb']);check('conflits_explicitement_exposes',len(e['reservations'])>=1)
            denied('partage_non_confirme',lambda:save(dict(mp,confirmation=e['token'])),'23514')
            m=save(dict(mp,confirmation=e['token'],shared_confirmed=True));check('partage_trace',m['assignment_mode']=='manual' and m['manual_decision'])
            check('decision_auteur',sql(f"SELECT actor='{actor}'::uuid FROM private.reservation_manual_decisions WHERE id='{m['manual_decision']}'")=='t')
            stale=dict(mp,id=c['id'],version=c['version']);es=call('reservations_service_preview',[q(est),q(json.dumps(stale))+'::jsonb']);save(dict(payload(),id=a['id'],version=a['version'],mode='keep',name='Nom modifié'))
            denied('preuve_perimee_refusee',lambda:save(dict(stale,confirmation=es['token'],shared_confirmed=True)),'40001')
            seq=save(dict(payload(),start='2027-12-10T14:00',end='2027-12-10T16:00'));seqp=dict(payload(),id=seq['id'],version=seq['version'],mode='manual',ids=[a['table_id']],start='2027-12-10T14:00',end='2027-12-10T16:00');se=call('reservations_service_preview',[q(est),q(json.dumps(seqp))+'::jsonb'])
            check('successif_distinct_chevauchement',bool(se['reservations']) and all(not x['overlap'] for x in se['reservations']))
            check('successif_manuel_confirme',save(dict(seqp,confirmation=se['token'],shared_confirmed=True))['assignment_mode']=='manual')
            denied('ancienne_rpc_pas_reemploi_automatique',lambda:call('reservations_service_save',[q(est),q(uid()),'NULL',q(a['table_id']),q('table'),q('FICTIF'),q('+32470000001'),'NULL',q('2027-12-10 15:00'),q('2027-12-10 16:00'),'2',f"ARRAY['{a['table_id']}']::uuid[]"]),'23P01')
            call('reservations_cancel_booking',[q(est),q(m['id']),str(m['version'])]);check('annulation_partage_libere_ses_seules_allocations',sql(f"SELECT count(*) FROM reservation_booking_allocations WHERE booking_id='{m['id']}'")=='0' and sql(f"SELECT count(*) FROM reservation_booking_allocations WHERE booking_id='{a['id']}'")=='1')
            denied('lecture_seule_refusee',lambda:save(payload(),who=reader),'42501');denied('autre_etablissement_refuse',lambda:save(payload(),who=outsider),'42501')
            denied('anonyme_manuel_refuse',lambda:call('reservations_service_confirm',[q(est),q(uid()),q(json.dumps(mp))+'::jsonb'],role='anon'),'42501')
            denied('ecriture_directe_refusee',lambda:sql("BEGIN;SET LOCAL ROLE authenticated;UPDATE public.reservation_bookings SET assignment_mode='manual';COMMIT;"),'42501')
            denied('anonyme_fermeture_refusee',lambda:call('reservations_service_close',[q(est),q(uid()),q('{}')+'::jsonb'],role='anon'),'42501')
            denied('lecture_seule_fermeture_refusee',lambda:call('reservations_service_close',[q(est),q(uid()),q('{}')+'::jsonb'],reader),'42501')
            denied('nouvelle_fermeture_inactive_refusee',lambda:call('reservations_service_close',[q(est),q(uid()),q(json.dumps(dict(id=uid(),version=None,first='2027-12-11',last='2027-12-11',service='soir',active=False)))+'::jsonb']),'22023')
            oldcopy=sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]'::jsonb)::text) FROM reservation_bookings b");stage='FERMETURES';cl=dict(id=uid(),version=None,first='2027-12-11',last='2027-12-12',service='soir',active=True);clreq=uid();closed=call('reservations_service_close',[q(est),q(clreq),q(json.dumps(cl))+'::jsonb']);check('fermeture_idempotente',call('reservations_service_close',[q(est),q(clreq),q(json.dumps(cl))+'::jsonb'])==closed)
            denied('fermeture_refuse_sans_table',lambda:save(dict(payload(),start='2027-12-11T16:30',end='2027-12-11T18:30',covers=99)),'23514')
            sql(f"UPDATE reservation_establishments SET online_test_enabled=true WHERE id='{est}'")
            denied('anonyme_ancienne_rpc_respecte_fermeture',lambda:call('reservations_public_book',[q(est),q(uid()),q(tid),q('table'),q('FICTIF'),q('+32470000001'),'NULL',q('2027-12-11 16:30'),q('2027-12-11 18:30'),'2',f"ARRAY['{tid}']::uuid[]"],role='anon'),'23514')
            check('fermeture_ne_modifie_pas_reservations',oldcopy==sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]'::jsonb)::text) FROM reservation_bookings b"))
            check('midi_16h00_autorise',save(dict(payload(),start='2027-12-11T16:00',end='2027-12-11T18:00'))['id'])
            reopened=call('reservations_service_close',[q(est),q(uid()),q(json.dumps(dict(cl,version=1,active=False)))+'::jsonb']);check('reouverture',not reopened['active'])
            check('22h30_lendemain',datetime.datetime.fromisoformat(save(dict(payload(),start='2027-12-11T22:30',end='2027-12-12T00:30'))['ends_at']).astimezone(zoneinfo.ZoneInfo('Europe/Brussels')).strftime('%Y-%m-%dT%H:%M')=='2027-12-12T00:30')
            stage='CONCURRENCE';barrier=threading.Barrier(2)
            def race(i):
                barrier.wait();return save(dict(payload(),start='2027-12-13T12:00',end='2027-12-13T14:00',covers=5))
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rr=list(pool.map(race,[0,1]))
            # Only the explicitly registered 1+2 group seats four, so both five-cover requests wait unplaced.
            check('aucun_jumelage_invente',all(x['placement_state']=='unplaced' for x in rr))
            barrier=threading.Barrier(2)
            sql(f"INSERT INTO reservation_table_groups(id,establishment_id,room_id,name,table_ids) VALUES('{uid()}','{est}','{room}','2 + 3',ARRAY['{t2}','{t3}']::uuid[])")
            def race_group(i):
                barrier.wait()
                return save(dict(payload(),start='2027-12-14T12:00',end='2027-12-14T14:00',covers=4),hold=.2)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rr=list(pool.map(race_group,[0,1]))
            check('concurrence_un_jumelage_autorise',sum(x['placement_state']=='assigned' for x in rr)==1)
            check('pas_de_demi_allocation',sql("SELECT bool_and(n IN (0,1,2)) FROM (SELECT count(*) n FROM reservation_booking_allocations GROUP BY booking_id) x")=='t')
            stage='PLANS_RETIREES';run('public.reservations_service_plan_visibility('+q(est)+','+q(room)+',true)');check('retrait_pas_archivage',sql(f"SELECT active FROM reservation_rooms WHERE id='{room}'")=='t')
            denied('nouvelle_auto_plan_retire_refusee',lambda:save(dict(payload(),start='2027-12-15T12:00',end='2027-12-15T14:00')),'22023')
            check('historique_plan_retire_consultable',len(call('reservations_service_day',[q(est),q('2027-12-10')]))>=4)
            check('ancien_available_exclut_plan_retire',call('reservations_service_available',[q(est),q('2027-12-15 12:00'),q('2027-12-15 14:00'),'2','NULL'])==[])
            run('public.reservations_service_plan_visibility('+q(est)+','+q(room)+',false)');check('retrait_reversible',len(call('reservations_service_available',[q(est),q('2027-12-15 12:00'),q('2027-12-15 14:00'),'2','NULL']))>0)
            stage='PRESERVATION';check('tables_inchangees',sql('SELECT count(*) FROM reservation_tables')=='3');check('rls_fermetures',sql("SELECT relrowsecurity FROM pg_class WHERE oid='reservation_service_closures'::regclass")=='t')
        print(json.dumps({'resultat':'PASS','tests':len(results),'controles':results,'postgresql':'17_JETABLE','auth':'SIMULEE','pilote_modifie':False}));return 0
    except BaseException as e:
        print(json.dumps({'resultat':'ECHEC','etape':stage,'type':type(e).__name__,'instruction':str(e),'sqlstate':getattr(e,'sqlstate',None),'diagnostic':getattr(e,'safe',None)}));return 1
if __name__=='__main__':raise SystemExit(main())
