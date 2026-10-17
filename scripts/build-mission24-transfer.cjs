'use strict';
// Offline packaging only. Received SQL and generated ZIP never enter Git.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {prepare,expectedSha256}=require('./prepare-snapshot23-local.cjs');
const {hash,project}=require('../tools/mission24/safety.cjs');
const repo=path.resolve(__dirname,'..');
function build(source,destination){
 if(!source||!destination)throw Error('Usage: SOURCE_SQL NEW_EXTERNAL_DIRECTORY');
 const base=path.resolve(destination),parent=fs.realpathSync(path.dirname(base));
 if(parent!==path.dirname(base)||base===repo||base.startsWith(repo+path.sep)||fs.existsSync(base))throw Error('Fresh external output required');
 fs.mkdirSync(base,{mode:0o700});
 const folder=path.join(base,'StopFlow-mission24.1-macos');fs.mkdirSync(folder,{mode:0o700});
 prepare({source,output:path.join(folder,'sql')});
 for(const name of ['README.md','run-macos.sh','runner.cjs','safety.cjs','local-http.cjs','self-test.cjs','gateway-self-test.cjs'])fs.copyFileSync(path.join(repo,'tools/mission24',name),path.join(folder,name),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(folder,'REVIEW.patch'),cp.execFileSync('git',['show','--format=fuller','--no-ext-diff','--color=never','HEAD'],{cwd:repo}),{flag:'wx',mode:0o600});
 const files=[];
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  if(entry.isFile())files.push(entry.name);
  else if(entry.name==='sql')for(const name of fs.readdirSync(path.join(folder,'sql')))files.push('sql/'+name);
  else throw Error('Unexpected package entry');
 }
 const manifest={mission:'2.4.1',project,sourceCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),sourceSha256:expectedSha256,execution:'NOT_EXECUTED_ON_OWNER_MAC',files:files.sort().map(name=>({name,sha256:hash(fs.readFileSync(path.join(folder,name)))}))};
 fs.writeFileSync(path.join(folder,'transfer-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 const zip=path.join(base,'StopFlow-mission24.1-macos.zip');
 cp.execFileSync('python3',['-c',"import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); z=zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root.parent)) for p in sorted(root.rglob('*')) if p.is_file()]; z.close()",folder,zip]);
 return {zip,sha256:hash(fs.readFileSync(zip)),sourceCommit:manifest.sourceCommit};
}
module.exports={build};
if(require.main===module){try{console.log(JSON.stringify(build(...process.argv.slice(2))))}catch(e){console.error(e.message);process.exitCode=1}}
