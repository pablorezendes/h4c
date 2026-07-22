import { useState } from 'react'
import { BellOff, ChevronDown, ChevronRight, PencilLine } from 'lucide-react'
import { dataBr, moeda, numero, plural } from './formato'

/**
 * Churn: risco de abandono e cliente perdido, em lista ACIONÁVEL (§9).
 *
 * Regra: perdido quando os dias sem compra passam de MIN(30; 2,0 × ciclo médio);
 * risco a partir de 1,6 × ciclo. Um cliente de ciclo curto vira risco no dia 8 e
 * perdido no dia 10 — muito antes do teto de 30. Por isso cada linha mostra os
 * SEUS limites em dias: sem eles o gestor não entende por que um cliente virou
 * perdido com 10 dias e outro com 30.
 *
 * ★ "Ciclo indefinido" precisa aparecer em texto. É o cliente com menos de duas
 *   compras na janela de 90 dias: ele não tem ritmo apurável e caiu na lista pelo
 *   teto de 30 dias, não por quebra de padrão. Tratar os dois casos igual faz o
 *   gestor cobrar o vendedor por um cliente que nunca teve recorrência.
 *
 * ★ Motivo da perda é editável porque a causa costuma ser qualitativa e não está no
 *   ERP (perdeu licitação, mudou de estado, fechou). Sem ele a lista entope de
 *   cliente que sabidamente não volta e o alerta perde valor. "Silenciar até" tira o
 *   cliente do topo sem apagá-lo.
 */
export interface LinhaChurn {
  codcli: number
  cliente: string | null
  codusur: number | null
  rca: string | null
  ultima_compra: string | null
  dias_sem_compra: number
  ciclo_medio: number | null
  ciclo_indefinido: boolean
  compras_90d: number
  status: string
  limite_risco: number | null
  limite_perdido: number
  liquido_12m: number
  motivo: string | null
  motivo_descricao: string | null
  observacao: string | null
  silenciado_ate: string | null
  silenciado: boolean
}

export interface MetaChurn {
  ativos: number
  risco: number
  perdidos: number
  nunca_compraram: number
  receita_perdida: number
  receita_total_12m?: number
  receita_perdida_pct?: number | null
  silenciados?: number
  anotacoes_disponiveis?: boolean
  referencia?: string
  regra: string
}

export interface MotivoPerda {
  codigo: string
  descricao: string
  recuperavel?: boolean
  ordem?: number
}

export interface AnotacaoPatch {
  motivo: string | null
  observacao: string | null
  silenciar_ate: string | null
}

const STATUS: Record<string, { rotulo: string; dot: string; texto: string }> = {
  RISCO: { rotulo: 'Risco de abandono', dot: 'dot-aviso', texto: 'text-amber' },
  PERDIDO: { rotulo: 'Perdido', dot: 'dot-erro', texto: 'text-danger' },
  ATIVO: { rotulo: 'Ativo', dot: 'dot-ativo', texto: 'text-emerald' },
}

type Aba = 'RISCO' | 'PERDIDO' | 'ATIVO'

/** Colunas do cabeçalho e das linhas — a MESMA definição, senão elas desalinham.
 *  No mobile vira coluna única: sete colunas em 375px não se leem. */
const GRADE =
  'grid grid-cols-1 gap-y-1 items-baseline sm:gap-x-3 ' +
  'sm:grid-cols-[minmax(10rem,2fr)_minmax(6rem,1fr)_6.5rem_6.5rem_6rem_7rem_minmax(7rem,1fr)]'

function ciclo(l: LinhaChurn): string {
  if (l.ciclo_indefinido || l.ciclo_medio === null) return 'indefinido'
  return `${l.ciclo_medio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`
}

function gatilho(l: LinhaChurn): string {
  if (l.ciclo_indefinido) return 'regra dos 30 dias (sem ciclo apurável)'
  const risco = l.limite_risco === null ? '—' : `${Math.round(l.limite_risco)} d`
  return `risco ${risco} · perdido ${Math.round(l.limite_perdido)} d`
}

