/* Human progress is independent from OCR uncertainty, selection and catalogue memory. */
(function(root,factory){const m=factory();if(typeof module==='object')module.exports=m;else root.stopflowReceiptGuideModel=m;})(globalThis,()=>{
'use strict';
const fields=['description','supplier_reference','quantity','unit','packaging_intact','quantity_diff','received_quantity','received_unit','temperature_relevant','temperature','observations','incident_kind'];
const snapshot=l=>Object.fromEntries(fields.map(k=>[k,String(l[k]??'')]));
const equal=(a,b)=>fields.every(k=>a?.[k]===b?.[k]);
const checked=l=>l.physical_reviewed===true&&equal(l.physical_snapshot,snapshot(l));
const uncertain=l=>(l.uncertain_fields||[]).length>0;
function counts(lines){const products=lines.filter(l=>l.type==='product');return {total:products.length,checked:products.filter(checked).length,remaining:products.filter(l=>!checked(l)).length,reading:products.filter(uncertain).length};}
function confirm(line,finish){const l=finish({lines:[structuredClone(line)]}).lines[0];l.physical_reviewed=true;l.physical_snapshot=snapshot(l);return l;}
function first(lines){return lines.findIndex(l=>l.type==='product'&&!checked(l));}
function rectAt(l,key,rotation,file){const g=l.source_geometry;if(!g||g.version!==1||g.space!=='ocr-oriented'||l.source_file_id!==file?.id||l.source_sha256!==file?.sha256||![0,90,180,270].includes(g.rotation))return null;const r=g.cells?.[key]||g.row;if(!r||!['x0','x1','y0','y1'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)||r.x1<=r.x0||r.y1<=r.y0)return null;const angle=(rotation-g.rotation+360)%360,points=[[r.x0,r.y0],[r.x1,r.y0],[r.x0,r.y1],[r.x1,r.y1]].map(([x,y])=>angle===90?[1-y,x]:angle===180?[1-x,1-y]:angle===270?[y,1-x]:[x,y]);return {x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),y0:Math.min(...points.map(p=>p[1])),y1:Math.max(...points.map(p=>p[1]))};}
const num=x=>/^\d+([.,]\d+)?$/.test(String(x??''))?Number(String(x).replace(',','.')):null;
// Display only the price information actually read; never infer HT/TTC or a stock unit.
function displayPrice(line){
 const value=num(line.unit_price),known=String(line.unit_price??'').trim()!=='',warnings=line.uncertain_fields||[];
 const uncertain=warnings.some(k=>['unit_price','currency','unit','pack_unit','pack_quantity','basis'].includes(k))||(value===null&&(known||line.price_printed===true));
 if(value===null)return {text:uncertain?'À vérifier':'—',uncertain};
 const money=value.toLocaleString('fr-BE',{minimumFractionDigits:2,maximumFractionDigits:4}),currency=line.currency==='EUR'?' €':line.currency?' '+line.currency:'';
 const rawUnit=String(line.pack_unit||line.unit||'').trim(),unit=rawUnit.toLowerCase()==='l'?'L':rawUnit,pack=num(line.pack_quantity),denominator=unit?'/'+(pack!==null&&pack!==1?pack.toLocaleString('fr-BE')+' ':'')+unit:'';
 return {text:money+currency+denominator+(['HT','TTC'].includes(line.basis)?' '+line.basis:''),uncertain};
}
function displayDate(value){
 const s=String(value||'');if(!s)return 'Date à vérifier';
 const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T12:00:00Z':s);
 return Number.isNaN(date.getTime())?'Date à vérifier':date.toLocaleDateString('fr-BE',{timeZone:'Europe/Brussels',day:'2-digit',month:'2-digit',year:'numeric'});
}
function compare(line,offer,history,document){if((line.uncertain_fields||[]).some(k=>['unit_price','unit','pack_unit','pack_quantity','basis','currency'].includes(k)))return {ok:false,reason:'Lecture du prix ou du conditionnement à vérifier.'};const current=num(line.unit_price),pack=num(line.pack_quantity||'1'),unit=String(line.pack_unit||line.unit||'').trim().toLowerCase();if(current===null||!pack||!unit||!['HT','TTC'].includes(line.basis)||line.currency!=='EUR')return {ok:false,reason:'Prix, unité, conditionnement, devise ou base HT/TTC à vérifier.'};if(!offer||offer.supplier_id!==document.supplier_id||String(offer.supplier_reference).trim().toLowerCase()!==String(line.supplier_reference).trim().toLowerCase()||line.uncertain_fields?.includes('supplier_reference'))return {ok:false,reason:'Référence fournisseur non confirmée ou ambiguë.'};const compatible=history.filter(h=>h.offer_id===offer.id&&h.document_id!==document.id&&h.price_date<=document.date&&String(h.pack_unit).trim().toLowerCase()===unit&&Number(h.pack_quantity)===pack&&h.basis===line.basis&&(!h.currency||h.currency==='EUR')&&num(h.pack_price)!==null).sort((a,b)=>String(b.price_date).localeCompare(String(a.price_date))||String(b.id).localeCompare(String(a.id)));const previous=compatible[0];if(previous&&previous.price_date===document.date)return {ok:false,reason:'Prix du même jour : ordre des confirmations non disponible pour établir un prix antérieur.'};if(previous&&new Set(compatible.filter(h=>h.price_date===previous.price_date).map(h=>Number(h.pack_price))).size>1)return {ok:false,reason:'Plusieurs prix confirmés différents à la même date : comparaison ambiguë.'};return previous?{ok:true,current,previous:Number(previous.pack_price),difference:Math.round((current-Number(previous.pack_price))*10000)/10000,date:previous.price_date,unit,pack,basis:line.basis,currency:'EUR'}:{ok:false,reason:'Aucun prix antérieur confirmé avec la même unité, le même conditionnement et la même base HT/TTC.'};}
return {fields,snapshot,checked,uncertain,counts,confirm,first,rectAt,compare,displayPrice,displayDate};
});
