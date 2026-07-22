import { useEffect, useState } from 'react'
import { KeyRound, Loader2, Power, PowerOff, Sparkles, X } from 'lucide-react'
import MatrizPermissoes from './MatrizPermissoes'
import { Aviso, BOTAO, BOTAO_PERIGO, BOTAO_PRINCIPAL, Campo, CLASSE_INPUT, Confirmar, Marcar, Nota } from './pecas'
import {
  chamar,
  dataHora,
  desligadoNoErp,
  ehProibido,
  mensagemDoErro,
  mesmoConjunto,
  normalizarRecursos,
  origemDaSugestao,
  PAPEIS,
  porQueNaoPodeGerarSenha,
  recursosDaSugestao,
  restricaoSemCarteira,
  rotuloPapel,
  type Papel,
  type RecursoCatalogo,
  type SugestaoErp,
  type Usuario,
} from './tipos'

/** O corpo do PATCH /api/usuarios/{id}. Só o que esta tela pode mudar. */
export interface PatchUsuario {
  nome?: string
  email?: string | null
  papel?: Papel
  codusur?: number | null
  restrito_a_carteira?: boolean
}

/**
 * O painel de um usuário: quem é, o que enxerga e até onde.
 *
 * ★ UM ÚNICO BOTÃO SALVAR para os dados e para as permissões. Com dois botões o
 *   dono trocava o papel, clicava em "salvar permissões" e perdia a troca de papel
 *   sem nenhum aviso — a lista recarrega depois de cada gravação e o formulário
 *   volta ao que está no banco. Aqui, o que está na tela é o que vai junto.
 */
