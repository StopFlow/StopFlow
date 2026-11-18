# StopFlow Pilote — propriétaire et équipe

Branche exclusivement `pilot/stopflow-v1-20261117`. Projet Supabase exclusivement
`mmrdpyhoawwoplbzqwag`. Les données restent fictives. Zenchef reste la référence
des vraies réservations. Aucun changement des trois assets R3 ni du plan.

Adresse stable du pilote :
https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app/

QR d’installation : `/pilot-install.svg`. QR d’inscription :
`/pilot-inscription.svg` (formulaire `/?inscription=1`). Ces QR ne contiennent
aucune clé, session ou permission. La levée de protection Vercel porte seulement
sur cet alias ; les autres aperçus et la production gardent leurs réglages.
La connexion StopFlow et les contrôles PostgreSQL restent obligatoires.
La barre Vercel est désactivée uniquement pour la branche pilote avec
`VERCEL_PREVIEW_FEEDBACK_ENABLED=0`. La sonde `/api/pilot-access-check` vérifie
la page sans cookie ni authentification Vercel et les réglages publics d’Auth.
Elle ne crée aucun compte et ne vérifie ni livraison d’e-mail ni redirection.
Les anciens comptes et identifiants de secours hors ligne ont été retirés de
la page pilote ; aucune connexion locale ne contourne Auth ou l’approbation.

## Activation privée du propriétaire

`tools/pilot/activate-owner.py --execute` lit l’adresse et la cible depuis
`.pilot-private/OWNER-REQUEST.json` (0600, ignoré Git). Il demande la clé serveur
du seul pilote en saisie masquée, la garde en mémoire et appelle Auth Admin
generate_link. Il n’envoie aucun e-mail et ne choisit aucun mot de passe.
Le reçu privé permet de reprendre après une réponse perdue sans recréer de
compte. Le lien à usage unique n’est jamais imprimé : il est enregistré dans
`.pilot-private/ACTIVATION-QUENTIN.html`, mode 0600.

Le propriétaire ouvre ce fichier privé, puis choisit et confirme son mot de
passe dans StopFlow. Le fragment d’activation est retiré de la barre d’adresse
avant sa vérification. Le compte reçoit le rôle général admin et une
appartenance explicite complète au seul établissement fictif du pilote,
y compris rooms/tables/layouts et agenda/clients. L’accès reste bloqué avant
la définition du mot de passe. Un lien expiré demande une nouvelle activation
explicite ; aucune réinitialisation automatique de mot de passe.

## Inscription et décision

Général → Équipe → Inviter l’équipe affiche le QR. Le formulaire demande
prénom, nom, e-mail et mot de passe. La vérification d’adresse Supabase reste
conservée. Après connexion confirmée, la demande crée un profil **inactif**,
sans département, permission ni appartenance Réservations. Si l’e-mail doit
être confirmé, aucune donnée métier n’est accessible pendant cette attente.
Les métadonnées Auth ne sont jamais utilisées pour attribuer des droits.

Le propriétaire voit le compteur des demandes et peut accepter, refuser,
modifier ou retirer les accès. Le rôle choisi est employé ou responsable,
jamais administrateur. Les permissions par département et les six droits
Réservations sont enregistrés atomiquement avec la décision et sa trace.
Un conflit de version ou une réponse perdue impose une relecture explicite.
Le retrait est vérifié en base même avec un ancien JWT encore valide.
L’ancien compte fictif est classé accepté sans changer ses droits.

**Prérequis Auth à confirmer avant invitation du personnel réel :** inscription
par e-mail autorisée, livraison des messages de confirmation, Site URL et
redirect autorisé vers l’adresse stable et `/?inscription=1`. Le connecteur
actuel ne donne pas accès à ces paramètres Auth. Ne pas désactiver la
confirmation d’adresse pour contourner un problème de messagerie.
Voir [URL de redirection Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

## Installation et navigation

Dans Safari iPad/iPhone : ouvrir le QR d’installation → Partager → Sur l’écran
d’accueil → Ajouter. L’icône PNG Apple est 180 px ; le manifeste fournit les
icônes 192/512 px et le mode standalone, avec start_url et scope `/`.
Le fonctionnement physique de cette installation reste à vérifier sur les
appareils ; un contrôle de fichiers ne vaut pas un essai iPad/iPhone.

Les anciens menus et boutons d’ouverture sont masqués sur tous les formats.
La barre commune conserve Accueil, Retour, Mon profil, Installer et Déconnexion.
Toutes les fonctions passent par les cartes selon les permissions ; Équipe est
réservée au propriétaire. Les gardes de brouillon existantes restent actives.

## Vérifications et limites

- PostgreSQL 17 : 9 groupes de tests sur schémas jetables, identités Auth
  simulées, transaction annulée ; propriétaire complet, attente, refus,
  acceptation ciblée, retrait, auto-approbation interdite et conflits.
- Simulation DOM/Auth/RPC : 7 groupes ; démarrage derrière le garde, navigation,
  inscription sans droits, activation et reprise, absence des menus.
- Activation : 3 groupes de transport simulé, reçu après interruption et
  absence de secrets dans la sortie.
- Paquet Vercel/PWA : 4 groupes, empreintes R3 et icônes.
- Le dernier PASS Auth/HTTP du pilote est conservé ; il ne valide pas les
  nouvelles inscriptions/approbations. Ces parcours Auth réels restent à
  vérifier après l’activation et la qualification de la messagerie.

Les migrations `team-access.sql`, `owner-activation.sql` et le classement
`legacy-team.sql` concernent uniquement le pilote. Ne pas les rejouer sur une
base active ou un autre environnement. Le cluster natif du Mac est inaccessible
dans cette session ; les tests serveur ont utilisé des schémas isolés annulés.
