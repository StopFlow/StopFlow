# Audit technique final — StopFlow 0.7.3

Date : 2026-08-14

## Verdict

La 0.7.3 ne présente pas de blocage technique évident côté déploiement, intégrité des données ou sécurité applicative inspectée. Elle est considérée **prête pour un dernier test fonctionnel réel sur iPhone**, mais **pas encore prête à être publiée en production sans ce smoke test**.

La production 0.7.2 reste inchangée.

## 1. Git / branches

- `stopflow-dev` contient le développement 0.7.3.
- `main` et `stopflow-dev` ont divergé.
- Au moment de l’audit, `stopflow-dev` était en avance de 34 commits et en retard de 2 commits par rapport à `main`.
- Les deux commits propres à `main` concernent un marqueur de déploiement et une ancienne version du roadmap, pas du code métier critique.

### Conséquence

La publication 0.7.3 ne devra pas être réalisée par un reset forcé de `main`. Il faudra réconcilier volontairement les deux branches puis vérifier le SHA réellement déployé.

## 2. Vercel

Preview auditée : branche `stopflow-dev`.

Contrôles réalisés :
- dernier déploiement READY ;
- SHA GitHub correspondant au HEAD de développement ;
- build sans erreur ;
- aucun log runtime `error` ou `fatal` trouvé dans la fenêtre contrôlée ;
- page principale HTTP 200 ;
- scripts 0.7.3 HTTP 200 ;
- cache statique configuré en `max-age=0, must-revalidate`.

## 3. Chargement / PWA

- Le service worker ne met actuellement pas l’application en cache.
- Il supprime les anciens caches StopFlow puis passe les requêtes directement au réseau.
- Il ne constitue donc pas une source identifiée de chargement d’ancienne version.
- Le numéro interne 0.5.1 du service worker est une dette technique à nettoyer plus tard.

La 0.7.3 utilise encore une chaîne de couches dynamiques 0.5/0.6/0.7. Ce fonctionnement est accepté pour terminer 0.7.x, mais devra être simplifié en 0.9.

## 4. Responsive et tactile mobile

Les standards 0.7.3 actuellement chargés comprennent :
- propriétaire tactile iPhone commun ;
- adaptation au viewport réel ;
- safe areas iPhone ;
- modales contenues dans l’écran ;
- conversion des tableaux trop larges en cartes mobiles ;
- Historique tappable ;
- retour vers l’accueil après validation ;
- protection visuelle pendant le rechargement.

Ces points ont déjà été validés partiellement sur iPhone pendant le développement. Un parcours complet final reste nécessaire avant publication.

## 5. Supabase — RLS

Toutes les tables publiques contrôlées ont RLS activé.

Aucune table métier publique inspectée n’a été trouvée sans RLS.

## 6. Supabase — intégrité des données

Contrôles réalisés :
- lignes de commandes orphelines : 0 ;
- articles liés à un fournisseur inexistant : 0 ;
- commandes avec fournisseur inconnu : 0 ;
- incohérences département article / fournisseur : 0 ;
- incohérences département commande / fournisseur : 0.

L’intégrité relationnelle contrôlée est donc propre.

## 7. Supabase — SECURITY DEFINER

Le conseiller de sécurité signale plusieurs fonctions `SECURITY DEFINER` exécutables par `anon` et/ou `authenticated`.

Les définitions principales ont été inspectées en lecture seule. Les fonctions sensibles contrôlées refont leurs vérifications dans la fonction :
- `auth.uid()` ;
- profil actif ;
- rôle administrateur ;
- permission fonctionnelle et scope ;
- fournisseur / département ;
- propriété ou révision du document lorsque nécessaire.

Aucun contournement anonyme évident n’a été identifié dans les fonctions inspectées.

### Durcissement restant

Même si les contrôles internes sont présents, laisser `anon` disposer de `EXECUTE` sur des fonctions `SECURITY DEFINER` est plus permissif que nécessaire. À traiter au plus tard pendant le durcissement 0.9 avant 1.0 :
- revue des GRANT/REVOKE `EXECUTE` ;
- suppression des droits anonymes inutiles ;
- conservation uniquement des appels réellement nécessaires ;
- nouveau passage du conseiller Supabase après migration.

La protection contre les mots de passe compromis est également désactivée dans Supabase Auth et doit être revue avant 1.0.

## 8. Performance Supabase

Le conseiller de performance remonte notamment :
- plusieurs clés étrangères sans index dédié ;
- des politiques RLS pouvant être optimisées ;
- plusieurs politiques permissives équivalentes ;
- un doublon d’index sur `user_admin_events`.

Ces éléments ne sont pas considérés bloquants au volume actuel. Ils sont classés pour le durcissement 0.9, sauf apparition d’un problème réel de performance avant cette étape.

## 9. Dette technique non bloquante

À conserver dans le plan jusqu’à 1.0 :
- suppression progressive des couches 0.5/0.6 devenues inutiles ;
- consolidation des propriétaires tactiles dupliqués ;
- suppression du mode local de test/publication ou de ses identifiants avant 1.0 ;
- mise à jour des anciens labels/version internes ;
- Suggestions : l’écran existe, mais sa persistance legacy reste locale et devra être rendue cohérente avec la base partagée avant la version finale ;
- audit final des permissions par profil Employé / Responsable / Administrateur.

## 10. Test réel restant avant publication 0.7.3

Quand un iPhone est disponible, réaliser un seul parcours de validation complet :

1. connexion ;
2. Accueil → Salle → Inventaire ;
3. choisir un fournisseur ;
4. tester comptage, `+`, `−` et `Tout mettre à 0` ;
5. Continuer → Résumé ;
6. Continuer → Validation ;
7. tester `Retour au résumé` ;
8. revenir en Validation ;
9. `Valider et générer le PDF` ;
10. vérifier la page de fin et le PDF ;
11. ouvrir Historique ;
12. vérifier l’intitulé `Commande — Fournisseur` ;
13. ouvrir le bon et vérifier l’absence de scroll horizontal ;
14. fermer/revenir à l’accueil ;
15. vérifier rapidement une autre zone existante, par exemple Températures ou Général.

Attention : la validation finale crée un vrai document dans Supabase. Le document de test devra être conservé ou supprimé uniquement après décision explicite.

## Conclusion

### Prêt
- déploiement ;
- RLS ;
- intégrité des données ;
- parcours 0.7.3 côté code et couches actuellement déployées ;
- base responsive/tactile déjà validée partiellement.

### Reste avant publication
- un smoke test physique iPhone complet ;
- correction uniquement si ce test révèle une régression ;
- réconciliation propre de `main` et `stopflow-dev` lors de la publication ;
- vérification finale du SHA de production et création de la branche/tag stable 0.7.3.
