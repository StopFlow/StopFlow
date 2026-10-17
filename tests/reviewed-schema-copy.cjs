'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {prepare}=require('../scripts/prepare-reviewed-schema-copy.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stopflow-review-copy-'));
try{
 const raw=path.join(dir,'raw.sql'),mapping=path.join(dir,'map.json'),output=path.join(dir,'reviewed.sql');
 const source=`create function public.fixture() returns void language plpgsql as $$begin insert into public.fixture_log values ('source-admin@example.test','source-manager@example.test');end$$;`;
 fs.writeFileSync(raw,source);fs.writeFileSync(mapping,JSON.stringify({'source-admin@example.test':'admin-test@example.invalid','source-manager@example.test':'responsable-test@example.invalid'}));
 const manifest=prepare({raw,mapping,output});assert(manifest.humanReviewRequired);assert.equal(manifest.execution,'NONE');
 assert.equal(fs.readFileSync(output,'utf8'),source.replace('source-admin@example.test','admin-test@example.invalid').replace('source-manager@example.test','responsable-test@example.invalid'));
 assert.throws(()=>prepare({raw,mapping,output}),/Fresh/);
 fs.writeFileSync(mapping,JSON.stringify({'source-admin@example.test':'same@example.invalid','source-manager@example.test':'same@example.invalid'}));assert.throws(()=>prepare({raw,mapping,output:output+'2'}),/Distinct/);
 fs.writeFileSync(mapping,'{}');assert.throws(()=>prepare({raw,mapping,output:output+'3'}),/Unmapped/);
 fs.writeFileSync(raw,"create table fixture(email text default 'source-admin@example.test',other text default 'admin-test@example.invalid');");
 fs.writeFileSync(mapping,JSON.stringify({'source-admin@example.test':'admin-test@example.invalid'}));assert.throws(()=>prepare({raw,mapping,output:output+'collision'}),/collision/);
 fs.writeFileSync(mapping,'{}');
 fs.writeFileSync(raw,'COPY public.fixture FROM stdin;');assert.throws(()=>prepare({raw,mapping,output:output+'4'}),/data statement/);
 fs.writeFileSync(raw,"select pg_catalog.setval('public.fixture',100,true);");assert.throws(()=>prepare({raw,mapping,output:output+'5'}),/data statement/);
 fs.writeFileSync(raw,"create function public.fixture() returns text language sql as $$select 'sb_secret_abcdefgh12345678'$$;");assert.throws(()=>prepare({raw,mapping,output:output+'6'}),/credential/);
 assert.throws(()=>prepare({raw:__filename,mapping,output:output+'7'}),/outside/);
 console.log('PASS offline schema review copy: distinct mappings, exact limited transformation, preserved function DML, data/credential/unmapped-email refusal, external-only files, no overwrite; human review still required');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
