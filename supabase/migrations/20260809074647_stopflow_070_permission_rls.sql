-- StopFlow 0.7.0 : sécurité par permission et portée.

create or replace function private.can_read_catalog_department(p_department text)
returns boolean language sql stable security definer set search_path=''
as $$
  select private.has_permission('inventory.use',p_department)
      or private.has_permission('suppliers.manage',p_department)
      or private.has_permission('articles.manage',p_department)
      or private.has_permission('orders.manage',p_department);
$$;

create or replace function private.can_access_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.orders o
    where o.id=p_order_id
      and (
        private.has_permission('history.view',o.department)
        or private.has_permission('orders.manage',o.department)
        or (o.author_id=auth.uid() and private.has_permission('inventory.use',o.department))
      )
  );
$$;

create or replace function private.can_edit_order_lines(p_order_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.orders o
    where o.id=p_order_id and o.status='Brouillon'
      and (
        private.has_permission('orders.manage',o.department)
        or (o.author_id=auth.uid() and private.has_permission('inventory.use',o.department))
      )
  );
$$;

create or replace function private.can_read_checklist_run(p_run_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.checklist_runs r
    where r.id=p_run_id
      and (
        private.has_permission('checklists.review',r.department)
        or private.has_permission('alerts.view',r.department)
        or (r.performed_by=auth.uid() and private.has_permission('checklists.run',r.department))
      )
  );
$$;

create or replace function private.can_write_checklist_run(p_run_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.checklist_runs r
    where r.id=p_run_id
      and (
        private.has_permission('checklists.review',r.department)
        or (r.performed_by=auth.uid() and private.has_permission('checklists.run',r.department))
      )
  );
$$;

create or replace function private.can_read_department_content(p_department text,p_content_type text,p_active boolean)
returns boolean language sql stable security definer set search_path=''
as $$
  select case
    when p_department<>'cuisine' then false
    when p_content_type='weekly_lunch' then
      private.has_permission('lunchs.manage','cuisine')
      or (coalesce(p_active,false) and private.has_permission('lunchs.view','cuisine'))
    when p_content_type='monthly_suggestion' then
      private.has_permission('monthly_suggestions.manage','cuisine')
      or (coalesce(p_active,false) and private.has_permission('monthly_suggestions.view','cuisine'))
    else false
  end;
$$;

create or replace function private.can_manage_department_content(p_department text,p_content_type text)
returns boolean language sql stable security definer set search_path=''
as $$
  select p_department='cuisine' and case
    when p_content_type='weekly_lunch' then private.has_permission('lunchs.manage','cuisine')
    when p_content_type='monthly_suggestion' then private.has_permission('monthly_suggestions.manage','cuisine')
    else false
  end;
$$;

-- Fournisseurs.
drop policy if exists suppliers_select_active_users on public.suppliers;
drop policy if exists suppliers_insert_admin on public.suppliers;
drop policy if exists suppliers_update_admin on public.suppliers;
create policy suppliers_select_permissions on public.suppliers for select to authenticated
using (
  private.can_read_catalog_department(department)
  and (active=true or private.has_permission('suppliers.manage',department) or private.has_permission('articles.manage',department))
);
create policy suppliers_insert_permissions on public.suppliers for insert to authenticated
with check (private.has_permission('suppliers.manage',department) and private.is_operational_department(department));
create policy suppliers_update_permissions on public.suppliers for update to authenticated
using (private.has_permission('suppliers.manage',department))
with check (private.has_permission('suppliers.manage',department) and private.is_operational_department(department));

-- Articles.
drop policy if exists articles_select_active_users on public.articles;
drop policy if exists articles_insert_responsible on public.articles;
drop policy if exists articles_update_responsible on public.articles;
create policy articles_select_permissions on public.articles for select to authenticated
using (
  private.can_read_catalog_department(department)
  and (active=true or private.has_permission('articles.manage',department))
);
create policy articles_insert_permissions on public.articles for insert to authenticated
with check (private.has_permission('articles.manage',department) and private.is_operational_department(department));
create policy articles_update_permissions on public.articles for update to authenticated
using (private.has_permission('articles.manage',department))
with check (private.has_permission('articles.manage',department) and private.is_operational_department(department));

