from pathlib import Path

index_path = Path("index.html")
index_text = index_path.read_text(encoding="utf-8")
index_original = index_text

catalog_script = '<script src="supabase-catalog.js"></script>'
tools_script = '<script src="supabase-article-tools.js"></script>'

if tools_script not in index_text:
    if catalog_script not in index_text:
        raise SystemExit("Module catalogue introuvable dans index.html")
    index_text = index_text.replace(catalog_script, catalog_script + "\n" + tools_script, 1)

if index_text != index_original:
    index_path.write_text(index_text, encoding="utf-8")
    print("Module d’ajout multiple intégré à index.html.")
else:
    print("Module articles déjà intégré à index.html.")

tools_path = Path("supabase-article-tools.js")
tools_text = tools_path.read_text(encoding="utf-8")
tools_original = tools_text

tools_text = tools_text.replace(
    "return supplierById(article.supplierId)||supplierByName(article.supplier);",
    "return supplierByName(article.supplier)||supplierById(article.supplierId);",
    1,
)

binding_marker = "  /* Actualise les données si une session avait été restaurée avant l’installation du module. */"
bindings = """  const articleSupplierInput=document.querySelector(\"#articleSupplier\");
  if(articleSupplierInput)articleSupplierInput.onchange=renderArticles;
  const supplierSearchInput=document.querySelector(\"#supplierSearch\");
  if(supplierSearchInput)supplierSearchInput.oninput=renderSuppliers;

"""
if "articleSupplierInput.onchange=renderArticles" not in tools_text:
    if binding_marker not in tools_text:
        raise SystemExit("Emplacement des liaisons articles introuvable")
    tools_text = tools_text.replace(binding_marker, bindings + binding_marker, 1)

if tools_text != tools_original:
    tools_path.write_text(tools_text, encoding="utf-8")
    print("Filtres et rattachements des articles corrigés.")
else:
    print("Filtres et rattachements déjà corrects.")
