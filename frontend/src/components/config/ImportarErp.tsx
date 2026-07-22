import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react'
import { Aviso, BOTAO, BOTAO_PRINCIPAL, Esqueleto, Nota, Vazio } from './pecas'
import {
  confiancaCarteira,
  porQueDaSugestao,
  rotuloPapel,
  type Importavel,
  type MetaImportaveis,
} from './tipos'

/**
 * Importar pessoas do WinThor.
 *
 * A lista traz quem TEM login no ERP e ainda não tem acesso ao BI, já com papel e
 * carteira sugeridos pelo backend: o papel sai do setor (PCEMPR.CODSETOR x PCSETOR)
 * e a carteira, de casamento exato de nome com PCUSUARI.
 *
 * ★ SUGESTÃO NÃO É DECISÃO, e a tela precisa dizer isso em voz alta. O setor
 *   descreve onde a pessoa senta, não o que ela deve ver no BI; e o nome casa com
 *   4 dos 5 RCAs que faturam. Por isso cada linha mostra DE ONDE veio o palpite e
 *   os alertas dele — importar sem ler é o caminho para liberar o vencido para a
 *   pessoa errada.
 *
 * ★ QUEM NÃO TEM LOGIN NO ERP NÃO APARECE AQUI E PRECISA DO CADASTRO MANUAL. Não é
 *   caso de canto: FERNANDA MOURA, a maior vendedora da empresa (RCA 5), não tem
 *   linha em PCEMPR. Por isso o botão de cadastro manual fica no topo desta seção,
 *   com o mesmo peso da importação — e não escondido em um menu.
 */
