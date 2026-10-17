/* Empty local PostgreSQL only. No production DSN, ports, volumes or network. */
'use strict';
const {execFileSync}=require('node:child_process');
async function emptyPostgres(){
  const container='stopflow-reconstruction-'+process.pid+'-'+Date.now();
  const image='postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
  execFileSync('docker',['run','--detach','--rm','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image],{stdio:'pipe'});
  const close=()=>execFileSync('docker',['rm','--force',container],{stdio:'pipe'});
  const sql=(source,database='postgres')=>{
    if(!/^[a-z][a-z0-9_]*$/.test(database))throw Error('Invalid local database name');
    try{return execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',database],{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
    catch(error){const message=String(error.stderr),match=message.match(/ERROR:\s+([A-Z0-9]{5}):\s*([^\n]+)/);throw Object.assign(Error(match?.[2]||message),{code:match?.[1]||'SQL_ERROR'})}
  };
  try{
    for(let i=0;i<80;i++){
      try{execFileSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});return {sql,close,container}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw Error('Local PostgreSQL did not start');
  }catch(error){close();throw error}
}
module.exports={emptyPostgres};
