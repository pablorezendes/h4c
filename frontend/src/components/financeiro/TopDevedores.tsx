import { brlExato } from '../../lib/format'
import { Vazio } from './formatos'
import type { Devedor } from './tipos'

/**
 * Quem está devendo — a lista acionável por trás do número do vencido.
 *
 * O RCA vai junto porque a cobrança sai pelo vendedor que atendeu; e os dias de
 * atraso são do título MAIS VELHO do cliente, não a média: é ele que define se a
 * conversa é telefonema ou suspensão de crédito.
 */
export default function TopDevedores({ dados }: { dados: Devedor[] }) {
  if (!dados.length) return <Vazio>nenhum cliente com título vencido</Vazio>
  const max = Math.max(...dados.map((d) => d.valor), 1)

  return (
    <ul className="flex flex-col gap-1">
      {dados.map((d, i) => (
        <li key={d.codcli} className="rounded px-3 py-2.5 hover:bg-primary-wash transition-colors cursor-default">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-soft truncate">
              <span className="font-mono text-xs text-muted mr-2">{String(i + 1).padStart(2, '0')}</span>
              {d.cliente ?? `Cliente ${d.codcli}`}
            </span>
            <span className="font-display font-semibold text-sm text-ink whitespace-nowrap">
              {brlExato.format(d.valor)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-floor border border-line overflow-hidden">
              <div
                className="h-full"
                style={{ width: `${Math.max(1, (d.valor / max) * 100)}%`, background: '#b23a2a' }}
              />
            </div>
            <span className="font-mono text-[11px] text-muted whitespace-nowrap">
              {d.dias_atraso} d · {d.titulos} tít.
            </span>
          </div>
          {d.rca && <p className="text-muted text-[11px] font-mono mt-1 truncate">RCA {d.rca}</p>}
        </li>
      ))}
    </ul>
  )
}
