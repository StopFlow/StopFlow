'use strict';
// Text candidates only. No inferred conformity, tax basis, supplier identity or price.
function candidates(text){
 const header=(pattern)=>String(text.match(pattern)?.[1]||'').trim().slice(0,120);
 const date=header(/(?:Date\s*(?:facture|document)?\s*:)\s*(\d{4}-\d{2}-\d{2})/i);
 const number=header(/(?:Facture|Bon|Avoir)\s*(?:n[°o.]?\s*)?:\s*([^\n]+)/i);
 const supplier=header(/Fournisseur\s*:\s*([^\n]+)/i);
 // Explicit pipe-separated rows are recognized conservatively; all remain human-review candidates.
 const lines=text.split(/\r?\n/).map((line,index)=>({line,index})).filter(x=>x.line.includes('|')).map(({line,index})=>{
  const a=line.split('|').map(x=>x.trim());if(a.length!==8||!a[0]||a[0].toLowerCase()==='reference')return null;
  const numeric=v=>/^\d+(?:[.,]\d+)?$/.test(v)?v:'';
  return {supplier_reference:a[0].slice(0,100),description:a[1].slice(0,300),quantity:numeric(a[2]),pack_quantity:numeric(a[3]),pack_unit:a[4],pack_price:numeric(a[5]),discount:numeric(a[6]),basis:['HT','TTC'].includes(a[7])?a[7]:'',currency:'',source_text_line:index+1,review_required:true};
 }).filter(Boolean).slice(0,300);
 return {supplier_candidate:supplier,number,date,kind:/\bavoir\b/i.test(text)?'credit':/\bfacture\b/i.test(text)?'invoice':'delivery',lines,review_required:true};
}
async function extract(bytes,mime,loader=()=>import('unpdf')){
 if(mime!=='application/pdf')return {status:'OCR_NOT_CONFIGURED',pages:null,candidates:null,manual_entry:true};
 const {getDocumentProxy,extractText}=await loader();const pdf=await getDocumentProxy(new Uint8Array(bytes));
 try{
  if(pdf.numPages>30)throw Object.assign(Error('PAGE_LIMIT'),{code:'PAGE_LIMIT'});
  const out=await extractText(pdf,{mergePages:false}),pages=out.text.map(String),text=pages.join('\n');
  if(text.length>150000)throw Object.assign(Error('TEXT_LIMIT'),{code:'TEXT_LIMIT'});
  return {status:text.trim()?'TEXT_EXTRACTED_REVIEW_REQUIRED':'OCR_NOT_CONFIGURED',pages:pdf.numPages,text:text.slice(0,60000),candidates:text.trim()?candidates(text):null,manual_entry:true};
 }finally{await pdf.destroy();}
}
module.exports={candidates,extract};
