# Audit ciblé de la sécurité des rendus Articles — 16 octobre 2026

État actuel : **rendu historique et attributs de la surcharge corrigés** sur
`stopflow-dev`, avec la fonction commune `escapeHTML()` du correctif Commandes.
La reproduction ci-dessous décrit l'état antérieur au correctif Articles, au
commit Suggestions `796d9e1921fcafb70b7ef2ba426f2cc8a48c2720`.

## Protection observée après chargement complet

- `supabase-article-tools.js:164` remplace `renderArticles()`. Les noms,
  fournisseurs, catégories et unités passent par `supplierText()`, qui échappe
  les caractères HTML (`supabase-catalog.js:29–30`).
- `supabase-article-tools.js:208` remplace aussi `articleModal()` et échappe les
  textes placés dans les champs du formulaire.
- `supabase-article-tools.js:357–358` réaffecte le gestionnaire `onchange` du
  sélecteur fournisseur au rendu sécurisé : la référence historique affectée
  dans `index.html:838` n'est donc plus conservée après cette installation.
- L'éditeur 0.8 remplace également la fonction globale `articleModal` par
  `openEditor()`, via un intervalle et des rappels différés. Ses valeurs textuelles
  sont échappées avec `esc()`
  (`stopflow-080-article-editor-ux.js:5,104–112,145–157`). Le bouton Ajouter et les
  boutons Modifier utilisent la fonction globale au moment du clic.

Test navigateur après `document.readyState === 'complete'` : navigation réelle
Général → Articles → Salle, changement de fournisseur Leloup puis Colruyt, puis
clic sur Modifier. Un nom d'article contenant une balise `<img onerror=...>` reste
du texte dans la liste et dans le champ du nouvel éditeur ; aucun élément image
n'est créé et aucun JavaScript injecté ne s'exécute.

## Fenêtre de chargement vulnérable reproduite avant correction

Les surcharges de `supabase-article-tools.js` sont installées sur `window.load`
(`supabase-article-tools.js:370–371`). Avant cet événement, les fonctions
historiques existent toujours : `index.html:725–741` pour la liste et
`index.html:743–764` pour le formulaire. Leurs interpolations n'étaient pas échappées.

Reproduction réalisée dans Chromium ordinateur, en navigateur jetable :

1. Restaurer une session Admin du mode local et des données temporaires comprenant
   un article Colruyt dont le nom contient une image invalide avec un gestionnaire
   `onerror` qui affecte seulement `window.__articleInjection = 1`.
2. Intercepter et laisser en attente la requête **image** `/api/pwa-icon`, tout en
   laissant charger les fichiers JavaScript et CSS. Cela simule une icône lente.
3. Attendre l'accueil, puis cliquer Général → Articles → Salle. Aucun appel direct
   à la fonction historique n'est effectué par le test.
4. Observer, avec `document.readyState === 'interactive'` et avant `window.load`,
   l'apparition d'une image dans `#articleRows` et la valeur du marqueur passant
   de 0 à 1. Le rendu historique est donc réellement atteint par l'interface.

Le test a confirmé l'exploitation de la **liste** avant `window.load`. Il ne
confirme pas séparément une exploitation du formulaire historique : dans ce
scénario, l'éditeur 0.8 était déjà installé.

## Correction ciblée et contrôles

Le test `tests/article-html-security.cjs` a d'abord échoué sur la navigation
réelle avant `window.load`, avec le marqueur JavaScript passant de 0 à 1. Le socle
historique est désormais protégé directement : cellules, attributs `data-*` et
`value` de la liste, puis nom, catégorie, unité et cible du formulaire passent
par `escapeHTML()`. Les branches `checked` et `selected` ne produisent que des
constantes, sans interpolation des données.

Le contrôle des attributs a également trouvé des interpolations brutes d'`id`
et de `target` dans `supabase-article-tools.js`, avec des données locales
malformées. Ces attributs utilisent maintenant le même `escapeHTML()`. Les
identifiants et cibles issus de Supabase sont déjà convertis en nombres par
`normalizeSharedArticle()` ; cette correction protège aussi les données du
cache local, sans dépendre de cette conversion. Les prix passent par une
conversion numérique et les autres textes surchargés étaient déjà échappés.

Le nouveau test couvre la navigation avant et après `window.load`, les fonctions
historiques capturées indépendamment des surcharges, l'éditeur intermédiaire et
l'éditeur 0.8, les noms/catégories/unités/fournisseurs malveillants, les sorties
d'attributs, ainsi que la modification et la sauvegarde locale. Il utilise
Chromium ordinateur et une émulation iPhone avec de vrais événements tactiles,
en respectant le délai existant de protection contre les taps après défilement.
Les caractères accentués, apostrophes, guillemets, `&`, `<` et `>` sont vérifiés
à l'identique à l'affichage et dans les données enregistrées.

Validation finale :

- `node tests/order-html-security.cjs` : réussi sur ordinateur et iPhone émulé,
  y compris Commandes, Suggestions, impression et PDF.
- `node tests/article-html-security.cjs` : réussi sur les deux configurations,
  y compris navigation tactile mobile, édition et sauvegarde locale.
- 85 contrôles `node --check` : réussis (84 fichiers et un script inline).
- `git diff --check` : réussi.

Limite ergonomique observée en émulation : avec un catalogue réduit à un seul
article, l'en-tête mobile peut recouvrir les actions du modal. Les tests de
sécurité conservent un second article témoin pour exercer la sauvegarde sans
modifier le CSS ni les gestionnaires tactiles. Ce cas réduit reste à contrôler
sur iPhone réel ; il n'est pas corrigé dans cette étape XSS.

Ces observations concernent un scénario local isolé ; elles ne prouvent pas un
incident en production ni un résultat sur Safari/iPhone réel. Les requêtes
externes étaient bloquées et aucune donnée Supabase n'a été consultée ou modifiée.
