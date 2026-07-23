import { useEffect, useState } from 'react'
import { CalendarRange, Clock, Layers, UserRound } from 'lucide-react'
import MultiSelecao from './MultiSelecao'
import { useDepartamentos, useRcas } from '../lib/dimensoes'

export interface Filtro {
  dt_ini: string
  dt_fim: string
  hora_ini: string // 'HH:MM' ou ''
  hora_fim: string
  /** Códigos de RCA. Lista vazia = todos (é assim que o backend entende). */
  rcas: number[]
  /** Códigos de departamento. Lista vazia = todos. */
  deptos: number[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * ISO no fuso LOCAL.
 * ★ toISOString() converte para UTC: das 21h em diante (UTC-3) ele devolve o dia
 *   seguinte e o filtro nasce com um dia a mais. Formatar componente a componente.
 */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface Periodo {
  dt_ini: string
  dt_fim: string
}

/**
 * Janela de N meses FECHADOS terminando no último mês encerrado.
 * O BI trabalha por ciclo mensal fechado (dia 1 ao último dia) — metas, projeção e
 * comparações se apoiam nele; janelas móveis de 30/90 dias misturam meses e
 * distorcem qualquer comparação mês a mês.
 */
export function periodoMesesFechados(meses = 1): Periodo {
  const hoje = new Date()
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0) // dia 0 = último dia do mês anterior
  const ini = new Date(fim.getFullYear(), fim.getMonth() - (meses - 1), 1)
  return { dt_ini: isoLocal(ini), dt_fim: isoLocal(fim) }
}

const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                   'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface PresetMes extends Periodo {
  rotulo: string
  dica: string
}

/**
 * Os últimos N meses FECHADOS, cada um isolado (não acumulado).
 *
 * ★ POR QUE ISTO EXISTE — as abas Estoque e Compras dimensionam a cobertura sobre a
 *   demanda de UM mês fechado (§10). Ali os presets "3 meses"/"6 meses" eram controles
 *   MORTOS: o backend normaliza qualquer intervalo para o mês fechado de dt_fim, então
 *   clicar "6 meses" devolvia exatamente o mesmo jun/2026 que "Mês fechado", sem nada
 *   na tela dizer isso. Trocamos por um mês fechado específico por botão (jun, mai,
 *   abr...), que é o recorte que o comprador realmente usa: "e se eu dimensionar pela
 *   demanda de maio?".
 */
export function mesesFechadosRecentes(n = 4): PresetMes[] {
  const hoje = new Date()
  const ultimoFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0) // último dia do mês anterior
  const lista: PresetMes[] = []
  for (let i = 0; i < n; i++) {
    const ini = new Date(ultimoFim.getFullYear(), ultimoFim.getMonth() - i, 1)
    const fim = new Date(ultimoFim.getFullYear(), ultimoFim.getMonth() - i + 1, 0)
    const rotulo = `${MESES_ABR[ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`
    lista.push({
      dt_ini: isoLocal(ini),
      dt_fim: isoLocal(fim),
      rotulo,
      dica: i === 0 ? 'Último mês encerrado — a demanda que dimensiona a cobertura' : `Demanda de ${rotulo}`,
    })
  }
  return lista
}

/** Do dia 1 até hoje — PARCIAL: nunca comparar direto com um mês fechado. */
export function periodoMesCorrente(): Periodo {
  const hoje = new Date()
  return {
    dt_ini: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    dt_fim: isoLocal(hoje),
  }
}

/** Janela móvel de dias, contando hoje. Opção secundária. */
export function periodoDias(dias: number): Periodo {
  const fim = new Date()
  const ini = new Date()
  ini.setDate(fim.getDate() - (dias - 1))
  return { dt_ini: isoLocal(ini), dt_fim: isoLocal(fim) }
}

/** Sem argumento devolve o último mês fechado — o padrão canônico do BI. */
export function filtroPadrao(dias?: number): Filtro {
  const periodo = dias ? periodoDias(dias) : periodoMesesFechados(1)
  return { ...periodo, hora_ini: '', hora_fim: '', rcas: [], deptos: [] }
}

const CHAVE_FILTRO = 'h4c_filtro'

function numeros(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return v.map(Number).filter((n) => Number.isFinite(n))
}

/**
 * ★ Normaliza o que veio do localStorage espalhando o PADRÃO ANTES do salvo: um filtro
 *   gravado no formato antigo (sem rcas/deptos) chegaria com undefined e quebraria o
 *   primeiro .map da tela. Os arrays ainda passam por numeros() porque o conteúdo do
 *   localStorage é editável pelo usuário.
 */
function normalizar(bruto: Partial<Filtro> | null): Filtro {
  const padrao = filtroPadrao()
  if (!bruto || !bruto.dt_ini || !bruto.dt_fim) return padrao
  return {
    ...padrao,
    ...bruto,
    hora_ini: bruto.hora_ini ?? '',
    hora_fim: bruto.hora_fim ?? '',
    rcas: numeros(bruto.rcas),
    deptos: numeros(bruto.deptos),
  }
}

