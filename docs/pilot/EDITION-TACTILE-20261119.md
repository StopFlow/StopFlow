# Pilote — édition tactile du plan, 19 novembre 2026

Périmètre : branche `pilot/stopflow-v1-20261117`, aperçu existant et projet
Supabase `mmrdpyhoawwoplbzqwag`. Référence R3 conservée :
`e160453537460c5b05e501d68d2376724b030317`.

## Parcours livré

Service conserve la liste à gauche et agrandit le plan à droite. « Agrandir
le plan » masque temporairement la liste. L'engrenage et l'ancien accès
Réservations ouvrent le même éditeur, sans menu latéral.

L'éditeur utilise la hauteur restante de l'écran. Les deux salles sont
affichées ensemble ; leur cadrage est une transformation d'affichage, pas
une modification des coordonnées enregistrées. Un doigt sélectionne et
déplace un objet ; le fond ou « Déplacer la vue » déplace la caméra ; deux
doigts zooment et déplacent la vue. La matrice écran/plan est figée pendant
chaque geste. Les boutons de zoom et les champs numériques restent disponibles.

Ajouter propose les trois formes de tables et les repères mur, porte,
plante, bar et cuisine. Le panneau permet numéro, capacité, forme, position,
dimensions et orientation. Les modifications restent en brouillon jusqu'à
« Enregistrer le plan ». Annuler revient au dernier état confirmé.

Le mode Jumelage permet une sélection multiple, un nom et une capacité
totale. Une table peut appartenir à plusieurs combinaisons. Le contrat
serveur existant impose des tables actives d'une même salle ; les conflits
continuent à porter sur les tables physiques.

Le champ de mot de passe existant est masqué par défaut. Le bouton œil
mesure 48 px, fonctionne au clavier, annonce Afficher/Masquer et ne soumet
pas le formulaire. La valeur et l'autocomplétion du champ sont conservées.

## Enregistrement et limites

Aucune migration, aucun droit attribué, aucun changement des réservations
ou des données du pilote pour les essais. Les RPC et leurs contrôles restent
autoritaires : `tables.manage` pour les métadonnées, `layouts.manage` pour
le plan et les combinaisons. Le personnel sans ce droit ne voit pas l'éditeur.

Les identifiants existants sont conservés. Une nouvelle table reçoit son
identifiant du serveur. Chaque élément envoyé à la RPC de plan inclut
désormais `expected_version`, exigé par sa définition réelle. Les versions
sont relues avant écriture et les résultats après écriture.

Le serveur existant rend chaque RPC atomique, pas l'ensemble des salles,
tables et combinaisons en une seule transaction. Si une étape ultérieure
échoue, l'interface signale les écritures déjà confirmées et conserve le
reste du brouillon. Les erreurs ne provoquent aucun renvoi automatique.
Un envoi incertain bloque les écritures suivantes jusqu'à sa relecture.
Si la réponse de création d'une table est perdue avant réception de son
identifiant serveur, le brouillon et le reçu sont conservés, mais cette
création reste à réconcilier ; aucune seconde création n'est tentée.

Les brouillons sont séparés par utilisateur et établissement dans le
stockage de session. Un conflit ne remplace ni la version serveur ni le
brouillon. Quitter avec des modifications demande confirmation.

## Vérification

- Modèle et RPC simulés : 15 groupes réussis, dont conflit, réponse perdue,
  création sans doublon, validation avant première écriture et brouillons
  séparés par utilisateur.
- Parcours Service simulé : 19 groupes réussis.
- Navigation/activation simulées : 7 groupes réussis.
- Paquet pilote/PWA : 4 groupes réussis, empreintes des sources et fichiers
  générés distinguées ; référence R3 conservée.
- Navigateur Chromium 156.0.8078.4 piloté par Playwright 1.64.1 : 17 étapes
  réussies sur les modules réels, avec backend simulé. Sélection et glissement,
  zoom avec contrôle de l'état, déplacement de la vue, pincement, annulation,
  sauvegarde et relecture, ajout/modification de table et repère, jumelages
  partageant une table, plan agrandi, rechargement, formats 1024 × 768 et
  1440 × 900 sans débordement, personnel sans accès à l'éditeur et bouton œil
  tactile/clavier sans soumission. Le scénario couvre aussi la
  modification de capacité/forme/dimensions/orientation d'une table créée,
  avec sauvegarde immédiate après saisie et identifiant conservé.
- Captures réelles du navigateur : `/pilot-touch/editeur-tablette-1024x768.png`,
  `/pilot-touch/service-plan-agrandi-1024x768.png` et
  `/pilot-touch/editeur-macbook-1440x900.png`. Rapport détaillé :
  `/pilot-touch/resultat.json`, avec confirmation de fermeture du navigateur
  et suppression de son profil temporaire. Les gestes sont émulés ; ni
  l'iPad physique ni une écriture réelle Supabase ne sont déclarés validés.

Défauts reproduits et corrigés pendant la qualification : reconstruction du
canevas à la fin du geste et des commandes lors du changement de champ ;
placement initial d'un nouvel objet au-dessus d'une table existante. Le
canevas reste désormais stable pendant les gestes et les nouveaux objets
cherchent une place libre sans réarranger les anciens. Le pilote de test
injecte les déplacements à une cadence de doigt, plutôt qu'en un seul
instant : l'injection instantanée supprimait le clic tactile suivant dans
Chromium. Cette correction du scénario est distinguée des changements
applicatifs.

La qualification navigateur charge les vrais modules Service/éditeur,
leurs styles et le formulaire de connexion, avec des RPC en mémoire et
les données fictives de `tools/pilot/fixtures.sql`. Les requêtes de page
extérieures à la fixture sont bloquées. Elle ne se connecte pas à Supabase.
Les dépendances navigateur et NSS/polices sont préparées uniquement dans
la machine de build éphémère, sans installation sur le Mac ni modification
des services de l'application. Un échec de qualification refuse le build.

Le manifeste `tools/pilot/touch-release.json` contient les empreintes sources
revues. `pilot-release.json` publié distingue ces sources des octets servis
après génération de la configuration et des icônes.
