# StopFlow — feuille de route produit 2026

## Principe général
StopFlow reste une seule application, une seule base de données et un seul système de permissions. Les adaptations desktop et mobile peuvent avoir des présentations différentes sans dupliquer les données ni la logique métier.

La feuille de route doit couvrir à la fois la stabilité technique et les fonctions métier réellement utiles sur le terrain. Une idée produit confirmée ne doit pas disparaître simplement parce que sa version exacte n'est pas encore développée : elle reste inscrite dans le backlog jusqu'à sa réalisation, son abandon explicite ou son remplacement par une meilleure solution.

Une branche stable est conservée à chaque publication importante afin de permettre un rollback rapide.

## Situation actuelle — 0.7.3 en développement
Objectif : terminer une version terrain fiable avant d'ouvrir les gros chantiers fonctionnels de la 0.8.

Comprend notamment :
- permissions fines et socle Supabase/RLS ;
- navigation par zones et cartes ;
- Températures V3 ;
- parcours Inventaire fournisseur mobile ;
- Résumé et Validation adaptés au smartphone ;
- génération du PDF du bon de commande ;
- historique des bons ;
- intitulés métier lisibles dans l'Historique, par exemple « Commande — Colruyt » ;
- standard tactile iPhone commun ;
- standard responsive commun selon la taille réelle de l'écran ;
- fenêtres, tableaux et modales adaptés au viewport mobile ;
- corrections indispensables au fonctionnement quotidien.

Avant publication 0.7.3 :
- contrôle desktop ;
- contrôle smartphone réel ;
- vérification Inventaire → Résumé → Validation → PDF → Historique ;
- vérification navigation et boutons principaux ;
- sauvegarde et validation explicite avant production.

## Backlog produit métier confirmé

### A. Catalogue achats et comparatif fournisseurs
Objectif : permettre de retrouver rapidement ce que l'établissement achète, chez qui, à quel prix, et comparer une même famille de produits entre plusieurs fournisseurs.

Cas d'usage de référence : rechercher « café » dans StopFlow et voir immédiatement le café acheté chez Café Liégeois, les références comparables éventuellement encodées chez Colruyt ou d'autres fournisseurs, leurs conditionnements et leurs prix.

Fonctions prévues :
- recherche globale dans les articles/produits ;
- fiche produit lisible avec photo ;
- association d'un même produit ou d'une même famille à plusieurs offres fournisseurs ;
- fournisseur, référence fournisseur et conditionnement ;
- prix d'achat ;
- date du prix relevé ;
- historique des prix ;
- calcul d'un prix comparable par unité lorsque pertinent : €/kg, €/L, €/pièce, etc. ;
- affichage comparatif multi-fournisseurs ;
- indication du fournisseur habituel ;
- possibilité d'ajouter rapidement une nouvelle offre ou un nouveau prix depuis un smartphone.

Règle d'architecture : les articles servant à l'inventaire ne doivent pas être détournés ou dupliqués de façon incohérente pour faire les comparatifs. Le futur modèle devra distinguer le produit comparable de l'offre propre à chaque fournisseur tout en restant compatible avec les articles d'inventaire existants.

### B. Capture terrain : photo et code-barres
Objectif : permettre au Responsable d'encoder rapidement un article rencontré dans un magasin ou chez un fournisseur.

Fonctions prévues :
- prendre une photo directement depuis le smartphone ;
- choisir une photo existante ;
- conserver l'image du produit dans StopFlow ;
- scanner un code-barres/EAN avec la caméra lorsque techniquement possible ;
- solution de secours par saisie manuelle du code-barres ;
- préremplir ou retrouver une référence déjà connue grâce au code-barres ;
- associer rapidement fournisseur, produit, conditionnement et prix ;
- parcours « ajout rapide en magasin » pensé pour fonctionner en quelques gestes.

La solution de scan ne doit pas dépendre d'un modèle précis d'iPhone. Elle doit utiliser les capacités disponibles du navigateur et prévoir un moteur de décodage compatible lorsque l'API native n'est pas disponible.

### C. Cycle complet des bons de commande
Objectif : ne pas s'arrêter à « générer un PDF », mais gérer ce qu'il advient réellement du bon de commande.

Parcours cible :
1. inventaire ;
2. résumé ;
3. validation ;
4. bon de commande généré ;
5. choix du destinataire ;
6. envoi ;
7. traçabilité de l'envoi ;
8. réception et contrôle éventuel.

