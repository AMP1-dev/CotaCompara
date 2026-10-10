# CotaCompara — Fase 1 (Base)

Plataforma de cotação de preços: o comprador monta a cotação, os fornecedores
recebem um link por e-mail e preenchem só o preço, sem login.

**Stack:** React + Vite (Vercel) · Supabase (Auth, Postgres, RLS, Realtime) · Resend (e-mail, fase 4)
**Domínio:** https://cotacompara.amp.ia.br

---

## O que tem na fase 1

- Schema completo do banco (todas as tabelas das fases 1 a 5) com RLS
- Funções públicas do fornecedor (`cotacao_publica` e `responder_cotacao`), já prontas para a fase 3
- Cadastro, login, esqueci/nova senha
- Empresa criada automaticamente no cadastro (gatilho no banco)
- Painel com contadores ao vivo (Realtime)
- Tela "Minha empresa" (dados que o fornecedor vê)
- Layout estilo Mercado Livre, responsivo

---

## 1. Supabase (projeto compartilhado "Fixos")

O CotaCompara roda no mesmo projeto Supabase de outros apps AMP, isolado no
schema **`cotacompara`**. Nada do schema `public` (drywall etc.) é tocado.

1. **SQL Editor → New query** → cole o conteúdo de `supabase/01_schema.sql` → **Run**.
2. **Project Settings → Data API → Exposed schemas** → adicione `cotacompara` → Save.
   (Sem isso o app recebe erro "schema must be one of the following".)
3. **Authentication → URL Configuration**
   - **Não mude o Site URL** (é dos outros apps do projeto).
   - Em **Redirect URLs**, adicione:
     - `https://cotacompara.amp.ia.br/**`
     - `http://localhost:5173/**`
4. **Project Settings → API**: copie a `Project URL` e a `anon public key`
   (são as mesmas do projeto — cada app usa as mesmas chaves).

### Login compartilhado entre apps AMP

- Os usuários ficam em `auth.users`, que é um só por projeto.
- O cadastro feito pelo CotaCompara envia `app: 'cotacompara'`; só esse cadastro cria empresa.
- Quem já tem conta em outro app (ex.: marketplace) entra com o mesmo e-mail e senha
  e cai na tela **/ativar**, que só pede o nome da empresa.
- O gatilho do banco tem nome exclusivo (`cotacompara_on_auth_user_created`),
  então não substitui gatilhos de outros apps.

> Confirmação de e-mail e modelos de e-mail são do projeto inteiro (valem para todos os apps).
> Enquanto o Resend não estiver configurado, o Supabase limita a poucos e-mails por hora.

## 2. Rodar local (Windows)

```bash
npm install
copy .env.example .env.local
# edite .env.local com a URL e a anon key do Supabase
npm run dev
```

Abre em http://localhost:5173

## 3. Vercel

1. Suba a pasta para um repositório no GitHub (`cotacompara`).
2. Vercel → **Add New → Project** → importe o repositório (framework: Vite, detecta sozinho).
3. **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` = `https://cotacompara.amp.ia.br`
4. Deploy.
5. **Settings → Domains** → adicione `cotacompara.amp.ia.br`.

O `vercel.json` já cuida das rotas (atualizar a página em `/painel` ou abrir `/r/token` não dá 404).

## 4. DNS (no seu servidor DNS do amp.ia.br)

| Tipo  | Nome          | Valor                  |
|-------|---------------|------------------------|
| CNAME | `cotacompara` | `cname.vercel-dns.com` |

Confira na tela de Domains da Vercel se ela pede exatamente esse valor; às vezes
ela mostra um CNAME específico do projeto, e aí vale o que ela mostrar.

**Não precisa mexer no Caddyfile da VPS**: o site roda na Vercel, então o
`cotacompara` aponta direto pra lá e não passa pelo Caddy que serve os outros sites.

## 5. Resend (pode adiantar agora, usado na fase 4)

1. Crie conta em resend.com → **Domains → Add domain** → `cotacompara.amp.ia.br`
   (usar o subdomínio isola a reputação do envio do seu e-mail principal).
2. O Resend vai mostrar registros **MX, TXT (SPF) e TXT (DKIM)** para cadastrar no seu DNS.
   Copie exatamente o que ele mostrar.
3. Adicione também um DMARC:
   `TXT  _dmarc.cotacompara  "v=DMARC1; p=none; rua=mailto:suporte@amp.ia.br"`
4. Bônus: no Supabase, **Project Settings → Authentication → SMTP Settings**,
   use o SMTP do Resend (`smtp.resend.com`, porta 465, usuário `resend`, senha = API key).
   Assim os e-mails de confirmação/recuperação de senha também saem pelo seu domínio,
   sem o limite do Supabase.

---

## Tipografia (padrão AMP)

| Uso | Fonte | Variável CSS |
|---|---|---|
| Interface inteira (textos, botões, formulários, menus) | Plus Jakarta Sans 300–800 | `--fonte` |
| Títulos (h1/h2), logo, números de destaque | Outfit 300–900 | `--fonte-destaque` |
| Badges, status, nº de cotação, tags técnicas | ui-monospace / Consolas | `--fonte-mono` (`.badge`, `.mono`) |
| Tabelas de preços / mapa de cotação | Roboto 400/500/700 | `--fonte-tabela` (`.tabela`) |

Fallback: `"Plus Jakarta Sans", "Outfit", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

---

## Estrutura

```
supabase/01_schema.sql      banco completo + RLS + funções
src/
  lib/supabase.js           cliente + tradução de erros
  contexts/AuthContext.jsx  sessão + empresa do usuário
  components/               Header, Layout, Logo, RotaProtegida...
  pages/                    Entrar, Cadastro, EsqueciSenha, NovaSenha,
                            Painel, MinhaEmpresa, EmBreve, ResponderCotacao
```

## Próximas fases

2. Fornecedores (CRUD) + criar cotação (itens, quantidades, prazo)
3. Tela pública do fornecedor `/r/:token`
4. Disparo de e-mail via Resend (Edge Function) + status enviado/aberto/respondido
5. Mapa de cotação, menor preço por item/total, dashboard, export
