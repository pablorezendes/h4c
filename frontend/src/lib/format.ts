export const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

export const brlExato = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** R$ compacto para eixos: 12,3 mil / 1,2 mi */
export function brlCompacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return brl.format(v)
}

export function diaCurto(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
