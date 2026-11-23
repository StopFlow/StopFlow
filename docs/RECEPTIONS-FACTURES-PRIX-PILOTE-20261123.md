# Réceptions, factures et prix — pilote du 23 novembre 2026

Périmètre : `pilot/stopflow-v1-20261117`, Supabase `mmrdpyhoawwoplbzqwag` uniquement. Base de départ : `b4a6daa8c4b582e55c483efe34747d94aef72753`. Référence Réservations R3 conservée : `e160453537460c5b05e501d68d2376724b030317`.

## Parcours livré

Cuisine et Salle ouvrent le même module **Réception marchandises** avec `inventory.use` dans leur département. Le contrôle conserve fournisseur, référence/date, réception, opérateur serveur, quantités, température renseignée (vide différent de zéro), conformité humaine sans présélection, réserves et photos/pages supplémentaires. Le brouillon se sauvegarde et se relit sur le serveur ; un secours local et un reçu d'intention distincts sont liés au compte et au département. Une réception ne modifie aucun comptage, ne prépare ni n'envoie une commande.

Un gestionnaire `articles.manage` dispose du parcours **Document → Vérification → Catalogue**. Les lignes restent corrigeables : nature produit/frais/consigne/autre, département, référence fournisseur, quantité facturée, conditionnement, prix, remise, base HT/TTC, devise et produit physique explicitement choisi. Une fiche article manquante peut être créée via le parcours Articles existant, puis le document repris. Le fournisseur doit être choisi et vérifié dans sa fiche existante ; la création refuse un nom déjà utilisé. Un bon sans prix ne crée aucun prix. Il peut être lié à une facture existante du même fournisseur, selon les droits.

Les prix ne sont appliqués qu'après une validation humaine distincte. Chaque prix conserve document, ligne et date de facture ; une facture ancienne alimente l'historique mais ne remplace pas le prix plus récent. Une facture du même jour ne remplace pas automatiquement un prix daté déjà présent. Les avoirs conservent leur nature et ne deviennent pas des prix ordinaires négatifs. Un changement manuel de l'offre retire l'attribution du prix courant à une ancienne facture, sans effacer son historique.

**Prix & équivalences**, accessible depuis les références d'inventaire et les offres Articles : historique réel avec sources ; aucune courbe si vide ; comparaison datée d'offres du même produit, même unité et base de prix. Les rapprochements par nom/caractéristiques restent des suggestions. Un gestionnaire doit examiner découpe, calibre, origine, qualité et frais/surgelé, motiver puis confirmer ou garder séparé. Un produit déjà compté ou présent dans des commandes ne peut pas être fusionné par cette action : ses stocks restent séparés. Pour un produit neuf jamais compté, l'approbation réaffecte explicitement les offres et désactive seulement la fiche source, sans suppression des références ni des prix. Aucun fournisseur habituel n'est choisi automatiquement.

La recherche d'inventaire porte aussi sur fournisseur, référence et conditionnement. Les références enrichies montrent le dernier prix comparable et sa date connue. Le comptage reste par produit physique, dans son département ; les stocks de départements différents ne sont jamais réunis.

## Fournisseurs partagés

Cases Cuisine et Salle indépendantes dans la fiche fournisseur du parcours produits ; Entretien & hygiène conservé. La fiche et les identifiants restent uniques. Contacts, conditions et historiques existants restent accessibles. Ajouter/retirer un rattachement ou modifier l'identité partagée exige `suppliers.manage` dans tous les départements concernés ; un seul droit Cuisine n'accorde pas de droit Salle. Un rattachement utilisé par des produits, commandes ou documents ne peut pas être supprimé.

Les anciens déclencheurs qui imposaient le département unique du fournisseur aux articles/commandes sont adaptés : le département propre de chaque article/commande est préservé et doit être desservi par le fournisseur. Le département d'une commande existante est immuable. Le champ scalaire historique du fournisseur est conservé, sans devenir la source des nouveaux rattachements.

## Originaux et extraction : limites explicites

**Aucun appel à OneDrive**, aucune consultation des archives et aucun import historique. Aucun travail récurrent créé. `server/document-archive.cjs` est volontairement inerte : `NOT_CONFIGURED`, jamais « archivé » ou « synchronisé ».