-- Commandes.
drop policy if exists orders_select_active on public.orders;
drop policy if exists orders_insert_own_draft on public.orders;
drop policy if exists orders_update_manager on public.orders;
drop policy if exists orders_update_own_draft on public.orders;
create policy orders_select_permissions on public.orders for select to authenticated
using (
  private.has_permission('history.view',department)
  or private.has_permission('orders.manage',department)
  or (author_id=auth.uid() and private.has_permission('inventory.use',department))
);
create policy orders_insert_inventory on public.orders for insert to authenticated
with check (
  private.is_active_user() and author_id=auth.uid() and status='Brouillon'
  and number is null and validator_id is null and validator_name is null and validated_at is null
  and private.has_permission('inventory.use',department)
);
create policy orders_update_own_inventory_draft on public.orders for update to authenticated
using (author_id=auth.uid() and status='Brouillon' and private.has_permission('inventory.use',department))
with check (
  author_id=auth.uid() and status='Brouillon' and number is null
  and validator_id is null and validator_name is null and validated_at is null
  and private.has_permission('inventory.use',department)
);
create policy orders_update_management on public.orders for update to authenticated
using (private.has_permission('orders.manage',department))
with check (private.has_permission('orders.manage',department) and private.is_operational_department(department));

-- Lignes de commandes.
drop policy if exists order_lines_select_active on public.order_lines;
drop policy if exists order_lines_insert_editable_order on public.order_lines;
drop policy if exists order_lines_update_editable_order on public.order_lines;
drop policy if exists order_lines_delete_editable_order on public.order_lines;
create policy order_lines_select_permissions on public.order_lines for select to authenticated
using (private.can_access_order(order_id));
create policy order_lines_insert_permissions on public.order_lines for insert to authenticated
with check (private.can_edit_order_lines(order_id));
create policy order_lines_update_permissions on public.order_lines for update to authenticated
using (private.can_edit_order_lines(order_id)) with check (private.can_edit_order_lines(order_id));
create policy order_lines_delete_permissions on public.order_lines for delete to authenticated
using (private.can_edit_order_lines(order_id));

-- Modèles de checklists.
drop policy if exists checklist_templates_read on public.checklist_templates;
drop policy if exists checklist_templates_manage on public.checklist_templates;
create policy checklist_templates_read_permissions on public.checklist_templates for select to authenticated
using (
  (active=true and private.has_permission('checklists.run',department))
  or private.has_permission('checklists.review',department)
  or private.has_permission('checklists.templates.manage',department)
  or private.has_permission('alerts.view',department)
);
create policy checklist_templates_manage_permissions on public.checklist_templates for all to authenticated
using (private.has_permission('checklists.templates.manage',department))
with check (private.has_permission('checklists.templates.manage',department));

-- Tâches des modèles.
drop policy if exists checklist_items_read on public.checklist_template_items;
drop policy if exists checklist_items_manage on public.checklist_template_items;
create policy checklist_items_read_permissions on public.checklist_template_items for select to authenticated
using (exists(
  select 1 from public.checklist_templates t
  where t.id=checklist_template_items.template_id
    and (
      (t.active=true and private.has_permission('checklists.run',t.department))
      or private.has_permission('checklists.review',t.department)
      or private.has_permission('checklists.templates.manage',t.department)
      or private.has_permission('alerts.view',t.department)
    )
));
create policy checklist_items_manage_permissions on public.checklist_template_items for all to authenticated
using (exists(select 1 from public.checklist_templates t where t.id=checklist_template_items.template_id and private.has_permission('checklists.templates.manage',t.department)))
with check (exists(select 1 from public.checklist_templates t where t.id=checklist_template_items.template_id and private.has_permission('checklists.templates.manage',t.department)));

-- Exécutions de checklists.
drop policy if exists checklist_runs_insert on public.checklist_runs;
drop policy if exists checklist_runs_read on public.checklist_runs;
drop policy if exists checklist_runs_update on public.checklist_runs;
create policy checklist_runs_insert_permissions on public.checklist_runs for insert to authenticated
with check (performed_by=auth.uid() and private.has_permission('checklists.run',department));
create policy checklist_runs_read_permissions on public.checklist_runs for select to authenticated
using (
  private.has_permission('checklists.review',department)
  or private.has_permission('alerts.view',department)
  or (performed_by=auth.uid() and private.has_permission('checklists.run',department))
);
create policy checklist_runs_update_permissions on public.checklist_runs for update to authenticated
using (
  private.has_permission('checklists.review',department)
  or (performed_by=auth.uid() and private.has_permission('checklists.run',department))
)
with check (
  private.has_permission('checklists.review',department)
  or (performed_by=auth.uid() and private.has_permission('checklists.run',department))
);

