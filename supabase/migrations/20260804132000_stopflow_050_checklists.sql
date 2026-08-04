-- StopFlow 0.5.0 — checklists opérationnelles.
-- Migration additive : les anciens modèles restent conservés mais sont désactivés.

alter table public.checklist_template_items
  add column if not exists section_label text not null default '';

alter table public.checklist_run_items
  add column if not exists section_label text not null default '';

create or replace function private.current_department()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.departement
  from public.profiles p
  where p.id = auth.uid()
    and p.actif = true
  limit 1;
$$;

revoke all on function private.current_department() from public;
grant execute on function private.current_department() to authenticated;

-- Les employés ne lisent que les modèles actifs de leur département.
drop policy if exists checklist_templates_read on public.checklist_templates;
create policy checklist_templates_read
on public.checklist_templates
for select
to authenticated
using (
  private.is_responsible_or_admin()
  or (active = true and department = private.current_department())
);

drop policy if exists checklist_items_read on public.checklist_template_items;
create policy checklist_items_read
on public.checklist_template_items
for select
to authenticated
using (
  exists (
    select 1
    from public.checklist_templates t
    where t.id = checklist_template_items.template_id
      and (
        private.is_responsible_or_admin()
        or (t.active = true and t.department = private.current_department())
      )
  )
);

drop policy if exists checklist_runs_insert on public.checklist_runs;
create policy checklist_runs_insert
on public.checklist_runs
for insert
to authenticated
with check (
  performed_by = auth.uid()
  and (
    private.is_responsible_or_admin()
    or department = private.current_department()
  )
);

drop policy if exists checklist_suggestions_insert on public.checklist_suggestions;
create policy checklist_suggestions_insert
on public.checklist_suggestions
for insert
to authenticated
with check (
  proposed_by = auth.uid()
  and (
    private.is_responsible_or_admin()
    or department = private.current_department()
  )
  and exists (
    select 1
    from public.checklist_templates t
    where t.id = checklist_suggestions.template_id
      and t.department = checklist_suggestions.department
  )
);

-- Les anciens exemples incomplets restent disponibles dans l'historique de la base,
-- mais ils ne sont plus proposés dans l'application.
update public.checklist_templates
set active = false,
    updated_at = now()
where active = true
  and name in ('Ouverture Salle', 'Fermeture Salle', 'Fermeture Cuisine', 'Ouverture Cuisine');

insert into public.checklist_templates
  (name, department, checklist_type, version, active, description)
select v.name, v.department, v.checklist_type, v.version, true, v.description
from (values
  ('Ouverture Salle', 'salle', 'ouverture', 2, 'Reprise de la check-list papier d’ouverture de la salle transmise le 4 août 2026.'),
  ('Fermeture Salle', 'salle', 'fermeture', 2, 'Reprise de la check-list papier de fermeture de la salle transmise le 4 août 2026.'),
  ('Fermeture Cuisine', 'cuisine', 'fermeture', 2, 'Reprise de la check-list papier de fermeture cuisine en deux pages transmise le 4 août 2026.'),
  ('Entretien & hygiène', 'nettoyage', 'controle', 1, 'Modèle initial créé manuellement dans StopFlow pour le département Entretien & hygiène.')
) as v(name, department, checklist_type, version, description)
where not exists (
  select 1
  from public.checklist_templates t
  where t.name = v.name and t.version = v.version
);

