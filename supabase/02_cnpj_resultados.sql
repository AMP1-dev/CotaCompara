-- =====================================================================
-- CotaCompara — Migração 02: dados de CNPJ + resultados das cotações
-- Rodar DEPOIS do 01_schema.sql. Pode rodar mais de uma vez sem problema.
-- SQL Editor > New query > colar > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novos campos (preenchidos pela consulta de CNPJ)
-- ---------------------------------------------------------------------
alter table cotacompara.empresas
  add column if not exists razao_social   text,
  add column if not exists nome_fantasia  text,
  add column if not exists situacao_cnpj  text,
  add column if not exists cep            text,
  add column if not exists endereco       text,
  add column if not exists email_contato  text;

alter table cotacompara.fornecedores
  add column if not exists cnpj           text,
  add column if not exists razao_social   text,
  add column if not exists situacao_cnpj  text,
  add column if not exists cidade         text,
  add column if not exists uf             char(2);

-- ---------------------------------------------------------------------
-- 2. Gatilho de cadastro: agora grava também os dados vindos do CNPJ
--    (continua só para quem se cadastra pelo CotaCompara: app = 'cotacompara')
-- ---------------------------------------------------------------------
create or replace function cotacompara.handle_new_user()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce(m->>'app', '') = 'cotacompara' then
    insert into cotacompara.empresas
      (owner_id, nome, responsavel, telefone, cnpj, razao_social, nome_fantasia,
       situacao_cnpj, cidade, uf, cep, endereco, email_contato)
    values (
      new.id,
      coalesce(nullif(m->>'empresa', ''), 'Minha empresa'),
      nullif(m->>'responsavel', ''),
      nullif(m->>'telefone', ''),
      nullif(m->>'cnpj', ''),
      nullif(m->>'razao_social', ''),
      nullif(m->>'nome_fantasia', ''),
      nullif(m->>'situacao_cnpj', ''),
      nullif(m->>'cidade', ''),
      nullif(left(m->>'uf', 2), ''),
      nullif(m->>'cep', ''),
      nullif(m->>'endereco', ''),
      nullif(m->>'email_contato', '')
    )
    on conflict (owner_id) do nothing;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Tela do fornecedor passa a mostrar CNPJ e razão social de quem cota
-- ---------------------------------------------------------------------
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
      'nome', v_emp.nome, 'razao_social', v_emp.razao_social, 'cnpj', v_emp.cnpj,
      'cidade', v_emp.cidade, 'uf', v_emp.uf,
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

revoke all on function cotacompara.cotacao_publica(text) from public;
grant execute on function cotacompara.cotacao_publica(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. View de propostas: total de cada fornecedor que respondeu
--    security_invoker = o RLS das tabelas vale aqui também
--    (cada empresa só vê as próprias propostas)
-- ---------------------------------------------------------------------
create or replace view cotacompara.v_propostas
with (security_invoker = true) as
select
  v.id                  as convite_id,
  v.cotacao_id,
  v.fornecedor_id,
  f.nome                as fornecedor_nome,
  v.respondido_em,
  v.prazo_entrega_dias,
  v.condicao_pagamento,
  v.frete,
  count(i.id)::int      as total_itens,
  (count(r.id) filter (where r.disponivel and r.preco_unitario is not null))::int as itens_cotados,
  coalesce(sum(r.preco_unitario * i.quantidade)
           filter (where r.disponivel and r.preco_unitario is not null), 0)
    + coalesce(v.frete, 0) as total
from cotacompara.convites v
join cotacompara.fornecedores  f on f.id = v.fornecedor_id
join cotacompara.cotacao_itens i on i.cotacao_id = v.cotacao_id
left join cotacompara.respostas_itens r on r.convite_id = v.id and r.item_id = i.id
where v.status = 'respondido'
group by v.id, f.id;

grant select on cotacompara.v_propostas to authenticated;
