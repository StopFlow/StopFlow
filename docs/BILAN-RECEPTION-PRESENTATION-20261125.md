# Réception marchandises — écarts visibles des maquettes — 25 novembre 2026

Départ propre `77e6218381cf075f0a7155d809b73a4743b96b33`, branche `pilot/stopflow-v1-20261117`. Mission et cinq références relues dans `Downloads/StopFlow_Receptions_iPad_Codex`. Livraison exclusivement pilote `mmrdpyhoawwoplbzqwag`, édition `20261125-guide9`.

## Présentation

- Accueil : photo, import et historique directs ; Reprendre sur chaque brouillon. Les onglets Réception/Documents en double sont retirés. Catalogue et vérification des factures restent dans un accès distinct soumis au droit Articles.
- Aperçu : une seule action bleue d’extraction, puis reprise de photo, ajout explicite d’une page et sauvegarde seule. Les actions de la fiche ne sont plus dupliquées dans l’aperçu. Une page ayant déjà fait l’objet d’une lecture propose Rescanner cette page. Les envois à réconcilier gardent leur parcours existant.
- Fiche : prix avec devise, unité/conditionnement et base fiscale connus ; signal À vérifier lorsque ces champs sont incertains, tiret si aucun prix n’est imprimé. Pas de base HT/TTC ni d’unité inventée, pas de conversion du prix enregistré. Une seule ligne développée, deux filtres et pointage source conservés.
- Historique et en-tête de fiche : dates en français de Belgique. Fiche, original privé et PDF versionnés accessibles.
- Le scénario tactile a reproduit un double clic de compatibilité refermant aussitôt un article en portrait : protection de 300 ms par article, sans bloquer la sélection d’un autre produit. Les clics intentionnels ultérieurs permettent toujours de replier la ligne.

## Vérifications ciblées

Les modèles de progression/source et les nouveaux cas d’affichage de prix/date totalisent 43 assertions PASS. Paquet/empreintes : 4 groupes PASS ; syntaxe et diff contrôlés.

La qualification navigateur utilise la page complète et le SDK réel, dans une VM jetable sans sortie réseau pendant les scénarios. Auth, REST, extraction et Storage sont interceptés et alimentés par des fixtures : aucun compte, document ou prix réel n’est créé. Le bon fictif comporte 30 articles, un nom long, une référence répétée, une référence incertaine, des produits froids/secs et deux bacs. Les images distinctes de deux bons permettent de vérifier deux brouillons indépendants ; une photo strictement identique est correctement reconnue par la protection de doublon existante.

Les preuves navigateur, captures et vérifications de livraison sont conservées dans `.pilot-private/RECEPTION-PRESENTATION-20261125/`. Les captures sont des rendus navigateur, sans annotations de maquette. Les quatre scénarios Cuisine/Salle sous Chromium 156 et WebKit 27.2 passent, avec 17 groupes par scénario. Paysage 1024 × 768 : cinq articles complets visibles ; portrait 834 × 1194 : aperçu, bascule et nom long contrôlés. Aucun débordement horizontal ni ressource en échec. Une seconde vérification Cuisine contrôle les derniers libellés et l’effacement des messages de l’étape précédente. Les résultats définitifs sont consignés dans le rapport JSON associé.

Aucun changement SQL, droit, moteur OCR, protocole de rescan ou génération PDF. Les tests serveur/OCR acquis ne sont pas rejoués. Aucune qualification physique sur iPad ni nouvel essai authentifié avec Storage réel dans cette passe. Reste à apprécier le confort du geste/du clavier sur l’iPad réel.

Essai court : Cuisine → Réception marchandises → photo/import → Extraire → contrôler quelques articles → Garder en brouillon → Reprendre → toucher un prix → historique. Les documents existants et les températures restent conservés.
