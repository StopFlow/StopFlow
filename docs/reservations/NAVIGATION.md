# Stabilisation de la navigation Réservations

Base examinée : `a71849aa1fc8dacdeedaa306c66525680b7b6e64`, branche
`feat/reservations-foundations`. Correction locale, sans accès distant.

## Diagnostic et reproductions avant correction

La suite `node tests/reservations-browser.cjs`, sans instrumentation ajoutée,
a été exécutée trois fois sur le code initial : réussite, échec après
rechargement, réussite. L'échec est le timeout de 30 secondes sur
`#sf91Reservations`, avec `sf70Home` visible, zone `home` et focus sur `body`.
Les deux localisations historiques (première entrée et après rechargement)
ont également été reproduites par un test contrôlé du rafraîchissement.

### 1. Le rafraîchissement détruisait le bouton focalisé

`refreshAccess()` actualise les droits de Réservations, puis demande un
rafraîchissement de navigation. `refreshAll()` programme les rafraîchissements
existants à 0/90/280/760 ms. `renderDesktopMenu()` et `renderMobileMenu()` vidaient
leurs conteneurs puis recréaient tous les boutons, même sans changement d'entrée.

L'activation clavier comporte une prise de focus et l'envoi d'une touche.
Un timer entre les deux supprime donc le bouton focalisé. Le nouvel élément
porte le même sélecteur, mais ne reçoit pas le focus perdu ; Entrée atteint
`body`, et aucun clic de navigation n'est produit.

Reproduction déterministe, sans listener de diagnostic ni délai ajouté :

1. Donner le focus au bouton Réservations ; vérifier qu'il le détient.
2. Appeler la vraie API `refreshMenus()` dans la même évaluation navigateur.
3. Constater `connected: false`, focus `BODY`.
4. Envoyer une vraie touche Entrée avec Playwright : la zone reste `home`.

Le résultat avant correction est identique en première entrée et après
rechargement. Le nouveau test échoue avant correction sur l'identité et le
focus du bouton. Cela établit le mécanisme sans dépendre du hasard d'un timer.
Une réussite instrumentée ne supprimait pas le défaut : le changement de
timing pouvait seulement éviter cette fenêtre. La position exacte des timers
dans chaque ancienne exécution instrumentée n'a pas été enregistrée.

### 2. La restauration historique pouvait rejouer l'accueil

Le mécanisme de `supabase-catalog.js` mémorise historiquement les clics
`[data-page]`. Les nouvelles entrées par zone n'utilisent pas ces boutons.
L'ancienne valeur `dashboard` pouvait donc rester mémorisée malgré l'ouverture
de Réservations. Les callbacks de restauration liés au chargement, à pageshow
ou à l'affichage de l'application pouvaient ensuite rejouer cette ancienne page.

Une trace ciblée a identifié l'appel :
`restoreRememberedStopFlowPage → navigation.click → b.onclick → page('dashboard')`.
Une reproduction sur le script de navigation du commit initial, avec le
masque de démarrage terminé et une valeur historique `dashboard`, a donné :

```text
avant : ready=1, zone=reservations, remembered=dashboard
après restoreRememberedStopFlowPage() : zone=home, visible=false
```

Le résultat ne dépend donc pas d'une ouverture prématurée sous le masque.
Le test de connexion respecte cet état prêt ; il n'augmente aucun délai.
Une garde envisagée sur le callback de permissions de showApp a été retirée :
elle n'était pas nécessaire à la correction démontrée. L'initialisation et
le masque de démarrage historiques restent inchangés.

## Correction applicative

Un seul fichier applicatif change : `stopflow-070-card-navigation.js`.

- `syncMenuButtons()` conserve les boutons existants par identifiant de zone,
  met à jour leur état/texte et retire uniquement les entrées devenues inutiles
  ou non autorisées. Un bouton inchangé n'est ni remplacé ni réinséré.
- Le wrapper de `page()` appelle la fonction historique
  `rememberStopFlowPage()` uniquement à l'entrée et à la sortie de Réservations.
  La restauration des autres rubriques reste inchangée. L'accueil conserve sa clé
  historique `dashboard`, sans enregistrer son alias interne `sf70Home`.
  La fonction continue à filtrer les pages stables ; Réservations est déjà
  enregistrée dans ce catalogue par son module.

Aucun nouvel événement tactile ou clavier global, aucun focus forcé différé,
aucune modification des délais de navigation, des règles d'authentification,
de l'UX ou des droits serveur. Aucun changement dans index.html, le module
Réservations, Supabase, les PDF ou le bouton + d'inventaire.

## Tests

`tests/reservations-browser.cjs` expose son scénario afin de partager son vrai
PostgreSQL local et son navigateur avec la nouvelle suite. L'exécution directe
conserve son parcours CRUD ; aucun observer de diagnostic n'y est injecté.

`node tests/reservations-navigation.cjs` vérifie :

