# Réception Cordier : fiche numérique et catalogue — 23 novembre 2026

Périmètre : branche `pilot/stopflow-v1-20261117`, départ `9d1b7e2f7e9e6ed25bba3a19a2ccf71a82c592e8`. Seul Supabase `mmrdpyhoawwoplbzqwag`. R3, plan Restaurant & Taverne, droits, originaux et réceptions existantes conservés. Aucun accès à la production, à Zenchef ou à OneDrive.

## Défauts corrigés

- Le parseur détectait l’en-tête Article/Description mais ne donnait pas de colonne à Article : les lignes étaient rejetées. Article est désormais une référence ; Vidange et TVA ont leurs propres limites de colonne. Une désignation lisible est conservée même sans référence, signalée à vérifier. Ordre et répétitions conservés.
- Articles manquants est une rubrique séparée, jamais comptée dans les produits livrés ni mémorisée automatiquement. Un tableau rencontré après le total, sans rubrique reconnue, reste à vérifier plutôt qu’être déclaré livré. Un passage OCR de texte épars complète les titres de rubrique que la lecture du tableau peut omettre.
- L’orientation affichée n’était pas toujours transmise à readAll. Elle est maintenant enregistrée par original dans le brouillon, restaurée puis réellement envoyée à la fonction. Une nouvelle tentative relit la photo ciblée. Les rotations 0/90/180/270 sont essayées sous le même délai global borné lorsqu’aucun tableau n’est trouvé ; l’orientation ayant réellement lu des produits est conservée. Aucun original n’est réencodé en stockage.
- Une relecture conserve les corrections explicites et les mesures d’une ligne retrouvée. Une ancienne ligne contrôlée non retrouvée reste visible et bloquée pour rapprochement, au lieu d’être supprimée silencieusement.

## Fiche unique

Photo privée à gauche, zoom/rotation/page, bon numérique à droite. Fournisseur, référence/date et en-tête extrait de l’original lorsqu’exploitable. Il s’agit d’une découpe de l’original, pas d’un logo généré ou téléchargé ; le logo Cordier réel n’est pas qualifié dans cet essai. Les champs fournisseur/référence/dates sont repliables lorsqu’ils sont renseignés, pour laisser la place aux produits.

Chaque produit conserve ses données imprimées ; température pertinente, emballage Oui/Non vierge, observation et quantité réellement reçue en cas d’écart restent des contrôles humains. Les choix catalogue sont présents dans cette même fiche : **Ce bon uniquement / Mémoriser l’article et sa référence / Enregistrer aussi le prix**. La fiche peut être terminée sans aucun ajout au catalogue.

Une référence exacte, vérifiée et unique chez le même fournisseur propose l’article connu. Une référence OCR incertaine n’entraîne pas de rattachement automatique. Une ressemblance de nom affiche unité et conditionnements, puis demande un choix explicite ; aucune fusion par nom. Le droit Articles du département demeure nécessaire. Une confirmation finale regroupe contrôle humain et choix catalogue. En cas de résultat incertain, les reçus existants restent applicables.

Un prix confirmé garde sa date, son document et sa ligne source. L’ajout ultérieur du prix après mémorisation sans prix ne recrée pas l’article. Les confirmations concurrentes et répétées ne dupliquent pas la mémoire ni le prix. Une réaffectation d’une ligne déjà mémorisée à un autre produit est refusée. Les changements de mesures et de métadonnées OCR n’invalident pas les seuls champs commerciaux inchangés.

Documents enregistrés permet la recherche par date (ISO ou belge), fournisseur, numéro et article. Le filtrage département/auteur et les autorisations restent ceux du serveur. La fiche, les mesures, les écarts, les articles manquants et les observations sont associés au PDF versionné et aux originaux inchangés. Les versions précédentes restent conservées.

## Document réellement testé et résultats

