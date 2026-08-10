# StopFlow 0.7.0 — personnalisation des cartes

## Correction UX immédiate
- La réinitialisation doit supprimer les préférences de la zone puis redessiner la zone depuis l'ordre canonique.
- La carte en cours de déplacement devient franchement grisâtre pour identifier l'élément tenu.

## Direction retenue pour la suite
La personnalisation évoluera vers une grille logique de 12 emplacements (3 colonnes × 4 lignes), indépendante des permissions métier. Les cartes pourront à terme occuper plusieurs tailles, par exemple 1×1, 2×1 ou 2×2. Le mode édition devra matérialiser les emplacements disponibles, permettre le déplacement au doigt/souris et conserver un accès séparé aux cartes masquées.

Les réglages visuels (position, taille, couleur, forme, pictogramme ou autres options d'affichage) restent des préférences personnelles et ne modifient jamais les permissions du profil.
