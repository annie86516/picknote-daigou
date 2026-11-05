create table public.picknote_boards (
  id uuid primary key,
  admin_hash text not null,
  invite_code text not null unique,
  shared_editing boolean not null default false,
  amount_password_hash text,
  created_at timestamptz not null default now()
);
create table public.picknote_items (
  id uuid primary key,
  board_id uuid not null references public.picknote_boards(id) on delete cascade,
  buyer text not null check (length(buyer) between 1 and 40),
  name text not null default '' check (length(name) <= 80),
  amount bigint not null check (amount between 0 and 999999999),
  actual_amount bigint check (actual_amount between 0 and 999999999),
  done boolean not null default false,
  image text not null,
  thumbnail text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index picknote_items_board_date on public.picknote_items(board_id, created_at desc);
alter table public.picknote_boards enable row level security;
alter table public.picknote_items enable row level security;
revoke all on public.picknote_boards, public.picknote_items from public, anon, authenticated;

create function public.picknote_validate_item(p_data jsonb, p_require_image boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if coalesce(length(btrim(p_data->>'buyer')),0) not between 1 and 40
     or coalesce(length(p_data->>'name'),0) > 80
     or coalesce(p_data->>'amount','') !~ '^[0-9]{1,9}$'
  then raise exception '請檢查購買人與預估金額'; end if;
  if p_require_image or p_data ? 'image' then
    if coalesce(length(p_data->>'image'),0) not between 50 and 2000000
       or coalesce(p_data->>'image','') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
       or coalesce(length(p_data->>'thumbnail'),0) not between 50 and 160000
       or coalesce(p_data->>'thumbnail','') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    then raise exception '請上傳有效的商品截圖'; end if;
  end if;
end;
$$;

create function public.picknote_item_json(p_item public.picknote_items)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_item.id, 'buyer', p_item.buyer, 'name', p_item.name,
    'amount', p_item.amount, 'actualAmount', p_item.actual_amount,
    'done', p_item.done, 'thumbnail', p_item.thumbnail,
    'date', p_item.created_at, 'updated', p_item.updated_at
  );
$$;

create function public.picknote_submit(p_board uuid, p_invite text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p_data->>'id')::uuid;
begin
  if not exists(select 1 from public.picknote_boards where id=p_board and invite_code=p_invite)
  then raise exception '填單連結無效，請向主揪索取完整連結'; end if;
  perform public.picknote_validate_item(p_data,true);
  insert into public.picknote_items(id,board_id,buyer,name,amount,image,thumbnail)
  values(v_id,p_board,btrim(p_data->>'buyer'),coalesce(btrim(p_data->>'name'),''),(p_data->>'amount')::bigint,p_data->>'image',p_data->>'thumbnail')
  on conflict(id) do nothing;
  if not exists(select 1 from public.picknote_items where id=v_id and board_id=p_board)
  then raise exception '無法儲存，請重新開啟填單頁'; end if;
  return jsonb_build_object('received',true);
end;
$$;

create function public.picknote_manage(p_board uuid,p_admin text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_board public.picknote_boards;
  v_item public.picknote_items;
  v_id uuid;
begin
  select * into v_board from public.picknote_boards
  where id=p_board and (
    admin_hash=encode(extensions.digest(p_admin,'sha256'),'hex')
    or (shared_editing and invite_code=p_admin)
  );
  if not found then raise exception '共用清單憑證無效，請使用最新版 HTML'; end if;
  if p_action='list' then
    return coalesce((select jsonb_agg(public.picknote_item_json(i) order by i.created_at desc) from public.picknote_items i where board_id=p_board),'[]'::jsonb);
  elsif p_action='invite' then
    return jsonb_build_object('code',v_board.invite_code);
  elsif p_action='add' then
    perform public.picknote_submit(p_board,v_board.invite_code,p_data);
    select * into v_item from public.picknote_items where id=(p_data->>'id')::uuid and board_id=p_board;
    return public.picknote_item_json(v_item);
  end if;
  v_id := (p_data->>'id')::uuid;
  select * into v_item from public.picknote_items where id=v_id and board_id=p_board for update;
  if not found then
    if p_action='delete' then return jsonb_build_object('deleted',true); end if;
    raise exception '這筆代購已不存在，請重新整理';
  end if;
  if p_action='image' then
    return jsonb_build_object('image',v_item.image);
  elsif p_action='delete' then
    delete from public.picknote_items where id=v_id and board_id=p_board;
    return jsonb_build_object('deleted',true);
  elsif p_action='edit' then
    perform public.picknote_validate_item(p_data,false);
    if (p_data->>'updated')::timestamptz is distinct from v_item.updated_at
    then raise exception '這筆代購已更新，請關閉並重新開啟修改'; end if;
    update public.picknote_items set
      buyer=btrim(p_data->>'buyer'), name=coalesce(btrim(p_data->>'name'),''),
      amount=(p_data->>'amount')::bigint,
      image=coalesce(p_data->>'image',image),thumbnail=coalesce(p_data->>'thumbnail',thumbnail),
      updated_at=clock_timestamp()
    where id=v_id and board_id=p_board returning * into v_item;
  elsif p_action='purchase' then
    if jsonb_typeof(p_data->'done') is distinct from 'boolean' then raise exception '請檢查購買狀態'; end if;
    if p_data ? 'actualAmount' and p_data->'actualAmount' <> 'null'::jsonb
       and (coalesce(p_data->>'actualAmount','') !~ '^[0-9]{1,9}$')
    then raise exception '購買金額需為 0 到 999,999,999 的整數'; end if;
    -- The row is locked above, so concurrent first fills cannot bypass this check.
    -- Unchecking a purchase preserves its amount; changing or clearing it is protected.
    if v_board.amount_password_hash is not null
       and v_item.actual_amount is not null
       and p_data ? 'actualAmount'
       and (p_data->>'actualAmount')::bigint is distinct from v_item.actual_amount
       and v_board.amount_password_hash is distinct from extensions.crypt(
         coalesce(p_data->>'amountPassword',''),v_board.amount_password_hash
       )
    then raise exception '修改已填購買金額需要正確密碼'; end if;
    update public.picknote_items set done=(p_data->>'done')::boolean,
      actual_amount=case when p_data ? 'actualAmount' then (p_data->>'actualAmount')::bigint else actual_amount end,
      updated_at=clock_timestamp()
    where id=v_id and board_id=p_board returning * into v_item;
  else raise exception '無效的操作';
  end if;
  return public.picknote_item_json(v_item);
end;
$$;
revoke all on function public.picknote_validate_item(jsonb,boolean),public.picknote_item_json(public.picknote_items),public.picknote_submit(uuid,text,jsonb),public.picknote_manage(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.picknote_submit(uuid,text,jsonb),public.picknote_manage(uuid,text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