-- Tâches exécutées.
drop policy if exists checklist_run_items_read on public.checklist_run_items;
drop policy if exists checklist_run_items_write on public.checklist_run_items;
create policy checklist_run_items_read_permissions on public.checklist_run_items for select to authenticated
using (private.can_read_checklist_run(run_id));
create policy checklist_run_items_write_permissions on public.checklist_run_items for all to authenticated
using (private.can_write_checklist_run(run_id))
with check (private.can_write_checklist_run(run_id));

-- Propositions de tâches checklist.
drop policy if exists checklist_suggestions_insert on public.checklist_suggestions;
drop policy if exists checklist_suggestions_read on public.checklist_suggestions;
drop policy if exists checklist_suggestions_update on public.checklist_suggestions;
create policy checklist_suggestions_insert_permissions on public.checklist_suggestions for insert to authenticated
with check (
  proposed_by=auth.uid() and private.has_permission('checklists.run',department)
  and exists(select 1 from public.checklist_templates t where t.id=template_id and t.department=checklist_suggestions.department)
);
create policy checklist_suggestions_read_permissions on public.checklist_suggestions for select to authenticated
using (proposed_by=auth.uid() or private.has_permission('checklists.templates.manage',department));
create policy checklist_suggestions_update_permissions on public.checklist_suggestions for update to authenticated
using (private.has_permission('checklists.templates.manage',department))
with check (private.has_permission('checklists.templates.manage',department));

-- Températures.
drop policy if exists temperature_readings_read on public.temperature_readings;
drop policy if exists temperature_readings_insert on public.temperature_readings;
drop policy if exists temperature_readings_manage on public.temperature_readings;
drop policy if exists temperature_readings_delete on public.temperature_readings;
create policy temperature_readings_read_permissions on public.temperature_readings for select to authenticated
using (private.has_permission('temperatures.use',department) or private.has_permission('alerts.view',department));
create policy temperature_readings_insert_permissions on public.temperature_readings for insert to authenticated
with check (recorded_by=auth.uid() and private.has_permission('temperatures.use',department));
create policy temperature_readings_update_admin on public.temperature_readings for update to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy temperature_readings_delete_admin on public.temperature_readings for delete to authenticated
using (private.is_admin());

-- Lunchs et suggestions Cuisine.
drop policy if exists department_content_read on public.department_content;
drop policy if exists department_content_manage on public.department_content;
create policy department_content_read_permissions on public.department_content for select to authenticated
using (private.can_read_department_content(department,content_type,active));
create policy department_content_manage_permissions on public.department_content for all to authenticated
using (private.can_manage_department_content(department,content_type))
with check (private.can_manage_department_content(department,content_type));

-- Messages d'équipe.
drop policy if exists team_banners_read on public.team_banners;
drop policy if exists team_banners_manage on public.team_banners;
create policy team_banners_read_permissions on public.team_banners for select to authenticated
using (
  private.is_active_user()
  and (audience='all' or private.has_any_scope_permission(audience))
);
create policy team_banners_manage_permissions on public.team_banners for all to authenticated
using (private.has_permission('banners.manage','global'))
with check (private.has_permission('banners.manage','global'));

-- Paramètres et journal opérationnel.
drop policy if exists app_settings_update_responsible on public.app_settings;
create policy app_settings_update_permissions on public.app_settings for update to authenticated
using (private.has_permission('settings.manage','global'))
with check (private.has_permission('settings.manage','global'));

drop policy if exists activity_events_read_managers on public.activity_events;
create policy activity_events_read_permissions on public.activity_events for select to authenticated
using (private.is_admin() or private.has_any_permission('orders.manage'));

-- Fonctions de cycle des commandes.
create or replace function private.submit_order_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v_order public.orders;
begin
  if not private.is_active_user() then raise exception 'Compte StopFlow inactif.' using errcode='42501'; end if;
  update public.orders o set status='À valider',inventory_at=now()
  where o.id=p_order_id and o.status='Brouillon'
    and (
      (o.author_id=auth.uid() and private.has_permission('inventory.use',o.department))
      or private.has_permission('orders.manage',o.department)
    )
  returning o.* into v_order;
  if v_order.id is null then raise exception 'Brouillon introuvable, déjà envoyé ou inaccessible.' using errcode='42501'; end if;
  return v_order;