Les originaux sélectionnés sont conservés temporairement dans le bucket Supabase **privé** `pilot-receipts-private`, 15 Mo/fichier. Ils sont immuables (pas d'upsert, de mise à jour ni de suppression par le client), liés au document et protégés par les droits actuels sur tous ses départements. Un original mixte Cuisine/Salle n'est pas accessible à un opérateur d'un seul département. La consultation utilise le JWT de l'utilisateur et un téléchargement privé/blob local, sans lien public permanent. Les métadonnées de prix peuvent rester consultables dans leur département sans ouvrir un original mixte interdit.

L'extraction de **PDF texte** s'effectue dans l'API serveur du pilote, avec `unpdf` **1.4.0**, version et intégrité verrouillées. L'API utilise le JWT utilisateur et la clé publique du pilote, pas de clé privilégiée. Elle vérifie les droits, le chemin enregistré, la taille et le SHA-256 de l'original. Elle ne prend aucune URL externe. Limites : 15 Mo, 30 pages, 150 000 caractères extraits (60 000 conservés dans le brouillon). Les champs d'en-tête explicitement étiquetés et les lignes structurées par séparateurs sont proposés ; les factures de mise en page non reconnue restent à saisir/corriger depuis le texte et l'original. La reconnaissance commerciale de mises en page arbitraires n'est pas revendiquée.

**OCR des photos et PDF scannés non configuré.** Ils peuvent être joints, consultés et contrôlés manuellement ; aucune extraction ni conformité n'est simulée. Aucun seuil réglementaire de température n'est déduit d'une facture : l'opérateur saisit la mesure pertinente et sa décision humaine.

La reprise d'un transfert interrompu réutilise le fichier enregistré et son empreinte ; elle n'écrase pas l'original. Un résultat d'envoi incertain conserve identifiant et payload initiaux, même après un refus ultérieur. La relecture est nécessaire avant de remplacer les saisies récentes.

## Prérequis de la phase OneDrive (non engagée)

Après feu vert distinct : identifier le tenant professionnel et un dossier métier convenu ; configurer côté serveur une identité applicative Graph avec accès limité au site/dossier retenu, consentement administrateur et secrets dans le coffre serveur ; définir conservation, limites et traitement des erreurs. Le connecteur devra conserver drive/item/version, empreinte et date d'archivage après contrôle effectif, puis servir les originaux par une passerelle authentifiée vérifiant les droits StopFlow. Aucun compte Microsoft personnel à partager aux employés et aucun lien public permanent. L'import historique devra être borné, proposé et approuvé séparément ; il est désactivé actuellement. Ne pas placer les accès Graph dans le frontend ni dans Git.

## Qualification et preuve

- PostgreSQL 17 jetable : **38 contrôles PASS**, rôle d'installation non superutilisateur ; identité Auth et contrat Storage simulés. Cas : fournisseurs Cuisine/Salle/partagés/Entretien, isolation produits et commandes, contrôle humain, température vide, bon sans prix, facture corrigée et validation, prix rétroactifs, doublons et validations concurrentes, reprise du même envoi, équivalence acceptée/refusée, frais/surgelé et stocks déjà comptés protégés. Cluster arrêté et répertoire supprimé.
- Node : **8 groupes PASS** (modèle, extraction conservatrice, accès API et empreintes, intentions incertaines, aucun accès OneDrive).
- PDF synthétique : **2 contrôles PASS avec le moteur unpdf/PDF.js réel**, sans OCR.
- Navigateurs : page complète et SDK réel, HTTP Auth/REST/Storage simulé et aucun accès externe ; Chromium 156 et WebKit 27.2, profils propriétaire/Cuisine/Salle. Tablette 1024×768, 1180×820, portrait 834×1194 et téléphone 390×844. Capture des pages réception, facture, fournisseur, recherche/prix. Les captures sont inspectées visuellement. Le format change sans relancer l'écran de démarrage ni perdre la page : défaut de l'enveloppe reproduit et corrigé.
- Pilote : deux migrations additives installées ; RPC réservé à authenticated, tables directes refusées, bucket privé et deux politiques Storage. Aucune fixture/document/prix de test ajouté. Empreintes des tables Réservations, éléments de plan, réservations, profils, droits et produits **identiques avant/après**.
- Les avertissements de l'advisor sur les tables fermées sans politique sont attendus : absence de grants directs et accès exclusivement via RPC contrôlé. Les fonctions anonymes préexistantes signalées par l'advisor ne sont pas élargies ; la nouvelle RPC documentaire refuse anon.
- Les tests navigateur utilisent des réponses serveur simulées ; ils ne qualifient pas un traitement de vraie facture, une signature Auth réelle du nouveau parcours ni l'usage physique sur iPad/iPhone. Ces essais et l'archivage réel restent distincts.

Commandes de qualification : `node tests/receipts.test.cjs`, `node tests/receipts-pdf.cjs` (dépendance verrouillée installée), `python3 -B tests/receipts-pg17.py` avec `STOPFLOW_TEST_PG_BIN`, et `node tests/receipts-browser.cjs` avec le répertoire compilé et Playwright existant. Aucun de ces tests n'utilise des documents réels ni OneDrive.

Sources techniques consultées : [Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [gestion de politiques via supautils](https://github.com/supabase/supautils#table-ownership-bypass), [unpdf](https://github.com/unjs/unpdf). Sur le pilote, `supautils.policy_grants` autorise postgres à gérer les politiques Storage sans changer le propriétaire ni accorder un rôle supplémentaire.

Livraison frontend : édition `20261123-receipts1`. La PWA continue à charger les assets réseau, avec revalidation ; aucune copie métier en cache ajoutée. Les essais physiques iPad/iPhone et les vraies factures ne sont pas qualifiés.
