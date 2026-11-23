# Réception : photo, lecture commune, contrôle et catalogue

Base vérifiée propre : `2f469683ee2f9e93724a7f861c6df5b1fb8f6e99`, branche `pilot/stopflow-v1-20261117`. Projet autorisé : `mmrdpyhoawwoplbzqwag` uniquement. Aucune production, aucun accès OneDrive, aucun import historique.

## Parcours

Photo/import : consigne feuille entière, un seul bon, texte net, prise en portrait pour une feuille verticale. Appareil arrière proposé, import séparé. Rotation de consultation sans réécrire l'original. Contrôle de netteté, résolution et texte touchant les bords avant acceptation ; motifs concrets en cas de refus. L'analyse serveur ajoute un refus lorsque le texte est trop petit ou globalement illisible. Ce sont des heuristiques : elles ne garantissent pas qu'une page est complète. L'opérateur doit vérifier le cadrage.

Trois actions selon les droits :

1. **Enregistrer seulement** : original privé, À contrôler, reprise ultérieure.
2. **Créer la fiche de contrôle** : lecture des pages, enregistrement de la lecture commune, ouverture d'une fiche distincte. Quantité du bon et quantité reçue séparées ; température et conformité restent vierges.
3. **Mémoriser les articles et les prix** : vérification des lignes, choix du fournisseur et rattachement explicite aux articles. Accessible sans créer ou terminer un contrôle. Les corrections et les identifiants de ligne sont réutilisés dans les deux sens.

Les lignes restent dans l'ordre imprimé ; répétitions et désignations sur deux lignes sont conservées. Insertion avant une ligne et retrait explicite disponibles. Les champs incertains sont signalés. Les lignes non classées sont consultables : elles ne deviennent pas automatiquement des articles. Un format non reconnu reste corrigeable manuellement ; aucun produit n'est inventé.

Paysage : original à gauche, zoom/pages/rotation ; fiche compacte à droite avec défilement propre. Actions en bas. Portrait/téléphone : bascule bon/fiche et maintien des saisies et du défilement. Les captures initiales inspectées ont révélé un doublon de commande de vue : supprimé dans la version livrée, avec recontrôle Chromium dans le garde du déploiement. Aucun essai physique iPad n'est revendiqué.

## Moteur et confidentialité

**Tesseract.js 6.0.1**, moteur WASM, langue française `@tesseract.js-data/fra` **1.0.0**, dépendances et modèles verrouillés par le lockfile. Traitement dans la fonction du pilote, avec chemins de worker, de moteur et de langue locaux. Aucun appel à un prestataire OCR, aucune clé OCR ni abonnement ajouté. Les coûts ordinaires d'exécution du pilote restent ceux de son hébergement existant.

L'API vérifie la session et les droits par la RPC existante, puis télécharge l'original depuis le bucket privé et vérifie taille/SHA256. Les photos ne sont pas envoyées à un nouveau prestataire. Le texte du document et les jetons ne sont pas journalisés. Les images de tests sont exclusivement fictives.

Le parseur exploite les positions des mots et les en-têtes de colonnes. Il distingue référence, désignation, quantité, unité, prix unitaire, montant de ligne et base HT/TTC explicite. Il ne garantit pas la reconnaissance de toutes les mises en page : les tableaux sans en-têtes reconnus ou les cellules ambiguës nécessitent une correction humaine. Les scans PDF sans couche texte restent à saisir manuellement ; l'OCR livré porte sur les photos JPEG/PNG/WebP. Les PDF texte conservent leur parcours existant.

## Catalogue et serveur

Deux migrations additives, sans rejeu du socle : `receipt-shared-reading.sql`, puis `receipt-catalogue-legacy-guard.sql`. Lecture persistée sur le document, identifiants stables par ligne, reçus d'intention et contrôle de révision. Mémorisations et provenance privées sous RLS, sans accès direct authentifié/anonyme.

Seul `articles.manage` du département permet de mémoriser. Choix du fournisseur obligatoire ; correspondance par référence proposée seulement si unique, sinon choix explicite. Un nouvel article requiert une demande explicite, avec unité de stock autorisée. Aucun rapprochement automatique par nom. La cible initiale de stock d'un nouvel article est explicitement annoncée à zéro ; aucun comptage n'est inventé.

