-- =====================================================================
-- CotaCompara — Migração 04: controle de envio por e-mail
-- Rodar DEPOIS do 01, 02 e 03. Pode rodar mais de uma vez.
-- =====================================================================
alter table cotacompara.convites
  add column if not exists envios     integer not null default 0,  -- quantas vezes o e-mail foi enviado
  add column if not exists erro_envio text;                        -- último erro de envio (se houver)