/** Filtro global: o mesmo recorte vale em todas as páginas e sobrevive ao reload. */
export function useFiltro(): [Filtro, (f: Filtro) => void] {
  const [filtro, setFiltro] = useState<Filtro>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_FILTRO)
      return normalizar(salvo ? (JSON.parse(salvo) as Partial<Filtro>) : null)
    } catch {
      return filtroPadrao() /* filtro corrompido -> padrão */
    }
  })
  useEffect(() => {
    localStorage.setItem(CHAVE_FILTRO, JSON.stringify(filtro))
  }, [filtro])
  return [filtro, setFiltro]
}

export function filtroQuery(f: Filtro): string {
  const p = new URLSearchParams({ dt_ini: f.dt_ini, dt_fim: f.dt_fim })
  if (f.hora_ini) p.set('hora_ini', f.hora_ini)
  if (f.hora_fim) p.set('hora_fim', f.hora_fim)
  // vazio = todos: só emite o parâmetro quando há seleção de verdade
  if (f.rcas && f.rcas.length) p.set('rcas', f.rcas.join(','))
  if (f.deptos && f.deptos.length) p.set('deptos', f.deptos.join(','))
  return p.toString()
}

const PRESETS_MES = [
  {
    id: 'fechado',
    rotulo: 'Mês fechado',
    fechado: true,
    periodo: () => periodoMesesFechados(1),
    dica: 'Último mês encerrado — é o ciclo em que o BI apura metas',
  },
  {
    id: 'corrente',
    rotulo: 'Mês corrente',
    fechado: false,
    periodo: periodoMesCorrente,
    dica: 'Do dia 1 até hoje — parcial, não compare com um mês fechado',
  },
  {
    id: '3m',
    rotulo: '3 meses',
    fechado: true,
    periodo: () => periodoMesesFechados(3),
    dica: 'Três meses fechados',
  },
  {
    id: '6m',
    rotulo: '6 meses',
    fechado: true,
    periodo: () => periodoMesesFechados(6),
    dica: 'Seis meses fechados',
  },
]

const PRESETS_DIAS = [7, 30, 90, 180]

const CLASSE_PRESET =
  'flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 min-h-11 sm:min-h-0 rounded-sm text-sm sm:text-xs font-mono font-semibold transition-colors'

