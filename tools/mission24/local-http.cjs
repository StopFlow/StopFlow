'use strict';
const http=require('node:http'),S=require('./safety.cjs');
function request(apiBase,credentials,route,{method='GET',body,token,key,timeout=10000}={}){
 const u=S.localUrl(apiBase);S.need(/^\/(auth|rest)\/v1\//.test(route)&&!/[\r\n]/.test(route),'INVALID_LOCAL_ROUTE');
 return new Promise((resolve,reject)=>{
  const payload=body===undefined?undefined:JSON.stringify(body);
  const headers={apikey:key||credentials.anon,Authorization:'Bearer '+(token||credentials.anon),Accept:route==='/rest/v1/'?'application/openapi+json':'application/json'};
  if(payload!==undefined){headers['Content-Type']='application/json';headers['Content-Length']=Buffer.byteLength(payload)}
  const req=http.request({hostname:'127.0.0.1',family:4,port:u.port,path:route,method,headers,agent:false},res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();reject(new S.Failure('HTTP_REDIRECT_REFUSED'));return}
   let data='',size=0;res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)req.destroy();else data+=chunk});
   res.on('end',()=>{let value=null;try{value=data?JSON.parse(data):null}catch{reject(new S.Failure('LOCAL_API_NON_JSON'));return}resolve({status:res.statusCode,body:value})});
   res.on('error',()=>reject(new S.Failure('LOCAL_API_READ_FAILED')));
  });req.setTimeout(timeout,()=>req.destroy());req.on('error',()=>reject(new S.Failure('LOCAL_API_CONNECTION_FAILED')));if(payload)req.write(payload);req.end();
 });
}
module.exports={request};
