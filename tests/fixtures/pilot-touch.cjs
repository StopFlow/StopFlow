'use strict';
// Parse only the existing, committed fictitious R3 plan. No database connection.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function split(line){const a=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==="'"){value+=c;if(quoted&&line[i+1]==="'"){value+=line[++i];continue;}quoted=!quoted;}else if(c===','&&!quoted){a.push(value.trim());value='';}else value+=c;}a.push(value.trim());return a;}
function fixture(){const data={rooms:[],tables:[],layouts:[],elements:[]};
 for(const line of fs.readFileSync(path.join(__dirname,'../../tools/pilot/fixtures.sql'),'utf8').split('\n')){const m=/^INSERT INTO public\.reservation_(rooms|tables|layouts|layout_elements)\(([^)]+)\) VALUES\((.*)\);$/.exec(line);if(!m)continue;
  const values=split(m[3]).map(x=>{if(x==='NULL')return null;if(x==='true'||x==='false')return x==='true';if(x.endsWith('::jsonb'))return JSON.parse(x.slice(1,-8).replace(/''/g,"'"));if(x.startsWith("'"))return x.slice(1,-1).replace(/''/g,"'");return Number(x);});
  const row=Object.fromEntries(m[2].split(',').map((k,i)=>[k,values[i]]));row.version=1;data[m[1]==='layout_elements'?'elements':m[1]].push(row);}
 const room=data.rooms[0],members=data.tables.filter(t=>t.room_id===room.id&&['2','3'].includes(t.label)).map(t=>t.id);
 return {data,groups:[{id:'8151fc5d-e4a2-579c-8fb2-c587e2f57254',establishment_id:room.establishment_id,room_id:room.id,name:'Jumelage 2 + 3',table_ids:members,active:true,version:1}]};
}
function backend(){const state=fixture();let mode='',calls=[];const clone=()=>structuredClone(state),find=(list,id)=>list.find(x=>x.id===id),fail=code=>{throw {code};};
 async function rpc(name,a){calls.push({name,args:structuredClone(a)});
  if(name==='reservations_service_state')return {data:{closures:[],hidden_plans:[],can_close:false}};if(name==='reservations_read')return {data:structuredClone(state.data)};if(name==='reservations_service_groups')return {data:structuredClone(state.groups)};
  if(mode==='conflict'){mode='';return {error:{code:'40001'}};}
  if(name==='reservations_save_room'){let r=find(state.data.rooms,a.p_id);if(a.p_id){if(!r||r.version!==a.p_expected_version)fail('40001');if(!a.p_active&&state.bookedRooms?.includes(r.id))fail('23514');Object.assign(r,{name:a.p_name,description:a.p_description,sort_order:a.p_sort_order,active:a.p_active,version:r.version+1});}else{if(state.data.rooms.some(x=>x.name.toLowerCase()===a.p_name.toLowerCase()))fail('23505');r={id:crypto.randomUUID(),establishment_id:a.p_establishment_id,name:a.p_name,description:a.p_description,sort_order:a.p_sort_order,active:a.p_active,version:1};state.data.rooms.push(r);state.data.layouts.push({id:crypto.randomUUID(),room_id:r.id,establishment_id:r.establishment_id,name:'Configuration initiale',status:'active',width:1100,height:660,version:1});}if(mode==='lost-room'){mode='';throw Error('SYNTHETIC_RESPONSE_LOSS');}return {data:structuredClone(r)};}
  if(name==='reservations_save_table'){let t=find(state.data.tables,a.p_id),l=state.data.layouts.find(l=>l.room_id===a.p_room_id);
   if(a.p_id){if(!t||t.version!==a.p_expected_version)fail('40001');Object.assign(t,{label:a.p_label,capacity:a.p_capacity,shape:a.p_shape,active:a.p_active,version:t.version+1});}
   else{if(state.data.tables.some(t=>t.room_id===a.p_room_id&&t.label.toLowerCase()===a.p_label.toLowerCase()))fail('23505');t={id:crypto.randomUUID(),room_id:a.p_room_id,establishment_id:a.p_establishment_id,label:a.p_label,capacity:a.p_capacity,shape:a.p_shape,active:true,version:1};state.data.tables.push(t);state.data.elements.push({id:crypto.randomUUID(),table_id:t.id,room_id:t.room_id,establishment_id:t.establishment_id,layout_id:l.id,kind:'table',x:null,y:null,width:t.shape==='rectangle'?120:80,height:80,rotation:0,properties:{},version:1});}
   l.version++;if(mode==='lost-create'){mode='';throw Error('SYNTHETIC_RESPONSE_LOSS');}return {data:structuredClone(t)};}
  if(name==='reservations_service_plan_save'){const l=find(state.data.layouts,a.p_layout);if(l.version!==a.p_version)fail('40001');const draft=structuredClone(state.data);
   for(const t of a.p_tables){const el=find(draft.elements,t.element_id);if(!el||el.version!==t.expected_version||Object.keys(t).length!==8)fail('40001');for(const k of ['x','y','width','height','rotation'])el[k]=t[k];el.version++;}
   draft.elements=draft.elements.filter(x=>x.layout_id!==l.id||x.table_id);for(const m of a.p_marks){const old=find(state.data.elements,m.id);draft.elements.push({...structuredClone(m),version:(old?.version||0)+1});}find(draft.layouts,l.id).version++;state.data=draft;
   if(mode==='lost-plan'){mode='';throw Error('SYNTHETIC_RESPONSE_LOSS');}return {data:{id:l.id,version:l.version+1}};}
  if(name==='reservations_service_group_save'){const old=find(state.groups,a.p_id);if(old&&old.version!==a.p_version)fail('40001');const g={id:a.p_id,establishment_id:a.p_est,room_id:a.p_room,name:a.p_name,table_ids:[...a.p_tables].sort(),active:a.p_active,version:(old?.version||0)+1};state.groups=state.groups.filter(x=>x.id!==g.id).concat(g);return {data:structuredClone(g)};}
  throw Error('UNSUPPORTED_SYNTHETIC_RPC');
 }
 return {state,calls,rpc,clone,mode:x=>mode=x};
}
module.exports={fixture,backend};
