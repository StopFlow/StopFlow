from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")
original = text

old_title = "<title>StopFlow — v0.3.2</title>"
new_head = """<title>StopFlow</title>
<meta name="application-name" content="StopFlow">
<meta name="apple-mobile-web-app-title" content="StopFlow">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2716%27 fill=%27%23071d31%27/%3E%3Ccircle cx=%2732%27 cy=%2732%27 r=%2721%27 fill=%27none%27 stroke=%27%2364a0ff%27 stroke-width=%274%27/%3E%3Cpath d=%27M22 40L42 20M30 20h12v12%27 fill=%27none%27 stroke=%27white%27 stroke-width=%275%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E">"""

if old_title in text:
    text = text.replace(old_title, new_head, 1)
elif "<title>StopFlow</title>" not in text:
    raise SystemExit("Titre StopFlow v0.3.2 introuvable")

if text == original:
    print("Identité de l’onglet déjà correcte.")
else:
    path.write_text(text, encoding="utf-8")
    print("Identité de l’onglet corrigée : StopFlow.")
