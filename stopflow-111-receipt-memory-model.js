/* Same-line price evidence and explicit missing decision, shared by OCR and UI. */
(function(root,factory){const m=factory();if(typeof module==='object')module.exports=m;else root.stopflowReceiptMemoryModel=m;})(globalThis,()=>{
'use strict';
const number=x=>/^\d+(?:[.,]\d+)?$/.test(String(x??'').trim())&&Number.isFinite(Number(String(x).replace(',','.')))?Number(String(x).replace(',','.')):null;
const ref=v=>String(v??'').trim().toLowerCase();
const unit=v=>({litre:'l',litres:'l',liter:'l',liters:'l',litreS:'l',kilo:'kg',kilos:'kg',kilogramme:'kg',kilogrammes:'kg',pieces:'piece','pièces':'piece','pièce':'piece'}[ref(v)]||ref(v));
function price(l){
 const errors=l.uncertain_fields||[],corrected=l.corrected_fields||[],printed=Boolean(l.price_printed||corrected.includes('unit_price')||!l.price_derivation&&String(l.unit_price??'').trim());
 const value=number(l.unit_price),q=number(l.quantity),total=number(l.line_total),u=unit(l.pack_unit||l.unit),basis=l.basis,currency=l.currency;
 const ambiguous=errors.some(k=>['unit_price','quantity','unit','pack_unit','pack_quantity','basis','currency','line_total'].includes(k)&&!corrected.includes(k));
 const pack=number(l.pack_quantity||'1');
 if(printed){const inconsistent=(!l.line_total_basis||l.line_total_basis===basis)&&pack===1&&q>0&&total!==null&&value!==null&&Math.abs(q*value-total)>.02;return {status:ambiguous||inconsistent||value===null||q===0?'review':corrected.includes('unit_price')?'corrected':'read',value,unit:u,basis,currency,reason:inconsistent?'Montant, quantité et prix imprimé incohérents.':''};}
 if(total===null)return {status:l.price_printed||errors.includes('unit_price')?'review':'absent',value:null,unit:u,basis,currency};
 if(l.line_total_basis&&l.line_total_basis!==basis||ambiguous||!q||q<=0||!['kg','g','l','cl','ml','piece'].includes(u)||pack!==1||unit(l.unit)!==u||!['HT','TTC'].includes(basis)||currency!=='EUR'||l.line_total_net===false||Number(l.deposit?.replace?.(',','.')||0)>0&&!l.line_total_net)return {status:'review',value:null,unit:u,basis,currency,reason:'Quantité, montant net, unité, conditionnement ou base à vérifier.'};
 return {status:'calculated',value:Math.round(total/q*10000)/10000,unit:u,basis,currency,net:total,quantity:q};
}
function applyPrice(line){const l=structuredClone(line),p=price(l);if(p.status==='calculated'){l.unit_price=String(p.value);l.pack_unit=p.unit;l.pack_quantity='1';l.price_derivation={kind:'calculated',net:p.net,quantity:p.quantity,unit:p.unit,basis:p.basis,currency:p.currency};}return l;}
const isMissing=l=>l.incident_kind==='missing'&&l.quantity_diff===true&&number(l.received_quantity)===0;
function missing(l,on){const n=structuredClone(l);if(on){if(!isMissing(n))n.missing_restore=Object.fromEntries(['incident_kind','quantity_diff','received_quantity','received_unit','temperature','temperature_relevant','packaging_intact','conformity','quantity_confirmed_same'].map(k=>[k,n[k]??'']));Object.assign(n,{incident_kind:'missing',quantity_diff:true,received_quantity:'0',received_unit:n.unit||'',temperature:'',temperature_relevant:false,packaging_intact:'',conformity:'no',quantity_confirmed_same:false});}else {Object.assign(n,n.missing_restore||{incident_kind:'',quantity_diff:false,received_quantity:'',temperature:'',temperature_relevant:false,packaging_intact:'',conformity:'',quantity_confirmed_same:false});delete n.missing_restore;}delete n.physical_reviewed;delete n.physical_snapshot;return n;}
const temperature=v=>/^-?\d{1,3}(?:[.,]\d{1,2})?$/.test(String(v))?String(v).replace('.',','):v===''?'':null;
return {number,ref,unit,price,applyPrice,isMissing,missing,temperature};
});
