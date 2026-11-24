'use strict';
// Preserve printed order/repeated products. Missing products are a separate section.
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const decimal=s=>/^\d+(?:[.,]\d+)?$/.test(String(s).trim())?String(s).trim():'';
const money=s=>decimal(String(s??'').replace(/(?:€|EUR)/gi,'').replace(/[\s\u00a0\u202f]/g,''));
function parse(rows,page=1,geometry=null){
 const box=words=>words.length?{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))}:null;
 const norm=r=>r&&geometry?{x0:Math.max(0,r.x0/geometry.width),x1:Math.min(1,r.x1/geometry.width),y0:Math.max(0,r.y0/geometry.height),y1:Math.min(1,r.y1/geometry.height)}:null;
 const locate=(row,cells)=>geometry?{version:1,space:'ocr-oriented',rotation:geometry.rotation,width:geometry.width,height:geometry.height,row:norm(box(row.words)),cells:Object.fromEntries(Object.entries(cells).map(([k,ws])=>[k,norm(box(ws))]))}:undefined;
 const out={supplier_candidate:'',number:'',date:'',lines:[],containers:[],missing_lines:[],unclassified:[],review_required:true};let columns=null,previous=null,section='delivered';
 for(const row of rows){const text=row.words.map(w=>w.text).join(' '),s=clean(text);let m;
  if((m=text.match(/(?:fournisseur|exp[eé]diteur)\s*:\s*(.+)/i)))out.supplier_candidate=m[1].trim();
  if((m=text.match(/(?:bon(?:\s+de\s+livraison)?|facture|bordereau)\s*(?:n[°o.]?\s*[:#]?|[:#])\s*(\S+)/i)))out.number=m[1];
  if((m=text.match(/(?:date(?:\s+du\s+bon)?\s*:?\s*)(\d{2})[/.\-](\d{2})[/.\-](\d{4})/i)))out.date=`${m[3]}-${m[2]}-${m[1]}`;
  if((m=text.match(/(?:date(?:\s+du\s+bon)?\s*:?\s*)(\d{4}-\d{2}-\d{2})/i)))out.date=m[1];
  if(/\barticles?\s*manquants?\b/.test(s)){section='missing';previous=null;continue;}
  if(/(?:designation|description|libelle|produit)/.test(s)&&/(?:ref|code|article)/.test(s)&&/(?:qte|quantite|livre|commande)/.test(s)){
   if(!columns)out.unclassified=[];columns=[];
   for(const w of row.words){const t=clean(w.text).replace(/[.:]/g,'');let key=/^(ref|reference|code|article)$/.test(t)?'supplier_reference':/^(designation|description|libelle|produit)$/.test(t)?'description':/^(qte|quantite|livre|commande)$/.test(t)?'quantity':/^(unite|unites|un|u|uv|colis|cond|conditionnement)$/.test(t)?'unit':/^(pu|prix|prixnet)$/.test(t)?'unit_price':(/^(montant|total)$/.test(t)||(t==='totas'&&row.words.some(v=>/^(€|EUR)$/.test(v.text.trim()))))?'line_total':/^(vidange|consigne)$/.test(t)?'deposit':/^tva$/.test(t)?'tax':null;
    if(key==='line_total'&&t==='totas')columns.uncertain=['line_total'];if(key&&!columns.some(c=>c.key===key))columns.push({key,x:w.bbox.x0-12});
   }
   columns.sort((a,b)=>a.x-b.x);const pu=columns.find(c=>c.key==='unit_price'),next=pu&&columns.find(c=>c.x>pu.x),priceHeading=pu?row.words.filter(w=>w.bbox.x0>=pu.x&&w.bbox.x0<(next?.x||Infinity)).map(w=>w.text).join(' '):'';columns.priceBasis=/\bHT\b/i.test(priceHeading)&&!/\bTTC\b/i.test(priceHeading)?'HT':/\bTTC\b/i.test(priceHeading)&&!/\bHT\b/i.test(priceHeading)?'TTC':'';previous=null;continue;
  }
  if(!columns){if(text.trim())out.unclassified.push({page,row:row.index,text:text.slice(0,300)});continue;}
  if(/^(sous[ -]?total|total\b|tva\b|net\s+a\s+payer|merci\b|page\s+\d)/.test(s)){previous=null;if(section==='delivered')section='after_total';continue;}
  const fields={},weak=[],cellWords={};for(const w of row.words){const col=columns.filter(c=>w.bbox.x0>=c.x).at(-1);if(col){(cellWords[col.key]||=([])).push(w);fields[col.key]=(fields[col.key]?fields[col.key]+' ':'')+w.text;if(w.confidence<70&&!weak.includes(col.key))weak.push(col.key);}}
  if(!fields.supplier_reference&&fields.description&&previous&&!fields.quantity&&!fields.unit&&!fields.unit_price&&!fields.line_total){previous.description+=' '+fields.description;previous.source_rows.push(row.index);if(geometry&&previous.source_geometry){const r=norm(box(row.words)),g=previous.source_geometry.row;g.y1=Math.max(g.y1,r.y1);g.x0=Math.min(g.x0,r.x0);g.x1=Math.max(g.x1,r.x1);}continue;}
  // A readable designation and delivery columns suffice; an unreadable code must not discard a product.
  if(fields.description&&(fields.quantity||fields.unit||fields.unit_price||fields.line_total||(section==='missing'&&fields.supplier_reference))){
   const reference=String(fields.supplier_reference||'').trim(),uncertain=[...weak,...(columns.uncertain||[])];if(!reference||/[?\uFFFD]/.test(reference))uncertain.push('supplier_reference');
   if(section==='after_total'){out.unclassified.push({page,row:row.index,text:text.slice(0,300),reason:'SECTION_APRES_TOTAL_A_VERIFIER'});previous=null;continue;}
   previous={...fields,source_geometry:locate(row,cellWords),supplier_reference:reference,quantity:decimal(fields.quantity),unit_price:money(fields.unit_price),line_total:money(fields.line_total),deposit:money(fields.deposit),price_printed:Boolean(fields.unit_price),basis:columns.priceBasis||'',currency:/€|\bEUR\b/.test(text)?'EUR':'',source_section:section,source_page:page,source_rows:[row.index],review_required:true,uncertain_fields:[...new Set([...uncertain,...(!decimal(fields.quantity)?['quantity']:[]),...(fields.unit_price&&!money(fields.unit_price)?['unit_price']:[]),...(fields.line_total&&!money(fields.line_total)?['line_total']:[])])]};if(section==='delivered'&&/\b(bacs?|caisses?)\b/.test(clean(fields.description))){previous.type='deposit';previous.source_section='containers';previous.received_count='';previous.returned_count='';out.containers.push(previous);}else out[section==='missing'?'missing_lines':'lines'].push(previous);
  }else if(text.trim())out.unclassified.push({page,row:row.index,text:text.slice(0,300)});
 }
 const all=rows.map(r=>r.words.map(w=>w.text).join(' ')).join('\n'),basis=/\bHT\b/i.test(all)&&!/\bTTC\b/i.test(all)?'HT':/\bTTC\b/i.test(all)&&!/\bHT\b/i.test(all)?'TTC':'';
 for(const l of [...out.lines,...out.containers,...out.missing_lines]){if(!l.basis)l.basis=basis;if(!l.currency&&/€|\bEUR\b/.test(all))l.currency='EUR';if(l.unit_price&&!l.basis)l.uncertain_fields.push('basis');}
 return out;
}
function rowsFromWords(words){const rows=[];for(const w of words.filter(w=>w.text?.trim()).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){const cy=(w.bbox.y0+w.bbox.y1)/2,h=w.bbox.y1-w.bbox.y0;let row=rows.find(r=>Math.abs(r.y-cy)<Math.max(5,h*.48));if(!row){row={y:cy,words:[],index:rows.length+1};rows.push(row);}row.words.push(w);}return rows.sort((a,b)=>a.y-b.y).map((r,i)=>({...r,index:i+1,words:r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)}));}
module.exports={parse,rowsFromWords,decimal,money};
