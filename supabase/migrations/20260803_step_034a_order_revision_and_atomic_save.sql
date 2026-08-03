alter table public.orders
  add column if not exists revision bigint not null default 1,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_name text;

alter table public.orders
  drop constraint if exists orders_revision_positive;

alter table public.orders
  add constraint orders_revision_positive check (revision >= 1);

create or replace function public.save_order_draft_atomic(
  p_order_id uuid,
  p_supplier text,
  p_author_name text,
  p_note text,
  p_stocks jsonb,
  p_adjustments jsonb,
  p_inventory_at timestamptz,
  p_created_at timestamptz,
  p_expected_revision bigint,
  p_lines jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_profile public.profiles;
  v_line jsonb;
  v_position integer := 0;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and actif = true;

  if v_profile.id is null then
    raise exception 'Compte StopFlow inactif ou session invalide.' using errcode = '42501';
  end if;

  if p_order_id is null or btrim(coalesce(p_supplier,'')) = '' then
    raise exception 'Identifiant ou fournisseur manquant.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then
    raise exception 'Les lignes du brouillon sont invalides.' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    insert into public.orders(
      id, supplier, status, author_id, author_name,
      note, stocks, adjustments, inventory_at, created_at,
      revision, last_edited_by, last_edited_name
    ) values (
      p_order_id, btrim(p_supplier), 'Brouillon', auth.uid(),
      coalesce(nullif(btrim(p_author_name),''), concat_ws(' ',v_profile.prenom,v_profile.nom),v_profile.email),
      coalesce(p_note,''), coalesce(p_stocks,'{}'::jsonb), coalesce(p_adjustments,'{}'::jsonb),
      coalesce(p_inventory_at,now()), coalesce(p_created_at,now()),
      1, auth.uid(), concat_ws(' ',v_profile.prenom,v_profile.nom)
    ) returning * into v_order;
  else
    if v_order.status <> 'Brouillon' then
      raise exception 'Ce document a déjà été envoyé et ne peut plus être remplacé comme brouillon.' using errcode = 'P0001';
    end if;

    if not (v_order.author_id = auth.uid() or private.is_responsible_or_admin()) then
      raise exception 'Vous ne pouvez pas modifier ce brouillon.' using errcode = '42501';
    end if;

    if p_expected_revision is null or v_order.revision <> p_expected_revision then
      raise exception 'CONFLIT_REVISION: ce brouillon a été modifié sur un autre appareil.' using errcode = '40001';
    end if;

    update public.orders
    set note = coalesce(p_note,''),
        stocks = coalesce(p_stocks,'{}'::jsonb),
        adjustments = coalesce(p_adjustments,'{}'::jsonb),
        inventory_at = coalesce(p_inventory_at,inventory_at),
        revision = revision + 1,
        last_edited_by = auth.uid(),
        last_edited_name = concat_ws(' ',v_profile.prenom,v_profile.nom)
    where id = p_order_id
    returning * into v_order;
  end if;

  delete from public.order_lines where order_id = p_order_id;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    insert into public.order_lines(
      order_id, line_position, article_id, article_name,
      category, unit, target, stock, proposed, quantity
    ) values (
      p_order_id, v_position,
      nullif(v_line->>'article_id',''),
      coalesce(nullif(v_line->>'article_name',''),'Article'),
      coalesce(v_line->>'category',''),
      coalesce(v_line->>'unit',''),
      greatest(0,coalesce((v_line->>'target')::numeric,0)),
      greatest(0,coalesce((v_line->>'stock')::numeric,0)),
      greatest(0,coalesce((v_line->>'proposed')::numeric,0)),
      greatest(0,coalesce((v_line->>'quantity')::numeric,0))
    );
    v_position := v_position + 1;
  end loop;

  return v_order;
end;
$$;

revoke all on function public.save_order_draft_atomic(uuid,text,text,text,jsonb,jsonb,timestamptz,timestamptz,bigint,jsonb) from public;
grant execute on function public.save_order_draft_atomic(uuid,text,text,text,jsonb,jsonb,timestamptz,timestamptz,bigint,jsonb) to authenticated;