L’original privé Cordier n’a pas pu être téléchargé avec une session pilote autorisée : aucune session authentifiée utilisable dans cet environnement. `Downloads/IMG_2422.HEIC` a été trouvé ; la conversion locale produit une erreur ImageIO/sips et aucun fichier image décodable. La capture n’a donc pas été présentée comme lue visuellement. Aucun octet de cette photo n’a été transféré au banc distant ou publié.

Le test utilise un **bon fictif reproduisant les huit colonnes et la rubrique décrites** : Article / Description / Vidange / Quantité / Unité / Prix unitaire / Total € / TVA ; dix produits livrés, deux manquants, ordre non alphabétique, doublon et désignation sur deux lignes. Ce n’est pas une reproduction des lignes privées du vrai bon Cordier.

- **Tesseract.js 6.0.1 / fra réel : 10 lignes livrées reconnues sur 10 ; 2 manquants sur 2, séparés.** Fournisseur, numéro, date, désignations, quantités, unités, prix et montants conformes à la fixture.
- Erreurs restantes : références alphanumériques des lignes livrées 1, 2, 4, 5, 7, 8, 9, 10 et du second article manquant. Toutes sont signalées à vérifier ; aucune correction supposée des caractères O/0. Les premières références sont corrigées explicitement dans le scénario catalogue avant approbation. Ne pas annoncer une lecture parfaite des codes.
- Rotation explicite puis réouverture et rotation automatique : PASS avec le moteur réel.
- PostgreSQL 17 jetable : **15 contrôles ciblés PASS**, dont ajout concurrent de prix, non-duplication, conservation des mesures/manquants, refus d’un autre rattachement, restriction de département et refus anonyme. Auth et contrat Storage simulés. Arrêt du cluster confirmé avant suppression.
- Modèle/reprises : **11 groupes PASS** ; parseur Cordier/classification/recherche : **16 assertions PASS** ; régressions du parseur : 12 ; versions partagées : 6 ; paquet pilote : 4 groupes.
- Application complète et SDK réel : Chromium 156.0.8078.4 et WebKit 27.2, Cuisine et Salle. Catalogue vide, photo tournée/reprise, contrôle/PDF sans catalogue, recherche et réouverture, référence connue/similaire/nouveau produit, confirmation finale et double mémorisation. Paysage 1024×768, portrait 834×1194, téléphone 390×844 ; aucun débordement horizontal ni erreur JS dans les scénarios qualifiés. Tactile émulé, pas iPad physique.

Les tests navigateur traversent le vrai code de l’API d’extraction et le moteur OCR/PDF réels, mais **Auth/REST/Storage y sont interceptés par des fixtures**. Ils ne traversent pas la fonction déployée avec un original réel et une session pilote. Ce parcours reste non vérifié ; aucun nouveau prestataire OCR, compte ou document de test n’a été ajouté au pilote.

## Livraison

Migration ciblée `supabase/pilot/receipt-cordier-workflow.sql`, sans rejeu du socle. Avant/après installation : empreintes documents `e9486369c44c7bb0b6dfa8626c3231a9`, fichiers `324e2219a5d40ee5a0015ef27ba21bac`, prix `d41d8cd98f00b204e9800998ecf8427e`, tables `7c7b43370ebb55c0ff351e7fd428c898`, éléments `3fae0416838633aa65e9e7080f889f22`, permissions `448166a1c1067d6a101a44ab4c688e19` : identiques. Bucket privé, RPC sans EXECUTE anonyme et search_path vide conservés. Les avis existants concernant d’autres RPC ne sont pas modifiés par ce lot.

Édition `20261123-cordier5`, scripts et cache PWA versionnés. Aperçu uniquement : https://stopflow-app-git-pilot-stopflow-v1-20261117-stopflow.vercel.app/.

Preuves fictives complémentaires dans `.pilot-private/CORDIER-FICHE-20261123/` ; garde navigateur et captures dans `pilot-touch/receipt-control/` de l’aperçu. Banc temporaire arrêté puis supprimé après conservation des preuves. Révision et empreintes servies consignées dans le reçu privé de livraison.
