/** Painel de ajuda: gaveta no desktop, folha de baixo no celular.
 *
 *  Ordem deliberada e visível: primeiro a ficha oficial da tela (texto humano
 *  já revisado, custo zero), depois — só se o usuário quiser — a pergunta livre
 *  ao assistente, que é a parte paga. */
import { useEffect, useRef, useState } from 'react'
import { HelpCircle, Loader2, Send, X } from 'lucide-react'
import { api } from '../../lib/api'

export interface ContextoAjuda {
  tela?: string
  foco_id?: string
  dt_ini?: string
  dt_fim?: string
}

interface Verbete {
  id: string
  titulo: string
  para_que_serve?: string | null
  como_ler?: string | null
  de_onde_vem?: string | null
  status?: string
}

interface Fonte { id: string; titulo?: string; status?: string }

interface Resposta {
  origem: string
  resposta: string
  citacoes: Fonte[]
  ressalvas: string[]
  sugestoes: { id: string; titulo?: string }[]
  custo_usd?: number
}

/** Negrito simples: o backend devolve **titulo** e o painel mostrava os
 *  asteriscos crus. Nada de biblioteca de markdown para isso. */
function Texto({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="font-display text-ink">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>,
      )}
    </>
  )
}

const SUGESTOES = [
  'O que é ticket médio?',
  'Como foi meu faturamento no período?',
  'Quais clientes estão sumindo?',
  'Quem eu preciso cobrar?',
]

export default function PainelAjuda({ contexto, aberto, aoFechar }: {
  contexto: ContextoAjuda
  aberto: boolean
  aoFechar: () => void
}) {
  const [verbete, setVerbete] = useState<Verbete | null>(null)
  const [pergunta, setPergunta] = useState('')
  const [conversa, setConversa] = useState<{ eu?: string; ia?: Resposta }[]>([])
  const [carregando, setCarregando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto || !contexto.foco_id) return setVerbete(null)
    api<Verbete>(`/api/ajuda/verbete?id=${contexto.foco_id}`)
      .then(setVerbete)
      .catch(() => setVerbete(null))
  }, [aberto, contexto.foco_id])

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversa, carregando])

  async function enviar(texto: string) {
    const q = texto.trim()
    if (!q || carregando) return
    setPergunta('')
    setConversa((c) => [...c, { eu: q }])
    setCarregando(true)
    try {
      const r = await api<Resposta>('/api/ajuda/perguntar', {
        method: 'POST',
        body: JSON.stringify({ pergunta: q, contexto }),
      })
      setConversa((c) => [...c, { ia: r }])
    } catch (e) {
      setConversa((c) => [...c, { ia: {
        origem: 'recusa', citacoes: [], ressalvas: [], sugestoes: [],
        resposta: `Não consegui responder agora. ${(e as Error).message ?? ''}`,
      } }])
    } finally {
      setCarregando(false)
    }
  }

  if (!aberto) return null

  return (
    <>
      <div className="fixed inset-0 bg-ink/20 z-40" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-label="Ajuda do BI"
        className="fixed z-50 bg-surface border-line flex flex-col
                   inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t
                   sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} className="text-primary" />
            <h2 className="font-display font-semibold text-ink">Ajuda</h2>
          </div>
          <button onClick={aoFechar} aria-label="Fechar ajuda" className="text-muted hover:text-ink p-1">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {/* ficha oficial da tela — texto humano, sem custo */}
          {verbete && (
            <section className="tile p-3">
              <p className="label-caps mb-1">Sobre este número</p>
              <h3 className="font-display font-semibold text-ink leading-snug">{verbete.titulo}</h3>
              {verbete.status && verbete.status !== 'validado' && (
                <p className="text-xs mt-1" style={{ color: '#9a6a00' }}>
                  Ainda não conferido contra o banco — use como direção.
                </p>
              )}
              {[verbete.para_que_serve, verbete.como_ler, verbete.de_onde_vem]
                .filter(Boolean)
                .map((t, i) => (
                  <p key={i} className="text-sm text-ink-soft mt-2 leading-relaxed">{t}</p>
                ))}
            </section>
          )}

          {conversa.length === 0 && (
            <div>
              <p className="text-muted text-sm mb-2">Pergunte em português comum:</p>
              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-xs border border-line rounded-sm px-2.5 py-1.5 text-ink-soft hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {conversa.map((t, i) => (
            <div key={i}>
              {t.eu && (
                <p className="text-sm text-ink bg-primary-wash rounded-sm px-3 py-2 ml-6">{t.eu}</p>
              )}
              {t.ia && (
                <div className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
                  <Texto>{t.ia.resposta}</Texto>
                  {t.ia.ressalvas.map((r) => (
                    <p key={r} className="text-xs mt-2" style={{ color: '#9a6a00' }}>{r}</p>
                  ))}
                  {/* de onde veio o número: o assistente nunca responde sem fonte */}
                  {t.ia.citacoes.length > 0 && (
                    <p className="text-[11px] text-muted mt-2 font-mono">
                      fonte: {t.ia.citacoes.map((c) => c.titulo ?? c.id).join(' · ')}
                    </p>
                  )}
                  {t.ia.sugestoes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {t.ia.sugestoes.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => enviar(`O que é ${s.titulo ?? s.id}?`)}
                          className="text-[11px] border border-line rounded-sm px-2 py-1 text-muted hover:border-primary hover:text-primary text-left"
                        >
                          {s.titulo ?? s.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {carregando && (
            <p className="text-muted text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> consultando o sistema…
            </p>
          )}
          <div ref={fim} />
        </div>

        <form
          className="border-t border-line p-3 flex gap-2 shrink-0"
          onSubmit={(e) => { e.preventDefault(); enviar(pergunta) }}
        >
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            maxLength={500}
            placeholder="Escreva sua pergunta…"
            className="flex-1 bg-transparent border border-line rounded-sm px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary outline-none"
          />
          <button
            type="submit"
            disabled={carregando || !pergunta.trim()}
            aria-label="Enviar pergunta"
            className="px-3 rounded-sm bg-primary text-floor disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      </aside>
    </>
  )
}
