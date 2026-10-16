# Audit ciblé de la sécurité des rendus Articles — 16 octobre 2026

État : **P0 confirmé avant la fin du chargement de la page**. Les fonctions Articles
restent inchangées dans le correctif Suggestions. L'analyse porte sur la branche
`stopflow-dev`, après le correctif Commandes `ca3f55254e7bbdd9144d333c86217e8cc5400744`.

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

## Fenêtre de chargement vulnérable reproduite

Les surcharges de `supabase-article-tools.js` sont installées sur `window.load`
(`supabase-article-tools.js:370–371`). Avant cet événement, les fonctions
historiques existent toujours : `index.html:725–741` pour la liste et
`index.html:743–764` pour le formulaire. Leurs interpolations ne sont pas échappées.

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

## Portée et suite

Les surcharges sécurisent le parcours une fois installées, mais ne constituent
pas une garantie pendant tout le démarrage. Le risque Articles n'est donc plus
à classer comme uniquement latent. Un correctif distinct reste nécessaire,
conformément à la décision de ne pas modifier Articles dans cette étape.

Ces observations concernent un scénario local isolé ; elles ne prouvent pas un
incident en production ni un résultat sur Safari/iPhone réel. Les requêtes
externes étaient bloquées et aucune donnée Supabase n'a été consultée ou modifiée.
