-- =====================================================================
-- CotaCompara · Fase 5 · ORÇAMENTO RÁPIDO (o fornecedor responde pedidos
-- que chegaram por WhatsApp, PDF, foto ou planilha — fora do CotaCompara)
--
-- Rode no SQL Editor do Supabase (projeto compartilhado AMP), DEPOIS dos
-- arquivos 01 a 05. Pode rodar de novo sem problema.
-- Só mexe no schema "cotacompara".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Padrões do orçamento da empresa (validade, prazo, pagamento...)
-- ---------------------------------------------------------------------
alter table cotacompara.empresas
  add column if not exists orc_padrao jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------
create table if not exists cotacompara.orcamentos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references cotacompara.empresas(id) on delete cascade,
  numero              integer not null default 0,
  token               text not null unique
                      default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status              text not null default 'rascunho'
                      check (status in ('rascunho','enviado','aprovado','recusado')),
  origem              text not null default 'manual'
                      check (origem in ('manual','texto','pdf','imagem','planilha')),
  -- cliente (quem pediu o orçamento)
  cliente_nome        text,
  cliente_documento   text,
  cliente_whatsapp    text,
  cliente_email       text,
  referencia          text,
  -- condições
  validade_dias       integer not null default 7 check (validade_dias between 1 and 365),
  prazo_entrega       text,
  condicao_pagamento  text,
  frete               numeric(14,2) check (frete >= 0),
  desconto            numeric(14,2) not null default 0 check (desconto >= 0),
  observacoes         text,
  -- material recebido (só para o fornecedor conferir; não aparece para o cliente)
  texto_original      text,
  -- acompanhamento
  enviado_em          timestamptz,
  visualizado_em      timestamptz,
  visualizacoes       integer not null default 0,
  aprovado_em         timestamptz,
  aprovado_por        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cotacompara.orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  orcamento_id    uuid not null references cotacompara.orcamentos(id) on delete cascade,
  ordem           integer not null default 0,
  produto         text not null,
  quantidade      numeric(14,3) not null check (quantidade > 0),
  unidade         text not null default 'UN',
  preco_unitario  numeric(14,4) check (preco_unitario >= 0),
  observacao      text
);

-- Catálogo do fornecedor: aprende com cada orçamento enviado e sugere
-- o nome correto e o último preço na próxima vez
create table if not exists cotacompara.catalogo_produtos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references cotacompara.empresas(id) on delete cascade,
  nome          text not null,
  chave         text not null,            -- nome normalizado (sem acento, minúsculo)
  unidade       text not null default 'UN',
  ultimo_preco  numeric(14,4),
  vezes         integer not null default 1,
  updated_at    timestamptz not null default now(),
  unique (empresa_id, chave)
);

create index if not exists idx_cc_orcamentos_empresa   on cotacompara.orcamentos(empresa_id, created_at desc);
create index if not exists idx_cc_orc_itens_orcamento  on cotacompara.orcamento_itens(orcamento_id);
create index if not exists idx_cc_catalogo_empresa     on cotacompara.catalogo_produtos(empresa_id);

grant select, insert, update, delete on cotacompara.orcamentos, cotacompara.orcamento_itens,
  cotacompara.catalogo_produtos to authenticated;
grant all on cotacompara.orcamentos, cotacompara.orcamento_itens, cotacompara.catalogo_produtos to service_role;

