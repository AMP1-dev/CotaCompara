-- =====================================================================
-- CotaCompara · Fase 6 · INTEGRAÇÃO ENTRE USUÁRIOS
--
-- Quando o comprador dispara uma cotação para um fornecedor que JÁ USA o
-- CotaCompara (mesmo CNPJ ou e-mail), o pedido cai direto no painel dele
-- (Orçamentos › Pedidos recebidos), já com os preços do catálogo dele.
-- E o contrário: o orçamento que o fornecedor envia a um cliente que usa o
-- CotaCompara aparece no painel do cliente (Propostas recebidas).
-- Quem não é usuário continua recebendo por e-mail/link, sem login.
--
-- Rode DEPOIS dos arquivos 01 a 06. Pode rodar de novo sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem é usuário? (pelo CNPJ ou pelo e-mail da conta / de contato)
-- ---------------------------------------------------------------------
create or replace function cotacompara.empresa_do_contato(p_email text, p_doc text, p_exceto uuid)
returns uuid language sql stable security definer set search_path = cotacompara, public as $$
  with alvo as (
    select nullif(regexp_replace(coalesce(p_doc, ''), '\D', '', 'g'), '') as doc,
           nullif(lower(btrim(coalesce(p_email, ''))), '') as email
  )
  select e.id
    from cotacompara.empresas e
    left join auth.users u on u.id = e.owner_id
    cross join alvo a
   where e.id is distinct from p_exceto
     and not coalesce(e.bloqueado, false)
     and (
       (length(a.doc) = 14 and regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = a.doc)
       or (a.email is not null and (lower(u.email) = a.email or lower(btrim(e.email_contato)) = a.email))
     )
   order by (length(a.doc) = 14 and regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g') = a.doc) desc, e.created_at
   limit 1
$$;
revoke all on function cotacompara.empresa_do_contato(text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Cotação → fornecedor usuário
-- ---------------------------------------------------------------------
alter table cotacompara.convites
  add column if not exists destino_empresa_id uuid references cotacompara.empresas(id) on delete set null;
create index if not exists idx_cc_convites_destino on cotacompara.convites(destino_empresa_id);

create or replace function cotacompara.convite_destino()
returns trigger language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_forn cotacompara.fornecedores;
  v_comprador uuid;
begin
  if new.destino_empresa_id is null then
    select * into v_forn from cotacompara.fornecedores where id = new.fornecedor_id;
    select empresa_id into v_comprador from cotacompara.cotacoes where id = new.cotacao_id;
    new.destino_empresa_id := cotacompara.empresa_do_contato(v_forn.email, v_forn.cnpj, v_comprador);
  end if;
  return new;
end $$;

drop trigger if exists trg_convites_destino on cotacompara.convites;
create trigger trg_convites_destino before insert or update of status on cotacompara.convites
  for each row execute function cotacompara.convite_destino();

-- convites que já existem
update cotacompara.convites cv
   set destino_empresa_id = cotacompara.empresa_do_contato(f.email, f.cnpj, c.empresa_id)
  from cotacompara.fornecedores f, cotacompara.cotacoes c
 where f.id = cv.fornecedor_id and c.id = cv.cotacao_id and cv.destino_empresa_id is null;

-- Pedidos de cotação que chegaram para a MINHA empresa (lado fornecedor)
create or replace function cotacompara.pedidos_recebidos()
returns jsonb language sql stable security definer set search_path = cotacompara, public as $$
  select coalesce(jsonb_agg(x.j order by x.ordem desc), '[]'::jsonb)
    from (
      select coalesce(cv.enviado_em, c.updated_at, cv.created_at) as ordem,
             jsonb_build_object(
               'token', cv.token,
               'status', cv.status,
               'respondido_em', cv.respondido_em,
               'pode_corrigir', cv.pode_corrigir,
               'recebido_em', coalesce(cv.enviado_em, c.updated_at, cv.created_at),
               'cotacao', jsonb_build_object(
                 'numero', c.numero, 'titulo', c.titulo, 'status', c.status, 'prazo_resposta', c.prazo_resposta,
                 'aberta', c.status = 'enviada' and (c.prazo_resposta is null or c.prazo_resposta > now()),
                 'itens', (select count(*) from cotacompara.cotacao_itens i where i.cotacao_id = c.id)),
               'comprador', jsonb_build_object('nome', e.nome, 'cidade', e.cidade, 'uf', e.uf)
             ) as j
        from cotacompara.convites cv
        join cotacompara.cotacoes c on c.id = cv.cotacao_id
        join cotacompara.empresas e on e.id = c.empresa_id
       where cv.destino_empresa_id = cotacompara.minha_empresa_id()
         and c.status in ('enviada', 'encerrada')
    ) x
$$;

-- ---------------------------------------------------------------------
-- 3. Orçamento → cliente usuário
-- ---------------------------------------------------------------------
alter table cotacompara.orcamentos
  add column if not exists destino_empresa_id uuid references cotacompara.empresas(id) on delete set null;
create index if not exists idx_cc_orcamentos_destino on cotacompara.orcamentos(destino_empresa_id);

-- registrar_envio passa a identificar o cliente na base (e devolve se foi entregue no painel)
create or replace function cotacompara.registrar_envio_orcamento(p_id uuid)
returns jsonb language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_orc     cotacompara.orcamentos;
  v_n       integer := 0;
  v_destino uuid;
begin
  select * into v_orc from cotacompara.orcamentos where id = p_id;
  if v_orc.id is null or v_orc.empresa_id is distinct from cotacompara.minha_empresa_id() then
    raise exception 'ACESSO_NEGADO';
  end if;

  v_destino := cotacompara.empresa_do_contato(v_orc.cliente_email, v_orc.cliente_documento, v_orc.empresa_id);

  update cotacompara.orcamentos
     set status = case when status = 'rascunho' then 'enviado' else status end,
         enviado_em = coalesce(enviado_em, now()),
         destino_empresa_id = v_destino
   where id = p_id;

  insert into cotacompara.catalogo_produtos as c (empresa_id, nome, chave, unidade, ultimo_preco, vezes, updated_at)
  select distinct on (cotacompara.chave_produto(i.produto))
         v_orc.empresa_id, btrim(i.produto), cotacompara.chave_produto(i.produto), i.unidade, i.preco_unitario, 1, now()
    from cotacompara.orcamento_itens i
   where i.orcamento_id = p_id and cotacompara.chave_produto(i.produto) <> ''
   order by cotacompara.chave_produto(i.produto), i.ordem
  on conflict (empresa_id, chave) do update
     set nome = excluded.nome, unidade = excluded.unidade,
         ultimo_preco = coalesce(excluded.ultimo_preco, c.ultimo_preco),
         vezes = c.vezes + 1, updated_at = now();
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'catalogo', v_n, 'no_painel_do_cliente', v_destino is not null);
end $$;

-- Propostas (orçamentos) que chegaram para a MINHA empresa (lado comprador)
create or replace function cotacompara.propostas_recebidas()
returns jsonb language sql stable security definer set search_path = cotacompara, public as $$
  select coalesce(jsonb_agg(x.j order by x.ordem desc), '[]'::jsonb)
    from (
      select o.enviado_em as ordem,
             jsonb_build_object(
               'token', o.token, 'numero', o.numero, 'status', o.status, 'referencia', o.referencia,
               'enviado_em', o.enviado_em,
               'valido_ate', o.enviado_em + make_interval(days => o.validade_dias),
               'itens', (select count(*) from cotacompara.orcamento_itens i where i.orcamento_id = o.id),
               'total', greatest(coalesce((select sum(round(i.quantidade * i.preco_unitario, 2))
                                             from cotacompara.orcamento_itens i
                                            where i.orcamento_id = o.id and i.preco_unitario is not null), 0)
                                 - coalesce(o.desconto, 0), 0) + coalesce(o.frete, 0),
               'fornecedor', jsonb_build_object('nome', e.nome, 'cidade', e.cidade, 'uf', e.uf, 'telefone', e.telefone)
             ) as j
        from cotacompara.orcamentos o
        join cotacompara.empresas e on e.id = o.empresa_id
       where o.destino_empresa_id = cotacompara.minha_empresa_id()
         and o.status in ('enviado', 'aprovado', 'recusado')
    ) x
$$;

-- ---------------------------------------------------------------------
-- 4. Catálogo aprende com a resposta dada pelo painel
--    p_itens: [{ "produto": "...", "unidade": "UN", "preco": 1.2 }]
-- ---------------------------------------------------------------------
create or replace function cotacompara.aprender_catalogo(p_itens jsonb)
returns integer language plpgsql security definer set search_path = cotacompara, public as $$
declare
  v_emp uuid := cotacompara.minha_empresa_id();
  v_n   integer := 0;
begin
  if v_emp is null then raise exception 'ACESSO_NEGADO'; end if;
  insert into cotacompara.catalogo_produtos as c (empresa_id, nome, chave, unidade, ultimo_preco, vezes, updated_at)
  select distinct on (cotacompara.chave_produto(x->>'produto'))
         v_emp, btrim(x->>'produto'), cotacompara.chave_produto(x->>'produto'),
         coalesce(nullif(x->>'unidade', ''), 'UN'), nullif(x->>'preco', '')::numeric, 1, now()
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
   where cotacompara.chave_produto(x->>'produto') <> '' and nullif(x->>'preco', '') is not null
   order by cotacompara.chave_produto(x->>'produto')
  on conflict (empresa_id, chave) do update
     set ultimo_preco = excluded.ultimo_preco, unidade = excluded.unidade, vezes = c.vezes + 1, updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function cotacompara.pedidos_recebidos()       from public, anon;
revoke all on function cotacompara.propostas_recebidas()     from public, anon;
revoke all on function cotacompara.aprender_catalogo(jsonb)  from public, anon;
grant execute on function cotacompara.pedidos_recebidos()       to authenticated;
grant execute on function cotacompara.propostas_recebidas()     to authenticated;
grant execute on function cotacompara.aprender_catalogo(jsonb)  to authenticated;
grant execute on function cotacompara.registrar_envio_orcamento(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Desempenho: políticas de segurança (RLS) calculando "minha empresa"
--    UMA vez por consulta (e não uma vez por linha) — recomendação do Supabase.
--    Mesmas regras de antes, só mais rápidas.
-- ---------------------------------------------------------------------
drop policy if exists empresas_dono on cotacompara.empresas;
create policy empresas_dono on cotacompara.empresas for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists fornecedores_empresa on cotacompara.fornecedores;
create policy fornecedores_empresa on cotacompara.fornecedores for all to authenticated
  using (empresa_id = (select cotacompara.minha_empresa_id()))
  with check (empresa_id = (select cotacompara.minha_empresa_id()));

drop policy if exists cotacoes_empresa on cotacompara.cotacoes;
create policy cotacoes_empresa on cotacompara.cotacoes for all to authenticated
  using (empresa_id = (select cotacompara.minha_empresa_id()))
  with check (empresa_id = (select cotacompara.minha_empresa_id()));

drop policy if exists itens_empresa on cotacompara.cotacao_itens;
create policy itens_empresa on cotacompara.cotacao_itens for all to authenticated
  using (cotacao_id in (select c.id from cotacompara.cotacoes c where c.empresa_id = (select cotacompara.minha_empresa_id())))
  with check (cotacao_id in (select c.id from cotacompara.cotacoes c where c.empresa_id = (select cotacompara.minha_empresa_id())));

drop policy if exists convites_empresa on cotacompara.convites;
create policy convites_empresa on cotacompara.convites for all to authenticated
  using (cotacao_id in (select c.id from cotacompara.cotacoes c where c.empresa_id = (select cotacompara.minha_empresa_id())))
  with check (cotacao_id in (select c.id from cotacompara.cotacoes c where c.empresa_id = (select cotacompara.minha_empresa_id())));

drop policy if exists respostas_leitura on cotacompara.respostas_itens;
create policy respostas_leitura on cotacompara.respostas_itens for select to authenticated
  using (convite_id in (select v.id from cotacompara.convites v join cotacompara.cotacoes c on c.id = v.cotacao_id
                        where c.empresa_id = (select cotacompara.minha_empresa_id())));

drop policy if exists orcamentos_empresa on cotacompara.orcamentos;
create policy orcamentos_empresa on cotacompara.orcamentos for all to authenticated
  using (empresa_id = (select cotacompara.minha_empresa_id()))
  with check (empresa_id = (select cotacompara.minha_empresa_id()));

drop policy if exists orc_itens_empresa on cotacompara.orcamento_itens;
create policy orc_itens_empresa on cotacompara.orcamento_itens for all to authenticated
  using (orcamento_id in (select o.id from cotacompara.orcamentos o where o.empresa_id = (select cotacompara.minha_empresa_id())))
  with check (orcamento_id in (select o.id from cotacompara.orcamentos o where o.empresa_id = (select cotacompara.minha_empresa_id())));

drop policy if exists catalogo_empresa on cotacompara.catalogo_produtos;
create policy catalogo_empresa on cotacompara.catalogo_produtos for all to authenticated
  using (empresa_id = (select cotacompara.minha_empresa_id()))
  with check (empresa_id = (select cotacompara.minha_empresa_id()));

create index if not exists idx_cc_convites_status on cotacompara.convites(status);
create index if not exists idx_cc_cotacoes_empresa_status on cotacompara.cotacoes(empresa_id, status, created_at desc);

notify pgrst, 'reload schema';
