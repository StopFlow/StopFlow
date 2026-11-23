'use strict';
// Geometric table parsing. No deduplication and no alphabetical sort.
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const decimal=s=>/^\d+(?:[.,]\d+)?$/.test(String(s).trim())?String(s).trim():'';
function parse(rows,page=1){
 const out={supplier_candidate:'',number:'',date:'',lines:[],unclassified:[],review_required:true};let columns=null,previous=null;
 for(const row of rows){const text=row.words.map(w=>w.text).join(' '),s=clean(text);let m;
  if((m=text.match(/(?:fournisseur|exp[eé]diteur)\s*:\s*(.+)/i)))out.supplier_candidate=m[1].trim();
  if((m=text.match(/(?:bon(?:\s+de\s+livraison)?|facture|bordereau)\s*(?:n[°o.]?\s*[:#]?|[:#])\s*(\S+)/i)))out.number=m[1];
  if((m=text.match(/(?:date(?:\s+du\s+bon)?\s*:?\s*)(\d{2})[/.\-](\d{2})[/.\-](\d{4})/i)))out.date=`${m[3]}-${m[2]}-${m[1]}`;
  if((m=text.match(/(?:date(?:\s+du\s+bon)?\s*:?\s*)(\d{4}-\d{2}-\d{2})/i)))out.date=m[1];
  if(/(?:designation|description|libelle|produit)/.test(s)&&/(?:ref|code|article)/.test(s)&&/(?:qte|quantite|livre|commande)/.test(s)){
   out.unclassified=[];columns=[];for(const w of row.words){const t=clean(w.text).replace(/[.:]/g,'');let key=/^(ref|reference|code)/.test(t)?'supplier_reference':/^(designation|description|libelle|produit)/.test(t)?'description':/^(qte|quantite|livre|commande)$/.test(t)?'quantity':/^(unite|unites|un|u|uv|colis|cond|conditionnement)$/.test(t)?'unit':/^(pu|prix|prixnet)$/.test(t)?'unit_price':/^(montant|total)$/.test(t)?'line_total':null;if(key&&!columns.some(c=>c.key===key))columns.push({key,x:w.bbox.x0-12});}columns.sort((a,b)=>a.x-b.x);columns.header=text;const pu=columns.find(c=>c.key==='unit_price'),next=pu&&columns.find(c=>c.x>pu.x);const priceHeading=pu?row.words.filter(w=>w.bbox.x0>=pu.x&&w.bbox.x0<(next?.x||Infinity)).map(w=>w.text).join(' '):'';columns.priceBasis=/\bHT\b/i.test(priceHeading)&&!/\bTTC\b/i.test(priceHeading)?'HT':/\bTTC\b/i.test(priceHeading)&&!/\bHT\b/i.test(priceHeading)?'TTC':'';previous=null;continue;
  }
  if(!columns){if(text.trim())out.unclassified.push({page,row:row.index,text:text.slice(0,300)});continue;}
  if(/^(sous[ -]?total|total\b|tva\b|net\s+a\s+payer|merci\b|page\s+\d)/.test(s)){previous=null;continue;}
  const fields={},weak=[];for(const w of row.words){const col=columns.filter(c=>w.bbox.x0>=c.x).at(-1);if(col){fields[col.key]=(fields[col.key]?fields[col.key]+' ':'')+w.text;if(w.confidence<70&&!weak.includes(col.key))weak.push(col.key);}}
  if(!fields.supplier_reference&&fields.description&&previous&&!fields.quantity&&!fields.unit_price&&!fields.line_total){previous.description+=' '+fields.description;previous.source_rows.push(row.index);continue;}
  if(fields.supplier_reference&&fields.description&&(fields.quantity||fields.unit||fields.unit_price||fields.line_total)){
   const basis=columns.priceBasis||'';
   previous={...fields,quantity:decimal(fields.quantity),unit_price:decimal(fields.unit_price),line_total:decimal(fields.line_total),basis,currency:/€|\bEUR\b/.test(text)?'EUR':'',source_page:page,source_rows:[row.index],review_required:true,uncertain_fields:[...weak,...(!decimal(fields.quantity)?['quantity']:[]),...(fields.unit_price&&!decimal(fields.unit_price)?['unit_price']:[]),...(fields.line_total&&!decimal(fields.line_total)?['line_total']:[])]};out.lines.push(previous);
  }else if(text.trim())out.unclassified.push({page,row:row.index,text:text.slice(0,300)});
 }
 // Price basis/currency are carried only when explicitly printed, never inferred from numbers.
 const all=rows.map(r=>r.words.map(w=>w.text).join(' ')).join('\n');
 const basis=/\bHT\b/i.test(all)&&!/\bTTC\b/i.test(all)?'HT':/\bTTC\b/i.test(all)&&!/\bHT\b/i.test(all)?'TTC':'';
 for(const l of out.lines){if(!l.basis)l.basis=basis;if(!l.currency&&/€|\bEUR\b/.test(all))l.currency='EUR';if(l.unit_price&&!l.basis)l.uncertain_fields.push('basis');}
 return out;
}
function rowsFromWords(words){const rows=[];for(const w of words.filter(w=>w.text?.trim()).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){const cy=(w.bbox.y0+w.bbox.y1)/2,h=w.bbox.y1-w.bbox.y0;let row=rows.find(r=>Math.abs(r.y-cy)<Math.max(5,h*.48));if(!row){row={y:cy,words:[],index:rows.length+1};rows.push(row);}row.words.push(w);}return rows.sort((a,b)=>a.y-b.y).map((r,i)=>({...r,index:i+1,words:r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)}));}
module.exports={parse,rowsFromWords,decimal};
