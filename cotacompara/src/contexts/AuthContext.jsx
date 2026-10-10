import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  // id do usuário cuja empresa já foi consultada (evita redirecionar antes da hora)
  const [empresaDe, setEmpresaDe] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const carregarEmpresa = useCallback(async (userId) => {
    if (!userId) { setEmpresa(null); setEmpresaDe(null); return }
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle()
    if (error) console.error('Erro ao carregar empresa:', error)
    setEmpresa(data || null)
    setEmpresaDe(userId)
  }, [])

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return
      setSession(data.session)
      await carregarEmpresa(data.session?.user?.id)
      if (ativo) setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao)
      // evita chamar o supabase dentro do callback (deadlock conhecido)
      setTimeout(() => carregarEmpresa(novaSessao?.user?.id), 0)
    })

    return () => { ativo = false; sub.subscription.unsubscribe() }
  }, [carregarEmpresa])

  const sair = async () => {
    await supabase.auth.signOut()
    setEmpresa(null)
    setEmpresaDe(null)
  }

  const userId = session?.user?.id ?? null

  const valor = {
    session,
    user: session?.user ?? null,
    empresa,
    // true enquanto a empresa do usuário logado ainda não foi consultada
    carregando: carregando || (!!userId && empresaDe !== userId),
    sair,
    recarregarEmpresa: () => carregarEmpresa(userId),
  }

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
