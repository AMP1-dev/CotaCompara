-- =====================================================================
-- CotaCompara — Schema completo (Fase 1)
-- Projeto Supabase COMPARTILHADO: tudo fica no schema "cotacompara".
-- Não toca em nada do schema public nem de outros apps.
--
-- Rodar inteiro: SQL Editor > New query > colar > Run
-- Depois: Project Settings > Data API > Exposed schemas > adicionar "cotacompara"
-- =====================================================================

create schema if not exists cotacompara;

-- Permissões do schema (o fornecedor anônimo só executa as 2 funções públicas)
grant usage on schema cotacompara to anon, authenticated, service_role;

-- o serviço de Auth do Supabase precisa enxergar o schema para o gatilho de cadastro
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema cotacompara to supabase_auth_admin;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TABELAS
-- ---------------------------------------------------------------------

-- Empresa/pessoa que cota (1 por usuário)
create table if not exists cotacompara.empresas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  nome        text not null,
  responsavel text,
  cnpj        text,
  telefone    text,
  cidade      text,
  uf          char(2),
  logo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Agenda de fornecedores de cada empresa
create table if not exists cotacompara.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references cotacompara.empresas(id) on delete cascade,
  nome        text not null,
  contato     text,
  email       text not null,
  whatsapp    text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, email)
);

-- Cotação
create table if not exists cotacompara.cotacoes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references cotacompara.empresas(id) on delete cascade,
  numero          integer not null default 0,
  titulo          text not null,
  observacoes     text,
  prazo_resposta  timestamptz,
  status          text not null default 'rascunho'
                  check (status in ('rascunho','enviada','encerrada','cancelada')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Itens da cotação
create table if not exists cotacompara.cotacao_itens (
  id          uuid primary key default gen_random_uuid(),
  cotacao_id  uuid not null references cotacompara.cotacoes(id) on delete cascade,
  ordem       integer not null default 0,
  produto     text not null,
  unidade     text not null default 'UN',
  quantidade  numeric(14,3) not null check (quantidade > 0),
  observacao  text
);

-- Convite = cotação enviada para 1 fornecedor (com token do link)
-- token: 64 caracteres hex aleatórios (2 UUIDs v4, sem depender de pgcrypto)
create table if not exists cotacompara.convites (
  id                  uuid primary key default gen_random_uuid(),
  cotacao_id          uuid not null references cotacompara.cotacoes(id) on delete cascade,
  fornecedor_id       uuid not null references cotacompara.fornecedores(id) on delete cascade,
  token               text not null unique
                      default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status              text not null default 'pendente'
                      check (status in ('pendente','enviado','aberto','respondido','recusado')),
  enviado_em          timestamptz,
  aberto_em           timestamptz,
  respondido_em       timestamptz,
  prazo_entrega_dias  integer,
  condicao_pagamento  text,
  frete               numeric(14,2),
  observacao          text,
  created_at          timestamptz not null default now(),
  unique (cotacao_id, fornecedor_id)
);

-- Preço de cada item informado pelo fornecedor
create table if not exists cotacompara.respostas_itens (
  id              uuid primary key default gen_random_uuid(),
  convite_id      uuid not null references cotacompara.convites(id) on delete cascade,
  item_id         uuid not null references cotacompara.cotacao_itens(id) on delete cascade,
  preco_unitario  numeric(14,4) check (preco_unitario >= 0),
  disponivel      boolean not null default true,
  observacao      text,
  updated_at      timestamptz not null default now(),
  unique (convite_id, item_id)
);

create index if not exists idx_cc_fornecedores_empresa on cotacompara.fornecedores(empresa_id);
create index if not exists idx_cc_cotacoes_empresa     on cotacompara.cotacoes(empresa_id);
create index if not exists idx_cc_itens_cotacao        on cotacompara.cotacao_itens(cotacao_id);
create index if not exists idx_cc_convites_cotacao     on cotacompara.convites(cotacao_id);
create index if not exists idx_cc_respostas_convite    on cotacompara.respostas_itens(convite_id);

-- Usuário logado acessa as tabelas (o RLS abaixo filtra o que é dele).
-- anon NÃO recebe acesso a tabela nenhuma.
grant select, insert, update, delete on all tables in schema cotacompara to authenticated;
grant all on all tables in schema cotacompara to service_role;

-- ---------------------------------------------------------------------
-- FUNÇÕES AUXILIARES / GATILHOS
-- ---------------------------------------------------------------------

-- id da empresa do usuário logado
create or replace function cotacompara.minha_empresa_id()
returns uuid
language sql stable security definer set search_path = cotacompara, public
as $$
  select id from cotacompara.empresas where owner_id = auth.uid()
$$;

-- updated_at automático
create or replace function cotacompara.set_updated_at()
returns trigger language plpgsql set search_path = cotacompara, public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_empresas_upd on cotacompara.empresas;
create trigger trg_empresas_upd before update on cotacompara.empresas
  for each row execute function cotacompara.set_updated_at();

drop trigger if exists trg_cotacoes_upd on cotacompara.cotacoes;
create trigger trg_cotacoes_upd before update on cotacompara.cotacoes
  for each row execute function cotacompara.set_updated_at();

-- número sequencial da cotação por empresa (1, 2, 3...)
create or replace function cotacompara.set_numero_cotacao()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
begin
  if new.numero is null or new.numero = 0 then
    select coalesce(max(numero), 0) + 1 into new.numero
      from cotacompara.cotacoes where empresa_id = new.empresa_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_cotacoes_numero on cotacompara.cotacoes;
create trigger trg_cotacoes_numero before insert on cotacompara.cotacoes
  for each row execute function cotacompara.set_numero_cotacao();

-- Cria a empresa no cadastro — SÓ para quem se cadastrou pelo CotaCompara
-- (o app envia app = 'cotacompara' nos metadados). Cadastros de outros
-- apps do mesmo projeto são ignorados.
create or replace function cotacompara.handle_new_user()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
begin
  if coalesce(new.raw_user_meta_data->>'app', '') = 'cotacompara' then
    insert into cotacompara.empresas (owner_id, nome, responsavel, telefone)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'empresa', ''), 'Minha empresa'),
      new.raw_user_meta_data->>'responsavel',
      new.raw_user_meta_data->>'telefone'
    )
    on conflict (owner_id) do nothing;
  end if;
  return new;
