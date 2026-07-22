import { Sparkles } from 'lucide-react'
import { BOTAO, Marcar, Vazio } from './pecas'
import { agruparPorAba, type Papel, type RecursoCatalogo } from './tipos'

/**
 * A matriz de permissões: ABA -> RELATÓRIOS DA ABA.
 *
 * A tela toda existe para o dono decidir sem TI, então cada linha mostra a
 * DESCRIÇÃO em português que vem do catálogo do backend. Ninguém aqui precisa
 * saber o que é "comercial.rca" — está escrito "Faturamento, margem e positivação
 * de cada RCA".
 *
 * ★ MARCAR ESTAS CAIXAS NÃO É O QUE PROTEGE O DADO. Elas gravam em
 *   app.usuario_permissao, e quem barra de verdade é o backend, em cada rota
 *   (`Depends(requer(...))`). O menu filtrado é conveniência: esconder a aba de
 *   quem abre o DevTools não esconderia nada.
 *
 * ★ A CAIXA DA ABA VALE PELO GRUPO INTEIRO. Marcar a aba marca os relatórios dela;
 *   desmarcar tira tudo. Desmarcar um relatório sozinho NÃO tira a aba — é assim
 *   que se libera "Comercial, mas sem o vencido do financeiro" sem precisar
 *   entender que a aba é um recurso à parte.
 */
export default function MatrizPermissoes({
  catalogo,
  marcados,
  papel,
  desabilitado = false,
  sugeridos = null,
  aoMudar,
}: {
  catalogo: RecursoCatalogo[]
  marcados: string[]
  papel: Papel
  desabilitado?: boolean
  /** recursos que vieram de "sugerir pelo acesso do ERP", para o dono ver o que mudou */
  sugeridos?: string[] | null
  aoMudar: (recursos: string[]) => void
}) {
  if (!catalogo.length) return <Vazio>catálogo de relatórios indisponível — recarregue a página</Vazio>

  const tem = new Set(marcados)
  const veioDoErp = new Set(sugeridos ?? [])
  const grupos = agruparPorAba(catalogo)

  const trocar = (mexer: (s: Set<string>) => void) => {
    const proximo = new Set(tem)
    mexer(proximo)
    aoMudar(catalogo.filter((r) => proximo.has(r.id)).map((r) => r.id))
  }

  const alternarAba = (aba: string, filhos: RecursoCatalogo[], ligar: boolean) =>
    trocar((s) => {
      if (ligar) {
        s.add(aba)
        filhos.forEach((f) => s.add(f.id))
      } else {
        s.delete(aba)
        filhos.forEach((f) => s.delete(f.id))
      }
    })

  const alternarFilho = (id: string, aba: string, ligar: boolean) =>
    trocar((s) => {
      if (ligar) {
        s.add(id)
        // a aba vai junto — é o que o backend faz em permissoes.normalizar()
        s.add(aba)
      } else {
        s.delete(id)
      }
    })

  const marcarTudo = (ligar: boolean) =>
    trocar((s) => {
      for (const r of catalogo) {
        // 'configuracoes' fica de fora do atalho: administração é papel, não caixinha
        if (r.id === 'configuracoes') continue
        if (ligar) s.add(r.id)
        else s.delete(r.id)
      }
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-xs font-mono">
          {marcados.filter((r) => r !== 'configuracoes').length} de{' '}
          {catalogo.filter((r) => r.id !== 'configuracoes').length} itens liberados
        </p>
        <div className="flex gap-2">
          <button className={BOTAO} onClick={() => marcarTudo(true)} disabled={desabilitado}>
            Marcar tudo
          </button>
          <button className={BOTAO} onClick={() => marcarTudo(false)} disabled={desabilitado}>
            Limpar
          </button>
        </div>
      </div>

      {grupos.map((g) => {
        const temAba = tem.has(g.aba.id)
        const filhosMarcados = g.filhos.filter((f) => tem.has(f.id)).length
        // 'configuracoes' é a única caixa que a tela não deixa LIGAR: quem administra
        // o BI é o papel 'admin' (requer_admin no backend). Marcar aqui só faria o item
        // aparecer no menu de um gestor e devolver 403 no primeiro clique.
        // ★ Desligar continua permitido: se a linha já existir no banco (semeada por
        //   um papel antigo), o dono precisa conseguir tirá-la — caixa desabilitada nos
        //   dois sentidos deixaria um item marcado que ninguém consegue apagar pela tela.
        const soAdmin = g.aba.id === 'configuracoes'
        const marcadoAba = soAdmin ? papel === 'admin' || temAba : temAba
        const travada = desabilitado || (soAdmin && !temAba)
        const parcial = temAba && g.filhos.length > 0 && filhosMarcados < g.filhos.length

        return (
          <section
            key={g.aba.id}
            className={`border rounded p-3.5 ${temAba ? 'border-line-strong bg-card' : 'border-line'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <Marcar
                forte
                marcado={marcadoAba}
                parcial={parcial}
                desabilitado={travada}
                aoMudar={(v) => alternarAba(g.aba.id, g.filhos, v)}
                rotulo={
                  <span className="flex items-center gap-2">
                    {g.aba.rotulo}
                    {veioDoErp.has(g.aba.id) && <SeloSugerido />}
                  </span>
                }
                dica={g.aba.descricao}
              />
              {g.filhos.length > 0 && (
                <span className="label-caps text-[11px] whitespace-nowrap shrink-0 pt-0.5">
                  {filhosMarcados}/{g.filhos.length}
                </span>
              )}
            </div>

            {soAdmin && (
              <p
                className={`text-xs mt-2 pl-6.5 leading-relaxed ${
                  temAba && papel !== 'admin' ? 'text-amber' : 'text-muted'
                }`}
              >
                Não se libera por caixinha: quem entra aqui é quem tem o papel{' '}
                <strong className="font-semibold text-ink-soft">Administrador</strong>. Troque o papel da
                pessoa se for essa a intenção.
                {temAba && papel !== 'admin'
                  && ' Este item está marcado no cadastro mas não tem efeito nenhum — pode desmarcar.'}
              </p>
            )}

            {temAba && g.filhos.length > 0 && filhosMarcados === 0 && (
              <p className="text-amber text-xs mt-2 pl-6.5 leading-relaxed">
                A aba está liberada sem nenhum relatório dentro — ela vai abrir praticamente vazia para
                esta pessoa.
              </p>
            )}

            {g.filhos.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3 mt-3 pl-6.5">
                {g.filhos.map((f) => (
                  <Marcar
                    key={f.id}
                    marcado={tem.has(f.id)}
                    desabilitado={desabilitado}
                    aoMudar={(v) => alternarFilho(f.id, f.aba, v)}
                    rotulo={
                      <span className="flex items-center gap-2">
                        {f.rotulo}
                        {veioDoErp.has(f.id) && <SeloSugerido />}
                      </span>
                    }
                    dica={f.descricao}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function SeloSugerido() {
  return (
    <span
      className="chip bg-primary-wash text-ink-soft text-[10px]"
      title="Este item entrou pela sugestão do acesso no ERP — confira antes de salvar"
    >
      <Sparkles className="w-3 h-3" strokeWidth={2} aria-hidden />
      sugerido
    </span>
  )
}
