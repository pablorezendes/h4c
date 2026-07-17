import { FileSpreadsheet } from 'lucide-react'
import { exportarExcel } from '../lib/exportarExcel'

/** Botão editorial discreto: baixa as linhas como planilha Excel. */
export default function BotaoExportar({
  nome,
  rows,
  rotulo = 'Excel',
}: {
  nome: string
  rows: Record<string, unknown>[] | null | undefined
  rotulo?: string
}) {
  if (!rows?.length) return null
  return (
    <button
      onClick={() => exportarExcel(nome, rows)}
      title={`Baixar ${rows.length} linhas em Excel`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-line bg-floor text-xs font-mono font-semibold text-muted hover:text-primary hover:border-primary-strong transition-colors shrink-0"
    >
      <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={1.75} />
      {rotulo}
    </button>
  )
}
