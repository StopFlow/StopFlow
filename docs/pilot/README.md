# StopFlow V1 Pilote

Branche : `pilot/stopflow-v1-20261117`.
Source R3 préservée : `e160453537460c5b05e501d68d2376724b030317`.

Seul backend autorisé : `https://mmrdpyhoawwoplbzqwag.supabase.co`.
Le socle et les migrations du pilote sont déjà installés ; ne pas les rejouer.
Les fixtures sont fictives : deux salles, huit tables et dix réservations, sans
connexion à Zenchef ou à la base active. Les identifiants et positions du plan
R3 sont préservés dans ce jeu de test.

Le reçu privé observé sur le Mac confirme `PASS_AUTH_HTTP_PILOTE` : connexion
Auth réelle, lectures Réservations, retour utilisateur envoyé puis relu et
session de vérification clôturée. Ce résultat n'est pas un test navigateur.
L'accueil et sa carte Réservations sont vérifiés en simulation. La validation
visuelle sur la tablette de salle reste à effectuer avant utilisation en service.

## Aperçu uniquement

Build : `node scripts/build-pilot.cjs`, sortie `.stopflow-dist`.
Le build exige le profil `development`, le backend exact et, sur Vercel,
`VERCEL_ENV=preview`. Les variables publiques de la seule branche pilote sont :

- `STOPFLOW_ENVIRONMENT=development` ;
- `STOPFLOW_SUPABASE_URL` : URL pilote ci-dessus ;
- `STOPFLOW_SUPABASE_PUBLIC_KEY` : clé publique du seul projet pilote ;
- `STOPFLOW_APP_ORIGINS=[]` (les origines exactes Vercel sont ajoutées au build) ;
- `STOPFLOW_VERCEL_PROJECT_ID` : projet Vercel vérifié ;
- `STOPFLOW_PILOT_COMMIT` : SHA du commit pilote effectivement livré.

Aucune clé serveur, identité de connexion ou session n'appartient au frontend.
Le profil de compatibilité historique du source est remplacé par le build ; il
n'est jamais utilisé comme repli de l'aperçu. La CSP limite les connexions du
navigateur au backend pilote. Le build publie `pilot-release.json` avec le commit
source, le commit pilote et les empreintes des trois assets Service R3 inchangés.

L'aperçu doit être protégé avant remise du lien. Une connexion Vercel peut être
requise avant la connexion employé à StopFlow. Ne pas désactiver cette protection
pour faire réussir un contrôle automatisé et ne pas promouvoir cet aperçu.

## iPad

Le build conserve le service worker et le manifeste, donne un nom distinct au
pilote et produit des PNG statiques 180, 192 et 512 px à partir des icônes
existantes. Le lien Apple touch du paquet pointe sur l'icône statique 180 px.
Les tests de paquet vérifient ces fichiers ; ils ne valident pas l'installation
physique d'une PWA protégée sur un iPad.

## Données privées et outils locaux

`.pilot-private` (compte, mot de passe fictif, reçu et résultat Auth), le fichier
public de configuration du lanceur, le lanceur opérationnel Auth et ses tests
locaux sont exclus du commit. Ils restent sur le Mac. Aucune création de compte,
migration ou habilitation n'est déclenchée par le build ou le démarrage frontend.
Les fixtures SQL et la définition du retour serveur sont conservées pour revue,
sans exécution automatique. Aucun envoi fournisseur ou intégration externe.


## Connexion du pilote — 20 novembre 2026

Référence avant correctif : e1ec098. La page réelle démarre dans des profils
neufs Chromium 156 et WebKit 27.2 avec le SDK CDN 2.119.2. Cela ne démontre
pas la cause réseau précise sur l’iPadOS 26.6 signalé. Le chemin défectueux
est confirmé : SDK absent ou initialisation échouée, client nul, bouton de
connexion pourtant actif, puis message générique avant tout envoi Auth.

Le SDK officiel 2.119.2 est désormais téléchargé au build seulement, contrôlé
par SHA-512 pour l’archive npm et SHA-256 pour le fichier UMD, puis servi par
le même domaine que l’application. Aucun script npm n’est exécuté. Les
références sont dans `tools/pilot/supabase-sdk.json`. Un écart refuse le build.
La licence accompagne le fichier distribué.

Le bouton reste désactivé pendant la préparation. Les échecs distinguent
chargement, délai, format, initialisation et vérification de session. Le code
technique, la phase et le type d’exception sont affichés sans message brut,
identifiant, clé ni jeton. Réessayer conserve les champs, déduplique les
préparations et ne renvoie aucun identifiant automatiquement. Le client
initialisé est aussi partagé avec les extensions historiques.

`tests/pilot-auth-startup-browser.cjs` charge la page complète et le SDK réel,
sans injecter de client. Douze cas sont vérifiés sous Chromium et WebKit :
normal, SDK retardé, refusé, invalide, expiré et exception d’initialisation,
avec reprise et conservation de la saisie. Seules les réponses HTTP de
connexion sont simulées ; aucun compte ni mot de passe réel n’est utilisé.
Le contrôle Chromium est aussi exécuté dans le build pilote pour ne plus
confondre le démarrage réel avec le client simulé du test tactile.

Éditeur tactile, bouton œil, plan, RPC, données et droits sont conservés.
L’essai physique Safari et application installée sur iPadOS 26.6 reste
distinct et non confirmé ; aucune modification du compte n’est requise.
