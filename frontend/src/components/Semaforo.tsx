import { brl, brlExato } from '../lib/format'

/**
 * Semáforo de meta.
 *
 * REGRA (validada com o dono): os limiares são sobre o ATINGIMENTO DA META, nunca sobre
 * o valor absoluto. Verde >= 100% da meta, amarelo de 90% a 100%, vermelho abaixo de 90%.
 * Para a margem (meta 33%) isso dá: verde >= 33,0% · amarelo >= 29,7% e < 33,0% ·
 * vermelho < 29,7%. Calibração real: margem de 27,2% (82% da meta) é VERMELHO.
 *
 * ★ A cor nunca é a única informação. Todo semáforo sai acompanhado do rótulo textual e
 *   do percentual de atingimento — quem não distingue as cores lê o mesmo diagnóstico.
 */
export type Farol = 'verde' | 'amarelo' | 'vermelho' | 'indefinido'

/** 29,7/33 dá 0,8999999999999999 em ponto flutuante — a folga evita o falso vermelho. */
const FOLGA = 1e-9

/** Atingimento em fração da meta (1 = meta cravada). null quando não dá para avaliar. */
export function atingimento(valor: number | null, meta: number): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null
  if (!Number.isFinite(meta) || meta <= 0) return null
  return valor / meta
}

export function avaliarMeta(valor: number | null, meta: number): Farol {
  const a = atingimento(valor, meta)
  if (a === null) return 'indefinido'
  if (a >= 1 - FOLGA) return 'verde'
  if (a >= 0.9 - FOLGA) return 'amarelo'
  return 'vermelho'
}

export const ROTULO_FAROL: Record<Farol, string> = {
  verde: 'Na meta',
  amarelo: 'Atenção',
  vermelho: 'Fora da meta',
  indefinido: 'Sem dado',
}

const CLASSES: Record<Farol, { dot: string; texto: string }> = {
  verde: { dot: 'dot-ativo', texto: 'text-emerald' },
  amarelo: { dot: 'dot-aviso', texto: 'text-amber' },
  vermelho: { dot: 'dot-erro', texto: 'text-danger' },
  indefinido: { dot: 'bg-line-strong', texto: 'text-muted' },
}

/** Classe de cor do farol — para quem monta o próprio layout (tabelas, chips). */
export function corFarol(farol: Farol): string {
  return CLASSES[farol].texto
}

export type FormatoSemaforo = 'percentual' | 'moeda'

function formatar(valor: number | null, formato: FormatoSemaforo): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  if (formato === 'moeda') {
    return Math.abs(valor) < 10000 ? brlExato.format(valor) : brl.format(valor)
  }
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

function pctAtingimento(a: number | null): string {
  if (a === null) return '—'
  return `${(a * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

/** Ponto de status. Sempre carrega o rótulo em texto acessível. */
export function SemaforoPonto({ farol, rotulo }: { farol: Farol; rotulo?: string }) {
  const texto = rotulo ?? ROTULO_FAROL[farol]
  return (
    <span className={`dot ${CLASSES[farol].dot}`} role="img" aria-label={texto} title={texto} />
  )
}

const TAMANHOS = {
  sm: 'text-xl',
  md: 'text-3xl sm:text-4xl',
} as const

/**
 * Bloco valor + meta + farol + atingimento.
 * Ex.: margem 29,83% com meta 33% -> "29,8%" âmbar, "Atenção · 90% da meta de 33,0%".
 */
export default function Semaforo({
  valor,
  meta,
  formato = 'percentual',
  rotulo,
  tamanho = 'md',
}: {
  valor: number | null
  meta: number
  formato?: FormatoSemaforo
  rotulo?: string
  tamanho?: keyof typeof TAMANHOS
}) {
  const farol = avaliarMeta(valor, meta)
  const a = atingimento(valor, meta)

  return (
    <div className="flex flex-col gap-1">
      {rotulo && <span className="label-caps leading-tight">{rotulo}</span>}
      <span className={`num ${TAMANHOS[tamanho]} font-bold ${CLASSES[farol].texto}`}>
        {formatar(valor, formato)}
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono">
        <span className="inline-flex items-center gap-1.5">
          <SemaforoPonto farol={farol} />
          <span className={`font-semibold ${CLASSES[farol].texto}`}>{ROTULO_FAROL[farol]}</span>
        </span>
        <span className="text-muted">
          {a === null
            ? `meta ${formatar(meta, formato)} — sem apuração no período`
            : `${pctAtingimento(a)} da meta de ${formatar(meta, formato)}`}
        </span>
      </div>
    </div>
  )
}
