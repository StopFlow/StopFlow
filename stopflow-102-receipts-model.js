/* Document presentation only; server remains authoritative for rights and application. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.stopflowReceiptsModel=api;})(globalThis,()=>{
 'use strict';
 const number=v=>String(v??'').trim()===''?null:Number(String(v).replace(',','.'));
 function normalized(row,unit,factor){const f=factor(row.pack_unit,unit),q=number(row.pack_quantity),p=number(row.pack_price);return f&&q>0&&p!==null&&Number.isFinite(p)&&['HT','TTC'].includes(row.basis||row.price_basis)?{price:p/(q*f),basis:row.basis||row.price_basis,unit}:null;}
 function matches(product,offers,suppliers,query){const hay=[product.name,product.category,...offers.flatMap(o=>[o.supplier_reference,o.pack_quantity,o.pack_unit,JSON.stringify(o.characteristics),suppliers.find(s=>s.id===o.supplier_id)?.name])].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/\s+/).every(x=>hay.includes(x));}
 function suggestions(source,offers,products){const p=products.find(p=>p.id===source.product_id);if(!p)return [];const tokens=new Set(p.name.toLowerCase().split(/\W+/).filter(x=>x.length>2));return offers.filter(o=>o.id!==source.id&&o.active).filter(o=>{const x=products.find(p=>p.id===o.product_id);return x&&x.active&&x.department===p.department&&x.name.toLowerCase().split(/\W+/).some(t=>tokens.has(t));});}
 const line=(department)=>({department,type:'product',description:'',supplier_reference:'',quantity:'',received_quantity:'',pack_quantity:'',pack_unit:'',pack_price:'',discount:'',basis:'',currency:'',product_id:'',temperature:'',temperature_relevant:false,conformity:'',packaging_intact:'',quantity_diff:false,quantity_confirmed_same:false,observations:'',characteristics:{}});
 return {number,normalized,matches,suggestions,line};
});