Fonctions prévues :
- conserver le PDF du bon ;
- adresse e-mail du fournisseur enregistrable dans sa fiche ;
- adresse e-mail interne possible, par exemple chef de cuisine ou Responsable ;
- action « Envoyer le bon » après validation ;
- possibilité de choisir fournisseur, adresse interne ou autre destinataire autorisé ;
- objet et message préremplis ;
- envoi du PDF en pièce jointe ;
- enregistrement de la date d'envoi, du destinataire et de l'utilisateur ayant envoyé ;
- statut métier permettant de distinguer au minimum Validé et Envoyé ;
- possibilité de réenvoyer un bon en gardant la trace des envois.

Orientation technique : l'envoi réel de pièces jointes ne doit pas dépendre uniquement de `mailto:`. Le mécanisme cible doit passer par un composant serveur sécurisé, par exemple une fonction serveur/Edge Function et un service d'e-mail transactionnel, afin que les clés d'envoi ne soient jamais exposées dans l'application.

### D. Réception et vérification des commandes
Objectif : pouvoir contrôler ce qui a réellement été livré par rapport au bon envoyé.

Fonctions envisagées :
- ouvrir un bon envoyé ;
- lancer « Vérifier la réception » ;
- confirmer les quantités reçues ;
- signaler manquants, différences, remplacements ou quantités incorrectes ;
- commentaire de réception ;
- utilisateur et date de vérification ;
- statut Reçu / Partiel / Problème à traiter selon le besoin final ;
- conserver l'écart dans l'historique.

Le détail précis de ce parcours sera validé avec l'usage réel avant développement définitif.

### E. Suggestions des utilisateurs
Objectif : permettre au personnel de proposer facilement des améliorations depuis StopFlow au lieu de perdre les retours terrain.

Fonctions prévues :
- formulaire simple de suggestion ;
- auteur et date automatiques ;
- titre et description ;
- catégorie éventuelle ;
- statut : Nouvelle, À étudier, Acceptée, Refusée, Réalisée ;
- consultation par les profils autorisés ;
- possibilité d'utiliser ces retours pour alimenter les versions suivantes.

### F. Bouton « + » mobile
Le bouton `+` reste présent à titre expérimental.

Décision :
- ne pas investir trop tôt dans une architecture spécifique autour de ce bouton ;
- observer son utilité pendant les tests terrain ;
- s'il est utile, il pourra devenir un menu d'actions rapides, par exemple Nouvel inventaire, Ajouter un prix/article, Scanner un code-barres ou Envoyer une suggestion ;
- s'il n'apporte pas de valeur, il pourra être simplifié ou supprimé.

### G. Validation terrain continue
Une fois les gros parcours disponibles, l'application doit être utilisée réellement et testée point par point.

Méthode prévue :
- tester chaque fonction sur smartphone et desktop ;
- noter l'écran précis, l'action, le résultat attendu et le résultat observé ;
- distinguer bug bloquant, gêne UX et nouvelle idée ;
- corriger les problèmes bloquants avant d'ajouter des fonctions secondaires ;
- conserver les suggestions non urgentes dans le backlog ;
- répéter le cycle jusqu'à obtenir une application réellement confortable à l'usage quotidien.

## Chronologie retenue

### 0.7.3 — Stabilisation de la version terrain actuelle
Priorité : terminer proprement le parcours actuel avant de construire les nouveaux modules métier.

Comprend :
- inventaire fournisseur fiable ;
- tactile et responsive communs ;
- Résumé/Validation/PDF ;
- historique lisible ;
- retours/navigation cohérents ;
- sécurité et corrections indispensables ;
- tests smartphone et desktop avant publication.

Ne comprend pas encore :
- gros catalogue comparatif ;
- capture photo/code-barres complète ;
- envoi automatique des bons par e-mail ;
- réception détaillée des commandes.

### 0.8.0 — Grande évolution d'usage et mobile-first
Objectif : rendre StopFlow plus simple, plus rapide et réellement pensé pour le smartphone tout en conservant une excellente expérience PC.

Comprend :
- audit des retours pratiques ;
- cohérence complète entre permissions, cartes visibles et sécurité Supabase ;
- grille personnalisable de 12 emplacements ;
- cartes 1×1, 2×1 et 2×2 ;
- déplacement tactile/souris et sauvegarde par utilisateur ;
- cartes masquées/réaffichables et réinitialisation fiable ;
- refonte mobile-first écran par écran ;
- formulaires, listes, tableaux, modales et panneaux adaptés au smartphone ;
- gestion cohérente du clavier virtuel et du scroll ;
- Suggestions utilisateurs réellement enregistrées et consultables ;
- évaluation du rôle du bouton `+` comme menu d'actions rapides ;
- conservation et optimisation de l'expérience desktop.

