from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")
original = text

catalog_script = '<script src="supabase-catalog.js"></script>'
tools_script = '<script src="supabase-article-tools.js"></script>'

if tools_script not in text:
    if catalog_script not in text:
        raise SystemExit("Module catalogue introuvable dans index.html")
    text = text.replace(catalog_script, catalog_script + "\n" + tools_script, 1)

if text == original:
    print("Module articles déjà intégré.")
else:
    path.write_text(text, encoding="utf-8")
    print("Module d’ajout multiple intégré à index.html.")
