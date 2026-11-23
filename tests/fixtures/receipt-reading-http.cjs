'use strict';
const {Fixture}=require('./receipt-control-http.cjs');
class ReadingFixture extends Fixture{
 constructor(actor){super(actor);this.memories=new Map();this.offers=[];this.priceHistory=[];this.extractionCalls=0;}
 readingRPC({p_action:a,p_request:req,p_payload:p}){if(this.intents.has(req))return structuredClone(this.intents.get(req));const doc=this.docs.get(p.id);if(a==='read')return this.view(p.id);if(doc.revision!==p.version)throw Object.assign(Error('VERSION'),{code:'40001'});let result;
 if(a==='save'){doc.reading=structuredClone(p.reading);doc.document_number=p.reading.number;doc.supplier_id=p.reading.supplier_id;doc.document_date=p.reading.date;if(doc.receipt_state==='draft')doc.receipt_draft=structuredClone(p.reading);doc.revision++;result=this.view(p.id);}
 else if(a==='start'){doc.receipt_state='draft';doc.receipt_draft=structuredClone(doc.reading);doc.revision++;result=this.view(p.id);}
 else if(a==='catalogue'){let count=0,prices=0;for(const l of doc.reading.lines.filter(l=>l.confirm_catalogue)){const k=doc.id+':'+l.source_line_id;if(this.memories.has(k))continue;let offer=this.offers.find(o=>o.supplier_id===doc.supplier_id&&o.supplier_reference===l.supplier_reference);if(!offer){let product=this.products.find(x=>x.id===l.product_id);if(!product){product={id:require('crypto').randomUUID(),department:p.department,name:l.description,unit:l.unit,active:true,version:1};this.products.push(product);}offer={id:require('crypto').randomUUID(),product_id:product.id,supplier_id:doc.supplier_id,supplier_reference:l.supplier_reference};this.offers.push(offer);}this.memories.set(k,structuredClone(l));if(l.confirm_price){this.priceHistory.push({line:l,offer});prices++;}count++;}result={lines_memorized:count,prices_recorded:prices,id:doc.id,revision:doc.revision};}
 else throw Error('READING_FIXTURE_UNKNOWN');this.intents.set(req,structuredClone(result));return structuredClone(result);}
 async fetch(url,opts={}){const u=new URL(url);if(u.pathname==='/rest/v1/rpc/pilot_documents'){const a=JSON.parse(opts.body);if(a.p_action==='file_info')return new Response(JSON.stringify(this.files.get(a.p_payload.id)),{status:200});}return super.fetch(url,opts);}
}
module.exports={ReadingFixture};
