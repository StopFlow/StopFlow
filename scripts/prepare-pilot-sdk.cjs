'use strict';
// Fetch only at build time, never at login. No package scripts are executed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const pin=require('../tools/pilot/supabase-sdk.json');
function checked(buffer,algorithm,expected){
 const actual=crypto.createHash(algorithm).update(buffer).digest(algorithm==='sha512'?'base64':'hex');
 if(actual!==expected)throw Error('PILOT_SDK_INTEGRITY_REFUSED');
 return buffer;
}
async function prepare(directory,fetcher=fetch){
 if(pin.version!=='2.119.2'||pin.asset!=='stopflow-supabase-sdk.js'||pin.member!=='package/dist/umd/supabase.js'||pin.tarball!=='https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.119.2.tgz')throw Error('PILOT_SDK_PIN_REFUSED');
 const response=await fetcher(pin.tarball,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('PILOT_SDK_DOWNLOAD_REFUSED');
 const reader=response.body.getReader(),parts=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>5*1024*1024){await reader.cancel();throw Error('PILOT_SDK_ARCHIVE_TOO_LARGE');}parts.push(Buffer.from(value));}
 const archive=checked(Buffer.concat(parts),'sha512',pin.integrity.replace(/^sha512-/,''));
 const tar=zlib.gunzipSync(archive,{maxOutputLength:20*1024*1024});
 const extracted=spawnSync('tar',['-xOf','-',pin.member],{input:tar,maxBuffer:2*1024*1024,timeout:10000});
 if(extracted.status!==0)throw Error('PILOT_SDK_EXTRACTION_REFUSED');
 const body=checked(extracted.stdout,'sha256',pin.sha256);
 const license=spawnSync('tar',['-xOf','-','package/LICENSE'],{input:tar,maxBuffer:32768,timeout:10000});
 if(license.status!==0||!license.stdout.toString('utf8').includes('MIT License'))throw Error('PILOT_SDK_LICENSE_MISSING');
 fs.writeFileSync(path.join(directory,'stopflow-supabase-sdk-LICENSE.txt'),license.stdout,{flag:'wx'});
 const file=path.join(directory,pin.asset);fs.writeFileSync(file,body,{flag:'wx'});
 return {version:pin.version,asset:pin.asset,sha256:pin.sha256,integrity:pin.integrity};
}
module.exports={prepare,checked,pin};