export default function FiltroBar({
  filtro,
  onChange,
  mostrarHora = true,
  mostrarRca = false,
  mostrarDepto = false,
  mostrarDias = true,
  periodoMensal = false,
  aviso,
}: {
  filtro: Filtro
  onChange: (f: Filtro) => void
  mostrarHora?: boolean
  mostrarRca?: boolean
  mostrarDepto?: boolean
  /**
   * ★ `false` remove os recortes que NÃO são de mês fechado: a janela móvel
   *   (7d/30d/90d/180d) e o "Mês corrente". É o que as abas Compras e Estoque
   *   pedem — demanda de reposição por janela móvel de 30 dias é anti-padrão
   *   declarado (§10/§11), e um botão ao alcance do comprador é convite para
   *   dimensionar a compra sobre meio junho mais um julho pela metade.
   *   Sobram os presets de mês fechado (1, 3 e 6 meses) e as datas manuais.
   */
  mostrarDias?: boolean
  /**
   * ★ `true` = a página apura sobre UM mês fechado (Estoque, Compras): os presets
   *   deixam de ser janelas acumuladas (3/6 meses) — que o backend colapsa no mês
   *   de dt_fim, virando controle morto — e passam a ser os últimos meses fechados
   *   individuais (jun, mai, abr...). Cada botão troca de verdade a demanda que
   *   dimensiona a cobertura. Implica mostrarDias=false.
   */
  periodoMensal?: boolean
  aviso?: string
}) {
  // só busca a lista da dimensão que a página realmente mostra
  const rcas = useRcas(mostrarRca)
  const deptos = useDepartamentos(mostrarDepto)
  // três modos de período: mensal-único (Estoque/Compras), só mês fechado
  // acumulado (padrão sem dias) e completo com janela móvel (Comercial).
  const presetsMensais = periodoMensal ? mesesFechadosRecentes(4) : null
  const presetsMes = presetsMensais
    ? presetsMensais.map((m) => ({ id: m.rotulo, rotulo: m.rotulo, dica: m.dica, periodo: () => m }))
    : (mostrarDias ? PRESETS_MES : PRESETS_MES.filter((p) => p.fechado))
  const usaDias = mostrarDias && !periodoMensal

  const aplicar = (p: Periodo) => onChange({ ...filtro, ...p })
  const ativo = (p: Periodo) => filtro.dt_ini === p.dt_ini && filtro.dt_fim === p.dt_fim
  const classePreset = (marcado: boolean) =>
    `${CLASSE_PRESET} ${marcado ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'}`

  return (
    <div className="tile px-4 sm:px-5 py-3.5 sm:py-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-x-6">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarRange className="w-4 h-4 text-primary-soft shrink-0" strokeWidth={1.5} />
          <span className="label-caps">Período</span>
          <input
            type="date"
            value={filtro.dt_ini}
            max={filtro.dt_fim}
            onChange={(e) => onChange({ ...filtro, dt_ini: e.target.value })}
            aria-label="Data inicial"
            className="input-dark px-3 py-2 text-sm basis-[132px] grow sm:grow-0 sm:basis-auto"
          />
          <span className="text-muted text-sm">até</span>
          <input
            type="date"
            value={filtro.dt_fim}
            min={filtro.dt_ini}
            onChange={(e) => onChange({ ...filtro, dt_fim: e.target.value })}
            aria-label="Data final"
            className="input-dark px-3 py-2 text-sm basis-[132px] grow sm:grow-0 sm:basis-auto"
          />
        </div>

        {mostrarHora && (
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="w-4 h-4 text-primary-soft shrink-0" strokeWidth={1.5} />
            <span className="label-caps">Hora</span>
            <input
              type="time"
              value={filtro.hora_ini}
              onChange={(e) => onChange({ ...filtro, hora_ini: e.target.value })}
              className="input-dark px-3 py-2 text-sm basis-[132px] grow sm:grow-0 sm:basis-auto"
              title="Hora inicial (opcional) — aplica às análises intradia"
              aria-label="Hora inicial"
            />
            <span className="text-muted text-sm">até</span>
            <input
              type="time"
              value={filtro.hora_fim}
              onChange={(e) => onChange({ ...filtro, hora_fim: e.target.value })}
              className="input-dark px-3 py-2 text-sm basis-[132px] grow sm:grow-0 sm:basis-auto"
              title="Hora final (opcional)"
              aria-label="Hora final"
            />
            {(filtro.hora_ini || filtro.hora_fim) && (
              <button
                onClick={() => onChange({ ...filtro, hora_ini: '', hora_fim: '' })}
                className="text-muted text-xs hover:text-ink-soft underline px-2 py-2 min-h-11 sm:min-h-0 flex items-center"
              >
                limpar
              </button>
            )}
          </div>
        )}

        <div className="sm:ml-auto flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          {/* ciclo mensal fechado: o recorte principal do BI */}
          <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Período por mês">
            {presetsMes.map((p) => {
              const periodo = p.periodo()
              return (
                <button
                  key={p.id}
                  onClick={() => aplicar(periodo)}
                  title={p.dica}
                  aria-pressed={ativo(periodo)}
                  className={`${classePreset(ativo(periodo))} whitespace-nowrap`}
                >
                  {p.rotulo}
                </button>
              )
            })}
          </div>

          {/* janela móvel de dias: opção secundária, fora do ciclo de apuração */}
          {usaDias && (
            <div
              className="flex gap-1 rounded border border-line bg-floor p-1"
              role="group"
              aria-label="Período por dias corridos"
            >
              {PRESETS_DIAS.map((d) => {
                const periodo = periodoDias(d)
                return (
                  <button
                    key={d}
                    onClick={() => aplicar(periodo)}
                    title={`Últimos ${d} dias corridos`}
                    aria-pressed={ativo(periodo)}
                    className={classePreset(ativo(periodo))}
                  >
                    {d}d
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {(mostrarRca || mostrarDepto) && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-x-6 border-t border-line pt-3">
          {mostrarRca && (
            <div className="flex items-center gap-2 flex-wrap">
              <UserRound className="w-4 h-4 text-primary-soft shrink-0" strokeWidth={1.5} />
              <span className="label-caps">RCA</span>
              <MultiSelecao
                opcoes={rcas.opcoes}
                selecionados={filtro.rcas}
                onChange={(v) => onChange({ ...filtro, rcas: v })}
                rotuloTodos="Todos os RCAs"
                rotuloFiltro="RCA"
                carregando={rcas.carregando}
                erro={rcas.erro}
              />
            </div>
          )}

          {mostrarDepto && (
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-4 h-4 text-primary-soft shrink-0" strokeWidth={1.5} />
              <span className="label-caps">Departamento</span>
              <MultiSelecao
                opcoes={deptos.opcoes}
                selecionados={filtro.deptos}
                onChange={(v) => onChange({ ...filtro, deptos: v })}
                rotuloTodos="Todos os departamentos"
                rotuloFiltro="Departamento"
                carregando={deptos.carregando}
                erro={deptos.erro}
              />
            </div>
          )}

          {(filtro.rcas.length > 0 || filtro.deptos.length > 0) && (
            <button
              onClick={() => onChange({ ...filtro, rcas: [], deptos: [] })}
              className="text-muted text-xs hover:text-ink-soft underline px-2 py-2 min-h-11 sm:min-h-0 flex items-center self-start"
            >
              limpar filtros
            </button>
          )}
        </div>
      )}

      {aviso && <p className="w-full text-muted text-[11px] font-mono">{aviso}</p>}
    </div>
  )
}