Le prix unitaire du bon et le montant de ligne restent deux champs distincts. Pour un conditionnement, quantité de stock et unité sont vérifiées avant conversion. Base HT/TTC et devise explicites ; aucune comparaison d'unités incompatibles. Sans prix confirmé, références/désignations mémorisables sans changer un prix connu. Historique daté et relié au document et à la ligne. Un prix plus ancien ou de même date ne remplace pas silencieusement le prix courant. Les documents déjà appliqués par l'ancien parcours ne peuvent pas être remémorisés par le nouveau.

Une intention rejouée retrouve son résultat. Une seconde intention sur les mêmes lignes ne recrée ni article, ni offre, ni historique. Deux mémorisations concurrentes du même bon sont sérialisées. Une correction d'une ligne déjà mémorisée est refusée pour revue de l'historique, au lieu d'ajouter un doublon silencieux.

La fiche et le PDF versionné restent séparés du catalogue. Le PDF inclut référence fournisseur, quantité du bon, quantité reçue, mesure, conformité humaine, observations et originaux en annexe. Une correction du contrôle ouvre une nouvelle version, sans réécrire les anciennes. La consultation d'un contrôle terminé conserve ses valeurs figées même si la lecture destinée au catalogue a ensuite été corrigée.

## Preuves

- **Lecture réelle** : image PNG d'un bon fictif de dix articles, ordre non alphabétique, référence répétée et désignation sur deux lignes. **10 lignes obtenues sur 10**, références/désignations/quantités/unités/prix unitaires/montants comparés aux valeurs attendues. Bon sans prix : **10/10**, aucun prix inventé. Deux pages : **5 + 5**, ordre conservé. Photo fortement floue : refus avec motif concret.
- **PostgreSQL 17 jetable : 19 contrôles PASS**, dont les deux sens contrôle/catalogue, prix connus préservés, quantités distinctes, mémorisation concurrente sans doublon, refus anonyme/autre département/sans droit et blocage du second chemin ancien. Auth et contrat Storage simulés ; cluster arrêté et répertoires du test nettoyés.
- **Chromium 156.0.8078.4 et WebKit 27.2**, Cuisine et Salle : **9 groupes par combinaison PASS**, application complète et vrai SDK, OCR et génération PDF réels ; Auth/REST/Storage interceptés. Capture/reprise, dix lignes, insertion/retrait, réponse perdue après mémorisation puis reprise, PDF avec annexe, portrait, téléphone, deux pages sans fiche et photo floue refusée avant création. Aucun échec de ressource ni erreur JavaScript. Sous Linux, WebKit a requis la désactivation de la composition graphique dans l'environnement de test ; aucun réglage utilisateur n'a été modifié.
- **9 assertions de parseur/configuration synthétiques** : ordre, doublons, continuation, quantité illisible conservée, séparation HT/TTC, prix absent, montant distinct, source intacte. **6 assertions simulées de versions** : lecture catalogue corrigée distincte du contrôle terminé et nouveau brouillon cohérent.
- **6 contrôles PDF + 5 contrôles API ciblés PASS**, générateur réel ; transports simulés. Ces résultats ne valent pas essai du lecteur PDF natif sur iPad.
- Contrôles réels du pilote après migration : RPC anonyme refusée, table de mémorisations inaccessible directement, bucket privé. Le document et son original déjà présents, les droits et la géométrie du plan sont inchangés. Aucun document ni prix fictif ajouté au pilote pour les tests.

Captures inspectées, images de bon, lectures obtenues, PDF et rapports fictifs conservés dans `.pilot-private/RECEPTION-OCR-20261123/`. La dernière validation du build contrôle la révision et les empreintes servies. Les brouillons restent protégés ; les assets et le service worker utilisent l'édition `20261123-reading3`.

## Court parcours iPad restant

Cuisine → Réception marchandises → photo nette en portrait → choisir fiche ou catalogue → vérifier le fournisseur et les dix lignes → corriger une quantité → revenir à l'autre usage sans ressaisie → renseigner les mesures/conformités réelles → Terminer le contrôle → ouvrir le bon PDF et son annexe. Ajouter la deuxième page uniquement avec l'action explicite correspondante.

Restent non vérifiés physiquement : capture par la caméra iPad, clavier/orientation réels et lecteur PDF natif. Le parcours complet avec un véritable compte et Storage sur un document du pilote n'a pas été exécuté pendant cette livraison ; les parcours de bout en bout décrits ci-dessus utilisent le vrai moteur sur un transport simulé. Le service actif est raccordé au bucket privé du pilote et attend la validation humaine des documents.