end;
$$;

create or replace function private.validate_order_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v_order public.orders;v_validator_name text;v_number text;
begin
  select * into v_order from public.orders o where o.id=p_order_id and o.status='À valider' for update;
  if v_order.id is null or not private.has_permission('orders.manage',v_order.department) then
    raise exception 'Document introuvable ou permission de validation absente.' using errcode='42501';
  end if;
  select nullif(btrim(concat_ws(' ',p.prenom,p.nom)),'') into v_validator_name from public.profiles p where p.id=auth.uid();
  v_validator_name:=coalesce(v_validator_name,'Responsable StopFlow');
  v_number:='BC-'||lpad(nextval('public.order_number_seq')::text,6,'0');
  update public.orders set status='Validé',number=v_number,validator_id=auth.uid(),validator_name=v_validator_name,validated_at=now()
  where id=p_order_id returning * into v_order;
  return v_order;
end;
$$;

create or replace function private.mark_ordered_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders o where o.id=p_order_id and o.status='Validé' for update;
  if v_order.id is null or not private.has_permission('orders.manage',v_order.department) then
    raise exception 'Bon validé introuvable ou permission absente.' using errcode='42501';
  end if;
  update public.orders set status='Commandé' where id=p_order_id returning * into v_order;
  return v_order;
end;
$$;

create or replace function private.cancel_order_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders o where o.id=p_order_id and o.status<>'Annulé' for update;
  if v_order.id is null or not private.has_permission('orders.manage',v_order.department) then
    raise exception 'Document introuvable ou permission absente.' using errcode='42501';
  end if;
  update public.orders set status='Annulé' where id=p_order_id returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.mark_order_sent(p_order_id uuid,p_supplier_email text default null,p_estimated_total numeric default null)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v public.orders;p public.profiles;
begin
  select * into v from public.orders where id=p_order_id and status in ('Validé','Commandé') for update;
  if v.id is null or not private.has_permission('orders.manage',v.department) then raise exception 'Bon validé introuvable ou permission absente.' using errcode='42501'; end if;
  select * into p from public.profiles where id=auth.uid() and actif=true;
  update public.orders set supplier_email=nullif(btrim(coalesce(p_supplier_email,'')),''),estimated_total=p_estimated_total,sent_at=now(),sent_by=auth.uid(),sent_by_name=concat_ws(' ',p.prenom,p.nom),status='Commandé' where id=p_order_id returning * into v;
  insert into public.activity_events(actor_user_id,actor_name,event_type,entity_type,entity_id,label,details) values(auth.uid(),concat_ws(' ',p.prenom,p.nom),'order_sent','order',p_order_id::text,'Commande envoyée à '||coalesce(v.supplier_email,'adresse non renseignée'),jsonb_build_object('supplier',v.supplier,'total',v.estimated_total));
  return v;
end;
$$;

create or replace function public.mark_order_delivered(p_order_id uuid,p_note text default null)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v public.orders;p public.profiles;
begin
  select * into v from public.orders where id=p_order_id and status='Commandé' for update;
  if v.id is null or not private.has_permission('orders.manage',v.department) then raise exception 'Commande introuvable ou permission absente.' using errcode='42501'; end if;
  select * into p from public.profiles where id=auth.uid() and actif=true;
  update public.orders set delivered_at=now(),delivery_note=nullif(btrim(coalesce(p_note,'')),'') where id=p_order_id returning * into v;
  insert into public.activity_events(actor_user_id,actor_name,event_type,entity_type,entity_id,label,details) values(auth.uid(),concat_ws(' ',p.prenom,p.nom),'order_delivered','order',p_order_id::text,'Livraison confirmée pour '||v.supplier,jsonb_build_object('note',v.delivery_note));
  return v;
end;
$$;