end $$;

-- Nome exclusivo: não derruba gatilhos de outros apps em auth.users
drop trigger if exists cotacompara_on_auth_user_created on auth.users;
create trigger cotacompara_on_auth_user_created after insert on auth.users
  for each row execute function cotacompara.handle_new_user();

-- ---------------------------------------------------------------------
-- RLS — o comprador só enxerga o que é da empresa dele.
-- O fornecedor (anônimo) NÃO acessa tabela nenhuma: só as funções RPC.
-- ---------------------------------------------------------------------

alter table cotacompara.empresas        enable row level security;
alter table cotacompara.fornecedores    enable row level security;
alter table cotacompara.cotacoes        enable row level security;
alter table cotacompara.cotacao_itens   enable row level security;
alter table cotacompara.convites        enable row level security;
alter table cotacompara.respostas_itens enable row level security;

drop policy if exists empresas_dono on cotacompara.empresas;
create policy empresas_dono on cotacompara.empresas
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fornecedores_empresa on cotacompara.fornecedores;
create policy fornecedores_empresa on cotacompara.fornecedores
  for all to authenticated
  using (empresa_id = cotacompara.minha_empresa_id())
  with check (empresa_id = cotacompara.minha_empresa_id());

drop policy if exists cotacoes_empresa on cotacompara.cotacoes;
create policy cotacoes_empresa on cotacompara.cotacoes
  for all to authenticated
  using (empresa_id = cotacompara.minha_empresa_id())
  with check (empresa_id = cotacompara.minha_empresa_id());

drop policy if exists itens_empresa on cotacompara.cotacao_itens;
create policy itens_empresa on cotacompara.cotacao_itens
  for all to authenticated
  using (exists (select 1 from cotacompara.cotacoes c
                 where c.id = cotacao_id and c.empresa_id = cotacompara.minha_empresa_id()))
  with check (exists (select 1 from cotacompara.cotacoes c
                 where c.id = cotacao_id and c.empresa_id = cotacompara.minha_empresa_id()));

drop policy if exists convites_empresa on cotacompara.convites;
create policy convites_empresa on cotacompara.convites
  for all to authenticated
  using (exists (select 1 from cotacompara.cotacoes c
                 where c.id = cotacao_id and c.empresa_id = cotacompara.minha_empresa_id()))
  with check (exists (select 1 from cotacompara.cotacoes c
                 where c.id = cotacao_id and c.empresa_id = cotacompara.minha_empresa_id()));

-- respostas: comprador só LÊ (quem grava é o fornecedor via RPC)
drop policy if exists respostas_leitura on cotacompara.respostas_itens;
create policy respostas_leitura on cotacompara.respostas_itens
  for select to authenticated
  using (exists (select 1 from cotacompara.convites v
                 join cotacompara.cotacoes c on c.id = v.cotacao_id
                 where v.id = convite_id and c.empresa_id = cotacompara.minha_empresa_id()));

-- ---------------------------------------------------------------------
-- FUNÇÕES PÚBLICAS DO FORNECEDOR (link sem login)
-- ---------------------------------------------------------------------

-- Abre a cotação pelo token. Marca como "aberto" no primeiro acesso.
create or replace function cotacompara.cotacao_publica(p_token text)
returns jsonb
language plpgsql security definer set search_path = cotacompara, public
as $$
declare
  v_conv  cotacompara.convites;
  v_cot   cotacompara.cotacoes;
  v_emp   cotacompara.empresas;
  v_forn  cotacompara.fornecedores;
  v_pode  boolean;
