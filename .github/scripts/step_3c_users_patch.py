from pathlib import Path
import re

path = Path("index.html")
text = path.read_text(encoding="utf-8")
original = text

old_title = "<title>StopFlow — v0.3.2</title>"
base_head = """<title>StopFlow</title>
<meta name="application-name" content="StopFlow">
<meta name="apple-mobile-web-app-title" content="StopFlow">"""

if old_title in text:
    text = text.replace(old_title, base_head, 1)
elif "<title>StopFlow</title>" not in text:
    raise SystemExit("Titre StopFlow v0.3.2 introuvable")

favicon_links = """<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=0322">
<link rel="shortcut icon" href="/favicon.svg?v=0322">"""

text, count = re.subn(
    r'<link rel="icon"[^>]*>\s*(?:<link rel="shortcut icon"[^>]*>\s*)?',
    favicon_links + "\n",
    text,
    count=1,
)

if count == 0:
    marker = '<meta name="apple-mobile-web-app-title" content="StopFlow">'
    if marker not in text:
        raise SystemExit("Emplacement du favicon introuvable")
    text = text.replace(marker, marker + "\n" + favicon_links, 1)

users_script = '<script src="supabase-users.js"></script>'
delete_script = '<script src="supabase-user-delete.js"></script>'
if delete_script not in text:
    if users_script not in text:
        raise SystemExit("Module utilisateurs introuvable")
    text = text.replace(users_script, users_script + "\n" + delete_script, 1)

if text == original:
    print("Identité et modules utilisateurs déjà corrects.")
else:
    path.write_text(text, encoding="utf-8")
    print("Identité StopFlow et suppression des utilisateurs intégrées.")
