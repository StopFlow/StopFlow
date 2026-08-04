/* StopFlow 0.5.4 — données partagées par département. */
(function(){
  const D={salle:"Salle",cuisine:"Cuisine",nettoyage:"Entretien & hygiène",bureau:"Bureau"};
  const S=window.SF54=window.SF54||{version:"0.5.4",departments:D,state:{department:null,history:null,checklists:null,bureau:"all",banners:[],content:[],temperatures:[],runs:[]}};
  S.$=q=>document.querySelector(q);S.$$=q=>[...document.querySelectorAll(q)];
  S.esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  S.manager=()=>typeof isResponsible==="function"&&isResponsible();
  S.cloud=()=>typeof isCloudMode==="function"&&isCloudMode();
  S.own=()=>String(session?.department||session?.departement||"").toLowerCase();
  S.valid=d=>Boolean(D[d]);S.label=d=>d==="all"?"Tous les départements":D[d]||"Non défini";
  S.date=v=>{const d=new Date(v);return !v||isNaN(d)?"—":d.toLocaleDateString("fr-BE")};
  S.dateTime=v=>{const d=new Date(v);return !v||isNaN(d)?"—":d.toLocaleString("fr-BE",{dateStyle:"short",timeStyle:"short"})};
  S.supplier=name=>(db.suppliers||[]).find(x=>String(x.name).toLowerCase()===String(name).toLowerCase());
  S.supplierDepartment=value=>{const x=typeof value==="object"?value:S.supplier(value);return S.valid(x?.department)?x.department:"salle"};
  S.orderDepartment=o=>S.valid(o?.department)?o.department:S.supplierDepartment(o?.supplier);
  S.can=d=>S.manager()||d===S.own();
  const local=(n,f=[])=>{try{return JSON.parse(localStorage.getItem("sf54_"+n)||JSON.stringify(f))}catch{return f}};
  const store=(n,v)=>localStorage.setItem("sf54_"+n,JSON.stringify(v));

  S.ensureSessionDepartment=async()=>{
    if(!S.cloud()||!session?.id||S.valid(S.own()))return;
    const {data}=await supabaseClient.from("profiles").select("departement").eq("id",session.id).single();
    if(data?.departement){session.department=data.departement;session.departement=data.departement}
  };

  function localDepartments(){
    (db.suppliers||[]).forEach(x=>{if(!S.valid(x.department))x.department="salle"});
    (db.articles||[]).forEach(x=>{if(!S.valid(x.department))x.department=S.supplierDepartment(x.supplier)});
    (db.orders||[]).forEach(x=>{if(!S.valid(x.department))x.department=S.supplierDepartment(x.supplier)});
    try{save()}catch{}
  }
  S.loadDepartments=async()=>{
    localDepartments();if(!S.cloud())return;
    const [a,b,c]=await Promise.all([
      supabaseClient.from("suppliers").select("id,department"),
      supabaseClient.from("articles").select("id,department"),
      supabaseClient.from("orders").select("id,department")
    ]);
    if(a.error||b.error||c.error)throw a.error||b.error||c.error;
    const sm=new Map((a.data||[]).map(x=>[String(x.id),x.department])),am=new Map((b.data||[]).map(x=>[String(x.id),x.department])),om=new Map((c.data||[]).map(x=>[String(x.id),x.department]));
    (db.suppliers||[]).forEach(x=>x.department=sm.get(String(x.id))||x.department||"salle");
    (db.articles||[]).forEach(x=>x.department=am.get(String(x.id))||x.department||S.supplierDepartment(x.supplier));
    (db.orders||[]).forEach(x=>x.department=om.get(String(x.id))||x.department||S.supplierDepartment(x.supplier));
    try{save()}catch{}
  };

  S.loadFeatures=async()=>{
    if(!S.cloud()){
      S.state.banners=local("banners");S.state.content=local("content");S.state.temperatures=local("temperatures");S.state.runs=[];return;
    }
    const [a,b,c,d]=await Promise.all([
      supabaseClient.from("team_banners").select("*").order("start_at",{ascending:false}),
      supabaseClient.from("department_content").select("*").order("created_at",{ascending:false}),
      supabaseClient.from("temperature_readings").select("*").order("recorded_at",{ascending:false}).limit(250),
      supabaseClient.from("checklist_runs").select("id,template_name,department,status,performed_by_name,started_at").order("started_at",{ascending:false}).limit(250)
    ]);
    if(a.error||b.error||c.error||d.error)throw a.error||b.error||c.error||d.error;
    S.state.banners=a.data||[];S.state.content=b.data||[];S.state.temperatures=c.data||[];S.state.runs=d.data||[];
  };

  S.saveBanner=async p=>{
    if(S.cloud()){const q={...p};delete q.id;const {data,error}=await supabaseClient.from("team_banners").insert(q).select("*").single();if(error)throw error;S.state.banners.unshift(data)}
    else{S.state.banners.unshift(p);store("banners",S.state.banners)}
  };
  S.disableBanner=async id=>{
    if(S.cloud()){const {error}=await supabaseClient.from("team_banners").update({active:false,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error}
    const x=S.state.banners.find(v=>String(v.id)===String(id));if(x)x.active=false;if(!S.cloud())store("banners",S.state.banners);
  };
  S.saveContent=async p=>{
    if(S.cloud()){const q={...p};delete q.id;const {data,error}=await supabaseClient.from("department_content").insert(q).select("*").single();if(error)throw error;S.state.content.unshift(data)}
    else{S.state.content.unshift(p);store("content",S.state.content)}
  };
  S.archiveContent=async id=>{
    if(S.cloud()){const {error}=await supabaseClient.from("department_content").update({active:false,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error}
    const x=S.state.content.find(v=>String(v.id)===String(id));if(x)x.active=false;if(!S.cloud())store("content",S.state.content);
  };
  S.saveTemperature=async p=>{
    if(S.cloud()){const q={...p};delete q.id;delete q.anomaly;const {data,error}=await supabaseClient.from("temperature_readings").insert(q).select("*").single();if(error)throw error;S.state.temperatures.unshift(data)}
    else{S.state.temperatures.unshift(p);store("temperatures",S.state.temperatures)}
  };

  function injectSupplierDepartment(id){
    if(S.$("#supplierDepartment"))return;const box=S.$("#modalBox"),x=(db.suppliers||[]).find(v=>String(v.id||v.code)===String(id||""));if(!box)return;
    const f=document.createElement("div");f.className="field sf54-department-field";f.innerHTML=`<label>Département *</label><select id="supplierDepartment" class="input">${Object.entries(D).map(([v,l])=>`<option value="${v}" ${v===(x?.department||"salle")?"selected":""}>${l}</option>`).join("")}</select>`;
    S.$("#supplierDescription")?.closest(".field")?.insertAdjacentElement("afterend",f);
  }

  function patchCatalog(){
    if(window.sf54CatalogPatched)return;window.sf54CatalogPatched=true;
    if(typeof loadSharedCatalog==="function"){const old=loadSharedCatalog;loadSharedCatalog=async function(){const r=await old(...arguments);await S.loadDepartments();S.render?.();return r}}
    if(typeof loadSharedOrders==="function"){const old=loadSharedOrders;loadSharedOrders=async function(){const r=await old(...arguments);await S.loadDepartments();return r}}
    if(typeof supplierModal==="function"){const old=supplierModal;supplierModal=function(id){old(id);setTimeout(()=>injectSupplierDepartment(id),0)}}
    if(typeof saveSharedSupplier==="function"){const old=saveSharedSupplier;saveSharedSupplier=async function(x){const d=S.$("#supplierDepartment")?.value||x.department||"salle",r=await old({...x,department:d});if(S.cloud()&&r?.id){let z=await supabaseClient.from("suppliers").update({department:d}).eq("id",r.id);if(z.error)throw z.error;z=await supabaseClient.from("articles").update({department:d}).eq("supplier_id",r.id);if(z.error)throw z.error}if(r)r.department=d;await S.loadDepartments();return r}}
    if(typeof saveSharedArticle==="function"){const old=saveSharedArticle;saveSharedArticle=async function(x){const d=S.supplierDepartment(x.supplier),r=await old({...x,department:d});if(S.cloud()&&r?.id){const z=await supabaseClient.from("articles").update({department:d}).eq("id",r.id);if(z.error)throw z.error}if(r)r.department=d;return r}}
  }

  function patchOrders(){
    if(window.sf54OrdersPatched)return;window.sf54OrdersPatched=true;
    if(typeof activeArticles==="function")activeArticles=function(s=current.supplier){const d=S.valid(current?.department)?current.department:S.supplierDepartment(s);return (db.articles||[]).filter(x=>x.active&&x.supplier===s&&(!S.valid(x.department)||x.department===d))};
    if(typeof newInventory==="function"){const old=newInventory;newInventory=function(s){const d=S.valid(S.state.department)?S.state.department:S.supplierDepartment(s);old(s);current.department=d;current.supplierId=S.supplier(s)?.id||null}}
    if(typeof orderSnapshot==="function"){const old=orderSnapshot;orderSnapshot=function(st){const o=old(st);o.department=S.valid(current?.department)?current.department:S.supplierDepartment(o.supplier);return o}}
    if(typeof stopFlowCurrentOrder==="function"){const old=stopFlowCurrentOrder;stopFlowCurrentOrder=function(){const o=old();if(o)o.department=S.valid(current?.department)?current.department:S.supplierDepartment(o.supplier);return o}}
    if(typeof stopFlowResumeOrder==="function"){const old=stopFlowResumeOrder;stopFlowResumeOrder=function(o,src){old(o,src);if(current)current.department=S.orderDepartment(o)}}
    if(typeof showDetail==="function"){const old=showDetail;showDetail=function(id){old(id);const o=(db.orders||[]).find(x=>String(x.id)===String(id)),h=S.$("#modalBox h2");if(o&&h&&!S.$("#modalBox .sf54-detail-department"))h.insertAdjacentHTML("afterend",`<div class="sf54-detail-department">${S.label(S.orderDepartment(o))}</div>`)}}
  }

  S.patchData=()=>{patchCatalog();patchOrders()};
})();
