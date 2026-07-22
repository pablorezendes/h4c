import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react'
import { ErroApi, api, setToken } from '../lib/api'
import { aplicarSessao, type Sessao } from '../lib/sessao'

/**
 * Entrada do BI.
 *
 * ★ O CAMPO É "USUÁRIO", NÃO E-MAIL. A identidade vem do WinThor e o login é o
 *   `PCEMPR.USUARIOBD` (ADRIEL, MARCELO.CURADO, THALLYA.GARCIA, 8888). Pedir e-mail
 *   deixaria 26 dos 28 funcionários de fora: só 2 têm e-mail cadastrado no ERP. O
 *   backend aceita os dois, e o e-mail continua servindo para a conta de emergência
 *   do .env — por isso o campo não é `type="email"`, que barraria "MARCELO.CURADO"
 *   na validação do próprio navegador.
 *
 * ★ A SENHA É DO BI, NÃO DO WINTHOR. Nenhuma senha do ERP é lida, copiada ou
 *   trafegada aqui — ver o cabeçalho de backend/app/auth.py.
 */

/** Corpo de POST /api/auth/login. */
interface RespostaLogin {
  access_token: string
  token_type: string
  usuario: Sessao
}

/** Quantos minutos o backend disse que falta no bloqueio ("... em 5 minuto(s)"). */
function minutosDoBloqueio(detalhe: string): number {
  const achado = /(\d+)\s*minuto/i.exec(detalhe)
  return achado ? Number(achado[1]) : 1
}

function relogio(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  /** Instante (epoch ms) em que o bloqueio por tentativas acaba. */
  const [bloqueadoAte, setBloqueadoAte] = useState<number | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const navigate = useNavigate()
  const { state } = useLocation()

  // recado de quem chegou aqui de propósito — hoje, a troca de senha, que invalida
  // o token atual e obriga a entrar de novo
  const aviso = (state as { aviso?: string } | null)?.aviso ?? null

  const faltam = bloqueadoAte ? Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000)) : 0
  const bloqueado = faltam > 0

  // o relógio só corre enquanto há bloqueio: um setInterval permanente na tela de
  // login repinta o formulário uma vez por segundo à toa
  useEffect(() => {
    if (!bloqueadoAte) return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bloqueadoAte])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (bloqueado) return
    setErro(null)
    setCarregando(true)
    try {
      const r = await api<RespostaLogin>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: usuario.trim(), senha }),
      })
      setToken(r.access_token)
      // o próprio login já devolve quem é a pessoa e o que ela pode ver: aproveitamos
      // em vez de pedir /api/auth/eu de novo na primeira tela
      aplicarSessao(r.usuario)
      setBloqueadoAte(null)
      navigate(r.usuario.deve_trocar_senha ? '/trocar-senha' : '/', { replace: true })
    } catch (e) {
      if (e instanceof ErroApi && e.status === 423) {
        // 423 é o ÚNICO erro que distingue uma conta existente, e é assim por
        // decisão de contrato: quem chegou aqui já errou 5 vezes naquele login e,
        // sem o aviso, fica tentando e culpando o BI
        setBloqueadoAte(Date.now() + minutosDoBloqueio(e.detalhe) * 60_000)
        setAgora(Date.now())
        setErro(e.detalhe)
      } else if (e instanceof ErroApi && e.status === 401) {
        // ★ MENSAGEM ÚNICA. Usuário inexistente, senha errada, conta desativada e
        // desligado no ERP dizem exatamente isto. Diferenciar entregaria a lista de
        // quem trabalha na empresa a quem tentar adivinhar.
        setErro('Usuário ou senha inválidos.')
      } else {
        const msg = e instanceof ErroApi ? e.detalhe || e.message : String((e as Error)?.message ?? e)
        setErro(msg)
      }
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="tile w-full max-w-md p-10">
        <div className="flex flex-col items-center gap-5 mb-10">
          <img src="/marca/logo-h4c.png" alt="H4C Distribuição" className="h-12 w-auto" draggable={false} />
          <div className="text-center">
            <p className="label-caps">Business Intelligence</p>
            <p className="text-muted mt-2">Entre com o seu usuário do Winthor.</p>
          </div>
        </div>

        {aviso && (
          <p className="text-sm text-primary border border-line rounded-sm px-3 py-2.5 mb-6" role="status">
            {aviso}
          </p>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="label-caps">Usuário</span>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} />
              <input
                type="text"
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="MARCELO.CURADO"
                className="input-dark w-full py-3.5 pl-11 pr-4 text-sm"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <span className="text-muted text-xs">
              O mesmo usuário que você digita no Winthor. A senha, não: a do BI é separada.
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="label-caps">Senha</span>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} />
              <input
                type={verSenha ? 'text' : 'password'}
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••••••"
                className="input-dark w-full py-3.5 pl-11 pr-11 text-sm"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
              >
                {verSenha ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </div>
          </label>

          {erro && (
            <p className="text-danger text-sm" role="alert">
              {erro}
              {bloqueado && (
                <>
                  {' '}
                  <span className="font-mono">{relogio(faltam)}</span>
                </>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando || bloqueado}
            className="btn-primary flex items-center justify-center gap-2 py-3.5 text-sm font-medium uppercase disabled:opacity-60"
          >
            <LogIn className="w-4 h-4" strokeWidth={1.5} />
            {bloqueado ? `Aguarde ${relogio(faltam)}` : carregando ? 'Autenticando…' : 'Entrar'}
          </button>
        </form>
      </div>

      <p className="text-muted text-sm mt-8">
        H4C Distribuição · dados do <span className="font-mono">Winthor</span>
      </p>
    </div>
  )
}
