# STOPFLOW — RAPPROCHEMENT FINAL DE SCHÉMA (SUITE MISSION 1.6)

Je te transmets une archive ZIP contenant un inventaire local et des métadonnées
vérifiées par ChatGPT directement depuis les catalogues de Supabase StopFlow
Production, en lecture seule.

## Ce que tu dois faire

1. Lire intégralement `README.md`, `CATALOGUE_VERIFIE.json`,
   `INVENTORY_LOCAL_CODEX.json` et les deux rapports Markdown.
2. Examiner `19_TABLES_COLONNES_REFERENCE.sql` : les colonnes des 19 tables sont
   maintenant présentes sous forme SQL vérifiable, mais les contraintes et
   autorisations restent à compléter. Ne pas exécuter ce fichier directement.
3. Examiner les 9 définitions SQL historiques fournies, dont
   `private.current_role()`. Les traiter comme références, pas comme migrations.
4. Rapprocher les 45 migrations distantes des 20 fichiers de migration locaux,
   sans inventer les contenus absents ni les réexécuter après un snapshot final.
5. Étudier les 12 requêtes de `EXTRACTION_CATALOGUES_READONLY.sql` :
   elles documentent précisément les dernières données structurelles à récupérer
   via un accès Supabase autorisé. Ne les exécute pas sans un accès et une
   autorisation de lecture seuls, et ne demande pas de tokens dans le chat.
6. Préparer, dans le dépôt local, une baseline d'état final et le processus de
   reconstruction de StopFlow sur un Supabase vierge (Supabase Auth réel),
   en explicitant les définitions encore indisponibles.
7. Identifier les 4 fonctions de protection de comptes contenant des adresses
   particulières ; prévoir une solution sûre avec identités de test, sans
   recopier d'identifiants privés dans Git. Ne pas inventer de protection.
8. Ne pas annoncer une baseline complètement vérifiée tant que les DDL finaux,
   le provisioning Auth, les ACL et la reconstruction depuis zéro n'ont pas été
   contrôlés sur un véritable environnement Supabase isolé.
9. Produire une liste **précise et priorisée** des dernières extractions ou
   décisions nécessaires. Éviter les allers-retours inutiles.

## Sécurité et livraison

- Branche locale : feat/reservations-foundations.
- Dernier commit local rapporté : 0d9d47c7f7a0179d91ef0db066bc4cc261b17abb.
- Aucune modification de main ni de stopflow-dev distant.
- Aucun push, aucun déploiement, aucune migration, aucune écriture Supabase distante.
- Ne pas modifier L'Union Connect. Ne pas commencer la partie 2.
- Conserver le travail existant, n'ajouter que des fichiers locaux nécessaires.
- Rapporter les tests effectivement réalisés et les blocages restants.

**Le ZIP est un dossier de preuve et de transfert, pas un ordre d'installation en production.**
