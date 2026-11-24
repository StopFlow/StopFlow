# Réception guidée iPad — 24 novembre 2026

Branche `pilot/stopflow-v1-20261117`, départ propre vérifié `53ae7781b7557bccc3d3ddf0bfc31dca51d2e94e`. Références lues avant développement : `Downloads/StopFlow_Receptions_iPad_Codex/00-Mission-Codex.md` et les cinq PNG, notamment 03 pour la fiche et 04 pour le pointage/comparaison dans la même fiche. Les annotations et les valeurs des maquettes ne sont pas importées. Supabase limité à `mmrdpyhoawwoplbzqwag` ; R3, plan, comptes et droits conservés. OneDrive/import historique désactivés.

## Parcours livré

1. Accueil réception : photo et import directs, brouillons avec miniature privée vérifiée, fournisseur, numéro, date/heure, compteurs et reprise. Les miniatures sont des blobs authentifiés en mémoire, pas des liens publics. Vérification des factures/catalogue toujours accessible selon les droits.
2. Aperçu commun : zoom avec pourcentage, rotation, déplacement/pincement existant, pages, reprise de photo, sauvegarde seule et extraction. Une page ajoutée explicitement à l’aperçu ne déclenche plus la lecture avant l’action principale. Les originaux et intentions de reprise existants sont réutilisés.
3. Fiche paysage : original à gauche, liste guidée à droite, un seul article actif. Deux filtres indépendants : incertitude OCR et contrôle physique restant. « Suivant à contrôler » valide les données humaines saisies, sauvegarde et relit, puis avance au premier article restant. Naviguer, filtrer ou rescanner ne confirme aucune mesure. Reprise après huit produits : neuvième article actif, 8/30 conservés. Écarts quantité, produit non livré, emballage ou observation ; les constats suivent la ligne dans le PDF. Un produit explicitement non livré ne demande pas de température fictive.
4. Référence/prix : page et occurrence identifiées par identifiant de ligne, SHA de l’original et géométrie OCR normalisée. Pointage sur la cellule, transformation lors d’une rotation, surlignage et centrage. Ancien document sans géométrie fiable : bonne page si connue, zoom manuel indiqué. Le résultat tardif d’un chargement/comparaison ne remplace pas une nouvelle sélection. Prix antérieur comparé uniquement pour fournisseur/référence, devise, unité, conditionnement et HT/TTC compatibles. Prix du même jour sans ordre de confirmation et prix contradictoires à une même date : comparaison refusée explicitement.
5. Historique : recherche fournisseur/article/numéro, période et fournisseur, contrôleur, écarts et version ; fiche, original et PDF versionné accessibles. Les anciennes versions sont conservées. Le contrôle peut être terminé sans mémorisation catalogue.

La confirmation physique possède un snapshot des valeurs contrôlées ; une mesure ou quantité modifiée invalide cette confirmation. Le serveur conserve l’auteur/horodatage et refuse la finalisation guidée tant qu’il reste un produit non confirmé. Aucun nouveau droit n’est attribué. Les anciens chemins restent compatibles.

## Vérifications

- **32 assertions de modèle** : progression, reprise, mesures, géométrie, rotation, référence répétée, prix compatibles/incompatibles/ambigus. **12 groupes de reprise** dont bascule explicite et double clic. **31 assertions de régression** du rescan/prix/bacs ; **4 groupes de paquet**.
- **PostgreSQL 17.12 jetable : 10 assertions PASS**, rôle applicatif non superutilisateur, arrêt/suppression confirmés. 8/30 persistés, compteurs distincts, invalidation après modification, identité du contrôleur calculée côté serveur, snapshot final avec écart, refus anonyme et isolation de département. Auth/Storage simulés pour cette qualification.
- **Page complète, SDK réel, Chromium 156 et WebKit 27.2**, profils Cuisine/Salle fictifs : entrées normales Accueil → département → réception ; import de deux pages ; 30 lignes dont répétition et référence incertaine ; pause/reprise ; filtres ; prix ; rotation et bonne occurrence ; ancien sans coordonnées ; température/écart après rescan ; mémorisation sans validation physique ; PDF réel et historique. Paysage 1024 × 768 : **cinq lignes complètes visibles**, dont l’article actif. Portrait 834 × 1194 : bascule explicitement vérifiée, une seule vue affichée et saisies conservées. Les captures ne montrent pas un iPad physique.
- Une vérification renforcée a reproduit deux clics de compatibilité sur la bascule portrait. Correction : destinations explicites photo/fiche et verrou transitoire de 300 ms. Les boutons de zoom utilisent le même plafond que le pincement ; « + » ne réduit plus un zoom source de 350 %.
- **OCR réel Tesseract.js 6.0.1 / français**, via le code de la fonction HTTP et le téléchargement privé simulé : `Bon-Fictif-Guide-30-20261124.png`, **30/30 produits**, **2/2 bacs**, désignations dans l’ordre, prix unitaires corrects. **5 références erronées, toutes signalées**. L’en-tête « Total » lu « Totas » a initialement fusionné prix et montant : reconnaissance contextuelle étroite corrigée, avec montant de ligne toujours marqué à vérifier. Aucune référence inventée/corrigée automatiquement.
- PDF généré par le vrai moteur : température, écarts, bacs, remarque, avertissements de lecture et deux originaux en annexe, puis réouverture depuis l’historique.

## Pilote et limites

Migration additive ciblée `receipt_guided_physical_progress`, sans réécriture de données ni rejeu des migrations. Empreintes avant/après identiques pour documents, fichiers, prix, tables et éléments du plan, permissions. Stockage privé ; RPC refusées au rôle anonyme ; helper de confirmation non exécutable par les clients. Contrôle advisors réalisé ; les avertissements globaux des RPC existantes restent distincts du helper privé ajouté.

Édition frontend/cache PWA : `20261124-guide8`. Fichiers servis, commit et projet vérifiés après déploiement ; reçus de livraison dans les preuves privées.

Les essais navigateur emploient Auth/REST/Storage simulés. L’OCR réel est testé séparément sur une image fictive, pas déduit des candidats du navigateur. **Aucun parcours authentifié sur le stockage réel, aucune nouvelle lecture de l’original Cordier, aucun essai physique iPad** dans cette mission. Aucun mot de passe/session demandé, aucune photo réelle transmise à un nouveau prestataire.

Preuves locales : `.pilot-private/RECEPTION-GUIDEE-20261124/` : cinq vues paysage, portrait, rapports, PDF fictif, SHA des captures et constats serveur. Les captures exportées en JPEG proviennent des captures navigateur PNG, sans ajout d’annotation.

Essai iPad court : Cuisine → Réception marchandises → photo/import → Extraire → emballage/température d’un article → Suivant → Garder en brouillon → Reprendre → toucher un prix/référence → retour au contrôle. L’enregistrement final reste une confirmation explicite ; historique → Ouvrir → PDF permet la consultation ultérieure.
