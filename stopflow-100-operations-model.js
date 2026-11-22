/* Decimal product arithmetic and durable intentions. No network or business fixtures. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.stopflowOperationsModel=api;})(globalThis,()=>{
 'use strict';
 const n=v=>{const s=String(v??'').replace(',','.');if(!/^\d{1,7}(\.\d{1,3})?$/.test(s))return null;const [a,b='']=s.split('.');const x=BigInt(a)*1000n+BigInt(b.padEnd(3,'0'));return x<=1000000000n?x:null;};
 const fmt=x=>x===null?'':(Number(x)/1000).toLocaleString('fr-BE',{maximumFractionDigits:3});
 const factor=(from,to)=>{if(from===to&&from)return 1;const mass={kg:1000,g:1},volume={l:1000,cl:10,ml:1};for(const family of [mass,volume])if(family[from]&&family[to])return family[from]/family[to];return null;};
 function need(line){const a=n(line.stock),b=n(line.target);return a===null||b===null?null:b>a?b-a:0n;}
 function offer(product,o){const f=factor(o.pack_unit,product.unit),q=Number(o.pack_quantity),price=Number(o.pack_price);return f&&q>0&&o.pack_price!==null&&o.pack_price!==''&&Number.isFinite(price)&&['HT','TTC'].includes(o.price_basis)?{size:q*f,price:price/(q*f),basis:o.price_basis,currency:o.currency||'EUR'}:null;}
 function purchase(product,o,line){const v=offer(product,o),q=need(line);if(!v||q===null)return null;const size=BigInt(Math.round(v.size*1000000)),amount=q*1000n,packs=size&&q>0n?(amount+size-1n)/size:0n;return size?{packs:Number(packs),ordered:(Number(packs*size)/1000000).toLocaleString('fr-BE',{maximumFractionDigits:6}),need:fmt(q),total:Number(packs)*Number(o.pack_price),...v}:null;}
 function cheapest(product,offers){const valid=offers.map(o=>({o,v:offer(product,o)})).filter(x=>x.v);return new Set(valid.filter(x=>!valid.some(y=>y.v.basis===x.v.basis&&y.v.currency===x.v.currency&&y.v.price<x.v.price)).map(x=>x.o.id));}
 const refused=e=>['40001','42501','23514','23503','22023','22P02'].includes(e?.code);
 class Intent{
  constructor(storage,key){this.storage=storage;this.key=key;this.current=JSON.parse(storage.getItem(key)||'null');}
  begin(action,payload,id){if(this.current){if(this.current.action!==action||JSON.stringify(this.current.payload)!==JSON.stringify(payload))throw Error('RECONCILIATION_REQUIRED');return this.current;}this.current={action,payload:structuredClone(payload),id,uncertain:false};this.save();return this.current;}
  save(){this.storage.setItem(this.key,JSON.stringify(this.current));}
  fail(e){if(refused(e)&&!this.current?.uncertain)this.clear();else if(this.current){this.current.uncertain=true;this.save();}}
  clear(){this.storage.removeItem(this.key);this.current=null;}
 }
 const mergeProducts=(lines,products)=>{const ids=new Set(lines.map(l=>l.product_id));return [...lines,...products.filter(p=>p.active&&!ids.has(p.id)).map(p=>({product_id:p.id,stock:'',target:String(p.target),offer_id:p.preferred_offer_id||null}))];};
 return {mergeProducts,canQuickBooking:(actor,context,response)=>Boolean(actor&&context?.actor===actor&&context.establishmentId&&response?.can_view===true&&response?.can_manage===true),number:n,format:fmt,factor,need,offer,purchase,cheapest,Intent,refused};
});
