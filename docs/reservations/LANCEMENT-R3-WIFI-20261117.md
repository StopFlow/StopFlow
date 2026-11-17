# R3 temporaire sur le Wi-Fi du Mac

Commande :

```sh
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 -I -B -u /Users/quentinpollet/Documents/StopFlow-Dev/StopFlow-restauration-20261027-wez39tpl/StopFlow/tools/reservations-service/lan-r3.py --start
```

Le lanceur n'exécute ni les 22 contrôles PostgreSQL acquis, ni Chromium. Il contrôle ses empreintes et utilise le moteur Service qualifié inchangé. Les primitives de création Auth/cluster déjà qualifiées sont réutilisées sur de NOUVELLES ressources Docker privées ; aucun pull/build ni port Docker publié. L'essai 8097 et les autres essais ne sont pas arrêtés ou modifiés.

Il identifie un périphérique Wi-Fi physique actif du Mac et son IPv4 privée (RFC1918). Le serveur est lié uniquement à cette adresse et au port 8098, jamais à 0.0.0.0. Si le Wi-Fi, l'adresse ou le port ne sont pas confirmés, il refuse ; aucune modification de réseau/pare-feu et aucun autre port tenté automatiquement.

Une base jetable et un compte Auth équipe exclusivement fictif sont créés. Le compte est réellement connecté et son JWT vérifié côté serveur. Appartenance : consultation et gestion des réservations, sans gestion physique des salles/tables/plans. Aucun mot de passe, JWT ou clé privilégiée dans le frontend, le lien ou les résultats.

Le jeu de présentation reprend les huit tables, les deux zones et les dix réservations fictives de design-r2/fixtures.json, à la date courante de Bruxelles. Les identifiants opaques de fixture sont convertis en UUID propres à cette opération. Aucune table/coordonnée provenant d'une base existante n'est modifiée. La note fictive d'affichage est attachée en mémoire à son identifiant, sans changement de schéma. Le jeu comporte cinq réservations du midi, un jumelage et les réservations du soir, dont une annulée.

Les lectures de contrôle confirment la journée et les droits limités. Après démarrage, le lanceur relit par HTTP la page et les trois assets Service (CSS, modèle et module), compare tous les octets/empreintes aux sources R3 et contrôle les marqueurs. Cette lecture utilise un cookie interne sans consommer le lien d'accueil destiné à la tablette.

Le lien exact n'est imprimé qu'après `R3_VERIFIEE` : `ESSAI_R3_PRET` contient le champ `lien`. Ouvrir ce lien à usage unique dans Safari sur la tablette connectée au même Wi-Fi. Il ne s'agit pas d'une publication ou d'un tunnel Internet. La preuve porte sur la version HTTP servie, pas sur une nouvelle validation visuelle du navigateur.

Durée : 30 minutes après préparation. Garder le Terminal ouvert ; Ctrl+C termine l'essai, clôt la session Auth et nettoie uniquement les ressources nouvelles dont l'identité est vérifiée. Le reçu est annoncé au début et le bilan de nettoyage est séparé en fin. Aucun nettoyage général. Une fermeture forcée ou panne du Mac peut nécessiter une récupération depuis le reçu.

Dans cette session : socket Docker refusé, aucun essai démarré, aucun lien inventé. Cinq tests hors connexion du lanceur passent (assets R3 sans token exposé, vérification HTTP sans consommation du lien, refus d'une ancienne version, détection Wi-Fi privée, absence de rejeu des anciennes campagnes). Aucune base active ni Zenchef contactés.
