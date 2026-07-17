import * as XLSX from 'xlsx'

/** Gera e baixa um .xlsx a partir de linhas {coluna: valor}. */
export function exportarExcel(nomeArquivo: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const chaves = Object.keys(rows[0])
  const humanizar = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

  const dados = rows.map((r) =>
    Object.fromEntries(chaves.map((k) => [humanizar(k), r[k] ?? ''])),
  )
  const planilha = XLSX.utils.json_to_sheet(dados)

  // largura de coluna proporcional ao conteúdo (limitada p/ não explodir)
  planilha['!cols'] = chaves.map((k) => {
    const maior = Math.max(
      humanizar(k).length,
      ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length),
    )
    return { wch: Math.min(Math.max(maior + 2, 8), 48) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, planilha, 'Dados')
  const nome = nomeArquivo.replace(/[^\w\-áéíóúâêôãõçà ]/gi, '').trim().slice(0, 80) || 'exportacao'
  XLSX.writeFile(wb, `${nome}.xlsx`)
}
