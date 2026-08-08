/* StopFlow 0.6.0 — simplification non destructive du menu Bureau. */
(function(){
  if(window.stopflow060BureauSimplify)return;
  window.stopflow060BureauSimplify=true;

  const hiddenActions=[
    "department",
    "checklists",
    "history",
    "all-inventories",
    "all-checklists",
    "all-history",
    "pending",
    "alerts",
    "banners"
  ];

  const desktop=hiddenActions.map(action=>
    `#sf53DesktopNav .sf53-group[data-group="bureau"] .sf54-menu-entry[data-sf54="${action}"]`
  );
  const mobile=hiddenActions.map(action=>
    `#sf52DrawerContent .sf52-nav-group:has(.sf52-nav-group-toggle[data-group="bureau"]) .sf54-menu-entry[data-sf54="${action}"]`
  );

  const style=document.createElement("style");
  style.id="sf60BureauSimplifyStyle";
  style.textContent=`${[...desktop,...mobile].join(",\n")}{display:none!important}`;
  document.head.appendChild(style);
})();
