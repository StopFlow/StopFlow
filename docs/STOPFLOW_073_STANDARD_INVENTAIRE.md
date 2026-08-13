# StopFlow 0.7.3 — Standard générique d’inventaire fournisseur

## Principe

Le parcours d’inventaire n’est lié à aucun fournisseur précis.

Créer ou modifier un fournisseur ne doit jamais imposer de recréer une page, des boutons ou une mise en page spécifique. Le même moteur et la même UX sont utilisés pour Colruyt, Leloup, HLS et tout fournisseur futur.

## Données qui pilotent l’inventaire

Un fournisseur apporte uniquement ses données :

- nom ;
- espace/département d’inventaire ;
- statut actif/inactif ;
- coordonnées et e-mail éventuel ;
- articles actifs ;
- ordre d’affichage des articles ;
- unité/conditionnement ;
- stock cible ;
- prix et autres paramètres métier lorsqu’ils sont disponibles.

La présentation et le comportement de l’inventaire ne sont jamais définis fournisseur par fournisseur.

## Parcours mobile standard

1. Choisir le fournisseur.
2. Compter le stock présent.
3. Résumé en lecture seule.
4. Validation avec remarque éventuelle.
5. Enregistrement.
6. Page de confirmation.

### Étape 1 — Comptage

L’écran terrain privilégie uniquement ce qui est nécessaire au geste de comptage :

- nom de l’article ;
- unité ;
- stock présent ;
- boutons moins / plus ;
- saisie directe ;
- action « Tout mettre à 0 ».

Le stock cible et la quantité à commander restent calculés en arrière-plan et ne doivent pas encombrer l’écran de comptage.

### Étape 2 — Résumé

Le résumé est en lecture seule.

Pour chaque article :

- stock présent ;
- stock cible ;
- quantité à commander.

Pour modifier une quantité, l’utilisateur retourne à l’étape de comptage.

### Étape 3 — Validation

La validation affiche :

- fournisseur ;
- nombre d’articles comptés ;
- références à commander ;
- quantité totale à commander ;
- remarque éventuelle.

Un utilisateur autorisé à valider enregistre directement le document comme validé. Un utilisateur autorisé uniquement à soumettre l’envoie avec le statut « À valider ».

## Page de fin

Après une validation réussie, StopFlow ouvre une page de confirmation générique :

- « Inventaire bien enregistré » ;
- fournisseur ;
- numéro du document ;
- références à commander ;
- quantité totale ;
- télécharger le PDF ;
- partager le PDF ;
- préparer un e-mail ;
- voir dans l’historique ;
- faire un autre inventaire.

Pour un inventaire envoyé à validation, aucun PDF final n’est généré avant la validation d’un responsable.

## PDF final

Le PDF est généré uniquement après validation finale et contient au minimum :

- fournisseur ;
- numéro du document ;
- date de l’inventaire ;
- article ;
- stock présent ;
- stock cible ;
- quantité à commander ;
- remarque.

## Fournisseurs futurs

Le formulaire fournisseur conserve l’espace/département d’inventaire. La valeur par défaut d’un nouveau fournisseur est `Salle` tant qu’un autre espace n’est pas choisi explicitement.

La création d’un fournisseur et de ses articles doit suffire pour qu’il hérite automatiquement du parcours d’inventaire standard.

## Règle de non-régression

Il est interdit de coder un nouvel écran d’inventaire en fonction du nom, du code ou de l’identité d’un fournisseur.

Toute évolution UX du parcours doit être apportée au composant générique afin que tous les fournisseurs existants et futurs en bénéficient en même temps.
