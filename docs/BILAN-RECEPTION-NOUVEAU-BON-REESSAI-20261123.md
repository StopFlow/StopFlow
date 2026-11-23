# Réception : nouveau bon, lecture et reprise — 23 novembre 2026

Périmètre : pilote `mmrdpyhoawwoplbzqwag`, branche `pilot/stopflow-v1-20261117`, départ vérifié `cc8666ca165b34bf79b7f347860d1d636db65116`. Référence R3 conservée : `e160453537460c5b05e501d68d2376724b030317`.

## Défauts identifiés et corrections

- L’entrée ouvrait implicitement le secours précédent, stocké dans une seule clé par compte/département. Elle affiche maintenant d’abord **Photographier un nouveau bon**, puis les brouillons avec fournisseur/date disponibles. Le secours est distinct par document ; l’ancienne clé est migrée sans écraser une version locale plus récente. Les deux réceptions restent indépendantes. Seul **Ajouter une page à ce document** joint une photo au bon courant.
- `readAll()` pouvait retourner `null`, accepté par le démarrage comme un succès. Une page OCR à zéro produit était considérée déjà lue. Résultat désormais structuré : réussite, partiel, zéro produit, problème de qualité ou échec technique. Aucune fiche vide ouverte dans les deux derniers parcours ; original conservé, vraie nouvelle lecture de la même photo, ou reprise de photo. Les pages/lignes déjà lisibles restent conservées.
- L’action principale enregistre l’original et lance la lecture avant d’ouvrir la fiche. Progression page par page et nombre de produits reconnus. Enregistrer seulement et catalogue restent indépendants.
- Fiche photo/contrôle : champs imprimés préremplis, corrections repliées ; emballage Oui/Non vierge, observation pour emballage abîmé, température mesurée lorsque signalée pertinente. L’écart de quantité se saisit uniquement sur la ligne concernée. Les quantités conformes ne sont copiées qu’après confirmation humaine explicite de fin ; aucune température présumée. Le serveur vérifie ces éléments avant le snapshot PDF.
- Nouveau bon fictif avec en-têtes `Code article / Libellé / Livré / U.V. / Prix net HT / Total HT`. Correction démontrée de l’en-tête fusionné `Prixnet` et de la lecture du bordereau/expéditeur ; aucun remplacement arbitraire de références OCR.

## Résultats ciblés

- Modèle/parcours : 9 groupes simulés, dont erreur → zéro → vraie nouvelle lecture, ancien cache vide et deux secours locaux isolés.
- Parseur géométrique : 12 assertions ; versions/lecture partagée : 6 assertions ; paquet pilote : 4 groupes.
- PostgreSQL 17 jetable : **9 contrôles PASS**, rôle applicatif représentatif, Auth et contrat Storage simulés ; cluster arrêté avant suppression du répertoire. Zéro fiche après lecture vide/échec, emballage/observation vérifiés, quantité identique fausse refusée, écart persisté et aucun catalogue modifié.
- Application complète, SDK réel, Chromium **156.0.8078.4** et WebKit **27.2**, profils Cuisine et Salle, tactile émulé : 7 groupes par scénario. Nouvelle entrée, extraction, deux échecs distincts puis reprise, deux brouillons rouverts avec toutes les saisies, PDF réel avec annexe, paysage 1024×768, portrait 834×1194 et téléphone 390×844. Les requêtes Auth/REST/Storage sont interceptées sur fixtures ; pas de données réelles envoyées au banc navigateur.
- Tesseract **6.0.1 / fra**, réellement exécuté dans le scénario HTTP et sur le PNG : **12 produits lus sur 12 présents**, ordre, répétition et désignation sur deux lignes conservés. Fournisseur, numéro/date, quantités, unités, prix unitaires et montants lus. **Référence fournisseur de la ligne 11 incorrecte et signalée à vérifier** ; lignes 10 et 12 également signalées par la confiance OCR. Aucune correction supposée de cette référence. Ce résultat n’est pas une garantie de lecture parfaite d’un autre fournisseur.

## Contrôle réel du pilote et limite Cordier

Migration ciblée `receipt-delivery-checks.sql` installée, sans rejeu des migrations précédentes ni réécriture des réceptions. Avant/après : documents `720984854f461d600ad14eebb92452a2`, fichiers `324e2219a5d40ee5a0015ef27ba21bac`, prix `d41d8cd98f00b204e9800998ecf8427e`, tables `7c7b43370ebb55c0ff351e7fd428c898`, éléments `3fae0416838633aa65e9e7080f889f22`, permissions `448166a1c1067d6a101a44ab4c688e19` : identiques. RPC anonyme sans EXECUTE, search_path vide conservé, bucket privé. Les avis de sécurité existants des autres RPC ne sont pas modifiés par ce lot ; les trois RPC Réception restent fermées à anon. Les tables privées sans politique directe sont accessibles seulement via leurs RPC contrôlées.

Deux originaux existent réellement dans le stockage privé. La première lecture enregistrée contient une ligne vide, sans produit exploitable ; l’autre document n’a pas de lecture enregistrée. **Aucune session pilote authentifiée disponible dans cette session pour télécharger les octets** : l’identification et la lecture du bon Cordier lui-même ne sont pas qualifiées. Aucun nombre de produits réellement présents sur Cordier n’est affirmé. Aucune modification de ces deux documents ni du catalogue.

Le test utilise le vrai code de la fonction d’extraction et le vrai moteur OCR/PDF, mais **ne traverse pas la fonction déjà déployée et le stockage réel avec une session pilote**. Ce point reste non vérifié, ainsi que capture caméra et lecteur PDF physique iPad. Aucun nouveau prestataire, OneDrive ou import historique. Ne pas présenter les tests simulés comme un essai utilisateur réel.

## Livraison et reprise

Édition `20261123-reception4`, empreintes source et cache PWA actualisés. Le garde de déploiement utilise le nouveau scénario de lecture/reprise. Aperçu uniquement : https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app/.

Parcours : Cuisine → Réception marchandises → Photographier un nouveau bon → **Extraire les données et créer la fiche de contrôle**. Après lecture, vérifier les champs signalés, renseigner emballages/températures et seuls les écarts de quantité ; enregistrer un brouillon ou terminer explicitement le contrôle. Le brouillon se reprend depuis l’entrée, sans ouvrir automatiquement l’ancien document.

Captures synthétiques et rapports navigateur : `pilot-touch/receipt-control/` de l’aperçu vérifié. Les preuves OCR/PG17 supplémentaires sont conservées localement dans `.pilot-private/RECEPTION-REESSAI-20261123/` ; aucun secret ou original réel dans ces preuves. Les ressources temporaires du banc sont supprimées après conservation des résultats.