### 0.8.1 — Catalogue achats intelligent et comparatif prix
Objectif : fournir l'outil de recherche et de comparaison utile pendant les achats.

Comprend :
- modèle Produit / Offres fournisseurs ;
- recherche rapide par nom ;
- fiche produit ;
- photos ;
- références fournisseurs ;
- conditionnements ;
- prix et dates de prix ;
- prix normalisés lorsque pertinent ;
- historique de prix ;
- comparatif multi-fournisseurs ;
- ajout rapide d'une offre depuis un smartphone ;
- première version du scan code-barres avec saisie manuelle de secours.

### 0.8.2 — Commandes et envoi e-mail
Objectif : transformer le PDF validé en véritable processus d'envoi de commande.

Comprend :
- coordonnées e-mail des fournisseurs ;
- destinataires internes autorisés ;
- action d'envoi du bon ;
- PDF en pièce jointe ;
- message prérempli ;
- envoi serveur sécurisé ;
- journal des envois ;
- statut Envoyé ;
- réenvoi contrôlé ;
- historique complet du bon depuis sa création jusqu'à son envoi.

### 0.8.3 — Réception et vérification de commande
Objectif : fermer la boucle achat → commande → livraison.

Comprend, après validation du besoin terrain :
- contrôle d'une livraison par rapport au bon ;
- quantités reçues ;
- écarts et produits manquants ;
- commentaires ;
- date/utilisateur ;
- statuts de réception ;
- historique des écarts.

### 0.8.x — Validation et corrections terrain
Objectif : utiliser les nouveaux parcours en conditions réelles et corriger ce qui gêne avant la phase de durcissement.

Comprend :
- tests réels smartphone et PC ;
- retours d'utilisation quotidienne ;
- correction navigation, formulaires, tactile et responsive ;
- contrôle des permissions et des données ;
- stabilisation catalogue, scan, e-mail, réception, suggestions et personnalisation ;
- aucun gros nouveau chantier non validé par un besoin réel.

### 0.9.0 — Durcissement et préversion finale
Objectif : arrêter les gros changements produit et rendre StopFlow fiable de bout en bout avant la 1.0.0.

Comprend :
- audit complet des parcours métier ;
- suppression progressive des anciens correctifs devenus inutiles ;
- nettoyage technique des couches 0.5/0.6 ;
- vérification erreurs, états vides, chargements et messages utilisateur ;
- contrôle des performances desktop/mobile ;
- contrôle complet RLS Supabase, permissions, fonctions serveur et historiques ;
- audit ciblé des fonctions SECURITY DEFINER et de leurs droits ;
- vérification des sauvegardes et du rollback ;
- tests par plusieurs profils ;
- validation des parcours principaux : inventaires, commandes, e-mails, réception, catalogue achats, suggestions, checklists, températures, gestion et historique ;
- bêta terrain plus large avant ouverture au personnel.

La 0.9.x doit principalement corriger et fiabiliser. Aucun nouveau gros chantier fonctionnel sauf nécessité critique.

### 1.0.0 — Version finale pour le personnel
Objectif : première version officielle de StopFlow considérée comme complète, stable et prête pour l'exploitation quotidienne par le personnel.

Comprend :
- validation finale smartphone et desktop ;
- validation finale des profils Employé / Responsable / Administrateur ;
- contrôle final Supabase et intégrité des données ;
- test des principaux parcours par des utilisateurs réels ;
- sauvegarde complète avant publication ;
- branche/tag stable 1.0.0 ;
- procédure de rollback documentée ;
- documentation d'utilisation et d'administration ;
- publication finale après validation explicite.

À partir de 1.0.0, les évolutions suivantes pourront être organisées en 1.1, 1.2, etc., sans remettre en cause le socle stable de la version finale.

## Règle de publication
Pour chaque grande étape :
1. développement sur la branche de développement ;
2. sauvegarde de l'état précédent ;
3. validation fonctionnelle desktop et smartphone ;
4. validation explicite avant production ;
5. création d'une branche stable de la version publiée ;
6. utilisation réelle et collecte des retours ;
7. rollback possible vers la précédente branche stable en cas de problème important.

## Règle d'architecture
Les permissions déterminent CE QUE l'utilisateur est autorisé à faire. Les préférences, la taille d'écran et l'interface déterminent COMMENT ces fonctions sont affichées. Aucun réglage visuel, mobile ou de tableau de bord ne doit pouvoir accorder un droit métier.

Les nouveaux modules doivent réutiliser les données métier communes plutôt que créer des silos séparés. Le catalogue achats, les fournisseurs, les inventaires, les bons de commande et leur historique doivent rester reliés de façon cohérente sans dupliquer la logique métier existante.
