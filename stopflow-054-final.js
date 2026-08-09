/* StopFlow 0.5.4 — contrôles finaux, droits et diagnostic. */
(function(){
  const S=window.SF54;
  if(!S||window.sf54Finalized)return;
  window.sf54Finalized=true;

  const managerOnly=new Set([
    "bureau","all-inventories","all-checklists","all-history",
    "pending","alerts","banners"
  ]);
  const departmentActions=new Set(["department","checklists","history"]);
  const originalAction=S.action;

  S.action=function(action,department){
    if(managerOnly.has(action)&&!S.manager()){
      alert("Cette vue globale est réservée aux Responsables et Administrateurs.");
      return typeof page==="function"?page("dashboard"):undefined;
    }
    if(departmentActions.has(action)&&department&&!S.can(department)){
      alert("Ton compte n’a pas accès à ce département.");
      return typeof page==="function"?page("dashboard"):undefined;
    }
    return originalAction(action,department);
  };

  function updateIdentity(){
    const own=S.own();
    const department=document.querySelector(".user-department");
    if(department)department.textContent=`Département : ${S.valid(own)?S.label(own):"non défini"}`;
    const meta=document.getElementById("sf52UserMeta");
    if(meta&&S.valid(own)&&!meta.textContent.includes(S.label(own)))meta.textContent=`${meta.textContent}${meta.textContent?" · ":""}${S.label(own)}`;
  }

  function protectGlobalPages(){if(S.manager())return;const current=document.querySelector("#app .page:not(.hidden)")?.id;if(["sf54Bureau","sf54Banners","sf54BureauAlerts"].includes(current)&&typeof page==="function")page("dashboard")}

  S.healthCheck=function(){
    const requiredPages=["sf54Department","sf54Bureau","sf54CuisineSuggestions","sf54Lunchs","sf54Temperatures","sf54Banners","sf54BureauAlerts"];
    return {version:S.version,data:Boolean(window.SF54?.loadDepartments),pages:requiredPages.every(id=>Boolean(document.getElementById(id))),mobileMenu:Boolean(document.getElementById("sf52DrawerContent")),desktopMenu:Boolean(document.getElementById("sf53DesktopNav")),department:S.own()||null,manager:S.manager(),suppliers:(window.db?.suppliers||[]).length,articles:(window.db?.articles||[]).length,orders:(window.db?.orders||[]).length};
  };

  function apply(){updateIdentity();protectGlobalPages()}
  if(typeof applyRole==="function"&&!window.sf54FinalRolePatched){window.sf54FinalRolePatched=true;const previousApplyRole=applyRole;applyRole=function(){previousApplyRole();setTimeout(apply,0)}}
  if(typeof showApp==="function"&&!window.sf54FinalShowPatched){window.sf54FinalShowPatched=true;const previousShowApp=showApp;showApp=function(){previousShowApp();setTimeout(apply,0);setTimeout(apply,900)}}
  [0,300,900,1800].forEach(delay=>setTimeout(apply,delay));
})();

/* Correction ciblée : recharger les fournisseurs attribués aux départements. */
(function(){
  if(document.querySelector('script[data-stopflow-054-supplier-refresh="0.5.4"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-054-supplier-refresh-fix.js?v=0543";
  script.async=false;
  script.dataset.stopflow054SupplierRefresh="0.5.4";
  document.head.appendChild(script);
})();

/* StopFlow 0.6.0 — accès à plusieurs départements et corrections de navigation. */
(function(){
  const loadFix=()=>{
    if(document.querySelector('script[data-stopflow-060-menu-auth-fix="0.6.0"]'))return;
    const fix=document.createElement("script");
    fix.src="stopflow-060-menu-auth-fix.js?v=0602";
    fix.async=false;
    fix.dataset.stopflow060MenuAuthFix="0.6.0";
    document.head.appendChild(fix);
  };
  const existing=document.querySelector('script[data-stopflow-060-multi-departments="0.6.0"]');
  if(existing){
    if(window.stopflow060MultiDepartments)loadFix();
    else existing.addEventListener("load",loadFix,{once:true});
    return;
  }
  const script=document.createElement("script");
  script.src="stopflow-060-multi-departments.js?v=0601";
  script.async=false;
  script.dataset.stopflow060MultiDepartments="0.6.0";
  script.onload=loadFix;
  document.head.appendChild(script);
})();

/* StopFlow 0.6.0 — masquer les pages non autorisées dans le menu Bureau. */
(function(){
  if(document.querySelector('script[data-stopflow-060-permission-menu-fix="0.6.0"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-060-permission-menu-fix.js?v=0601";
  script.async=false;
  script.dataset.stopflow060PermissionMenuFix="0.6.0";
  document.head.appendChild(script);
})();

/* StopFlow 0.6.0 — distinguer les idées communes des suggestions Cuisine. */
(function(){
  if(document.querySelector('script[data-stopflow-060-ideas-wording="0.6.0"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-060-ideas-wording.js?v=0602";
  script.async=false;
  script.dataset.stopflow060IdeasWording="0.6.0";
  document.head.appendChild(script);
})();

/* StopFlow 0.6.0 — simplifier le menu Bureau sans retirer de fonctions. */
(function(){
  if(document.querySelector('script[data-stopflow-060-bureau-simplify="0.6.0"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-060-bureau-simplify.js?v=0601";
  script.async=false;
  script.dataset.stopflow060BureauSimplify="0.6.0";
  document.head.appendChild(script);
})();

/* StopFlow 0.6.0 — nettoyer le doublon du département principal dans les formulaires utilisateurs. */
(function(){
  if(document.querySelector('script[data-stopflow-060-user-form-cleanup="0.6.0"]'))return;
  const script=document.createElement("script");
  script.src="stopflow-060-user-form-cleanup.js?v=0601";
  script.async=false;
  script.dataset.stopflow060UserFormCleanup="0.6.0";
  document.head.appendChild(script);
})();

/* StopFlow 0.7.0 — interface permissions par fonction des profils, chargée après les correctifs 0.6.0. */
(function(){
  if(document.querySelector('script[data-stopflow-070-profile-permissions="0.7.0"]'))return;
  const load=()=>{
    if(document.querySelector('script[data-stopflow-070-profile-permissions="0.7.0"]'))return;
    const script=document.createElement("script");
    script.src="stopflow-070-profile-permissions.js?v=0702";
    script.async=false;
    script.dataset.stopflow070ProfilePermissions="0.7.0";
    document.head.appendChild(script);
  };
  let attempts=0;
  const timer=setInterval(()=>{
    if(window.stopflow060MultiDepartments&&window.stopflow060MenuAuthFix&&window.stopflow060UserFormCleanupPatched){clearInterval(timer);load();return}
    if(++attempts>=40){clearInterval(timer);load()}
  },75);
})();