export default function PainelUsuario({
  usuario,
  catalogo,
  euId,
  ocupado,
  aoFechar,
  aoSalvar,
  aoGerarSenha,
  aoAlternarAtivo,
}: {
  usuario: Usuario
  catalogo: RecursoCatalogo[]
  euId: number | null
  ocupado: boolean
  aoFechar: () => void
  aoSalvar: (patch: PatchUsuario | null, recursos: string[] | null) => void
  aoGerarSenha: (u: Usuario) => void
  aoAlternarAtivo: (u: Usuario) => void
}) {
  const [nome, setNome] = useState(usuario.nome)
  const [email, setEmail] = useState(usuario.email ?? '')
  const [papel, setPapel] = useState<Papel>(usuario.papel)
  const [codusur, setCodusur] = useState(usuario.codusur === null ? '' : String(usuario.codusur))
  const [restrito, setRestrito] = useState(usuario.restrito_a_carteira)
  const [permissoes, setPermissoes] = useState<string[]>(usuario.permissoes ?? [])

  const [sugeridos, setSugeridos] = useState<string[] | null>(null)
  const [fonteSugestao, setFonteSugestao] = useState<string | null>(null)
  const [buscandoSugestao, setBuscandoSugestao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarAdmin, setConfirmarAdmin] = useState(false)

  // O formulário reflete o banco: a lista é recarregada depois de cada gravação e
  // o objeto chega novo — este efeito é o que descarta rascunho já salvo e o que
  // troca o conteúdo quando o dono clica em outra pessoa da lista.
  useEffect(() => {
    setNome(usuario.nome)
    setEmail(usuario.email ?? '')
    setPapel(usuario.papel)
    setCodusur(usuario.codusur === null ? '' : String(usuario.codusur))
    setRestrito(usuario.restrito_a_carteira)
    setPermissoes(usuario.permissoes ?? [])
    setSugeridos(null)
    setFonteSugestao(null)
    setErro(null)
  }, [usuario])

  const rcaNumero = codusur.trim() === '' ? null : Number(codusur)
  const rcaInvalido = rcaNumero !== null && (!Number.isInteger(rcaNumero) || rcaNumero < 0)
  const eleMesmo = euId !== null && usuario.id === euId
  const travaSenha = porQueNaoPodeGerarSenha(usuario, euId)

  const dadosMudaram =
    nome.trim() !== usuario.nome
    || (email.trim() || null) !== (usuario.email || null)
    || papel !== usuario.papel
    || rcaNumero !== usuario.codusur
    || restrito !== usuario.restrito_a_carteira

  const permissoesMudaram = !mesmoConjunto(
    normalizarRecursos(permissoes, catalogo),
    normalizarRecursos(usuario.permissoes ?? [], catalogo),
  )

  const mudou = dadosMudaram || permissoesMudaram
  const podeSalvar = mudou && !ocupado && !rcaInvalido && nome.trim().length > 0

  function salvar() {
    // promover a administrador é a única troca que não se desfaz sozinha: quem
    // recebe passa a mandar em todo mundo, inclusive em quem promoveu
    if (papel === 'admin' && usuario.papel !== 'admin') {
      setConfirmarAdmin(true)
      return
    }
    gravar()
  }

  function gravar() {
    setConfirmarAdmin(false)
    const patch: PatchUsuario | null = dadosMudaram
      ? {
          nome: nome.trim(),
          email: email.trim() || null,
          papel,
          codusur: rcaNumero,
          restrito_a_carteira: restrito,
        }
      : null
    // 'admin' vê tudo por definição (permissoes.permitidos); as caixas ficam
    // desabilitadas nesse caso e não faz sentido reenviá-las
    const recursos = permissoesMudaram && papel !== 'admin' ? normalizarRecursos(permissoes, catalogo) : null
    aoSalvar(patch, recursos)
  }

  function descartar() {
    setNome(usuario.nome)
    setEmail(usuario.email ?? '')
    setPapel(usuario.papel)
    setCodusur(usuario.codusur === null ? '' : String(usuario.codusur))
    setRestrito(usuario.restrito_a_carteira)
    setPermissoes(usuario.permissoes ?? [])
    setSugeridos(null)
    setFonteSugestao(null)
  }

  async function sugerirPeloErp() {
    setBuscandoSugestao(true)
    setErro(null)
    try {
      const r = await chamar<SugestaoErp>(`/api/usuarios/${usuario.id}/sugestao-erp`)
      const meta = r?.meta ?? {}
      // usuário sem matrícula, ou PCCONTRO/PCROTINA fora do espelho: o backend
      // explica o motivo e a tela repete a explicação dele, sem inventar outra
      if (meta.disponivel === false) {
        setSugeridos(null)
        setFonteSugestao(null)
        setErro(meta.aviso || 'A sugestão pelo ERP não está disponível para este usuário.')
        return
      }
      const recursos = normalizarRecursos(recursosDaSugestao(r), catalogo)
      setFonteSugestao(origemDaSugestao(r ?? null))
      if (!recursos.length) {
        setSugeridos([])
        setErro(
          'O ERP não deu pista nenhuma para esta pessoa: nenhum módulo do WinThor que ela usa '
          + 'corresponde a relatório do BI. Marque na mão.',
        )
        return
      }
      setSugeridos(recursos)
      setPermissoes(recursos)
    } catch (e) {
      setErro(
        ehProibido(e)
          ? 'Sem permissão para consultar o acesso desta pessoa no ERP.'
          : mensagemDoErro(e),
      )
    } finally {
      setBuscandoSugestao(false)
    }
  }

  const fora = desligadoNoErp(usuario)

  return (
    <section className="tile tile-active p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="label-caps">Permissões de</p>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight mt-0.5">{usuario.nome}</h2>
          <p className="text-muted text-xs font-mono mt-1">
            {usuario.login}
            {usuario.matricula !== null ? ` · matrícula ${usuario.matricula}` : ' · cadastro manual'}
            {' · '}
            {usuario.tem_senha ? 'senha definida' : 'ainda sem senha'}
            {usuario.ultimo_login ? ` · último acesso ${dataHora(usuario.ultimo_login)}` : ' · nunca entrou'}
          </p>
        </div>
        <button onClick={aoFechar} aria-label="Fechar painel" className="text-muted hover:text-ink p-1 -mr-1 -mt-1">
          <X className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex flex-col gap-4">
        {fora && (
          <Aviso tom="erro">
            <strong className="font-semibold">Desligado no ERP</strong> (situação {usuario.situacao_erp} em
            PCEMPR). O login desta pessoa já é recusado pelo servidor, independentemente do que estiver
            marcado aqui. Desative o cadastro para tirá-lo da lista de quem tem acesso.
          </Aviso>
        )}

        {usuario.bloqueado && usuario.ativo && (
          <Aviso tom="alerta">
            <strong className="font-semibold">Login bloqueado por tentativas erradas.</strong> Sai sozinho
            em alguns minutos; gerar uma senha provisória também destrava na hora.
          </Aviso>
        )}

        {!usuario.ativo && !fora && (
          <Aviso tom="alerta">
            Cadastro <strong className="font-semibold">desativado</strong> no BI: a pessoa não entra e a
            sessão dela cai no próximo clique. As permissões abaixo continuam guardadas e voltam a valer se
            você reativar.
          </Aviso>
        )}

        {erro && <Aviso tom="alerta" aoFechar={() => setErro(null)}>{erro}</Aviso>}

        {/* ── identidade e papel ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            rotulo="Nome"
            htmlFor="cfg-nome"
            dica={
              usuario.origem === 'erp'
                ? 'O nome oficial vem do WinThor; o que você escrever aqui vale só dentro do BI.'
                : undefined
            }
          >
            <input
              id="cfg-nome"
              className={CLASSE_INPUT}
              value={nome}
              maxLength={80}
              onChange={(e) => setNome(e.target.value)}
            />
          </Campo>

          <Campo
            rotulo="E-mail (opcional)"
            htmlFor="cfg-email"
            dica="Serve como identificador alternativo no login. Só 2 dos 28 funcionários têm e-mail no ERP — ninguém é obrigado a ter."
          >
            <input
              id="cfg-email"
              className={CLASSE_INPUT}
              value={email}
              maxLength={120}
              inputMode="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Papel" htmlFor="cfg-papel" dica={PAPEIS.find((p) => p.id === papel)?.descricao}>
            <select
              id="cfg-papel"
              className={CLASSE_INPUT}
              value={papel}
              disabled={eleMesmo}
              onChange={(e) => setPapel(e.target.value as Papel)}
            >
              {PAPEIS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </select>
            {eleMesmo && (
              <p className="text-muted text-xs mt-1.5">
                Você não pode mudar o próprio papel — seria a forma mais rápida de o BI ficar sem
                administrador.
              </p>
            )}
          </Campo>

          <Campo
            rotulo="Carteira (RCA)"
            htmlFor="cfg-rca"
            dica={
              // ★ o nome da carteira confirma o número: o RCA 6 foi reciclado de
              // JOAO PEDRO (desligado) para BRUNO MATIAS, e "RCA 6" sozinho faria o
              // dono conferir contra a memória — que está desatualizada
              usuario.carteira_nome && rcaNumero === usuario.codusur
                ? `Hoje aponta para ${usuario.carteira_nome}. Deixe vazio para quem não tem carteira.`
                : 'Código do vendedor no WinThor. Deixe vazio para quem não tem carteira.'
            }
          >
            <input
              id="cfg-rca"
              className={CLASSE_INPUT}
              value={codusur}
              inputMode="numeric"
              placeholder="ex.: 5"
              maxLength={6}
              onChange={(e) => setCodusur(e.target.value.replace(/\D/g, ''))}
            />
          </Campo>
        </div>

        {/* ── a terceira camada: a carteira ──────────────────────────────── */}
        <div className="border border-line rounded p-3.5">
          <Marcar
            forte
            marcado={restrito}
            aoMudar={setRestrito}
            rotulo="Restringir à própria carteira"
            dica={
              'O filtro é aplicado no servidor: esta pessoa só recebe os números do RCA acima, e não vê '
              + 'o dos colegas nem trocando o endereço da página.'
            }
          />
          {restrito && rcaNumero === null && (
            <p className="text-danger text-xs mt-2.5 pl-6.5 leading-relaxed">
              <strong className="font-semibold">Falta o RCA.</strong> Restrito sem carteira vinculada faz o
              servidor recusar TODA consulta desta pessoa — ela entra no BI e não vê relatório nenhum.
              Preencha o campo Carteira acima.
            </p>
          )}
          {restricaoSemCarteira(usuario) && !restrito && (
            <p className="text-muted text-xs mt-2.5 pl-6.5">
              Estava restrito sem RCA — salvando assim, a restrição sai e a pessoa passa a ver a base
              inteira dentro do que estiver liberado abaixo.
            </p>
          )}
          <Nota>
            O vínculo pessoa → RCA é do BI, não do ERP: PCEMPR.CODUSUR traz 1 de fábrica em 20 das 28
            linhas e daria a carteira do Marcelo Curado para COMPRAS, TI e PCADMIN. Nas telas de venda a
            carteira segue o vendedor do movimento; nas de cadastro de cliente, o vendedor do cadastro —
            os dois números podem divergir e cada tela diz qual está usando.
          </Nota>
        </div>

        {/* ── permissões ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink">O que esta pessoa vê</h3>
              <p className="text-muted text-sm mt-0.5">
                Marque a aba para liberar o grupo inteiro; desmarque relatório por relatório o que não
                deve aparecer.
              </p>
            </div>
            <button
              className={BOTAO}
              onClick={sugerirPeloErp}
              // sem matrícula não há ACL no ERP para consultar; e para admin a matriz
              // inteira está desabilitada, então sugerir não mudaria nada na tela
              disabled={buscandoSugestao || papel === 'admin' || usuario.matricula === null}
              title={
                usuario.matricula === null
                  ? 'Cadastro manual, sem vínculo com o ERP — não há acesso do WinThor para consultar'
                  : undefined
              }
            >
              {buscandoSugestao ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} aria-hidden />
              ) : (
                <Sparkles className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              )}
              Sugerir pelo acesso do ERP
            </button>
          </div>

          {sugeridos !== null && (
            <div className="mb-3">
              <Aviso tom="info">
                Sugestão montada a partir do acesso REAL desta pessoa no WinThor — as rotinas liberadas
                para ela em PCCONTRO, agrupadas por módulo
                {fonteSugestao ? `: ${fonteSugestao}` : ''}. Ela substituiu o que estava marcado, mas{' '}
                <strong className="font-semibold">nada foi salvo</strong>: confira item a item e clique em
                Salvar, ou em Descartar para voltar. O que a pessoa abre no ERP nem sempre é o que ela
                precisa ver no BI.
              </Aviso>
            </div>
          )}

          {papel === 'admin' && (
            <div className="mb-3">
              <Aviso tom="alerta">
                <strong className="font-semibold">Administrador enxerga todos os relatórios</strong>,
                independentemente das caixas abaixo — elas ficam guardadas e voltam a valer se você trocar o
                papel para Gestor ou Leitor.
              </Aviso>
            </div>
          )}

          <MatrizPermissoes
            catalogo={catalogo}
            marcados={permissoes}
            papel={papel}
            desabilitado={papel === 'admin'}
            sugeridos={sugeridos}
            aoMudar={setPermissoes}
          />
        </div>

        {/* ── ações ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line">
          <button className={BOTAO_PRINCIPAL} onClick={salvar} disabled={!podeSalvar}>
            {ocupado && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} aria-hidden />}
            Salvar alterações
          </button>
          <button className={BOTAO} onClick={descartar} disabled={!mudou || ocupado}>
            Descartar
          </button>

          <span className="flex-1" />

          <button
            className={BOTAO}
            onClick={() => aoGerarSenha(usuario)}
            disabled={ocupado || travaSenha !== null}
            title={travaSenha ?? undefined}
          >
            <KeyRound className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            {usuario.tem_senha ? 'Gerar nova senha' : 'Gerar senha de acesso'}
          </button>
          <button
            className={usuario.ativo ? BOTAO_PERIGO : BOTAO}
            onClick={() => aoAlternarAtivo(usuario)}
            disabled={ocupado || eleMesmo}
            title={eleMesmo ? 'Você não pode desativar o próprio usuário' : undefined}
          >
            {usuario.ativo ? (
              <>
                <Power className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                Desativar acesso
              </>
            ) : (
              <>
                <PowerOff className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                Reativar acesso
              </>
            )}
          </button>
        </div>

        {mudou && (
          <p className="text-amber text-xs">
            Há alterações não salvas neste painel.
            {rcaInvalido && ' O campo Carteira precisa ser um número inteiro.'}
          </p>
        )}
      </div>

      {confirmarAdmin && (
        <Confirmar
          titulo="Tornar administrador?"
          rotuloConfirmar={`Sim, ${usuario.nome.split(' ')[0]} vira administrador`}
          perigo
          ocupado={ocupado}
          aoConfirmar={gravar}
          aoCancelar={() => setConfirmarAdmin(false)}
        >
          <p>
            <strong className="font-semibold text-ink">{usuario.nome}</strong> passa a ver todos os
            relatórios do BI — inclusive o vencido e a lista de devedores — e a poder criar usuários, gerar
            senhas, mudar permissões e desativar contas, inclusive a sua.
          </p>
          <p className="mt-2 text-muted">
            Para dar acesso amplo sem esse poder, use o papel{' '}
            <strong className="font-semibold text-ink-soft">{rotuloPapel('gestor')}</strong>.
          </p>
        </Confirmar>
      )}
    </section>
  )
}
