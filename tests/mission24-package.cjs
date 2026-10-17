'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {build}=require('../scripts/build-mission24-transfer.cjs');
const {hash}=require('../tools/mission24/safety.cjs');
const source=process.env.STOPFLOW_SNAPSHOT23_SOURCE;
assert(source,'External reviewed snapshot required');
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'stopflow24-package-test-'));
const result=build(source,path.join(parent,'payload'));
const root=path.join(parent,'payload/StopFlow-mission24.1-macos');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'transfer-manifest.json')));
assert.equal(manifest.files.length,14);
for(const file of manifest.files){assert.equal(hash(fs.readFileSync(path.join(root,file.name))),file.sha256);assert(!/(\.env|\.pem|credentials|password)/i.test(file.name))}
assert.equal(hash(fs.readFileSync(result.zip)),result.sha256);
assert.throws(()=>build(source,path.join(parent,'payload')),/Fresh external/);
for(const name of ['runner.cjs','safety.cjs','local-http.cjs','self-test.cjs','gateway-self-test.cjs'])cp.execFileSync(process.execPath,['--check',path.join(root,name)]);
cp.execFileSync('bash',['-n',path.join(root,'run-macos.sh')]);
cp.execFileSync(process.execPath,[path.join(root,'self-test.cjs')],{stdio:'inherit'});
const inventory=JSON.parse(fs.readFileSync(path.join(root,'sql/manifest.json')));
assert.equal(inventory.counts.tables,24);assert.equal(inventory.counts.functions,56);
const baseline=fs.readFileSync(path.join(root,'sql/01-final-pg17-local.sql'),'utf8');
assert(baseline.includes('POSTGRES_17_REQUIRED'));assert(baseline.includes('FRESH_LOCAL_SCHEMA_REQUIRED'));
assert(!/service_role_key|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sb_secret_/i.test(baseline));
const emails=[...baseline.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0]);
assert(emails.every(e=>e.endsWith('@example.invalid')));
cp.execFileSync('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==15; assert all(n.startswith('StopFlow-mission24.1-macos/') and '..' not in n.split('/') for n in z.namelist())",result.zip]);
if(process.platform!=='darwin'){
 assert.throws(()=>cp.execFileSync('bash',[path.join(root,'run-macos.sh')],{stdio:'pipe'}));
 let report=JSON.parse(fs.readFileSync(path.join(root,'reports/result.json')));
 assert.equal(report.failure,'MACOS_REQUIRED');assert.equal(report.databaseModified,false);assert.equal(report.checks.length,0);
 fs.appendFileSync(path.join(root,'sql/02-auth-local.sql'),'\n-- corruption test\n');
 assert.throws(()=>cp.execFileSync('bash',[path.join(root,'run-macos.sh')],{stdio:'pipe'}));
 report=JSON.parse(fs.readFileSync(path.join(root,'reports/result.json')));
 assert.equal(report.failure,'PACKAGE_HASH_MISMATCH');assert.equal(report.databaseModified,false);
 // A concurrent invocation must neither run nor overwrite an existing report.
 const before=fs.readFileSync(path.join(root,'reports/result.json'),'utf8');
 fs.writeFileSync(path.join(root,'.run.lock'),'test lock');
 assert.throws(()=>cp.execFileSync('bash',[path.join(root,'run-macos.sh')],{stdio:'pipe'}));
 assert.equal(fs.readFileSync(path.join(root,'reports/result.json'),'utf8'),before);
}
console.log('PASS — assemblage ZIP, intégrité, anonymisation et refus avant toute écriture.');
