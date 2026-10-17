'use strict';
const assert=require('node:assert/strict');
const {createDb,users,tenants,literal}=require('./helpers/reservations-db.cjs');
const roomArgs=(est,name)=>({p_establishment_id:est,p_id:null,p_expected_version:null,p_name:name,p_description:'Description & accents',p_sort_order:0,p_active:true});
const tableArgs=(est,room,label)=>({p_establishment_id:est,p_room_id:room,p_id:null,p_expected_version:null,p_label:label,p_capacity:4,p_shape:'round',p_active:true});
async function run(){
  const db=await createDb();let count=0;
  const denied=(fn,codes)=>{assert.throws(fn,error=>codes.includes(error.code));count++};
  try{
    assert.equal(db.rpc(users.admin,'reservations_context').establishments.length,1);count++;
    assert.equal(db.rpc(users.admin,'reservations_context').establishments[0].id,tenants.a);count++;
    denied(()=>db.rpc(null,'reservations_context'),['42501']);
    denied(()=>db.sql(db.as(null,'select public.reservations_context()','anon')),['42501']);
    denied(()=>db.rpc(users.inactive,'reservations_context'),['42501']);
    const room=db.rpc(users.admin,'reservations_save_room',roomArgs(tenants.a,'Salle A'));
    const second=db.rpc(users.admin,'reservations_save_room',roomArgs(tenants.a,'Salle secondaire'));
    const other=db.rpc(users.other,'reservations_save_room',roomArgs(tenants.b,'Salle B'));
    const renamed=db.rpc(users.admin,'reservations_save_room',{...roomArgs(tenants.a,'Salle renommée'),p_id:room.id,p_expected_version:room.version,p_sort_order:7});
    assert.equal(renamed.id,room.id);assert.equal(renamed.version,2);assert.equal(renamed.sort_order,7);count++;
    const table=db.rpc(users.admin,'reservations_save_table',tableArgs(tenants.a,room.id,'A-1'));
    denied(()=>db.rpc(users.admin,'reservations_save_table',tableArgs(tenants.a,room.id,' a-1 ')),['23505']);
    assert(db.rpc(users.admin,'reservations_save_table',tableArgs(tenants.a,second.id,'A-1')).id);count++;
    for(const capacity of [0,-1,1001,1.5])denied(()=>db.rpc(users.admin,'reservations_save_table',{...tableArgs(tenants.a,room.id,'bad-capacity'),p_capacity:capacity}),['23514','22P02']);
    denied(()=>db.rpc(users.admin,'reservations_save_table',{...tableArgs(tenants.a,room.id,' ')}),['23514']);
    denied(()=>db.rpc(users.admin,'reservations_save_table',{...tableArgs(tenants.a,room.id,'shape'),p_shape:'triangle'}),['23514']);
    for(const user of [users.reader,users.other,users.inactive]){
      denied(()=>db.rpc(user,'reservations_save_room',roomArgs(tenants.a,'forbidden')),['42501']);
      denied(()=>db.rpc(user,'reservations_save_table',tableArgs(tenants.a,room.id,'forbidden')),['42501']);
    }
    denied(()=>db.rpc(users.tables,'reservations_save_room',roomArgs(tenants.a,'forbidden')),['42501']);
    denied(()=>db.rpc(users.rooms,'reservations_save_table',tableArgs(tenants.a,room.id,'forbidden')),['42501']);
    assert(db.rpc(users.tables,'reservations_save_table',tableArgs(tenants.a,room.id,'T-only')).id);count++;
    assert(db.rpc(users.rooms,'reservations_save_room',roomArgs(tenants.a,'Room-only')).id);count++;
    denied(()=>db.rpc(users.admin,'reservations_read',{p_establishment_id:tenants.b}),['42501']);
    denied(()=>db.rpc(users.admin,'reservations_save_table',tableArgs(tenants.a,other.id,'cross-tenant')),['42501']);
    denied(()=>db.rpc(users.admin,'reservations_save_room',{...roomArgs(tenants.a,'cross-tenant'),p_id:other.id,p_expected_version:1}),['42501']);
    for(const relation of ['reservation_establishments','reservation_memberships','reservation_rooms','reservation_tables','reservation_layouts','reservation_layout_elements','reservation_audit']){
      assert.equal(db.sql(db.as(users.admin,`select count(*) from public.${relation} where ${relation==='reservation_establishments'?'id':'establishment_id'}=${literal(tenants.b)}`)),'0');count++;
    }
    denied(()=>db.sql(db.as(users.reader,`insert into public.reservation_rooms(establishment_id,name) values(${literal(tenants.a)},'bypass')`)),['42501']);
    denied(()=>db.sql(db.as(users.admin,`update public.reservation_memberships set can_manage_rooms=true where profile_id=${literal(users.reader)}`)),['42501']);
    denied(()=>db.sql(db.as(users.admin,`delete from public.reservation_tables where id=${literal(table.id)}`)),['42501']);
    const read=db.rpc(users.reader,'reservations_read',{p_establishment_id:tenants.a});
    assert.equal(read.rooms.find(r=>r.id===room.id).name,'Salle renommée');count++;
    assert.equal(read.layouts.filter(l=>l.room_id===room.id&&l.status==='active').length,1);count++;
    const element=read.elements.find(e=>e.table_id===table.id);
    assert.equal(element.x,null);assert.equal(element.y,null);count++;
    const changed=db.rpc(users.admin,'reservations_save_table',{...tableArgs(tenants.a,room.id,'A-2'),p_id:table.id,p_expected_version:table.version,p_capacity:6,p_shape:'rectangle'});
    assert.equal(changed.id,table.id);assert.equal(changed.capacity,6);assert.equal(changed.version,2);count++;
    denied(()=>db.sql(`update public.reservation_tables set id=gen_random_uuid() where id=${literal(table.id)}`),['22023']);
    const parallel={...tableArgs(tenants.a,room.id,'Concurrent'),p_id:table.id,p_expected_version:changed.version};
    const results=await Promise.allSettled([db.concurrentRpc(users.admin,'reservations_save_table',parallel),db.concurrentRpc(users.admin,'reservations_save_table',{...parallel,p_label:'Concurrent bis'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.match(results.find(r=>r.status==='rejected').reason.stderr,/40001|CONFLIT_VERSION/);count++;
    const archived=db.rpc(users.admin,'reservations_save_room',{...roomArgs(tenants.a,'Salle renommée'),p_id:room.id,p_expected_version:renamed.version,p_active:false});
    assert.equal(archived.active,false);assert(db.rpc(users.admin,'reservations_read',{p_establishment_id:tenants.a}).tables.some(t=>t.id===table.id));count++;
    denied(()=>db.rpc(users.admin,'reservations_save_table',tableArgs(tenants.a,room.id,'archived-room')),['42501']);
    denied(()=>db.sql(`insert into public.reservation_layouts(establishment_id,room_id,name) values(${literal(tenants.a)},${literal(second.id)},'duplicate-active')`),['23505']);
    const layout=read.layouts.find(l=>l.room_id===second.id);
    for(const properties of [{capacity:4},{fill:'url(https://example.invalid)'},{label:null},[],{stroke:'#fff'}])denied(()=>db.sql(`insert into public.reservation_layout_elements(establishment_id,room_id,layout_id,kind,properties) values(${literal(tenants.a)},${literal(second.id)},${literal(layout.id)},'wall',${literal(JSON.stringify(properties))}::jsonb)`),['23514']);
    for(const [key,value] of [['width','0'],['height','10001'],['rotation','360'],['rotation','NaN']])denied(()=>db.sql(`insert into public.reservation_layout_elements(establishment_id,room_id,layout_id,kind,${key}) values(${literal(tenants.a)},${literal(second.id)},${literal(layout.id)},'wall',${literal(value)}::numeric)`),['23514']);
    const wall=db.sql(`insert into public.reservation_layout_elements(establishment_id,room_id,layout_id,kind,x,y,properties) values(${literal(tenants.a)},${literal(second.id)},${literal(layout.id)},'wall',10,20,'{"fill":"#123456","label":"Mur témoin"}') returning table_id is null`);
    assert.equal(wall,'t');count++;
    denied(()=>db.sql(`insert into public.reservation_layout_elements(establishment_id,room_id,layout_id,table_id,kind) values(${literal(tenants.a)},${literal(second.id)},${literal(layout.id)},${literal(table.id)},'table')`),['23503']);
    denied(()=>db.sql(`insert into public.reservation_layout_elements(establishment_id,room_id,layout_id,kind,table_id) values(${literal(tenants.a)},${literal(second.id)},${literal(layout.id)},'wall',${literal(table.id)})`),['23514']);
    assert(Number(db.sql(`select count(*) from public.reservation_audit where actor_id=${literal(users.admin)} and action='UPDATE'`))>=3);count++;
    db.sql(`delete from public.profiles where id=${literal(users.rooms)}`);
    assert.equal(db.sql("select created_by is null from public.reservation_rooms where name='Room-only'"),'t');count++;
    db.sql(`update public.reservation_memberships set active=false where profile_id=${literal(users.reader)}`);
    assert.equal(db.rpc(users.reader,'reservations_context').establishments.length,0);count++;
    denied(()=>db.rpc(users.reader,'reservations_read',{p_establishment_id:tenants.a}),['42501']);
    console.log(`PASS PostgreSQL 16: ${count} checks; real migration, persistent CRUD, granular permissions, RLS on seven relations, tenant FKs, archive integrity, concurrent writers, validated graphics and audit`);
  }finally{db.close()}
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
module.exports={roomArgs,tableArgs};
