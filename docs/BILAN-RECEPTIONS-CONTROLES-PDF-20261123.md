# Réceptions : original, fiche et bon PDF associés

Branche : `pilot/stopflow-v1-20261117`. Base préservée : `1b499ec77df49907c3c17b623e345d11a9ac61cf`. Référence Réservations R3 : `e160453537460c5b05e501d68d2376724b030317`.

## Parcours livré

- Cuisine et Salle : photo/import, puis **Enregistrer seulement** (À contrôler) ou **Créer la fiche de contrôle**. Un document possède un dossier ; une page rejoint celui-ci uniquement par l'action explicite correspondante. Un original identique retrouve son dossier autorisé, sans doublon.
- Photo conservée dans IndexedDB avant toute création serveur. Octets et métadonnées sont stockés séparément pour la compatibilité WebKit ; le fichier et son empreinte sont reconstitués à la reprise. Descripteur et intentions liés au compte et au département. Une reprise réutilise les identifiants et payloads initiaux.
- Fournisseur, référence, réception, opérateur serveur, lignes, quantités, unités, températures, conformité et observations. Aucune température ni conformité précochée. Une fiche ouverte reste un brouillon.
- **Terminer le contrôle** exige confirmation humaine. La version figée et les originaux sont assemblés côté serveur ; le contrôle devient terminé seulement après stockage privé et relecture des octets du PDF. Aucune clé privilégiée dans la fonction ou le frontend.
- Correction explicite : nouvelle version, anciennes fiches/PDF et originaux conservés. Un résultat réseau incertain reste à réconcilier, sans nouveau dossier ni PDF en double. Le catalogue, les prix et les stocks ne sont pas modifiés par cette fiche de réception.
- Historique : nom du document, état, originaux et bons de contrôle versionnés accessibles selon les droits. Téléchargement de secours lorsque le navigateur ne montre pas son lecteur PDF.

## Serveur pilote

Migration additive `supabase/pilot/receipt-control-pdf.sql`, appliquée uniquement à `mmrdpyhoawwoplbzqwag`. Fonction authentifiée `pilot_receipt_controls`, tables privées sous RLS, accès direct refusé. L'ancien chemin `receive` ne peut plus annoncer une réception terminée sans bon PDF. Le bucket `pilot-receipts-private` reste privé.

Contrôles réels de métadonnées après migration : anonyme sans EXECUTE ; authentifié sans SELECT direct ; RLS active ; bucket privé. Empreintes des tables et éléments du plan, réservations, profils et habilitations identiques avant/après. Zéro document/fichier métier créé par les tests sur le pilote.

## Preuves ciblées

- PostgreSQL 17 jetable, rôle d'installation non superutilisateur : **34 contrôles PASS**, Auth et contrat Storage simulés. Refus anonyme/autre département/sans permission, versions, concurrence, obsolescence, relecture, absence d'effet catalogue. Cluster arrêté et répertoires propres au test supprimés.
- Générateur PDF réel pdf-lib/sharp/PDF.js : **6 contrôles PASS**, photos PNG/WebP et PDF multipage en annexe ; empreintes, valeurs nulles versus zéro et refus des originaux manquants/différents.
- API : **5 contrôles PASS**, transport Auth/REST/Storage simulé et génération PDF réelle ; reprise après commit, refus sans Auth et hors pilote.
- Application complète, SDK réel, Chromium **156.0.8078.4** et WebKit **27.2** : Cuisine et Salle, **10 étapes PASS par combinaison**. Import, choix, reprise après fermeture de l'onglet, ajout explicite, confirmation annulée sans écriture, PDF réel, réponse perdue après commit, correction et conservation des originaux. Aucune erreur JS ni ressource en échec. Auth/REST/Storage interceptés : ces parcours ne sont pas des essais Auth ou Storage réels du pilote.
- Dimensions 1024×768, 834×1194, 390×844 : absence de débordement contrôlée ; captures tablette/téléphone et rendu PDF à 1024 px inspectés. PDF d'exemple de six pages lisible, annexe et SHA présents. La dernière modification de texte remplace la mention trompeuse de stockage temporaire par stockage privé du pilote.
- Artefacts fictifs conservés localement dans `.pilot-private/RECEPTION-PHOTO-FICHE-PDF-20261123/` : rapport navigateur, résultat PostgreSQL, captures, PDF et rendu de ses pages. Ils ne contiennent pas de données métier.

## Limites et raccordement restant

OneDrive et import historique **désactivés**, aucun accès effectué. L'OCR des photos **n'est pas configuré** : créer une fiche n'extrait aucune ligne ; la saisie manuelle est opérationnelle. Pour une reconnaissance future, raccorder un service OCR approuvé côté serveur, limité aux originaux privés autorisés, retournant des propositions avec provenance et confiance, puis validation humaine ; jamais de conformité ou température déduite sans validation.

Formats originaux : JPEG/PNG/WebP/PDF, 15 Mo par fichier. Assemblage borné à 20 originaux, 80 Mo d'entrée, 30 pages par PDF source et 60 pages d'annexes ; bon final limité à 15 Mo. Un dépassement ou un original illisible conserve le brouillon et refuse de déclarer le contrôle terminé. Les caractères hors police sont explicités `[U+…]`, leur valeur originale restant dans le snapshot.

Non vérifiés : capture photo matérielle et lecteur PDF natif sur iPad physique ; parcours complet avec véritable Auth/Storage sur un document pilote. Les tests navigateur utilisent des données synthétiques et un transport simulé ; les contrôles réels du pilote portent ici sur la migration, les ACL et les fichiers servis. Les données des réservations et la géométrie du plan restent intactes.

La PWA conserve les brouillons ; les assets utilisent l'édition `20261123-control2`, revalidation HTTP et service worker sans cache des données métier. Aucun rechargement forcé ne doit supprimer une saisie.
