# STOPFLOW — MISSION 1.9

Dernier commit annoncé : `0a0a6d6732127ca1d129471c63306fade2c77531`
Branche locale : `feat/reservations-foundations`.

ChatGPT a récupéré, en lecture seule, les **trois fonctions des triggers
profiles**, la fonction de protection historique et **deux fonctions RPC
d'administration**, avec des identités de test différentes selon le rôle.
Lire tous les fichiers de cette archive.

**Travail demandé à Codex :**

1. Vérifier les corps source SQL transmis, leurs dépendances, triggers,
   signature, propriétaires et permissions d'exécution.
2. Ajouter localement ces preuves aux travaux de baseline. NE PAS en faire
   des migrations directement : elles dépendent de tables/fonctions absentes
   du socle partiel.
3. Simuler la protection de deux comptes fictifs distincts, puis vérifier
   l'impossibilité de les rétrograder / désactiver / renommer. Inclure des
   tests négatifs pour les comptes ordinaires et les changements autorisés.
   **Ne pas instaurer définitivement la correspondance fictive sans
   l'approbation du propriétaire.**
4. Vérifier le trigger audit de suppression et la synchronisation des
   départements : y compris contraintes ON CONFLICT, absence de récursion,
   cas admin / responsable / employé, en Supabase local quand possible.
5. Déterminer les lacunes encore exactes du snapshot final. Privilégier un
   `supabase db dump --schema public,private` ou `supabase db pull`,
   **strictement schema-only**, quand la CLI est opérationnelle, en utilisant
   la syntaxe vérifiée par `--help`. Protéger les données réelles et les
   constantes sensibles avant tout commit. NE PAS accepter les invites
   `repair`, `push` ou de modification de l'historique Production.
6. Produire un rapport concis GO/NO-GO et les tests réellement exécutés.

**Interdictions :** aucune écriture Supabase Production ou Test, aucune
suppression/reset de branche, aucune modification de L'Union Connect, aucun
push GitHub, aucun déploiement Vercel ni changement Vapi, aucune partie 2.

Ne pas demander à nouveau `profiles`, `handle_new_user`, la première migration
historique, ni les définitions des trois fonctions profil désormais jointes.