- identité DOM et focus après cinq rafraîchissements entre focus et Entrée/Espace ;
- clic natif avec rafraîchissement entre pression et relâchement ;
- conservation des boutons du menu mobile et entrée par la carte tactile ;
- rechargement, affichage après connexion simulée et restauration historique ;
- réponse de contexte retardée après retour à l'accueil ;
- changement d'identité pendant une réponse retardée, sans rétablir l'ancien tenant ;
- disparition de l'entrée à la déconnexion, réapparition unique à la reconnexion ;
- cinq allers-retours par appareil, sans délai supplémentaire.

La suite partage le contrat Auth simulé et le pont RPC vers PostgreSQL local
déjà documentés. Elle ne valide ni Supabase Auth/JWT distant ni Safari physique.
Les demandes retardées sont libérées explicitement ; elles ne reposent pas sur
un sommeil arbitraire. Le délai de démarrage de 3 200 ms de l'ancien banc CRUD
est inchangé ; aucune augmentation n'a été utilisée pour obtenir une réussite.

Résultats finaux, sur le correctif limité à Réservations :

| Contrôle | Résultat |
| --- | --- |
| Nouvelle suite navigation | RÉUSSI, ordinateur/clavier et iPhone émulé/tactile, y compris vraie réponse PostgreSQL de l'ancien utilisateur libérée après changement d'identité. |
| Suite CRUD Réservations sans instrumentation supplémentaire | RÉUSSI deux exécutions consécutives, chacune sur ordinateur et mobile, avec rechargement, persistance PostgreSQL, droits, conflit et erreur réseau. |
| Commandes/Suggestions | RÉUSSI, tests de sécurité, impression/PDF et historique. |
| Articles | RÉUSSI, chemins historiques et surchargés, ordinateur/mobile. |
| Remarques Inventaire/Températures et checklist | RÉUSSI, focus natif, validation unique, clavier numérique, persistance simulée et PDF. |
| Gestes des remarques | RÉUSSI, Pointer Events et Touch Events, défilement, annulation et multitouch. |
| Sauvegarde Températures | RÉUSSI, historique, erreurs réseau/RPC, reprise et sauvegarde unique ; test existant non modifié. |
| Syntaxe | 93 contrôles réussis, puis nouveaux contrôles des trois fichiers JavaScript modifiés. |
| Types | checkJs/noEmit TypeScript 5.9.3 réussi pour le module Réservations et son contrat de globals. |
| Diff | git diff --check réussi. |

La migration SQL et les fonctions métier n'ont pas changé. Chaque scénario
navigateur initialise néanmoins son propre PostgreSQL local avec la migration
intégrale. La suite SQL distincte de 62 assertions, déjà validée avant cette
mission, n'a pas été réexécutée pour cette correction de navigation.

Les tests finaux n'utilisent aucun observer d'événements ajouté pour modifier
le timing de l'application. Les rafraîchissements et réponses retardées de la
nouvelle suite sont des conditions de concurrence contrôlées et des assertions,
pas des corrections ou délais insérés dans le produit.

La comparaison avec la navigation initiale et avec la seule conservation des
boutons a aussi identifié une régression intermédiaire dans Températures :
mettre à jour la mémorisation pour toutes les pages modifiait la restauration
historique. Cette version n'est pas livrée. La correction finale ne synchronise
la mémoire qu'à l'entrée ou à la sortie de Réservations et conserve la clé
`dashboard` de l'accueil. Le test Températures a ensuite été relancé sans être
modifié, sans augmentation de son délai.

## Prérequis pour la validation distante ultérieure

- Projet Supabase distinct, identité vérifiée et accès d'administration fourni
  par connexion ou paramètres sécurisés, sans secret dans le dépôt ou le chat.
- Schéma StopFlow de référence vérifié et installé dans ce projet, notamment
  profiles et ses champs utilisés à la connexion, RLS, helpers privés et RPC
  nécessaires au démarrage. La migration Réservations seule n'installe pas
  toute l'application sur une base vide ; le dépôt n'a pas de baseline complète.
- Comptes de test et appartenances explicites pour deux établissements, avec
  lecteur et gestionnaires. Aucune copie de données métier ou comptes réels.
- Configuration frontend de test explicite, sans repli vers la production.
  index.html contient encore l'URL Supabase historique en dur : de simples
  variables Vercel ne suffisent pas. Son adaptation sera une étape distincte.
- Projet Vercel de test séparé, redirections Auth adaptées à sa future origine,
  automatisations et emails métier isolés. Avant tout déploiement, vérifier que
  l'artefact ne peut joindre le projet Supabase de production.
- Tests distants via JWT utilisateur réel, REST et RPC, puis parcours navigateur
  et iPhone physique. Une clé service_role ne prouve pas les droits utilisateur.

Ces prérequis sont documentés uniquement ; aucune configuration distante
Supabase/Vercel ni adaptation des connexions frontend n'a été effectuée ici.

## Limites et état de livraison

La validation Supabase distante et l'iPhone physique restent à faire sur un
environnement isolé. Aucun push, aucune Preview, aucun déploiement, aucune
migration distante. main et stopflow-dev ne sont pas modifiées. La partie 2
n'a pas commencé. Les fichiers sont laissés localement pour revue.
