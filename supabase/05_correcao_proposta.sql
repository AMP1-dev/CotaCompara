-- =====================================================================
-- CotaCompara — Migração 05: proposta travada + correção liberada pelo comprador
-- Rodar DEPOIS do 01 a 04. Pode rodar mais de uma vez.
--
-- Regras:
--  - Depois que o fornecedor envia, ele NÃO pode reenviar sozinho.
--  - Só o comprador libera uma correção (convites.pode_corrigir = true).
--  - Na correção, o preço anterior fica guardado em preco_original (não editável)
--    e corrigido_em marca quando mudou. Vale a primeira versão como "original".
-- =====================================================================

alter table cotacompara.convites
  add column if not exists pode_corrigir        boolean not null default false,
  add column if not exists revisao              integer not null default 0,
  add column if not exists correcao_liberada_em timestamptz;

alter table cotacompara.respostas_itens
  add column if not exists preco_original      numeric(14,4),
  add column if not exists disponivel_original boolean,
  add column if not exists corrigido_em        timestamptz;

-- Comprador não pode mexer nos preços: a tabela de respostas segue só leitura
-- para ele (policy de select do 01). Só a função abaixo grava.

-- ---------------------------------------------------------------------
-- Tela pública do fornecedor
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
  v_aberta boolean;
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

  v_aberta := v_cot.status = 'enviada'
            and (v_cot.prazo_resposta is null or v_cot.prazo_resposta > now());
  -- já respondeu: só pode enviar de novo se o comprador liberou a correção
  v_pode := v_aberta and (v_conv.respondido_em is null or v_conv.pode_corrigir);

  return jsonb_build_object(
    'pode_responder', v_pode,
    'status_cotacao', v_cot.status,
    'ja_respondido',  v_conv.respondido_em is not null,
    'respondido_em',  v_conv.respondido_em,
    'pode_corrigir',  v_conv.pode_corrigir,
    'cotacao_aberta', v_aberta,
    'revisao',        v_conv.revisao,
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
               'preco_original', r.preco_original,
               'corrigido_em',   r.corrigido_em,
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
-- Gravação da proposta (primeira vez ou correção liberada)
-- ---------------------------------------------------------------------
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
  v_conv     cotacompara.convites;
  v_cot      cotacompara.cotacoes;
  v_item     jsonb;
  v_qtd      integer := 0;
  v_correcao boolean;
  v_preco    numeric;
  v_disp     boolean;
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

  v_correcao := v_conv.respondido_em is not null;
  if v_correcao and not v_conv.pode_corrigir then
    raise exception 'JA_RESPONDIDO';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    if exists (select 1 from cotacompara.cotacao_itens
                where id = (v_item->>'item_id')::uuid and cotacao_id = v_cot.id) then
      v_preco := nullif(v_item->>'preco_unitario', '')::numeric;
      v_disp  := coalesce((v_item->>'disponivel')::boolean, true);

      insert into cotacompara.respostas_itens
        (convite_id, item_id, preco_unitario, disponivel, observacao, updated_at)
      values (v_conv.id, (v_item->>'item_id')::uuid, v_preco, v_disp,
              left(v_item->>'observacao', 500), now())
      on conflict (convite_id, item_id) do update
        set -- guarda a 1ª versão quando o preço/disponibilidade muda (nunca sobrescreve o original)
            preco_original = case
              when respostas_itens.preco_unitario is distinct from excluded.preco_unitario
                or respostas_itens.disponivel is distinct from excluded.disponivel
              then coalesce(respostas_itens.preco_original, respostas_itens.preco_unitario)
              else respostas_itens.preco_original end,
            disponivel_original = case
              when respostas_itens.preco_unitario is distinct from excluded.preco_unitario
                or respostas_itens.disponivel is distinct from excluded.disponivel
              then coalesce(respostas_itens.disponivel_original, respostas_itens.disponivel)
              else respostas_itens.disponivel_original end,
            corrigido_em = case
              when respostas_itens.preco_unitario is distinct from excluded.preco_unitario
                or respostas_itens.disponivel is distinct from excluded.disponivel
              then now() else respostas_itens.corrigido_em end,
            preco_unitario = excluded.preco_unitario,
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
         pode_corrigir      = false,                       -- trava de novo
         revisao            = case when v_correcao then revisao + 1 else revisao end,
         prazo_entrega_dias = p_prazo_entrega_dias,
         condicao_pagamento = left(p_condicao_pagamento, 200),
         frete              = p_frete,
         observacao         = left(p_observacao, 1000)
   where id = v_conv.id;

  return jsonb_build_object('ok', true, 'itens', v_qtd, 'correcao', v_correcao);
end $$;

revoke all on function cotacompara.responder_cotacao(text, jsonb, integer, text, numeric, text) from public;
grant execute on function cotacompara.responder_cotacao(text, jsonb, integer, text, numeric, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- View de propostas com a revisão (para marcar "corrigida" no mapa)
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
    + coalesce(v.frete, 0) as total,
  v.revisao
from cotacompara.convites v
join cotacompara.fornecedores  f on f.id = v.fornecedor_id
join cotacompara.cotacao_itens i on i.cotacao_id = v.cotacao_id
left join cotacompara.respostas_itens r on r.convite_id = v.id and r.item_id = i.id
where v.status = 'respondido'
group by v.id, f.id;

grant select on cotacompara.v_propostas to authenticated;
