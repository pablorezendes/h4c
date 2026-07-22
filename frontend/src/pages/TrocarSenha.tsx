import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, KeyRound, Lock, LogOut, Minus } from 'lucide-react'
import { ErroApi, api, clearToken } from '../lib/api'
import { limparSessao, useSessao } from '../lib/sessao'

/**
 * Troca da própria senha.
 *
 * Obrigatória quando `deve_trocar_senha` é true — a pessoa acabou de receber do
 * administrador uma senha provisória, ditada por telefone ou escrita num bilhete, e
 * não navega para lugar nenhum antes de escolher a dela. Por isso a tela é uma folha
 * solta, SEM o Layout: menu aqui seria oferecer saída que a guarda de rota vai fechar
 * de novo (ver `Protegida` em main.tsx) e o backend recusar de qualquer forma
 * (`permissoes._exigir_troca_de_senha` responde 403 em todo relatório enquanto a senha
 * for a provisória).
 *
 * ★ AS REGRAS APARECEM ANTES DE DIGITAR, não depois de errar. Uma lista que só se
 *   revela em mensagem de erro faz a pessoa adivinhar de tentativa em tentativa — e
 *   quem está trocando senha provisória por telefone com o administrador na linha
 *   desiste na segunda recusa. As marcas verdes acendem conforme se digita.
 *
 * ★ A VALIDAÇÃO DAQUI É CONVENIÊNCIA. Quem decide é `auth.criticar_senha()` no
 *   backend, que ainda recusa senha óbvia de uma lista própria. Duplicar a lista aqui
 *   só criaria duas verdades para divergirem; o 422 do servidor é exibido como veio.
 */
export default function TrocarSenha() {
  const { sessao } = useSessao()
  const navigate = useNavigate()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const obrigatoria = !!sessao?.deve_trocar_senha
  const login = sessao?.login ?? ''
  const nome = sessao?.nome ?? ''
  const baixa = nova.toLowerCase()

  const regras = [
    { ok: nova.length >= 8, texto: 'Pelo menos 8 caracteres' },
    { ok: nova.length > 0 && nova.trim() === nova, texto: 'Sem espaço no começo nem no fim' },
    { ok: new Set(nova).size >= 4, texto: 'Pelo menos 4 caracteres diferentes' },
    {
      ok: nova.length > 0 && baixa !== login.toLowerCase() && baixa !== nome.toLowerCase(),
      texto: 'Diferente do seu usuário e do seu nome',
    },
    { ok: nova.length > 0 && nova !== atual, texto: 'Diferente da senha atual' },
  ]

  const confere = confirmacao.length > 0 && confirmacao === nova
  const podeSalvar = atual.length > 0 && confere && regras.every((r) => r.ok)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await api<void>('/api/auth/trocar-senha', {
        method: 'POST',
        body: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
      })
      // ★ O backend incrementa `token_versao` ao trocar a senha, o que invalida o
      // token que está aqui na mão — inclusive o desta aba. É o comportamento certo
      // (trocar senha por desconfiar de vazamento tem que derrubar quem estava usando
      // a antiga), e cabe à tela sair limpa em vez de esperar o próximo 401.
      clearToken()
      limparSessao()
      navigate('/login', {
        replace: true,
        state: { aviso: 'Senha alterada. Entre de novo com a senha nova.' },
      })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.detalhe || e.message : String((e as Error)?.message ?? e))
    } finally {
      setSalvando(false)
    }
  }

  function sair() {
    clearToken()
    limparSessao()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10">
      <div className="tile w-full max-w-md p-10">
        <div className="flex flex-col items-center gap-5 mb-8">
          <img src="/marca/logo-h4c.png" alt="H4C Distribuição" className="h-12 w-auto" draggable={false} />
          <div className="text-center">
            <p className="label-caps">{obrigatoria ? 'Primeiro acesso' : 'Sua conta'}</p>
            <h1 className="font-display text-2xl font-bold text-ink mt-2">Escolha a sua senha</h1>
            <p className="text-muted text-sm mt-2">
              {obrigatoria
                ? 'A senha que você recebeu é provisória e serve só para chegar até aqui.'
                : 'Trocar a senha encerra as sessões abertas — você vai entrar de novo.'}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="label-caps">{obrigatoria ? 'Senha provisória' : 'Senha atual'}</span>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} />
              <input
                type="password"
                required
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                className="input-dark w-full py-3.5 pl-11 pr-4 text-sm"
                autoComplete="current-password"
              />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="label-caps">Senha nova</span>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} />
              <input
                type="password"
                required
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                className="input-dark w-full py-3.5 pl-11 pr-4 text-sm"
                autoComplete="new-password"
              />
            </div>
          </label>

          <ul className="flex flex-col gap-1.5 -mt-1">
            {regras.map((r) => (
              <li
                key={r.texto}
                className={`flex items-center gap-2 text-xs ${r.ok ? 'text-primary' : 'text-muted'}`}
              >
                {r.ok ? (
                  <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                ) : (
                  <Minus className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                )}
                {r.texto}
              </li>
            ))}
          </ul>

          <label className="flex flex-col gap-2">
            <span className="label-caps">Repita a senha nova</span>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} />
              <input
                type="password"
                required
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className="input-dark w-full py-3.5 pl-11 pr-4 text-sm"
                autoComplete="new-password"
              />
            </div>
            {confirmacao.length > 0 && !confere && (
              <span className="text-danger text-xs">As duas senhas não são iguais.</span>
            )}
          </label>

          {erro && (
            <p className="text-danger text-sm" role="alert">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando || !podeSalvar}
            className="btn-primary flex items-center justify-center gap-2 py-3.5 text-sm font-medium uppercase disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" strokeWidth={1.5} />
            {salvando ? 'Salvando…' : 'Salvar senha'}
          </button>
        </form>

        {/* saída para quem abriu a tela sem querer — e para quem não lembra a
            provisória e vai pedir outra ao administrador */}
        <button
          onClick={sair}
          className="flex items-center gap-2 mx-auto mt-8 text-muted hover:text-ink transition-colors"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          <span className="uppercase tracking-wide text-xs font-semibold">Sair</span>
        </button>
      </div>

      <p className="text-muted text-sm mt-8">
        {sessao ? (
          <>
            Conectado como <span className="font-mono">{sessao.login}</span>
          </>
        ) : (
          'H4C Distribuição'
        )}
      </p>
    </div>
  )
}
