'use strict';
const path=require('node:path'),sharp=require('sharp'),{parse,rowsFromWords}=require('./document-lines.cjs'),Q=require('../stopflow-104-photo-quality.js');
async function recognize(bytes,rotation=0){
 if(![0,90,180,270].includes(rotation))throw Error('ROTATION_REFUSED');
 const image=sharp(bytes,{limitInputPixels:50000000}).autoOrient().rotate(rotation),meta=await image.metadata();
 const small=await image.clone().resize({width:1000,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const quality=Q.assess(small.data,small.info.width,small.info.height,meta.width,meta.height);
 if(!quality.accepted)return {status:'RECAPTURE_REQUIRED',quality,candidates:null,engine:'Tesseract.js 6.0.1 / fra',manual_entry:true};
 const input=await image.clone().resize({width:1800,height:2600,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).grayscale().normalize().png().toBuffer();
 const {createWorker}=require('tesseract.js'),language=require('@tesseract.js-data/fra');let worker,timer,closed=false;
 try{
  const work=(async()=>{worker=await createWorker('fra',1,{langPath:language.langPath,corePath:path.dirname(require.resolve('tesseract.js-core/package.json')),workerPath:require.resolve('tesseract.js/src/worker-script/node/index.js'),cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{} });if(closed){await worker.terminate();throw Error('OCR_TIMEOUT');}await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});return worker.recognize(input,{}, {text:true,blocks:true});})();
  const result=await Promise.race([work,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('OCR_TIMEOUT')),35000))]);
  const words=(result.data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]);const rows=rowsFromWords(words),candidates=parse(rows);
  const heights=words.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b);if(words.length>=8&&heights[Math.floor(heights.length/2)]<10)return {status:'RECAPTURE_REQUIRED',quality:{...quality,accepted:false,reasons:['Texte trop petit dans la photo : rapprochez-vous en conservant toute la feuille.']},candidates:null,engine:'Tesseract.js 6.0.1 / fra',manual_entry:true};
  if(words.length<8||result.data.confidence<25)return {status:'RECAPTURE_REQUIRED',quality:{...quality,accepted:false,reasons:['Le texte ne peut pas être lu avec assez de fiabilité : rapprochez-vous, éclairez et reprenez la feuille entière.']},candidates:null,engine:'Tesseract.js 6.0.1 / fra',manual_entry:true};
  return {status:'OCR_EXTRACTED_REVIEW_REQUIRED',quality,candidates,text:result.data.text.slice(0,60000),confidence:result.data.confidence,engine:'Tesseract.js 6.0.1 / fra',manual_entry:true};
 }finally{closed=true;clearTimeout(timer);await worker?.terminate();}
}
module.exports={recognize};
