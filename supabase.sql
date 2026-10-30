-- Execute no SQL Editor do Supabase para ativar a sincronização online.
-- Cada usuário autenticado acessa apenas seus próprios clientes/pedidos.
create extension if not exists pgcrypto;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  telefone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  constraint clientes_id_user_unique unique (id, user_id)
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id uuid not null,
  descricao text not null check (char_length(trim(descricao)) between 1 and 250),
  data_pedido date not null default current_date,
  valor numeric(12,2) not null default 0 check(valor >= 0),
  status text not null default 'Pendente' check(status in ('Pendente','Em andamento','Concluído','Cancelado')),
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  constraint pedidos_clientes_fk foreign key (cliente_id,user_id) references public.clientes(id,user_id) on delete restrict
);

create index if not exists pedidos_usuario_data_idx on public.pedidos(user_id,data_pedido desc);
create index if not exists pedidos_cliente_idx on public.pedidos(cliente_id);
create index if not exists clientes_usuario_nome_idx on public.clientes(user_id,nome);

alter table public.clientes enable row level security;
alter table public.pedidos enable row level security;

-- Apenas a conta proprietária pode ler e alterar cada linha.
drop policy if exists "clientes_select_own" on public.clientes;
drop policy if exists "clientes_insert_own" on public.clientes;
drop policy if exists "clientes_update_own" on public.clientes;
drop policy if exists "clientes_delete_own" on public.clientes;
create policy "clientes_select_own" on public.clientes for select to authenticated using (user_id = (select auth.uid()));
create policy "clientes_insert_own" on public.clientes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "clientes_update_own" on public.clientes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "clientes_delete_own" on public.clientes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "pedidos_select_own" on public.pedidos;
drop policy if exists "pedidos_insert_own" on public.pedidos;
drop policy if exists "pedidos_update_own" on public.pedidos;
drop policy if exists "pedidos_delete_own" on public.pedidos;
create policy "pedidos_select_own" on public.pedidos for select to authenticated using (user_id = (select auth.uid()));
create policy "pedidos_insert_own" on public.pedidos for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pedidos_update_own" on public.pedidos for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pedidos_delete_own" on public.pedidos for delete to authenticated using (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clientes, public.pedidos to authenticated;
