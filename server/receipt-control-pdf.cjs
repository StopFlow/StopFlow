'use strict';
const crypto=require('node:crypto');
function fail(code){throw Object.assign(Error(code),{code});}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function build(job,originals){
 const {PDFDocument,StandardFonts,rgb,PDFName}=require('pdf-lib'),sharp=require('sharp');
 if(job.status!=='pending'||!Array.isArray(originals)||!originals.length||originals.length>20||job.originals.length!==originals.length||new Set(originals.map(x=>x.file.id)).size!==originals.length)fail('CONTROL_SOURCE_INVALID');
 const pdf=await PDFDocument.create({updateMetadata:false}),normal=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),date=new Date(job.created_at);
 pdf.setTitle('StopFlow — Contrôle '+job.version);pdf.setAuthor(job.snapshot.operator_label||'Opérateur');pdf.setCreator('StopFlow Pilote');pdf.setProducer('StopFlow Pilote / pdf-lib 1.17.1');pdf.setCreationDate(date);pdf.setModificationDate(date);
 const ink=rgb(.06,.15,.28),blue=rgb(.02,.31,.78),pale=rgb(.94,.97,1);let page,y,pages=0;
 // Preserve unsupported code points explicitly instead of silently deleting names/notes.
 const text=value=>[...String(value??'')].map(c=>{try{normal.encodeText(c);return c;}catch{return '[U+'+c.codePointAt(0).toString(16).toUpperCase()+']';}}).join('');
 function sheet(){page=pdf.addPage([595.28,841.89]);y=800;pages++;page.drawRectangle({x:30,y:775,width:535,height:42,color:pale});page.drawText('StopFlow | Bon de contrôle',{x:42,y:790,font:bold,size:18,color:ink});y=751;}
 function lines(value,width=510,size=11,font=normal){const output=[];for(const para of text(value).split(/\r?\n/)){let line='';for(const word of para.split(/\s+/)){let fragments=[''];for(const c of word){let i=fragments.length-1;if(font.widthOfTextAtSize(fragments[i]+c,size)>width)fragments.push(c);else fragments[i]+=c;}for(const fragment of fragments){if(font.widthOfTextAtSize(line+(line?' ':'')+fragment,size)>width){output.push(line);line=fragment;}else line+=(line?' ':'')+fragment;}}output.push(line);}return output;}
 function write(value,{size=11,font=normal,color=ink,space=5}={}){for(const line of lines(value,510,size,font)){if(y<55)sheet();page.drawText(line,{x:42,y,font,size,color});y-=size+space;}}
 function gap(n=10){y-=n;}
 const data=job.snapshot.control,fmt=v=>v===null||v===undefined||v===''?'Non renseigné':String(v),stamp=v=>{if(!v)return 'Non renseignée';const d=new Date(v);if(!Number.isFinite(d.getTime()))return 'Non renseignée';return new Intl.DateTimeFormat('fr-BE',{timeZone:'Europe/Brussels',dateStyle:'short',timeStyle:'short'}).format(d);};
 sheet();write('Version '+job.version+' — contrôle humain validé',{font:bold,size:14,color:blue});gap();write('Fournisseur : '+fmt(job.snapshot.supplier_name));write('Référence : '+fmt(data.number));write('Réception : '+stamp(data.received_at));if(data.date)write('Date du document : '+data.date);write('Opérateur : '+fmt(job.snapshot.operator_label));write('Validation : '+stamp(job.snapshot.validated_at));write('Département(s) : '+job.snapshot.departments.map(d=>({cuisine:'Cuisine',salle:'Salle',nettoyage:'Entretien & hygiène'})[d]||d).join(', '));gap();
 for(let i=0;i<data.lines.length;i++){const item=data.lines[i];if(y<180)sheet();write((i+1)+'. '+fmt(item.description),{font:bold,size:13});if(item.supplier_reference)write('Référence fournisseur : '+item.supplier_reference);if(item.quantity!==undefined&&item.quantity!=='')write('Quantité sur le bon : '+item.quantity+(item.unit?' '+item.unit:''));write('Quantité reçue : '+fmt(item.received_quantity)+(item.received_unit?' '+item.received_unit:' — unité non renseignée'));write('Température relevée : '+(item.temperature!==''&&item.temperature!==null&&item.temperature!==undefined?item.temperature+' °C':'Non renseignée'));write('Emballage intact : '+(({yes:'Oui',no:'Non'})[item.packaging_intact]||'Non renseigné'));write('Contrôle humain : '+(({yes:'Conforme',no:'Non conforme'})[item.conformity]||'Non renseigné'),{font:bold,color:item.conformity==='no'?rgb(.66,.1,.1):ink});if(item.observations)write('Observations / réserves : '+item.observations);gap(12);}
 if(data.missing_lines?.length){write('Articles manquants — non livrés',{font:bold,size:14,color:blue});for(const item of data.missing_lines)write(fmt(item.supplier_reference)+' — '+fmt(item.description)+(item.quantity?' — '+item.quantity+' '+(item.unit||''):''));write('Rubrique séparée : ces articles ne sont pas déclarés reçus.',{size:10});gap();}
 if(data.observations){write('Observations générales',{font:bold,size:13});write(data.observations);gap();}
 write('Ce bon conserve le contrôle humain. Aucune température ni conformité n’a été déduite automatiquement du document.',{size:10});write('Dossier : '+job.document_id,{size:9});write('Contrôle : '+job.id,{size:9});
 let total=0,annexPages=0;for(let i=0;i<originals.length;i++){
  const {file,bytes}=originals[i];total+=bytes.length;if(total>80*1024*1024)fail('ORIGINAL_TOTAL_LIMIT');if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)fail('ORIGINAL_HASH_MISMATCH');
  if(!job.originals.some(x=>x.id===file.id&&x.sha256===file.sha256&&x.path===file.path))fail('CONTROL_SOURCE_INVALID');
  if(file.mime==='application/pdf'){
   let source;try{source=await PDFDocument.load(bytes,{updateMetadata:false});}catch{fail('ORIGINAL_PDF_UNREADABLE');}
   if(source.getPageCount()>30||annexPages+source.getPageCount()>60)fail('ANNEX_PAGE_LIMIT');
   sheet();write('Annexe '+(i+1)+' — document original PDF',{font:bold,size:15});write(file.name);write('Identifiant : '+file.id,{size:9});write('SHA-256 : '+file.sha256,{size:9});write('Les pages suivantes reproduisent le document. Le fichier original reste conservé séparément, inchangé.');
   for(const p of await pdf.copyPages(source,source.getPageIndices())){p.node.delete(PDFName.of('AA'));pdf.addPage(p);annexPages++;}
  }else{
   let converted;try{converted=await sharp(bytes,{limitInputPixels:40000000,failOn:'error'}).rotate().resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:88}).toBuffer();}catch{fail('ORIGINAL_IMAGE_UNREADABLE');}
   const image=await pdf.embedJpg(converted),landscape=image.width>image.height*1.2,w=landscape?841.89:595.28,h=landscape?595.28:841.89;page=pdf.addPage([w,h]);const scale=Math.min((w-72)/image.width,(h-140)/image.height);page.drawText(text('Annexe '+(i+1)+' — '+file.name),{x:36,y:h-34,font:bold,size:12,color:ink,maxWidth:w-72});page.drawImage(image,{x:(w-image.width*scale)/2,y:70+(h-140-image.height*scale)/2,width:image.width*scale,height:image.height*scale});page.drawText('Original : '+file.id,{x:36,y:42,font:normal,size:9,color:ink});page.drawText('SHA-256 : '+file.sha256,{x:36,y:26,font:normal,size:7,color:ink});annexPages++;if(annexPages>60)fail('ANNEX_PAGE_LIMIT');
  }
 }
 const bytes=Buffer.from(await pdf.save({useObjectStreams:false,addDefaultPage:false}));if(bytes.length>15728640)fail('CONTROL_PDF_SIZE_LIMIT');return {bytes,sha256:hash(bytes),pages:pdf.getPageCount()};
}
module.exports={build,hash};
