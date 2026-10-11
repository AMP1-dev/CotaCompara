// Vercel Function: POST /api/enviar-convites
// Envia por e-mail (Resend) o link de resposta para os fornecedores de uma cotação.
//
// Segurança: usa o token do usuário logado, então o RLS do Supabase garante que
// ele só lê/atualiza cotações da própria empresa. A chave do Resend fica só aqui
// no servidor (variável RESEND_API_KEY na Vercel), nunca vai para o navegador.
//
// Corpo: { cotacao_id: uuid, convite_ids?: uuid[], reenvio?: boolean }
//  - sem convite_ids: envia para todos que ainda não receberam (status "pendente")
//  - com convite_ids: envia/reenvia só para esses

import { createClient } from '@supabase/supabase-js'
import { montarEmailCotacao, numeroCotacao } from './_lib/emailCotacao.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const RESEND_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'CotaCompara <cotacao@amp.adm.br>'
const APP_URL = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://cotacompara.amp.ia.br').replace(/\/$/, '')
const MAX_POR_ENVIO = 50

const responder = (res, status, corpo) => res.status(status).json(corpo)

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST.' })
  if (!SUPABASE_URL || !SUPABASE_ANON) return responder(res, 500, { erro: 'Supabase não configurado no servidor.' })
  if (!RESEND_KEY) return responder(res, 500, { erro: 'RESEND_API_KEY não configurada na Vercel.' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return responder(res, 401, { erro: 'Faça login novamente.' })

  let corpo = req.body
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo) } catch { corpo = {} } }
  const { cotacao_id, convite_ids, reenvio = false, tipo = 'convite' } = corpo || {}
  if (!cotacao_id) return responder(res, 400, { erro: 'cotacao_id é obrigatório.' })

  // cliente "como o usuário": todas as consultas passam pelo RLS
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    db: { schema: 'cotacompara' },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return responder(res, 401, { erro: 'Sessão expirada. Entre novamente.' })
  const usuario = userData.user

  const { data: cotacao } = await sb
    .from('cotacoes')
    .select('id, numero, titulo, observacoes, prazo_resposta, status, empresa_id, cotacao_itens(produto, unidade, quantidade, observacao, ordem)')
    .eq('id', cotacao_id)
    .maybeSingle()
  if (!cotacao) return responder(res, 404, { erro: 'Cotação não encontrada.' })
  if (cotacao.status !== 'enviada')
    return responder(res, 400, { erro: 'Libere a cotação para respostas antes de enviar os e-mails.' })
  if (cotacao.prazo_resposta && new Date(cotacao.prazo_resposta) < new Date())
    return responder(res, 400, { erro: 'O prazo de resposta já passou. Edite a cotação e ajuste o prazo.' })

  const { data: empresa } = await sb.from('empresas').select('*').eq('id', cotacao.empresa_id).maybeSingle()
  if (!empresa) return responder(res, 404, { erro: 'Empresa não encontrada.' })
  if (empresa.bloqueado) return responder(res, 403, { erro: 'Conta suspensa. Fale com o suporte.' })

  let consulta = sb
    .from('convites')
    .select('id, token, status, envios, pode_corrigir, fornecedor:fornecedores(nome, contato, email)')
    .eq('cotacao_id', cotacao_id)
  if (Array.isArray(convite_ids) && convite_ids.length) consulta = consulta.in('id', convite_ids)
  else consulta = consulta.eq('status', 'pendente')
  const { data: convites, error: convErr } = await consulta
  if (convErr) return responder(res, 500, { erro: 'Erro ao ler fornecedores: ' + convErr.message })

  // quem já respondeu só recebe de novo se o comprador liberou correção
  const alvo = (convites || [])
    .filter((c) => c.fornecedor?.email && (c.status !== 'respondido' || c.pode_corrigir))
    .slice(0, MAX_POR_ENVIO)
  if (!alvo.length) return responder(res, 200, { enviados: 0, erros: [], aviso: 'Nenhum fornecedor pendente de envio.' })

  const itens = [...(cotacao.cotacao_itens || [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const replyTo = empresa.email_contato || usuario.email

  const mensagens = alvo.map((c) => {
    const { assunto, html, texto } = montarEmailCotacao({
      empresa, cotacao, itens, fornecedor: c.fornecedor,
      link: `${APP_URL}/r/${c.token}`,
      reenvio: reenvio || c.envios > 0,
      tipo: c.pode_corrigir ? 'correcao' : tipo,
    })
    return {
      from: EMAIL_FROM,
      to: [c.fornecedor.email],
      reply_to: replyTo,
      subject: assunto,
      html,
      text: texto,
      tags: [{ name: 'app', value: 'cotacompara' }, { name: 'cotacao', value: String(cotacao.numero) }],
    }
  })

  // Um único pedido ao Resend (o plano grátis limita a 2 requisições por segundo)
  console.log(`[enviar-convites] usuario=${usuario.email} cotacao=${numeroCotacao(cotacao.numero)} destinatarios=${alvo.length} tipo=${tipo}`)

  let resultado
  try {
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mensagens),
    })
    resultado = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = resultado?.message || resultado?.error || `Resend respondeu ${r.status}`
      console.error(`[enviar-convites] ERRO Resend ${r.status}: ${msg}`)
      await Promise.all(alvo.map((c) => sb.from('convites').update({ erro_envio: String(msg).slice(0, 300) }).eq('id', c.id)))
      return responder(res, 502, { erro: 'Falha no envio: ' + msg })
    }
  } catch (e) {
    return responder(res, 502, { erro: 'Não foi possível falar com o serviço de e-mail: ' + e.message })
  }

  console.log(`[enviar-convites] OK ${alvo.length} e-mail(s) aceitos pelo Resend`)
  const agora = new Date().toISOString()
  await Promise.all(alvo.map((c) => sb.from('convites').update({
    status: ['pendente', 'enviado'].includes(c.status) ? 'enviado' : c.status, // não rebaixa "aberto"/"respondido"
    enviado_em: agora,
    envios: (c.envios || 0) + 1,
    erro_envio: null,
  }).eq('id', c.id)))

  return responder(res, 200, {
    enviados: alvo.length,
    ids: (resultado?.data || []).map((d) => d.id),
    cotacao: numeroCotacao(cotacao.numero),
    ignorados: (convites || []).length - alvo.length,
  })
}
