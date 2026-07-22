import { useMemo, useState } from 'react'
import { mesCurto, mesLongo, milCurto, moedaExata } from './formato'

/**
 * Faturamento cruzado RCA × Departamento, mês a mês (§5.3).
 *
 * Responde "quanto o Sergino faturou em químicos nos últimos meses?" sem cavar nada:
 * escolhe o RCA, lê a linha do departamento.
 *
 * ★ Matriz, não gráfico de linhas. São 8 departamentos — oito linhas coloridas no
 *   mesmo par de eixos viram emaranhado e obrigam a distinguir oito cores parecidas.
 *   Na matriz a magnitude é comprimento de barra (a codificação mais precisa que
 *   existe) e a tendência se lê andando pela linha, da esquerda para a direita.
 *
 * ★ O mês em andamento é marcado "parcial" no cabeçalho: comparar o parcial com mês
 *   fechado como se fossem iguais é o erro que a série cruzada mais convida a cometer.
 */
export interface LinhaRcaDepto {
  mes: string
  codusur: number
  nome: string | null
  codepto: number
  departamento: string | null
  liquido: number
  margem_pct?: number | null
  fechado: boolean
}

interface Celula {
  valor: number
  fechado: boolean
}

function nomeRca(codusur: number, nome: string | null): string {
  return (nome ?? '').trim() || `RCA ${codusur}`
}

function nomeDepto(codepto: number, descricao: string | null): string {
  return (descricao ?? '').trim() || `Departamento ${codepto}`
}

export default function RcaDepartamento({ rows }: { rows: LinhaRcaDepto[] }) {
  const [rca, setRca] = useState<number | null>(null)

  const rcas = useMemo(() => {
    const total = new Map<number, { codusur: number; nome: string | null; liquido: number }>()
    for (const r of rows) {
      const atual = total.get(r.codusur) ?? { codusur: r.codusur, nome: r.nome, liquido: 0 }
      atual.liquido += r.liquido
      total.set(r.codusur, atual)
    }
    return [...total.values()].sort((a, b) => b.liquido - a.liquido)
  }, [rows])

  const matriz = useMemo(() => {
    const linhas = rca === null ? rows : rows.filter((r) => r.codusur === rca)

    const meses = new Map<string, boolean>() // mes -> fechado
    const deptos = new Map<number, { codepto: number; nome: string; total: number; celulas: Map<string, Celula> }>()

    for (const r of linhas) {
      meses.set(r.mes, (meses.get(r.mes) ?? true) && r.fechado)
      const d =
        deptos.get(r.codepto) ??
        { codepto: r.codepto, nome: nomeDepto(r.codepto, r.departamento), total: 0, celulas: new Map<string, Celula>() }
      d.total += r.liquido
      const c = d.celulas.get(r.mes) ?? { valor: 0, fechado: r.fechado }
      c.valor += r.liquido
      c.fechado = c.fechado && r.fechado
      d.celulas.set(r.mes, c)
      deptos.set(r.codepto, d)
    }

    const listaMeses = [...meses.keys()].sort()
    const listaDeptos = [...deptos.values()].sort((a, b) => b.total - a.total)
    const maior = Math.max(
      1,
      ...listaDeptos.flatMap((d) => [...d.celulas.values()].map((c) => Math.abs(c.valor))),
    )
    const totalMes = new Map<string, number>()
    for (const d of listaDeptos) {
      for (const [mes, c] of d.celulas) totalMes.set(mes, (totalMes.get(mes) ?? 0) + c.valor)
    }
    return { listaMeses, listaDeptos, maior, totalMes, meses }
  }, [rows, rca])

  if (!rows.length) return <p className="text-muted text-sm py-6 text-center">Sem faturamento no período.</p>

  const { listaMeses, listaDeptos, maior, totalMes, meses } = matriz
  const classeChip = (marcado: boolean) =>
    `px-3 py-1.5 rounded-sm text-xs font-mono font-semibold transition-colors whitespace-nowrap ${
      marcado ? 'bg-primary text-white' : 'text-muted hover:text-ink hover:bg-primary-wash'
    }`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded border border-line bg-floor p-1 overflow-x-auto" role="group" aria-label="RCA">
        <button type="button" onClick={() => setRca(null)} className={classeChip(rca === null)}>
          Todos os RCAs
        </button>
        {rcas.map((r) => (
          <button
            key={r.codusur}
            type="button"
            onClick={() => setRca(r.codusur)}
            className={classeChip(rca === r.codusur)}
          >
            {nomeRca(r.codusur, r.nome)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Faturamento líquido por departamento e mês {rca === null ? 'de todos os RCAs' : ''}
          </caption>
          <thead>
            <tr>
              <th className="label-caps text-[10px] text-left py-2 pr-4 sticky left-0 bg-card z-10">Departamento</th>
              {listaMeses.map((m) => (
                <th key={m} className="label-caps text-[10px] text-right py-2 px-2 whitespace-nowrap">
                  {mesCurto(m)}
                  {meses.get(m) === false && <span className="block font-normal normal-case text-amber">parcial</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {listaDeptos.map((d) => (
              <tr key={d.codepto} className="hover:bg-primary-wash transition-colors">
                <th
                  scope="row"
                  className="text-left font-semibold text-xs text-ink py-2 pr-4 sticky left-0 bg-card z-10 whitespace-nowrap"
                >
                  {d.nome}
                </th>
                {listaMeses.map((m) => {
                  const c = d.celulas.get(m)
                  const valor = c?.valor ?? 0
                  return (
                    <td
                      key={m}
                      className="py-2 px-2 align-bottom text-right whitespace-nowrap"
                      title={`${d.nome} · ${mesLongo(m)}: ${moedaExata(valor)}`}
                    >
                      <span className="font-mono text-xs text-ink">{milCurto(valor)}</span>
                      <span className="block mt-1 h-1 bg-floor border border-line overflow-hidden rounded-sm">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${Math.min(100, (Math.abs(valor) / maior) * 100)}%` }}
                        />
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <th scope="row" className="label-caps text-[10px] text-left py-2 pr-4 sticky left-0 bg-card z-10">
                Total
              </th>
              {listaMeses.map((m) => (
                <td key={m} className="py-2 px-2 text-right font-mono text-xs font-semibold text-ink whitespace-nowrap">
                  {milCurto(totalMes.get(m) ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] font-mono text-muted leading-relaxed">
        Valores em reais, líquidos de devolução. A barra compara a célula com o maior mês da tabela.
        Departamento vem do cadastro do produto.
      </p>
    </div>
  )
}