create or replace function public.resolve_checklist_anomaly(p_item_id uuid,p_resolution_note text default '')
returns table(run_id uuid,run_status text,remaining_anomalies bigint)
language plpgsql security definer set search_path='public','private','auth'
as $$
declare v_run_id uuid;v_department text;v_name text;v_remaining bigint;
begin
  select item.run_id,run.department into v_run_id,v_department
  from public.checklist_run_items item join public.checklist_runs run on run.id=item.run_id
  where item.id=p_item_id and item.anomaly=true;
  if v_run_id is null then raise exception 'Anomalie introuvable.'; end if;
  if not private.has_permission('checklists.review',v_department) then raise exception 'Permission de contrôle des checklists absente.' using errcode='42501'; end if;
  select coalesce(nullif(btrim(concat_ws(' ',profile.prenom,profile.nom)),''),profile.email,'Responsable') into v_name from public.profiles profile where profile.id=auth.uid();
  update public.checklist_run_items set anomaly_status='resolue',resolved_at=now(),resolved_by=auth.uid(),resolved_by_name=coalesce(v_name,'Responsable'),resolution_note=btrim(coalesce(p_resolution_note,'')) where id=p_item_id;
  select count(*) into v_remaining from public.checklist_run_items item where item.run_id=v_run_id and item.anomaly=true and coalesce(item.anomaly_status,'a_traiter')<>'resolue';
  if v_remaining=0 then
    update public.checklist_runs set status='validee',validated_by=auth.uid(),validated_by_name=coalesce(v_name,'Responsable'),validated_at=now(),validator_note=case when btrim(coalesce(validator_note,''))='' then 'Toutes les anomalies ont été résolues.' else validator_note||E'\nSuivi clôturé : toutes les anomalies ont été résolues.' end,updated_at=now()
    where id=v_run_id and status='suivi_necessaire';
  end if;
  return query select run.id,run.status,v_remaining from public.checklist_runs run where run.id=v_run_id;
end;
$$;

-- Sauvegarde des inventaires : permission inventory.use obligatoire.
create or replace function public.save_order_draft_atomic(
  p_order_id uuid,p_supplier text,p_author_name text,p_note text,p_stocks jsonb,p_adjustments jsonb,
  p_inventory_at timestamptz,p_created_at timestamptz,p_expected_revision bigint,p_lines jsonb
)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare
  v_order public.orders;v_profile public.profiles;v_supplier public.suppliers;v_article public.articles;
  v_line jsonb;v_position integer:=0;v_department text;
begin
  select * into v_profile from public.profiles where id=auth.uid() and actif=true;
  if v_profile.id is null then raise exception 'Compte StopFlow inactif ou session invalide.' using errcode='42501'; end if;
  if p_order_id is null or btrim(coalesce(p_supplier,''))='' then raise exception 'Identifiant ou fournisseur manquant.' using errcode='22023'; end if;
  select s.* into v_supplier from public.suppliers s where lower(s.name)=lower(btrim(p_supplier)) limit 1;
  if v_supplier.id is null then raise exception 'Fournisseur introuvable.' using errcode='23503'; end if;
  if v_supplier.active is not true then raise exception 'Ce fournisseur est désactivé.' using errcode='23514'; end if;
  v_department:=v_supplier.department;
  if not private.has_permission('inventory.use',v_department) then raise exception 'Permission Inventaires absente pour ce département.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_stocks,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_adjustments,'{}'::jsonb))<>'object' then raise exception 'Les données du brouillon sont invalides.' using errcode='22023'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then
    insert into public.orders(id,supplier,department,status,author_id,author_name,note,stocks,adjustments,inventory_at,created_at,revision,last_edited_by,last_edited_name)
    values(p_order_id,v_supplier.name,v_department,'Brouillon',auth.uid(),coalesce(nullif(btrim(p_author_name),''),nullif(btrim(concat_ws(' ',v_profile.prenom,v_profile.nom)),''),v_profile.email),coalesce(p_note,''),coalesce(p_stocks,'{}'::jsonb),coalesce(p_adjustments,'{}'::jsonb),coalesce(p_inventory_at,now()),coalesce(p_created_at,now()),1,auth.uid(),coalesce(nullif(btrim(concat_ws(' ',v_profile.prenom,v_profile.nom)),''),v_profile.email)) returning * into v_order;
  else
    if v_order.status<>'Brouillon' then raise exception 'Ce document a déjà été envoyé et ne peut plus être remplacé comme brouillon.' using errcode='P0001'; end if;
    if lower(v_order.supplier)<>lower(v_supplier.name) or v_order.department<>v_department then raise exception 'Le fournisseur ou département du brouillon ne peut pas être modifié.' using errcode='42501'; end if;
    if v_order.author_id<>auth.uid() and not private.has_permission('orders.manage',v_department) then raise exception 'Vous ne pouvez pas modifier ce brouillon.' using errcode='42501'; end if;
    if p_expected_revision is null or v_order.revision<>p_expected_revision then raise exception 'CONFLIT_REVISION: ce brouillon a été modifié sur un autre appareil.' using errcode='40001'; end if;
    update public.orders set supplier=v_supplier.name,department=v_department,note=coalesce(p_note,''),stocks=coalesce(p_stocks,'{}'::jsonb),adjustments=coalesce(p_adjustments,'{}'::jsonb),inventory_at=coalesce(p_inventory_at,inventory_at),revision=revision+1,last_edited_by=auth.uid(),last_edited_name=coalesce(nullif(btrim(concat_ws(' ',v_profile.prenom,v_profile.nom)),''),v_profile.email) where id=p_order_id returning * into v_order;
  end if;
  delete from public.order_lines where order_id=p_order_id;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    select a.* into v_article from public.articles a where a.id::text=nullif(v_line->>'article_id','') and a.supplier_id=v_supplier.id and a.department=v_department limit 1;
    if v_article.id is null then raise exception 'Une ligne du brouillon appartient à un autre fournisseur ou département.' using errcode='42501'; end if;
    insert into public.order_lines(order_id,line_position,article_id,article_name,category,unit,target,stock,proposed,quantity)
    values(p_order_id,v_position,v_article.id::text,v_article.name,v_article.category,v_article.unit,greatest(0,coalesce((v_line->>'target')::numeric,0)),greatest(0,coalesce((v_line->>'stock')::numeric,0)),greatest(0,coalesce((v_line->>'proposed')::numeric,0)),greatest(0,coalesce((v_line->>'quantity')::numeric,0)));
    v_position:=v_position+1;
  end loop;
  return v_order;