with source_items(template_name, template_version, item_order, section_label, label, required, input_type, help_text) as (
  values
  -- OUVERTURE SALLE — source PDF, page 1.
  ('Ouverture Salle',2,1,'Accès et ambiance','Arriver par les communs et ouvrir la porte de la brasserie.',true,'checkbox',''),
  ('Ouverture Salle',2,2,'Accès et ambiance','Allumer les lumières.',true,'checkbox',''),
  ('Ouverture Salle',2,3,'Accès et ambiance','Allumer la musique.',true,'checkbox',''),
  ('Ouverture Salle',2,4,'Accès et ambiance','Ouvrir les portes et remettre la clé de la porte d’entrée sur l’attache-clés du back-office.',true,'checkbox',''),
  ('Ouverture Salle',2,5,'Réservations et courrier','Vérifier Zenchef et les réservations.',true,'checkbox',''),
  ('Ouverture Salle',2,6,'Réservations et courrier','Aller à la boîte aux lettres, récupérer le journal et le déposer sur la table 30.',true,'checkbox',''),
  ('Ouverture Salle',2,7,'Réservations et courrier','Déposer le courrier derrière la machine à vin.',true,'checkbox',''),
  ('Ouverture Salle',2,8,'Mise en place extérieure','Sortir les deux panneaux : suggestions et lunch.',true,'checkbox',''),
  ('Ouverture Salle',2,9,'Mise en place salle','Mettre en place deux lavettes et un essuie-verres.',true,'checkbox',''),
  ('Ouverture Salle',2,10,'Mise en place salle','Nettoyer les tables.',true,'checkbox',''),
  ('Ouverture Salle',2,11,'Mise en place salle','Nettoyer les cartes et les déposer sur les tables.',true,'checkbox',''),
  ('Ouverture Salle',2,12,'Matériel','Remonter la machine lave-verres et récupérer ce qui traîne en plonge.',true,'checkbox',''),
  ('Ouverture Salle',2,13,'Approvisionnement','Aller chercher du pain à la boulangerie si nécessaire.',false,'checkbox','Tâche conditionnelle.'),
  ('Ouverture Salle',2,14,'Contrôle final','Faire un tour de contrôle de la mise en place.',true,'checkbox',''),
  ('Ouverture Salle',2,15,'Organisation','Faire la liste des tâches journalières à effectuer.',true,'checkbox',''),

  -- FERMETURE SALLE — source PDF, page 2.
  ('Fermeture Salle',2,1,'Clients et accès','Vérifier qu’il n’y a plus de clients dans le bâtiment.',true,'checkbox',''),
  ('Fermeture Salle',2,2,'Clients et accès','Fermer la porte d’entrée et remettre sa clé sur l’attache-clés dans le back-office.',true,'checkbox',''),
  ('Fermeture Salle',2,3,'Clients et accès','Fermer les fenêtres de la taverne.',true,'checkbox',''),
  ('Fermeture Salle',2,4,'Salle et mobilier','Nettoyer les tables.',true,'checkbox',''),
  ('Fermeture Salle',2,5,'Salle et mobilier','Replacer les tables conformément au plan standard, sauf avis contraire ou réservation du lendemain.',true,'checkbox',''),
  ('Fermeture Salle',2,6,'Salle et mobilier','Mettre les chaises sur les tables.',true,'checkbox',''),
  ('Fermeture Salle',2,7,'Bar et plonge','Après nettoyage des verres, placer les éléments de la machine à cocktails, du bar et du lave-verres dans les paniers adéquats, puis mettre les paniers en plonge.',true,'checkbox',''),
  ('Fermeture Salle',2,8,'Bar et plonge','Vérifier la propreté générale des postes du bar.',true,'checkbox','Les contrôles détaillés suivent.'),
  ('Fermeture Salle',2,9,'Bar et plonge','Nettoyer le bar en marbre ou inox et les vitres des frigos.',true,'checkbox',''),
  ('Fermeture Salle',2,10,'Bar et plonge','Vider le bac de réception des canettes de la machine à cocktails et remettre les modèles.',true,'checkbox',''),
  ('Fermeture Salle',2,11,'Bar et plonge','Nettoyer le lave-verres.',true,'checkbox',''),
  ('Fermeture Salle',2,12,'Bar et plonge','Nettoyer le plan de travail.',true,'checkbox',''),
  ('Fermeture Salle',2,13,'Bar et plonge','Nettoyer la machine à café et le back-office.',true,'checkbox',''),
  ('Fermeture Salle',2,14,'Bar et plonge','Nettoyer le congélateur et la réception bûche ou glace, si applicable.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Salle',2,15,'Bar et plonge','Nettoyer le frigo à pain.',true,'checkbox',''),
  ('Fermeture Salle',2,16,'Linge','Mettre les lavettes et essuie-verres du jour au linge sale. Aucun linge sale ne doit rester sur les postes de travail.',true,'checkbox',''),
  ('Fermeture Salle',2,17,'Sécurité','Vérifier que les lampes de la salle à l’étage sont éteintes et fermer la porte à clé.',true,'checkbox',''),
  ('Fermeture Salle',2,18,'Sécurité','Vérifier que la porte du garage est bien fermée, pour les deux portes.',true,'checkbox',''),
  ('Fermeture Salle',2,19,'Caisse et facturation','Faire le Z, plier le ticket en quatre avec le numéro visible et le placer dans une enveloppe avec les tickets à facturer électroniquement.',true,'checkbox','Exemple indiqué sur le document : locations de salle.'),
  ('Fermeture Salle',2,20,'Caisse et facturation','Vérifier que les locations de salle ont été pointées et relever les renseignements des clients.',false,'checkbox','Uniquement lorsqu’une salle a été occupée.'),
  ('Fermeture Salle',2,21,'Matériel','Éteindre les tablettes.',true,'checkbox',''),
  ('Fermeture Salle',2,22,'Caisse et facturation','Déposer l’enveloppe Z sous la porte du bureau.',true,'checkbox',''),
  ('Fermeture Salle',2,23,'Départ','Éteindre les lumières de la cuisine, du restaurant de la taverne et du frigo à Djote.',true,'checkbox',''),
  ('Fermeture Salle',2,24,'Départ','Fermer la porte de la brasserie et vérifier que la porte de l’établissement est déjà fermée.',true,'checkbox',''),
  ('Fermeture Salle',2,25,'Départ','Quitter les lieux par la porte des communs.',true,'checkbox',''),

  -- FERMETURE CUISINE — source PDF, pages 1 et 2.
  ('Fermeture Cuisine',2,1,'1. Débarrassage','Ramener toute la vaisselle de la salle en plonge.',true,'checkbox',''),
  ('Fermeture Cuisine',2,2,'1. Débarrassage','Vérifier qu’il ne reste plus de vaisselle sale en cuisine, au passe ou en salle.',true,'checkbox',''),
  ('Fermeture Cuisine',2,3,'2. Produits frais / frigos / saladette','Vérifier s’il reste de l’américain dans le frigo.',true,'checkbox',''),
  ('Fermeture Cuisine',2,4,'2. Produits frais / frigos / saladette','S’il reste de l’américain, le filmer correctement.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Cuisine',2,5,'2. Produits frais / frigos / saladette','Noter la date sur l’américain.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Cuisine',2,6,'2. Produits frais / frigos / saladette','Ranger l’américain au bon endroit dans le frigo.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Cuisine',2,7,'2. Produits frais / frigos / saladette','Vider la saladette.',true,'checkbox',''),
  ('Fermeture Cuisine',2,8,'2. Produits frais / frigos / saladette','Ranger les bacs dans des gastronormes propres.',true,'checkbox',''),
  ('Fermeture Cuisine',2,9,'2. Produits frais / frigos / saladette','Filmer les produits ouverts.',true,'checkbox',''),
  ('Fermeture Cuisine',2,10,'2. Produits frais / frigos / saladette','Dater les produits si nécessaire.',true,'checkbox',''),
  ('Fermeture Cuisine',2,11,'2. Produits frais / frigos / saladette','Mettre les gastronormes sur le rayonnage.',true,'checkbox',''),
  ('Fermeture Cuisine',2,12,'2. Produits frais / frigos / saladette','Mettre le rayonnage dans la chambre froide du garage.',true,'checkbox',''),
  ('Fermeture Cuisine',2,13,'3. Machine à viande hachée','Démonter la machine à viande hachée.',true,'checkbox',''),
  ('Fermeture Cuisine',2,14,'3. Machine à viande hachée','Vérifier que toutes les pièces sont propres.',true,'checkbox',''),
  ('Fermeture Cuisine',2,15,'3. Machine à viande hachée','Si nécessaire, nettoyer la machine et les pièces avant de partir.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Cuisine',2,16,'3. Machine à viande hachée','Laisser sécher correctement les éléments.',true,'checkbox',''),
  ('Fermeture Cuisine',2,17,'3. Machine à viande hachée','Ranger les éléments propres à leur place.',true,'checkbox',''),
  ('Fermeture Cuisine',2,18,'4. Nettoyage cuisine','Nettoyer le fourneau.',true,'checkbox',''),
  ('Fermeture Cuisine',2,19,'4. Nettoyage cuisine','Nettoyer le mur derrière le fourneau.',true,'checkbox',''),
  ('Fermeture Cuisine',2,20,'4. Nettoyage cuisine','Nettoyer les plans de travail.',true,'checkbox',''),
  ('Fermeture Cuisine',2,21,'4. Nettoyage cuisine','Nettoyer l’évier.',true,'checkbox',''),
  ('Fermeture Cuisine',2,22,'4. Nettoyage cuisine','Vérifier la propreté de la machine à laver la vaisselle.',true,'checkbox',''),
  ('Fermeture Cuisine',2,23,'4. Nettoyage cuisine','Si nécessaire, nettoyer la machine à laver la vaisselle avant de partir.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Cuisine',2,24,'5. Poubelles','Sortir les poubelles.',true,'checkbox',''),
  ('Fermeture Cuisine',2,25,'5. Poubelles','Remettre un nouveau sac propre dans chaque poubelle.',true,'checkbox',''),
  ('Fermeture Cuisine',2,26,'5. Poubelles','Vérifier qu’aucun déchet ne reste au sol ou sur les plans de travail.',true,'checkbox',''),
  ('Fermeture Cuisine',2,27,'5. Poubelles','Le lundi, sortir la benne à ordures.',false,'checkbox','Uniquement le lundi.'),
  ('Fermeture Cuisine',2,28,'6. Températures / frigos','Vérifier les températures des frigos.',true,'checkbox',''),
  ('Fermeture Cuisine',2,29,'6. Températures / frigos','Vérifier que les portes des frigos sont bien fermées.',true,'checkbox',''),
  ('Fermeture Cuisine',2,30,'6. Températures / frigos','Noter les températures sur la feuille prévue.',true,'checkbox',''),
  ('Fermeture Cuisine',2,31,'6. Températures / frigos','Si une température est anormale ou présente un écart d’environ 2 °C, envoyer un message au responsable cuisine.',false,'checkbox','Tâche conditionnelle.'),
  ('Fermeture Cuisine',2,32,'7. Friteuses','Mettre les boutons des friteuses sur 0.',true,'checkbox',''),
  ('Fermeture Cuisine',2,33,'7. Friteuses','Enlever les deux prises des friteuses.',true,'checkbox',''),
  ('Fermeture Cuisine',2,34,'7. Friteuses','Vérifier que les câbles ne touchent pas une zone chaude ou humide.',true,'checkbox',''),
  ('Fermeture Cuisine',2,35,'8. Gaz','Fermer la vanne 1 du gaz.',true,'checkbox','Vanne perpendiculaire au tuyau = fermée.'),
  ('Fermeture Cuisine',2,36,'8. Gaz','Fermer la vanne 2 du gaz.',true,'checkbox','Vanne perpendiculaire au tuyau = fermée.'),
  ('Fermeture Cuisine',2,37,'9. Hotte','Éteindre la hotte uniquement lorsque les cuissons et le nettoyage sont terminés.',true,'checkbox',''),
  ('Fermeture Cuisine',2,38,'10. Garage','Vérifier que le rayonnage est bien rangé dans la chambre froide du garage.',true,'checkbox',''),
  ('Fermeture Cuisine',2,39,'10. Garage','Fermer le garage à clé.',true,'checkbox',''),
  ('Fermeture Cuisine',2,40,'10. Garage','Vérifier les deux poignées de la porte du garage.',true,'checkbox',''),
  ('Fermeture Cuisine',2,41,'10. Garage','Vérifier que la porte du garage est bien fermée.',true,'checkbox',''),
  ('Fermeture Cuisine',2,42,'11. Dernier contrôle avant départ','Vérifier que tous les produits sont filmés, datés et rangés.',true,'checkbox',''),
  ('Fermeture Cuisine',2,43,'11. Dernier contrôle avant départ','Vérifier que les frigos sont bien fermés.',true,'checkbox',''),
  ('Fermeture Cuisine',2,44,'11. Dernier contrôle avant départ','Vérifier que les températures sont notées.',true,'checkbox',''),
  ('Fermeture Cuisine',2,45,'11. Dernier contrôle avant départ','Vérifier que les plans de travail sont propres.',true,'checkbox',''),
  ('Fermeture Cuisine',2,46,'11. Dernier contrôle avant départ','Vérifier que l’évier est propre.',true,'checkbox',''),
  ('Fermeture Cuisine',2,47,'11. Dernier contrôle avant départ','Vérifier que la machine à laver la vaisselle est propre.',true,'checkbox',''),
  ('Fermeture Cuisine',2,48,'11. Dernier contrôle avant départ','Vérifier que la machine à viande hachée est propre.',true,'checkbox',''),
  ('Fermeture Cuisine',2,49,'11. Dernier contrôle avant départ','Vérifier que les poubelles sont sorties.',true,'checkbox',''),
  ('Fermeture Cuisine',2,50,'11. Dernier contrôle avant départ','Le lundi, vérifier que la benne à ordures est sortie.',false,'checkbox','Uniquement le lundi.'),
  ('Fermeture Cuisine',2,51,'11. Dernier contrôle avant départ','Vérifier que les friteuses sont sur 0 et débranchées.',true,'checkbox',''),
  ('Fermeture Cuisine',2,52,'11. Dernier contrôle avant départ','Revérifier que la vanne 1 du gaz est bien fermée.',true,'checkbox','Contrôle de sécurité obligatoire.'),
  ('Fermeture Cuisine',2,53,'11. Dernier contrôle avant départ','Revérifier que la vanne 2 du gaz est bien fermée.',true,'checkbox','Contrôle de sécurité obligatoire.'),
  ('Fermeture Cuisine',2,54,'11. Dernier contrôle avant départ','Vérifier que le garage est fermé à clé.',true,'checkbox',''),
  ('Fermeture Cuisine',2,55,'11. Dernier contrôle avant départ','Vérifier les deux poignées de la porte du garage.',true,'checkbox',''),
  ('Fermeture Cuisine',2,56,'11. Dernier contrôle avant départ','Vérifier qu’il ne reste plus de vaisselle sale.',true,'checkbox',''),
  ('Fermeture Cuisine',2,57,'12. Départ','Éteindre les lumières en dernier.',true,'checkbox',''),
  ('Fermeture Cuisine',2,58,'12. Départ','Fermer correctement la cuisine.',true,'checkbox',''),

  -- ENTRETIEN & HYGIÈNE — modèle créé manuellement dans l’application.
  ('Entretien & hygiène',1,1,'Salle et zones clients','Nettoyer et désinfecter les tables ainsi que les chants.',true,'checkbox',''),
  ('Entretien & hygiène',1,2,'Salle et zones clients','Nettoyer les chaises, banquettes et pieds de mobilier.',true,'checkbox',''),
  ('Entretien & hygiène',1,3,'Salle et zones clients','Balayer puis laver les sols de la salle.',true,'checkbox',''),
  ('Entretien & hygiène',1,4,'Salle et zones clients','Nettoyer les poignées, interrupteurs et surfaces fréquemment touchées.',true,'checkbox',''),
  ('Entretien & hygiène',1,5,'Salle et zones clients','Nettoyer les vitres et miroirs présentant des traces.',true,'checkbox',''),
  ('Entretien & hygiène',1,6,'Salle et zones clients','Vider les poubelles et remettre des sacs propres.',true,'checkbox',''),
  ('Entretien & hygiène',1,7,'Entrée et terrasse','Nettoyer l’entrée, le paillasson et le trottoir immédiat.',true,'checkbox',''),
  ('Entretien & hygiène',1,8,'Entrée et terrasse','Contrôler la propreté de la terrasse et vider les cendriers.',true,'checkbox',''),
  ('Entretien & hygiène',1,9,'Sanitaires','Nettoyer et désinfecter les cuvettes et urinoirs.',true,'checkbox',''),
  ('Entretien & hygiène',1,10,'Sanitaires','Nettoyer les lavabos, robinets, miroirs et poignées.',true,'checkbox',''),
  ('Entretien & hygiène',1,11,'Sanitaires','Recharger le savon, le papier toilette et les essuie-mains.',true,'checkbox',''),
  ('Entretien & hygiène',1,12,'Sanitaires','Vider les poubelles et laver le sol des sanitaires.',true,'checkbox',''),
  ('Entretien & hygiène',1,13,'Sanitaires','Vérifier l’absence d’odeur anormale, de fuite ou de matériel défectueux.',true,'checkbox','Toute anomalie doit être signalée.'),
  ('Entretien & hygiène',1,14,'Communs et back-office','Nettoyer les couloirs, escaliers et zones communes.',true,'checkbox',''),
  ('Entretien & hygiène',1,15,'Communs et back-office','Nettoyer le back-office et les surfaces de bureau accessibles.',true,'checkbox',''),
  ('Entretien & hygiène',1,16,'Matériel et produits','Rincer, essorer et ranger le matériel de nettoyage.',true,'checkbox',''),
  ('Entretien & hygiène',1,17,'Matériel et produits','Séparer les lavettes selon leur zone d’utilisation et placer le linge sale au bon endroit.',true,'checkbox',''),
  ('Entretien & hygiène',1,18,'Matériel et produits','Vérifier le stock de sacs, papier, savon et produits de nettoyage.',true,'checkbox',''),
  ('Entretien & hygiène',1,19,'Contrôle final','Vérifier qu’aucun matériel ou produit ne gêne les passages et sorties.',true,'checkbox',''),
  ('Entretien & hygiène',1,20,'Contrôle final','Signaler toute casse, fuite, panne, manque de produit ou anomalie constatée.',true,'checkbox','Utiliser la note d’anomalie dans StopFlow.')
), target_templates as (
  select id, name, version
  from public.checklist_templates
  where (name, version) in (
    ('Ouverture Salle',2),
    ('Fermeture Salle',2),
    ('Fermeture Cuisine',2),
    ('Entretien & hygiène',1)
  )
)
insert into public.checklist_template_items
  (template_id, item_order, section_label, label, required, input_type, help_text, active)
select t.id, s.item_order, s.section_label, s.label, s.required, s.input_type, s.help_text, true
from source_items s
join target_templates t
  on t.name = s.template_name and t.version = s.template_version
where not exists (
  select 1
  from public.checklist_template_items existing
  where existing.template_id = t.id
    and existing.item_order = s.item_order
);

create index if not exists checklist_templates_department_active_idx
  on public.checklist_templates(department, active, checklist_type);

create index if not exists checklist_runs_department_status_idx
  on public.checklist_runs(department, status, started_at desc);

create index if not exists checklist_suggestions_status_idx
  on public.checklist_suggestions(status, created_at desc);