-- ---------------------------------------------------------------------
-- 3. Gatilhos: número sequencial por empresa, updated_at, validações
-- ---------------------------------------------------------------------
create or replace function cotacompara.set_numero_orcamento()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
begin
  if new.numero is null or new.numero = 0 then
    perform pg_advisory_xact_lock(hashtext('cc_orc_' || new.empresa_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero
      from cotacompara.orcamentos where empresa_id = new.empresa_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_orcamentos_numero on cotacompara.orcamentos;
create trigger trg_orcamentos_numero before insert on cotacompara.orcamentos
  for each row execute function cotacompara.set_numero_orcamento();

drop trigger if exists trg_orcamentos_updated on cotacompara.orcamentos;
create trigger trg_orcamentos_updated before update on cotacompara.orcamentos
  for each row execute function cotacompara.set_updated_at();

-- Mesmas regras da cotação: conta bloqueada não usa; CNPJ obrigatório
-- (o orçamento sai com os dados da empresa)
create or replace function cotacompara.valida_empresa_orcamento()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_emp cotacompara.empresas;
begin
  if tg_op = 'UPDATE' and new.empresa_id is not distinct from old.empresa_id then
    if new.token is distinct from old.token or new.numero is distinct from old.numero then
      raise exception 'ACESSO_NEGADO';
    end if;
    return new;
  end if;
  select * into v_emp from cotacompara.empresas where id = new.empresa_id;
  if v_emp.bloqueado then raise exception 'CONTA_BLOQUEADA'; end if;
  if coalesce(trim(v_emp.cnpj), '') = '' then raise exception 'CNPJ_OBRIGATORIO'; end if;
  return new;
end $$;

drop trigger if exists trg_orcamentos_valida on cotacompara.orcamentos;
create trigger trg_orcamentos_valida before insert or update on cotacompara.orcamentos
  for each row execute function cotacompara.valida_empresa_orcamento();

-- ---------------------------------------------------------------------
-- 4. RLS: cada empresa só vê os seus
-- ---------------------------------------------------------------------
alter table cotacompara.orcamentos        enable row level security;
alter table cotacompara.orcamento_itens   enable row level security;
alter table cotacompara.catalogo_produtos enable row level security;

drop policy if exists orcamentos_empresa on cotacompara.orcamentos;
create policy orcamentos_empresa on cotacompara.orcamentos
  for all to authenticated
  using (empresa_id = cotacompara.minha_empresa_id())
  with check (empresa_id = cotacompara.minha_empresa_id());

drop policy if exists orc_itens_empresa on cotacompara.orcamento_itens;
create policy orc_itens_empresa on cotacompara.orcamento_itens
  for all to authenticated
  using (exists (select 1 from cotacompara.orcamentos o
                 where o.id = orcamento_id and o.empresa_id = cotacompara.minha_empresa_id()))
  with check (exists (select 1 from cotacompara.orcamentos o
                      where o.id = orcamento_id and o.empresa_id = cotacompara.minha_empresa_id()));

drop policy if exists catalogo_empresa on cotacompara.catalogo_produtos;
create policy catalogo_empresa on cotacompara.catalogo_produtos
  for all to authenticated
  using (empresa_id = cotacompara.minha_empresa_id())
  with check (empresa_id = cotacompara.minha_empresa_id());

-- ---------------------------------------------------------------------
-- 5. Normalização do nome do produto (igual à do app: src/lib/leitorItens.js)
-- ---------------------------------------------------------------------
create or replace function cotacompara.chave_produto(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- 6. Registrar envio: marca como enviado e alimenta o catálogo
--    (chamado pelo app ao enviar por WhatsApp, e-mail, link ou PDF)
-- ---------------------------------------------------------------------
create or replace function cotacompara.registrar_envio_orcamento(p_id uuid)
returns jsonb language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_orc cotacompara.orcamentos;
  v_n   integer := 0;
begin
  select * into v_orc from cotacompara.orcamentos where id = p_id;
  if v_orc.id is null or v_orc.empresa_id is distinct from cotacompara.minha_empresa_id() then
    raise exception 'ACESSO_NEGADO';
  end if;

  update cotacompara.orcamentos
     set status = case when status = 'rascunho' then 'enviado' else status end,
         enviado_em = coalesce(enviado_em, now())
   where id = p_id;

  insert into cotacompara.catalogo_produtos as c (empresa_id, nome, chave, unidade, ultimo_preco, vezes, updated_at)
  select distinct on (cotacompara.chave_produto(i.produto))
         v_orc.empresa_id, btrim(i.produto), cotacompara.chave_produto(i.produto), i.unidade, i.preco_unitario, 1, now()
    from cotacompara.orcamento_itens i
   where i.orcamento_id = p_id and cotacompara.chave_produto(i.produto) <> ''
   order by cotacompara.chave_produto(i.produto), i.ordem
  on conflict (empresa_id, chave) do update
     set nome = excluded.nome,
         unidade = excluded.unidade,
         ultimo_preco = coalesce(excluded.ultimo_preco, c.ultimo_preco),
         vezes = c.vezes + 1,
         updated_at = now();
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'catalogo', v_n);
end $$;

-- ---------------------------------------------------------------------
-- 7. Página pública do orçamento (link enviado ao cliente, sem login)
-- ---------------------------------------------------------------------
create or replace function cotacompara.orcamento_publico(p_token text)
returns jsonb language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_orc  cotacompara.orcamentos;
  v_emp  cotacompara.empresas;
  v_dono boolean;
  v_sub  numeric := 0;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'LINK_INVALIDO'; end if;
  select * into v_orc from cotacompara.orcamentos where token = p_token;
  if v_orc.id is null then raise exception 'LINK_INVALIDO'; end if;
  select * into v_emp from cotacompara.empresas where id = v_orc.empresa_id;

  -- conta só a visita do cliente (o próprio fornecedor conferindo não conta)
  v_dono := v_emp.owner_id is not distinct from auth.uid();
  if not v_dono then
    update cotacompara.orcamentos
       set visualizacoes = visualizacoes + 1,
           visualizado_em = coalesce(visualizado_em, now())
     where id = v_orc.id;
  end if;

  select coalesce(sum(round(quantidade * preco_unitario, 2)), 0) into v_sub
    from cotacompara.orcamento_itens where orcamento_id = v_orc.id and preco_unitario is not null;

  return jsonb_build_object(
    'empresa', jsonb_build_object(
      'nome', v_emp.nome, 'razao_social', v_emp.razao_social, 'cnpj', v_emp.cnpj,
      'endereco', v_emp.endereco, 'cidade', v_emp.cidade, 'uf', v_emp.uf, 'cep', v_emp.cep,
      'telefone', v_emp.telefone, 'email', v_emp.email_contato, 'responsavel', v_emp.responsavel,
      'logo_url', v_emp.logo_url),
    'orcamento', jsonb_build_object(
      'numero', v_orc.numero, 'status', v_orc.status, 'criado_em', v_orc.created_at,
      'enviado_em', v_orc.enviado_em,
      'valido_ate', (coalesce(v_orc.enviado_em, v_orc.created_at) + make_interval(days => v_orc.validade_dias)),
      'validade_dias', v_orc.validade_dias,
      'cliente_nome', v_orc.cliente_nome, 'cliente_documento', v_orc.cliente_documento,
      'referencia', v_orc.referencia, 'prazo_entrega', v_orc.prazo_entrega,
      'condicao_pagamento', v_orc.condicao_pagamento, 'frete', v_orc.frete, 'desconto', v_orc.desconto,
      'observacoes', v_orc.observacoes, 'aprovado_em', v_orc.aprovado_em, 'aprovado_por', v_orc.aprovado_por,
      'subtotal', v_sub,
      'total', greatest(v_sub - coalesce(v_orc.desconto, 0), 0) + coalesce(v_orc.frete, 0)),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produto', i.produto, 'quantidade', i.quantidade, 'unidade', i.unidade,
               'preco_unitario', i.preco_unitario, 'observacao', i.observacao,
               'subtotal', case when i.preco_unitario is null then null else round(i.quantidade * i.preco_unitario, 2) end)
             order by i.ordem)
        from cotacompara.orcamento_itens i where i.orcamento_id = v_orc.id), '[]'::jsonb),
    'sou_dono', v_dono
  );
