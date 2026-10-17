'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createDb}=require('./helpers/reservations-db.cjs');
const {prepareSql}=require('../scripts/prepare-development-sql.cjs');
const {productionRef}=require('../stopflow-environment.js');
(async()=>{
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'stopflow-development-sql-'));let db;
  try{
    const baseline=path.join(parent,'baseline.sql');fs.writeFileSync(baseline,'-- Fixture minimale de packaging, PAS une baseline StopFlow.\nselect 1;\n');
    const sha256=crypto.createHash('sha256').update(fs.readFileSync(baseline)).digest('hex');
    const options={projectRef:'abcdefghijklmnopqrst',baseline,sha256,output:path.join(parent,'bundle')};
    assert.throws(()=>prepareSql({...options,projectRef:productionRef}));
    assert.throws(()=>prepareSql({...options,sha256:'0'.repeat(64)}));assert.equal(fs.existsSync(options.output),false);
    const manifest=prepareSql(options);assert.equal(manifest.files.length,4);
    for(const file of manifest.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(options.output,file.name))).digest('hex'),file.sha256);
    assert.deepEqual(fs.readFileSync(path.join(options.output,'20-reservations.sql')),fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261017120000_stopflow_reservations_foundation.sql')));
    assert.throws(()=>prepareSql(options),/neuf/);
    const contaminated=path.join(parent,'contaminated.sql');fs.writeFileSync(contaminated,'-- '+productionRef);
    assert.throws(()=>prepareSql({...options,baseline:contaminated,sha256:crypto.createHash('sha256').update(fs.readFileSync(contaminated)).digest('hex'),output:path.join(parent,'unsafe')}),/Production/);
    db=await createDb();
    const baseCheck=fs.readFileSync(path.join(__dirname,'../supabase/development/10-check-base.sql'),'utf8');
    const moduleCheck=fs.readFileSync(path.join(__dirname,'../supabase/development/30-check-reservations.sql'),'utf8');
    assert.throws(()=>db.sql(baseCheck),/BASELINE_INCOMPLETE/,'Minimal Auth fixtures must never be declared a complete StopFlow installation');
    db.sql(moduleCheck);
    db.sql('grant insert on public.reservation_rooms to authenticated');
    assert.throws(()=>db.sql(moduleCheck),/UNSAFE_DIRECT_GRANT/);
    db.sql('revoke insert on public.reservation_rooms from authenticated');
    db.sql('alter table public.reservation_tables disable row level security');
    assert.throws(()=>db.sql(moduleCheck),/RLS_MISSING/);
    db.sql('alter table public.reservation_tables enable row level security');
    db.sql(moduleCheck);
    console.log('PASS development schema: offline bundle hashes, production refusal, untouched migration, incomplete baseline refusal, PostgreSQL read-only checks, unsafe grants and disabled RLS detected');
  }finally{db?.close();fs.rmSync(parent,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
