# STOPFLOW — Mission 1.8 : intégrer les preuves et préparer la baseline

Tu reçois un dossier contenant une **copie vérifiée MD5 de la première migration
historique distante** ainsi que les définitions de l'état réel actuel de
`public.profiles` et du provisioning Auth. Ces fichiers sont des références,
**pas des migrations à appliquer**.

Branche locale : `feat/reservations-foundations`.
Dernier commit communiqué par Codex : `223e8741f617da34e85fbeea8f1b37358cdf243c`.

1. Vérifier l'intégrité MD5 du premier fichier et comparer les références avec
   `docs/schema/` et les tests existants.
2. Étudier la dépendance : première migration crée `orders` avec FK `profiles`,
   tandis que `profiles` n'est pas préinstallée dans l'historique disponible.
3. Proposer la structure d'une **baseline finale** indépendante du replay des
   anciennes migrations ; conserver une seule migration Réservations ultérieure.
4. Vérifier sur un Supabase **local isolé** l'ordre de création de `profiles`,
   des fonctions `private`, des policies, des triggers et du provisioning Auth.
5. Ne pas traiter les 4 fonctions de protection des comptes en remplaçant toutes
   leurs adresses par un marqueur identique : fournir une stratégie de tests avec
   identités fictives **distinctes**, à faire approuver explicitement.
6. Indiquer précisément les autres exports de schéma nécessaires. Prioriser
   un export `schema-only` du schéma final `public/private`, y compris droits,
   fonctions et définition du trigger Auth personnalisé, depuis un accès **lecture
   seule** et sans données réelles, avec revue des constantes sensibles.
7. Ne pas déclarer la baseline finalisée ni la branche utilisable tant que
   le reset local complet et les tests Auth/RLS n'ont pas passé.

Interdictions : **aucune** modification de Production, de L'Union Connect ou
même de la branche distante échouée ; aucun push GitHub, aucun déploiement Vercel,
aucun correctif d'historique distant, aucune migration distante, partie 2 non
commencée. Codex code localement, ChatGPT pilote.

Livrable : rapport GO/NO-GO, nouvelles preuves intégrées, éventuelles demandes
strictement nécessaires et résultats exacts des tests locaux.
