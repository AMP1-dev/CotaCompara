-- =====================================================================
-- CotaCompara — Migração 03: painel admin, planos, bloqueio e trava de CNPJ
-- Rodar DEPOIS do 01 e do 02. Pode rodar mais de uma vez.
-- No final há o comando para tornar você administrador (ajuste o e-mail).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Plano / bloqueio por empresa
-- ---------------------------------------------------------------------
alter table cotacompara.empresas
  add column if not exists plano          text not null default 'gratis',
  add column if not exists plano_validade date,
  add column if not exists bloqueado      boolean not null default false,
  add column if not exists obs_admin      text;

do $$ begin
  alter table cotacompara.empresas
    add constraint empresas_plano_chk check (plano in ('gratis','basico','pro','cortesia'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Administradores da plataforma
-- ---------------------------------------------------------------------
create table if not exists cotacompara.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table cotacompara.admins enable row level security;
-- ninguém acessa a tabela direto; só pelas funções abaixo

create or replace function cotacompara.is_admin()
returns boolean
language sql stable security definer set search_path = cotacompara, public
as $$
  select exists (select 1 from cotacompara.admins where user_id = auth.uid())
$$;

-- usado pelo app para mostrar o cadeado
create or replace function cotacompara.sou_admin()
returns boolean
language sql stable security definer set search_path = cotacompara, public
as $$ select cotacompara.is_admin() $$;

-- ---------------------------------------------------------------------
-- 3. Cliente NÃO pode mudar o próprio plano/bloqueio (só admin)
-- ---------------------------------------------------------------------
create or replace function cotacompara.protege_campos_admin()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
begin
  if cotacompara.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plano := 'gratis';
    new.plano_validade := null;
    new.bloqueado := false;
    new.obs_admin := null;
  else
    new.plano := old.plano;
    new.plano_validade := old.plano_validade;
    new.bloqueado := old.bloqueado;
    new.obs_admin := old.obs_admin;
  end if;
  return new;
end $$;

drop trigger if exists trg_empresas_protege on cotacompara.empresas;
create trigger trg_empresas_protege before insert or update on cotacompara.empresas
  for each row execute function cotacompara.protege_campos_admin();

-- ---------------------------------------------------------------------
-- 4. Trava: para CRIAR ou LIBERAR cotação a empresa precisa ter CNPJ
--    e não pode estar bloqueada
-- ---------------------------------------------------------------------
create or replace function cotacompara.valida_empresa_cotacao()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_emp cotacompara.empresas;
begin
  if tg_op = 'UPDATE' and not (new.status = 'enviada' and old.status is distinct from 'enviada') then
    return new; -- só valida na criação e quando libera para respostas
  end if;
  select * into v_emp from cotacompara.empresas where id = new.empresa_id;
  if v_emp.bloqueado then
    raise exception 'CONTA_BLOQUEADA';
  end if;
  if coalesce(trim(v_emp.cnpj), '') = '' then
    raise exception 'CNPJ_OBRIGATORIO';
  end if;
  return new;
end $$;

drop trigger if exists trg_cotacoes_valida_empresa on cotacompara.cotacoes;
create trigger trg_cotacoes_valida_empresa before insert or update on cotacompara.cotacoes
  for each row execute function cotacompara.valida_empresa_cotacao();

-- ---------------------------------------------------------------------
-- 5. Funções do painel admin
-- ---------------------------------------------------------------------
create or replace function cotacompara.admin_listar_clientes()
returns table (
  empresa_id      uuid,
  owner_id        uuid,
  nome            text,
  razao_social    text,
  cnpj            text,
  situacao_cnpj   text,
  responsavel     text,
  telefone        text,
  cidade          text,
  uf              text,
  email           text,
  criado_em       timestamptz,
  ultimo_acesso   timestamptz,
  email_confirmado boolean,
  plano           text,
  plano_validade  date,
  bloqueado       boolean,
  obs_admin       text,
  qtd_cotacoes    int,
  qtd_fornecedores int,
  qtd_respostas   int,
  ultima_cotacao  timestamptz
)
language plpgsql stable security definer set search_path = cotacompara, public
as $$
begin
  if not cotacompara.is_admin() then
    raise exception 'ACESSO_NEGADO';
  end if;
  return query
  select
    e.id, e.owner_id, e.nome, e.razao_social, e.cnpj, e.situacao_cnpj, e.responsavel,
    e.telefone, e.cidade, e.uf::text,
    u.email::text, e.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null),
    e.plano, e.plano_validade, e.bloqueado, e.obs_admin,
    (select count(*)::int from cotacompara.cotacoes c where c.empresa_id = e.id),
    (select count(*)::int from cotacompara.fornecedores f where f.empresa_id = e.id),
    (select count(*)::int from cotacompara.convites v
       join cotacompara.cotacoes c on c.id = v.cotacao_id
      where c.empresa_id = e.id and v.status = 'respondido'),
    (select max(c.created_at) from cotacompara.cotacoes c where c.empresa_id = e.id)
  from cotacompara.empresas e
  join auth.users u on u.id = e.owner_id
  order by e.created_at desc;
end $$;

create or replace function cotacompara.admin_atualizar_cliente(
  p_empresa_id     uuid,
  p_plano          text,
  p_plano_validade date,
  p_bloqueado      boolean,
  p_obs_admin      text
)
returns void
language plpgsql security definer set search_path = cotacompara, public
as $$
begin
  if not cotacompara.is_admin() then
    raise exception 'ACESSO_NEGADO';
  end if;
  update cotacompara.empresas
     set plano = p_plano,
         plano_validade = p_plano_validade,
         bloqueado = coalesce(p_bloqueado, false),
         obs_admin = nullif(trim(p_obs_admin), '')
   where id = p_empresa_id;
  if not found then
    raise exception 'EMPRESA_NAO_ENCONTRADA';
  end if;
end $$;

revoke all on function cotacompara.is_admin() from public;
revoke all on function cotacompara.sou_admin() from public;
revoke all on function cotacompara.admin_listar_clientes() from public;
revoke all on function cotacompara.admin_atualizar_cliente(uuid, text, date, boolean, text) from public;
grant execute on function cotacompara.is_admin() to authenticated;
grant execute on function cotacompara.sou_admin() to authenticated;
grant execute on function cotacompara.admin_listar_clientes() to authenticated;
grant execute on function cotacompara.admin_atualizar_cliente(uuid, text, date, boolean, text) to authenticated;

-- =====================================================================
-- 6. TORNAR-SE ADMINISTRADOR — troque o e-mail se precisar e rode:
-- =====================================================================
insert into cotacompara.admins (user_id)
select id from auth.users where email = 'suporte@amp.ia.br'
on conflict do nothing;