export default function Churn({
  rows,
  meta,
  motivos,
  edicaoDisponivel,
  aoSalvar,
}: {
  rows: LinhaChurn[]
  meta: MetaChurn
  motivos: MotivoPerda[]
  edicaoDisponivel: boolean
  aoSalvar: (codcli: number, dados: AnotacaoPatch) => Promise<void>
}) {
  const [aba, setAba] = useState<Aba>('RISCO')
  const [comSilenciados, setComSilenciados] = useState(false)
  const [aberto, setAberto] = useState<number | null>(null)
  const [form, setForm] = useState<AnotacaoPatch>({ motivo: null, observacao: null, silenciar_ate: null })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const visiveis = rows.filter((l) => l.status === aba && (comSilenciados || !l.silenciado))
  const silenciadosNaAba = rows.filter((l) => l.status === aba && l.silenciado).length

  const abrir = (l: LinhaChurn) => {
    setErro(null)
    if (aberto === l.codcli) {
      setAberto(null)
      return
    }
    setAberto(l.codcli)
    setForm({ motivo: l.motivo, observacao: l.observacao, silenciar_ate: l.silenciado_ate })
  }

  const salvar = async (codcli: number) => {
    setSalvando(true)
    setErro(null)
    try {
      await aoSalvar(codcli, form)
      setAberto(null)
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setSalvando(false)
    }
  }

  const ABAS: { id: Aba; rotulo: string; quantidade: number }[] = [
    { id: 'RISCO', rotulo: 'Em risco', quantidade: meta.risco },
    { id: 'PERDIDO', rotulo: 'Perdidos', quantidade: meta.perdidos },
    { id: 'ATIVO', rotulo: 'Ativos', quantidade: meta.ativos },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Situação do cliente">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setAba(a.id)
                setAberto(null)
              }}
              aria-pressed={aba === a.id}
              className={`px-3 py-1.5 rounded-sm text-xs font-mono font-semibold transition-colors whitespace-nowrap ${
                aba === a.id ? 'bg-primary text-white' : 'text-muted hover:text-ink hover:bg-primary-wash'
              }`}
            >
              {a.rotulo} ({numero(a.quantidade)})
            </button>
          ))}
        </div>

        {silenciadosNaAba > 0 && (
          <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={comSilenciados}
              onChange={(e) => setComSilenciados(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            mostrar {plural(silenciadosNaAba, 'silenciado', 'silenciados')}
          </label>
        )}
      </div>

      {!edicaoDisponivel && (
        <p className="text-[11px] font-mono text-amber">
          Registro de motivo indisponível no momento — a lista continua atualizada, mas as anotações
          não podem ser gravadas.
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="text-muted text-sm py-6 text-center">
          Nenhum cliente nesta situação{comSilenciados ? '' : ' (fora os silenciados)'}.
        </p>
      ) : (
        <div>
          {/* cabeçalho e linhas dividem o MESMO grid: numa tabela real a linha
              expandida teria de morar num <td colSpan>, e aí o conteúdo deixa de
              se alinhar com as colunas do cabeçalho */}
          <div className={`${GRADE} hidden sm:grid px-1 pb-1 border-b border-line`}>
            <span className="label-caps text-[10px]">Cliente</span>
            <span className="label-caps text-[10px]">RCA</span>
            <span className="label-caps text-[10px] text-right">Últ. compra</span>
            <span className="label-caps text-[10px] text-right">Sem comprar</span>
            <span className="label-caps text-[10px] text-right">Ciclo</span>
            <span className="label-caps text-[10px] text-right">Líq. 12 m</span>
            <span className="label-caps text-[10px]">Motivo</span>
          </div>

          <ul className="flex flex-col divide-y divide-line">
            {visiveis.map((l) => {
              const st = STATUS[l.status] ?? STATUS.ATIVO
              const expandido = aberto === l.codcli
              return (
                <li key={l.codcli}>
                  <button
                    type="button"
                    onClick={() => abrir(l)}
                    aria-expanded={expandido}
                    className="w-full text-left hover:bg-primary-wash transition-colors rounded-sm"
                  >
                    <span className={`${GRADE} py-2.5 px-1`}>
                      <span className="flex items-center gap-2 min-w-0">
                        {expandido ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={1.75} />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={1.75} />
                        )}
                        <span className={`dot ${st.dot}`} role="img" aria-label={st.rotulo} />
                        <span className="text-xs font-semibold text-ink truncate">
                          {l.cliente ?? `Cliente ${l.codcli}`}
                        </span>
                        {l.silenciado && (
                          <BellOff className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={1.75} aria-label="silenciado" />
                        )}
                      </span>
                      <span className="font-mono text-[11px] text-muted truncate">{l.rca ?? '—'}</span>
                      <span className="font-mono text-[11px] text-muted sm:text-right whitespace-nowrap">
                        {dataBr(l.ultima_compra)}
                      </span>
                      <span className={`font-mono text-xs font-semibold sm:text-right whitespace-nowrap ${st.texto}`}>
                        {numero(l.dias_sem_compra)} d
                      </span>
                      <span
                        className={`font-mono text-[11px] sm:text-right whitespace-nowrap ${l.ciclo_indefinido ? 'text-amber' : 'text-muted'}`}
                        title={gatilho(l)}
                      >
                        {ciclo(l)}
                      </span>
                      <span className="font-mono text-[11px] text-ink sm:text-right whitespace-nowrap">
                        {moeda(l.liquido_12m)}
                      </span>
                      <span className="font-mono text-[11px] text-muted truncate flex items-center gap-1.5">
                        {l.motivo_descricao ?? l.motivo ?? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <PencilLine className="w-3 h-3" strokeWidth={1.75} /> registrar
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  {expandido && (
                    <div className="px-1 pb-4 pt-1 border-t border-line">
                      <p className="text-[11px] font-mono text-muted mb-3">
                        Gatilho deste cliente: {gatilho(l)} ·{' '}
                        {plural(l.compras_90d, 'compra', 'compras')} na janela de 90 dias
                        {l.ciclo_indefinido &&
                          ' — sem duas compras na janela não há ciclo confiável, vale só o teto de 30 dias'}
                        .
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="label-caps text-[10px]">Motivo da perda</span>
                          <select
                            value={form.motivo ?? ''}
                            disabled={!edicaoDisponivel}
                            onChange={(e) => setForm({ ...form, motivo: e.target.value || null })}
                            className="input-dark px-3 py-2 text-sm disabled:opacity-50"
                          >
                            <option value="">— sem motivo registrado —</option>
                            {motivos.map((m) => (
                              <option key={m.codigo} value={m.codigo}>
                                {m.descricao}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="label-caps text-[10px]">Silenciar alerta até</span>
                          <span className="flex items-center gap-2">
                            <input
                              type="date"
                              value={form.silenciar_ate ?? ''}
                              disabled={!edicaoDisponivel}
                              onChange={(e) => setForm({ ...form, silenciar_ate: e.target.value || null })}
                              className="input-dark px-3 py-2 text-sm flex-1 disabled:opacity-50"
                            />
                            {form.silenciar_ate && (
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, silenciar_ate: null })}
                                className="text-muted text-xs hover:text-ink underline"
                              >
                                limpar
                              </button>
                            )}
                          </span>
                        </label>

                        <label className="flex flex-col gap-1 sm:col-span-2">
                          <span className="label-caps text-[10px]">Observação</span>
                          <textarea
                            value={form.observacao ?? ''}
                            disabled={!edicaoDisponivel}
                            maxLength={2000}
                            rows={2}
                            placeholder="Ex.: perdeu a licitação da maternidade e saiu do estado."
                            onChange={(e) => setForm({ ...form, observacao: e.target.value || null })}
                            className="input-dark px-3 py-2 text-sm disabled:opacity-50 resize-y"
                          />
                        </label>
                      </div>

                      {erro && <p className="mt-2 text-danger text-xs font-mono break-words">{erro}</p>}

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          disabled={!edicaoDisponivel || salvando}
                          onClick={() => salvar(l.codcli)}
                          className="btn-primary px-4 py-2 text-xs disabled:opacity-50"
                        >
                          {salvando ? 'Gravando…' : 'Gravar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAberto(null)}
                          className="text-muted text-xs hover:text-ink underline"
                        >
                          cancelar
                        </button>
                        <span className="ml-auto font-mono text-[11px] text-muted">cód. {l.codcli}</span>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-[11px] font-mono text-muted leading-relaxed">{meta.regra}</p>
    </div>
  )
}
