import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { api, setToken } from '../lib/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      const r = await api<{ access_token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: senha }),
      })
      setToken(r.access_token)
      navigate('/')
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      setErro(msg.includes('401') || msg.includes('Sessão') ? 'E-mail ou senha incorretos' : `Falha ao conectar na API: ${msg}`)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="tile w-full max-w-md p-10">
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="w-16 h-16 rounded flex items-center justify-center font-display font-bold text-2xl text-white bg-primary">
            h4c
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-ink">h4c BI</h1>
            <p className="text-muted mt-2">Bem-vindo de volta.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="label-caps">E-mail</span>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" strokeWidth={1.5} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@h4c.sys"
                className="input-dark w-full py-3.5 pl-11 pr-4 text-sm"
                autoComplete="username"
              />
            </div>
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
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="btn-primary flex items-center justify-center gap-2 py-3.5 text-sm font-medium uppercase disabled:opacity-60"
          >
            <LogIn className="w-4 h-4" strokeWidth={1.5} />
            {carregando ? 'Autenticando…' : 'Entrar'}
          </button>
        </form>
      </div>

      <p className="text-muted text-sm mt-8">
        Hygiene For Care · BI operacional <span className="font-mono">Winthor</span>
      </p>
    </div>
  )
}