export default function ImportarErp({
  itens,
  meta,
  carregando,
  ocupado,
  erro,
  aoImportar,
  aoCadastrarManual,
}: {
  itens: Importavel[] | null
  meta: MetaImportaveis | null
  carregando: boolean
  ocupado: boolean
  erro: string | null
  aoImportar: (matriculas: number[]) => void
  aoCadastrarManual: () => void
}) {
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())

  // depois de importar, a lista volta do servidor menor: qualquer marcação antiga
  // apontaria para gente que já virou usuário
  useEffect(() => {
    setSelecionadas(new Set())
  }, [itens])

  const lista = itens ?? []
  const alternar = (matricula: number) =>
    setSelecionadas((s) => {
      const proximo = new Set(s)
      if (proximo.has(matricula)) proximo.delete(matricula)
      else proximo.add(matricula)
      return proximo
    })

  const cabecalho = (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Importar do ERP</h2>
        <p className="text-muted text-sm mt-0.5">
          Pessoas com login no WinThor que ainda não têm acesso ao BI
        </p>
      </div>
      <button className={BOTAO} onClick={aoCadastrarManual}>
        <UserPlus className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
        Cadastrar manualmente
      </button>
    </div>
  )

  if (carregando && itens === null) {
    return (
      <section className="tile p-4 sm:p-6">
        {cabecalho}
        <Esqueleto altura="h-32" />
      </section>
    )
  }

  // "e cadê o fulano?" é sempre a pergunta seguinte — a resposta fica na tela,
  // não no suporte
  const fora = [
    meta?.genericas_ignoradas
      ? `${meta.genericas_ignoradas} contas genéricas ou de serviço (PCADMIN, VENDAS, TI…), que não são pessoas`
      : '',
    meta?.desligados_ignorados
      ? `${meta.desligados_ignorados} desligados no ERP, que o BI recusaria no primeiro acesso`
      : '',
    meta?.ja_no_bi ? `${meta.ja_no_bi} que já têm cadastro aqui` : '',
  ].filter(Boolean)

  return (
    <section className="tile p-4 sm:p-6">
      {cabecalho}

      {erro && (
        <div className="mb-4">
          <Aviso tom="alerta">{erro}</Aviso>
        </div>
      )}

      {!erro && meta?.disponivel === false && (
        <div className="mb-4">
          <Aviso tom="alerta">
            {meta.aviso
              || 'O espelho do WinThor ainda não tem a tabela de funcionários — rode o sincronismo. '
                + 'Enquanto isso, use o cadastro manual.'}
          </Aviso>
        </div>
      )}

      {!erro && (meta?.avisos ?? []).length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {(meta?.avisos ?? []).map((a) => (
            <Aviso key={a} tom="alerta">
              {a}
            </Aviso>
          ))}
        </div>
      )}

      {!erro && lista.length === 0 ? (
        <>
          <Vazio>
            {meta?.disponivel === false
              ? 'lista do ERP indisponível'
              : 'todo mundo do ERP já tem cadastro no BI'}
          </Vazio>
          {fora.length > 0 && (
            <p className="text-muted text-xs text-center -mt-3 mb-2">
              Ficaram de fora {fora.join(', ')}.
            </p>
          )}
          <Nota>
            Quem não tem login no WinThor nunca vai aparecer nesta lista — é o caso da maior vendedora da
            empresa, que fatura sem ter linha em PCEMPR. Use{' '}
            <strong className="font-semibold text-ink-soft">Cadastrar manualmente</strong> para criar o
            acesso dela.
          </Nota>
        </>
      ) : (
        !erro && (
          <>
            <div className="mb-4">
              <Aviso tom="info">
                Papel e carteira abaixo são <strong className="font-semibold">sugestões, não decisões</strong>
                : o papel vem do setor da pessoa no ERP e a carteira, de casamento exato de nome com o
                cadastro de vendedores. Confira linha a linha — nada é liberado antes de você gerar a senha.
              </Aviso>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                className={BOTAO}
                onClick={() => setSelecionadas(new Set(lista.map((i) => i.matricula)))}
                disabled={ocupado}
              >
                Selecionar todos
              </button>
              <button className={BOTAO} onClick={() => setSelecionadas(new Set())} disabled={ocupado}>
                Limpar seleção
              </button>
              <span className="text-muted text-xs font-mono">
                {selecionadas.size} de {lista.length} marcados
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr>
                    {['', 'Pessoa', 'Setor no ERP', 'Papel sugerido', 'Carteira sugerida', 'De onde veio'].map(
                      (c, i) => (
                        <th
                          key={c || i}
                          className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong"
                        >
                          {c}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => {
                    const conf = confiancaCarteira(i)
                    const porque = porQueDaSugestao(i)
                    const alertas = i.alertas ?? []
                    const marcado = selecionadas.has(i.matricula)
                    return (
                      <tr
                        key={i.matricula}
                        onClick={() => alternar(i.matricula)}
                        className={`cursor-pointer transition-colors align-top ${
                          marcado ? 'bg-primary-wash' : 'hover:bg-primary-wash'
                        }`}
                      >
                        <td className="px-3 py-2.5 border-b border-line">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => alternar(i.matricula)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Importar ${i.nome}`}
                            className="w-4 h-4 accent-primary"
                          />
                        </td>

                        <td className="px-3 py-2.5 border-b border-line">
                          <span className="text-ink-soft font-semibold">{i.nome}</span>
                          {i.revisar && (
                            <span
                              className="chip text-amber ml-2 text-[10px]"
                              title="Login com cara de conta de sistema, mas com uso intenso no ERP"
                            >
                              conferir
                            </span>
                          )}
                          <span className="block text-muted text-[11px] font-mono mt-0.5">
                            {i.login} · matrícula {i.matricula}
                            {i.email ? ` · ${i.email}` : ''}
                          </span>
                        </td>

                        <td className="px-3 py-2.5 border-b border-line text-[12px] text-muted">
                          {i.setor || '—'}
                        </td>

                        <td className="px-3 py-2.5 border-b border-line whitespace-nowrap">
                          {i.papel_sugerido ? (
                            <span className="chip border border-line text-muted">
                              {rotuloPapel(i.papel_sugerido)}
                            </span>
                          ) : (
                            <span className="text-muted font-mono text-[11px]">sem sugestão</span>
                          )}
                          {i.funcao && (
                            <span className="block text-muted text-[11px] mt-0.5">{i.funcao}</span>
                          )}
                          {i.restrito_sugerido && (
                            <span
                              className="block text-[11px] mt-0.5 text-ink-soft"
                              title="Entra vendo só os números da própria carteira, com o filtro aplicado no servidor"
                            >
                              só a própria carteira
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2.5 border-b border-line whitespace-nowrap">
                          <span className="font-mono text-[12px]">
                            {i.codusur_sugerido != null ? (
                              <span className="text-ink-soft">RCA {i.codusur_sugerido}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </span>
                          {i.carteira_nome && (
                            <span className="block text-muted text-[11px] mt-0.5">{i.carteira_nome}</span>
                          )}
                          <span
                            className={`inline-flex items-center gap-1.5 font-mono text-[11px] mt-0.5 ${conf.classe}`}
                          >
                            <span className={`dot ${conf.dot}`} aria-hidden />
                            {conf.rotulo}
                          </span>
                        </td>

                        <td className="px-3 py-2.5 border-b border-line max-w-[22rem]">
                          {porque && (
                            <span className="block text-muted text-[11px] leading-snug">{porque}</span>
                          )}
                          {alertas.map((a) => (
                            <span
                              key={a}
                              className="flex items-start gap-1.5 text-amber text-[11px] leading-snug mt-1"
                            >
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
                              {a}
                            </span>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-line">
              <button
                className={BOTAO_PRINCIPAL}
                disabled={ocupado || selecionadas.size === 0}
                onClick={() => aoImportar([...selecionadas])}
              >
                {ocupado && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} aria-hidden />}
                Importar {selecionadas.size > 0 ? `${selecionadas.size} ` : ''}
                {selecionadas.size === 1 ? 'pessoa' : 'pessoas'}
              </button>
              <p className="text-muted text-xs">
                A importação cria o cadastro com a identidade do ERP e{' '}
                <strong className="font-semibold">sem senha</strong>: ninguém entra antes de você gerar a
                senha provisória.
              </p>
            </div>

            <Nota>
              {meta?.regra
                || 'Papel sugerido pelo setor do ERP e carteira por casamento de nome. PCEMPR.CODUSUR é '
                  + 'ignorado de propósito: o valor 1 é default de fábrica em 20 das 28 linhas.'}
              {fora.length > 0 && ` Ficaram de fora ${fora.join(', ')}.`}
            </Nota>
          </>
        )
      )}
    </section>
  )
}