end $$;

-- Cliente aprova o orçamento pelo link
create or replace function cotacompara.aprovar_orcamento(p_token text, p_nome text)
returns jsonb language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_orc cotacompara.orcamentos;
begin
  select * into v_orc from cotacompara.orcamentos where token = p_token;
  if v_orc.id is null then raise exception 'LINK_INVALIDO'; end if;
  if v_orc.status = 'aprovado' then return jsonb_build_object('ok', true, 'ja_aprovado', true); end if;
  if v_orc.status not in ('enviado') then raise exception 'ORCAMENTO_INDISPONIVEL'; end if;
  if now() > coalesce(v_orc.enviado_em, v_orc.created_at) + make_interval(days => v_orc.validade_dias) then
    raise exception 'ORCAMENTO_VENCIDO';
  end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'NOME_OBRIGATORIO'; end if;
  update cotacompara.orcamentos
     set status = 'aprovado', aprovado_em = now(), aprovado_por = left(btrim(p_nome), 120)
   where id = v_orc.id;
  return jsonb_build_object('ok', true);
end $$;

-- Permissões das funções
revoke all on function cotacompara.orcamento_publico(text)        from public;
revoke all on function cotacompara.aprovar_orcamento(text, text)  from public;
revoke all on function cotacompara.registrar_envio_orcamento(uuid) from public;
grant execute on function cotacompara.orcamento_publico(text)        to anon, authenticated;
grant execute on function cotacompara.aprovar_orcamento(text, text)  to anon, authenticated;
grant execute on function cotacompara.registrar_envio_orcamento(uuid) to authenticated;
grant execute on function cotacompara.chave_produto(text) to authenticated;

-- tempo real: o fornecedor vê na hora quando o cliente abre/aprova
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'cotacompara' and tablename = 'orcamentos') then
    alter publication supabase_realtime add table cotacompara.orcamentos;
  end if;
end $$;

notify pgrst, 'reload schema';
