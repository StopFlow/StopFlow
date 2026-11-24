# Réception marchandises — fiche compacte et rescan — 24 novembre 2026

Périmètre : branche `pilot/stopflow-v1-20261117`, Supabase `mmrdpyhoawwoplbzqwag` exclusivement. Base de départ vérifiée : `5bdc7eb16e42cceb3f8e4dfee8bd20fd3f1d25d9`. Référence Réservations R3 conservée : `e160453537460c5b05e501d68d2376724b030317`. OneDrive et import historique restent désactivés.

## Changements

- Fiche paysage originale/contrôle côte à côte, produits sur deux lignes compactes, détails repliés, prix toujours présent. Cinq produits complets mesurés dans la fiche au repos à 1024 × 768. Les boutons et choix principaux conservent des cibles tactiles de 44 px. Photo : zoom, pincement à deux doigts, déplacement indépendant de la fiche, recentrage et rotation.
- « Rescanner cette page » reste disponible sur tout brouillon. Nouvelle extraction du même original privé, sans nouvelle réception. Les correspondances sûres conservent identifiants, températures, observations, corrections et choix catalogue. Les différences sont enregistrées comme proposition séparée ; aucune substitution silencieuse. Seules les lignes à départager demandent une correspondance, les lignes sûres sont conservées automatiquement. Une ancienne ligne contrôlée non rapprochée reste conservée. Les saisies effectuées pendant cette comparaison restent prises en compte. La finalisation est refusée tant que la comparaison reste ouverte. Un contrôle terminé passe par sa correction versionnée existante.
- `4,50 €` et `4,50 EUR` sont reconnus comme prix, sans élargir le parseur des quantités. Prix unitaire, montant de ligne, consigne monétaire et TVA restent séparés. Les champs absents restent vides ; le prix imprimé illisible est signalé.
- Disquette rouge/bleue selon le couple fournisseur/référence, jamais selon le nom. Référence incertaine ou ambiguë : vérification préalable. La confirmation d’une seule ligne utilise les droits Articles existants, puis relit le catalogue avant de passer en bleu. Le verrou d’action couvre sauvegarde, mémorisation et relecture. Ajout d’un prix daté à un article connu avec les contrôles existants d’unité, conditionnement et HT/TTC.
- Mesure proposée pour les catégories froides identifiées, absente des produits secs et des bacs. Catégorie inconnue : activation dans Modifier. Aucune température préremplie. Emballage Oui/Non vierge ; remarque si Non ; écarts de quantité repliés.
- Bacs séparés : référence, désignation, nombre imprimé, réellement reçu et vides rendus. Les sommes de consigne ne deviennent jamais des nombres de bacs.
- Une action principale « Enregistrer le bon et le contrôle ». Snapshot serveur, PDF versionné avec prix, mesures, bacs et remarque générale, puis original en annexe. Nom des nouveaux PDF : date de réception en Europe/Brussels, fournisseur, opérateur validant, numéro du bon si disponible et version. Les anciens fichiers ne sont pas renommés. Historique et lien de téléchargement « dans Fichiers » conservés ; le statut de téléchargement est rendu visible même après un message de lecture masqué.

## Vérifications réalisées

- Modèle/parseur synthétique : **31 assertions PASS** (rescan 30 lignes, euro, ambiguïtés, corrections, couleurs, catégories, deux références de bacs).
- Reprises de lecture directement concernées : **11 groupes PASS**. Paquet/versionnement : **4 groupes PASS** ; contrôle syntaxique et `git diff --check`.
- PostgreSQL **17.12 jetable**, rôle applicatif non superutilisateur : **18 assertions PASS**, arrêt et suppression confirmés. Persistance de 30 produits et deux bacs, mémorisation limitée à une ligne, reprise sans doublon, prix ajouté ultérieurement, snapshot/PDF nommé, correction versionnée, comparaison non résolue refusée, comptes de bacs invalides refusés, restrictions anonymes/département conservées. Auth et Storage : contrats simulés dans ce test.
- Page complète avec vrai SDK : **Chromium 156.0.8078.4 et WebKit 27.2**, profils Cuisine et Salle fictifs, viewport tactile 1024 × 768. Quatre scénarios exécutés. Capture, 30 produits, prix affiché, deux bacs, rescan après température, comparaison, rouge→bleu et réouverture, génération réelle du PDF, recherche dans l’historique et téléchargement avec nom lisible. Aucune ressource étrangère, aucune erreur JavaScript finale. Pincement tactile Chromium via CDP ; boutons de zoom/recentrage dans les deux moteurs.
- Le scénario WebKit Salle a d’abord capturé l’événement du téléchargement déclenché par l’aperçu PDF au lieu du lien nommé. Le test attend désormais le téléchargement portant le nom attendu ; sa reprise a réussi. Les traces initiales et la reprise sont conservées.
- Générateur PDF réel `pdf-lib`/`sharp`, texte relu avec `unpdf` : 30 lignes, température, prix, références BAC-A/B, reçus/rendus, remarque et annexe. Capture Chromium inspectée visuellement : cinq produits complets, photo et fiche côte à côte, prix et commandes contenus. Les captures WebKit sont conservées pour comparaison.

## Contrôle du pilote réel

Migration ciblée `receipt_30_lines_rescan_containers_pdf` appliquée après qualification. Les empreintes avant/après des documents, fichiers, historiques de prix, tables physiques du plan et permissions sont identiques. Stockage privé maintenu ; appels des deux RPC refusés au rôle anonyme ; helper de nommage non exécutable par les clients. Aucun compte ou document de test créé sur le pilote pour ces vérifications.

La livraison frontend emploie l’édition `20261124-reception6`, manifeste et cache PWA actualisés. Le garde de construction exécute désormais le scénario de la fiche 30 lignes, en conservant les contrôles communs de connexion/plan.

## Preuves et limites

Preuves privées locales : `.pilot-private/RECEPTION-30-20261124/` (captures 1024 × 768, PDF fictifs, rapports navigateur/PG et empreintes serveur avant/après). Aucun secret ni original Cordier dans les captures ou dans Git.

Les 30 lignes du scénario navigateur sont des candidats synthétiques, pas un nouveau résultat OCR de l’original Cordier. Le moteur du pilote reste Tesseract.js 6.0.1 / français ; aucun nouveau prestataire. Le correctif du prix et les colonnes Cordier sont testés sur mots/coordonnées synthétiques. L’original Cordier n’a pas été récupéré avec une session pilote dans cette mission.

**Non vérifié ici :** nouvel aller-retour authentifié de bout en bout sur les originaux privés réels, pincement physique iPad, clavier Safari et destination finale dans l’application Fichiers. Les tests navigateur n’équivalent pas à cet essai physique. Les données métier et les droits n’ont pas été modifiés pour simuler ces résultats.