end;
$$;

create or replace function public.save_order_draft_atomic_v054(
  p_order_id uuid,p_supplier text,p_department text,p_author_name text,p_note text,p_stocks jsonb,p_adjustments jsonb,
  p_inventory_at timestamptz,p_created_at timestamptz,p_expected_revision bigint,p_lines jsonb
)
returns public.orders language plpgsql security definer set search_path=''
as $$
declare v_supplier public.suppliers;v_result public.orders;
begin
  select * into v_supplier from public.suppliers where lower(name)=lower(btrim(p_supplier)) limit 1;
  if v_supplier.id is null then raise exception 'Fournisseur introuvable.' using errcode='23503'; end if;
  if lower(btrim(coalesce(p_department,'')))<>v_supplier.department then raise exception 'Le département ne correspond pas au fournisseur.' using errcode='42501'; end if;
  select * into v_result from public.save_order_draft_atomic(p_order_id,p_supplier,p_author_name,p_note,p_stocks,p_adjustments,p_inventory_at,p_created_at,p_expected_revision,p_lines);
  return v_result;
end;
$$;

-- Compatibilité temporaire : l'ancien formulaire 0.6.0 continue à produire un jeu de permissions équivalent.
create or replace function private.sync_legacy_profile_permissions(p_profile_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id=p_profile_id;
  if v_profile.id is null then return; end if;
  delete from public.profile_permissions where profile_id=p_profile_id;
  if not v_profile.actif or v_profile.role='admin' then return; end if;
  insert into public.profile_permissions(profile_id,permission_key,scope)
  values(p_profile_id,'ideas.share','global') on conflict do nothing;
  if v_profile.role='responsable' then
    insert into public.profile_permissions(profile_id,permission_key,scope)
    select p_profile_id,k.permission_key,d.scope
    from (values ('cuisine'),('salle'),('nettoyage')) d(scope)
    cross join (values ('inventory.use'),('history.view'),('checklists.run'),('orders.manage'),('checklists.review'),('checklists.templates.manage'),('alerts.view'),('articles.manage')) k(permission_key)
    on conflict do nothing;
    insert into public.profile_permissions(profile_id,permission_key,scope)
    select p_profile_id,k.permission_key,'cuisine' from (values ('temperatures.use'),('lunchs.view'),('lunchs.manage'),('monthly_suggestions.view'),('monthly_suggestions.manage')) k(permission_key)
    on conflict do nothing;
    insert into public.profile_permissions(profile_id,permission_key,scope)
    values(p_profile_id,'banners.manage','global'),(p_profile_id,'settings.manage','global') on conflict do nothing;
  elsif v_profile.role='employe' then
    insert into public.profile_permissions(profile_id,permission_key,scope)
    select p_profile_id,k.permission_key,pd.department from public.profile_departments pd
    cross join (values ('inventory.use'),('history.view'),('checklists.run')) k(permission_key)
    where pd.profile_id=p_profile_id and private.is_operational_department(pd.department)
    on conflict do nothing;
    if exists(select 1 from public.profile_departments where profile_id=p_profile_id and department='cuisine') then
      insert into public.profile_permissions(profile_id,permission_key,scope)
      values(p_profile_id,'temperatures.use','cuisine'),(p_profile_id,'lunchs.view','cuisine'),(p_profile_id,'monthly_suggestions.view','cuisine')
      on conflict do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.admin_set_user_access(p_profile_id uuid,p_prenom text,p_nom text,p_role text,p_actif boolean,p_primary_department text,p_departments text[])
returns public.profiles language plpgsql security definer set search_path=''
as $$
declare
  v_profile public.profiles;v_before public.profiles;v_email text;v_role text:=lower(btrim(coalesce(p_role,'')));v_primary text:=lower(btrim(coalesce(p_primary_department,'')));v_departments text[];v_invited boolean:=false;v_audit_action text:='update';
begin
  if not private.is_admin() then raise exception 'Cette action est réservée à l’Administrateur.' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=p_profile_id for update;
  if v_profile.id is null then raise exception 'Utilisateur introuvable.' using errcode='P0002'; end if;
  v_before:=v_profile;v_email:=lower(v_profile.email);
  select (u.invited_at is not null) into v_invited from auth.users u where u.id=p_profile_id;
  if v_role not in ('admin','responsable','employe') then raise exception 'Rôle invalide.' using errcode='22023'; end if;
  if v_email='contact@srlreunion.com' then v_role:='admin';p_actif:=true;v_primary:='bureau';
  elsif v_email='quentin@lunion.be' then v_role:='responsable';p_actif:=true;v_primary:='bureau'; end if;
  if v_role='employe' then
    if not private.is_operational_department(v_primary) then raise exception 'Le département principal de l’employé est invalide.' using errcode='22023'; end if;
    if exists(select 1 from unnest(coalesce(p_departments,array[]::text[])) d where not private.is_operational_department(lower(btrim(d)))) then raise exception 'Un département sélectionné est invalide.' using errcode='22023'; end if;
    select coalesce(array_agg(d order by d),array[]::text[]) into v_departments from (select distinct lower(btrim(value)) d from unnest(coalesce(p_departments,array[]::text[])) value where private.is_operational_department(lower(btrim(value)))) normalized;
    if cardinality(v_departments)=0 then raise exception 'Sélectionnez au moins un département.' using errcode='22023'; end if;
    if not (v_primary=any(v_departments)) then raise exception 'Le département principal doit être coché.' using errcode='22023'; end if;
  else v_primary:='bureau';v_departments:=array[]::text[]; end if;
  update public.profiles set prenom=nullif(btrim(coalesce(p_prenom,'')),''),nom=nullif(btrim(coalesce(p_nom,'')),''),role=v_role,actif=coalesce(p_actif,false),departement=v_primary,updated_at=now() where id=p_profile_id returning * into v_profile;
  delete from public.profile_departments where profile_id=p_profile_id;
  if v_role='employe' then insert into public.profile_departments(profile_id,department,is_primary) select p_profile_id,d,d=v_primary from unnest(v_departments) d; end if;
  perform private.sync_legacy_profile_permissions(p_profile_id);
  if v_before.departement is null and not coalesce(v_invited,false) then v_audit_action:='create';
  elsif v_before.actif=true and v_profile.actif=false then v_audit_action:='deactivate';
  elsif v_before.actif=false and v_profile.actif=true then v_audit_action:='activate'; else v_audit_action:='update'; end if;
  if not (v_before.departement is null and coalesce(v_invited,false)) then
    insert into public.user_admin_events(actor_user_id,target_user_id,target_email,action,details)
    values(auth.uid(),p_profile_id,v_email,v_audit_action,jsonb_build_object('role',v_profile.role,'actif',v_profile.actif,'departement',v_profile.departement,'departments',v_departments,'permissions_synced','legacy_0.6'));
  end if;
  return v_profile;
end;
$$;

-- Les permissions se modifient via RPC Admin ; lecture de ses propres permissions autorisée.
revoke insert,update,delete on public.profile_permissions from authenticated,anon;
grant select on public.profile_permissions to authenticated;