begin
  select * into v_conv from cotacompara.convites where token = p_token;
  if not found then
    raise exception 'LINK_INVALIDO';
  end if;

  select * into v_cot  from cotacompara.cotacoes     where id = v_conv.cotacao_id;
  select * into v_emp  from cotacompara.empresas     where id = v_cot.empresa_id;
  select * into v_forn from cotacompara.fornecedores where id = v_conv.fornecedor_id;

  if v_conv.aberto_em is null then
    update cotacompara.convites
       set aberto_em = now(),
           status = case when status in ('pendente','enviado') then 'aberto' else status end
     where id = v_conv.id;
  end if;

  v_pode := v_cot.status = 'enviada'
            and (v_cot.prazo_resposta is null or v_cot.prazo_resposta > now());

  return jsonb_build_object(
    'pode_responder', v_pode,
    'status_cotacao', v_cot.status,
    'ja_respondido',  v_conv.respondido_em is not null,
    'empresa', jsonb_build_object(
      'nome', v_emp.nome, 'cidade', v_emp.cidade, 'uf', v_emp.uf,
      'telefone', v_emp.telefone, 'logo_url', v_emp.logo_url),
    'cotacao', jsonb_build_object(
      'numero', v_cot.numero, 'titulo', v_cot.titulo,
      'observacoes', v_cot.observacoes, 'prazo_resposta', v_cot.prazo_resposta),
    'fornecedor', jsonb_build_object('nome', v_forn.nome),
    'condicoes', jsonb_build_object(
      'prazo_entrega_dias', v_conv.prazo_entrega_dias,
      'condicao_pagamento', v_conv.condicao_pagamento,
      'frete', v_conv.frete,
      'observacao', v_conv.observacao),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'produto', i.produto, 'unidade', i.unidade,
               'quantidade', i.quantidade, 'observacao', i.observacao,
               'preco_unitario', r.preco_unitario,
               'disponivel', coalesce(r.disponivel, true))
             order by i.ordem, i.produto)
        from cotacompara.cotacao_itens i
        left join cotacompara.respostas_itens r
               on r.item_id = i.id and r.convite_id = v_conv.id
       where i.cotacao_id = v_cot.id), '[]'::jsonb)
  );
end $$;

-- Grava a resposta do fornecedor.
-- p_itens = [{"item_id": "...", "preco_unitario": 12.5, "disponivel": true, "observacao": ""}]
create or replace function cotacompara.responder_cotacao(
  p_token              text,
  p_itens              jsonb,
  p_prazo_entrega_dias integer default null,
  p_condicao_pagamento text    default null,
  p_frete              numeric default null,
  p_observacao         text    default null
)
returns jsonb
language plpgsql security definer set search_path = cotacompara, public
as $$
declare
  v_conv cotacompara.convites;
  v_cot  cotacompara.cotacoes;
  v_item jsonb;
  v_qtd  integer := 0;
begin
  select * into v_conv from cotacompara.convites where token = p_token for update;
  if not found then
    raise exception 'LINK_INVALIDO';
  end if;

  select * into v_cot from cotacompara.cotacoes where id = v_conv.cotacao_id;
  if v_cot.status <> 'enviada' then
    raise exception 'COTACAO_FECHADA';
  end if;
  if v_cot.prazo_resposta is not null and v_cot.prazo_resposta <= now() then
    raise exception 'PRAZO_ENCERRADO';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    -- só aceita itens que pertencem a ESTA cotação
    if exists (select 1 from cotacompara.cotacao_itens
                where id = (v_item->>'item_id')::uuid and cotacao_id = v_cot.id) then
      insert into cotacompara.respostas_itens
        (convite_id, item_id, preco_unitario, disponivel, observacao, updated_at)
      values (
        v_conv.id,
        (v_item->>'item_id')::uuid,
        nullif(v_item->>'preco_unitario', '')::numeric,
        coalesce((v_item->>'disponivel')::boolean, true),
        left(v_item->>'observacao', 500),
        now())
      on conflict (convite_id, item_id) do update
        set preco_unitario = excluded.preco_unitario,
            disponivel     = excluded.disponivel,
            observacao     = excluded.observacao,
            updated_at     = now();
      v_qtd := v_qtd + 1;
    end if;
  end loop;

  if v_qtd = 0 then
    raise exception 'SEM_ITENS';
  end if;

  update cotacompara.convites
     set status             = 'respondido',
         respondido_em      = now(),
         prazo_entrega_dias = p_prazo_entrega_dias,
         condicao_pagamento = left(p_condicao_pagamento, 200),
         frete              = p_frete,
         observacao         = left(p_observacao, 1000)
   where id = v_conv.id;

  return jsonb_build_object('ok', true, 'itens', v_qtd);
end $$;

-- Permissões das funções: por padrão ninguém executa; liberamos só o necessário
revoke all on all functions in schema cotacompara from public;
grant execute on function cotacompara.minha_empresa_id() to authenticated;
grant execute on function cotacompara.cotacao_publica(text) to anon, authenticated;
grant execute on function cotacompara.responder_cotacao(text, jsonb, integer, text, numeric, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- REALTIME — painel do comprador atualiza quando o fornecedor responde
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table cotacompara.convites;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table cotacompara.respostas_itens;
  exception when duplicate_object then null;
  end;
end $$;
