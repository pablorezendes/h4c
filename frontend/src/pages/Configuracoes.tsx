import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, UserPlus, Users } from 'lucide-react'
import Layout from '../components/Layout'
import ImportarErp from '../components/config/ImportarErp'
import ListaUsuarios from '../components/config/ListaUsuarios'
import NovoUsuario, { type NovoUsuarioDados } from '../components/config/NovoUsuario'
import PainelUsuario, { type PatchUsuario } from '../components/config/PainelUsuario'
import SenhaProvisoria from '../components/config/SenhaProvisoria'
import { Aviso, BOTAO, BOTAO_PRINCIPAL, Confirmar, Esqueleto, Nota } from '../components/config/pecas'
import { recarregarSessao, useSessao } from '../lib/sessao'
import {
  chamar,
  comoLista,
  desligadoNoErp,
  ehProibido,
  mensagemDoErro,
  rotuloPapel,
  type Importavel,
  type MetaImportaveis,
  type RecursoCatalogo,
  type RespostaImportaveis,
  type RespostaImportar,
  type RespostaUsuarios,
  type Usuario,
} from '../components/config/tipos'

/**
 * CONFIGURAÇÕES — usuários e permissões.
 *
 * A tela existe para o dono operar sozinho, sem TI, e faz três trabalhos:
 *   1. LISTA      — quem tem acesso, em que estado, com ativar/desativar e senha;
 *   2. IMPORTAR   — trazer as pessoas do WinThor, com papel e carteira sugeridos;
 *   3. PERMISSÕES — aba -> relatório -> carteira, por pessoa.
 *
 * ★ NADA AQUI É CONTROLE DE ACESSO DE VERDADE. Esta tela grava intenção; quem
 *   barra é o backend, em toda requisição (`requer()`, `requer_admin()`,
 *   `escopo_rca()`). Se um dia esta página inteira for exposta por engano, o pior
 *   que acontece é alguém ver botões que o servidor recusa.
 *
 * ★ QUEM SOU EU VEM DA SESSÃO (lib/sessao.ts), e não de palpite: é o que permite
 *   marcar "você" na lista e travar, já no botão, os dois tiros no pé que o
 *   backend também recusa — desativar a própria conta e mudar o próprio papel.
 *   A trava daqui é cortesia; a que vale é a de usuarios.py.
 */

interface Confirmacao {
  titulo: string
  corpo: ReactNode
  rotulo: string
  perigo?: boolean
  acao: () => void
}

export default function Configuracoes() {
  // ★ a sessão vem de lib/sessao.ts, que já carregou /api/auth/eu uma vez para o
  //   menu. Pedir de novo aqui só para saber quem sou eu daria duas verdades sobre
  //   a mesma pessoa — e a segunda envelheceria sozinha.
  const { situacao, sessao, erro: erroSessao } = useSessao()
  const souAdmin = sessao?.papel === 'admin'

  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null)
  const [catalogo, setCatalogo] = useState<RecursoCatalogo[]>([])
  const [importaveis, setImportaveis] = useState<Importavel[] | null>(null)
  const [metaImportaveis, setMetaImportaveis] = useState<MetaImportaveis | null>(null)
  const [erroImportaveis, setErroImportaveis] = useState<string | null>(null)

  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'alerta'; texto: string; itens?: string[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; login: string; senha: string } | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [erroNovo, setErroNovo] = useState<string | null>(null)

  const painel = useRef<HTMLDivElement>(null)

  // ── carga ────────────────────────────────────────────────────────────────
  const carregarUsuarios = useCallback(async () => {
    // o backend responde {rows, meta}; `comoLista` também aceita o array puro,
    // para a tela não quebrar se o envelope mudar
    const r = await chamar<RespostaUsuarios>('/api/usuarios')
    setUsuarios(comoLista<Usuario>(r))
  }, [])

  const carregarImportaveis = useCallback(async () => {
    try {
      const r = await chamar<RespostaImportaveis>('/api/usuarios/importaveis')
      setImportaveis(comoLista<Importavel>(r))
      setMetaImportaveis(r?.meta ?? null)
      setErroImportaveis(null)
    } catch (e) {
      // o espelho do WinThor pode estar vazio (sync ainda não rodou) sem que isso
      // impeça de administrar quem já existe: o erro fica preso nesta seção
      setImportaveis([])
      setMetaImportaveis(null)
      setErroImportaveis(
        `Não consegui ler as pessoas do ERP. ${mensagemDoErro(e)} `
        + 'O cadastro manual continua funcionando.',
      )
    }
  }, [])

  const carregarTudo = useCallback(async () => {
    setErro(null)
    try {
      const cat = await chamar<{ recursos: RecursoCatalogo[] }>('/api/usuarios/recursos')
      setCatalogo(comoLista<RecursoCatalogo>(cat))
      await carregarUsuarios()
    } catch (e) {
      if (ehProibido(e)) {
        // a sessão em memória diz "admin" e o servidor diz que não: alguém trocou o
        // papel desta pessoa com a tela aberta. Recarregar a sessão faz a tela se
        // trocar pela explicação certa, em vez de exibir um erro cru sobre uma
        // permissão que ela acha que tem.
        void recarregarSessao()
      }
      setErro(mensagemDoErro(e))
      return
    }
    await carregarImportaveis()
  }, [carregarImportaveis, carregarUsuarios])

  useEffect(() => {
    if (souAdmin) void carregarTudo()
  }, [souAdmin, carregarTudo])

  // o painel abre longe do clique em telas pequenas — sem isto o dono seleciona
  // alguém e acha que nada aconteceu
  useEffect(() => {
    if (selecionado !== null) painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selecionado])

  // aviso de sucesso some sozinho; o de alerta fica até o dono fechar
  useEffect(() => {
    if (aviso?.tom !== 'ok') return
    const t = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(t)
  }, [aviso])

  // ── operações ────────────────────────────────────────────────────────────
  async function comOcupado(trabalho: () => Promise<void>) {
    setOcupado(true)
    setErro(null)
    try {
      await trabalho()
    } catch (e) {
      setAviso({ tom: 'alerta', texto: mensagemDoErro(e) })
    } finally {
      setOcupado(false)
    }
  }

  const salvar = (id: number, patch: PatchUsuario | null, recursos: string[] | null) =>
    comOcupado(async () => {
      // ★ os `avisos` da resposta são o valor do backend chegando à tela: "a carteira
      //   5 também está com fulano", "restrito sem RCA não vê nada". Engolir isso
      //   deixaria o dono achando que salvou e está tudo certo.
      const recados: string[] = []
      if (patch) {
        const r = await chamar<Usuario>(`/api/usuarios/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        })
        recados.push(...(r?.avisos ?? []))
      }
      if (recursos) {
        const r = await chamar<{ concedidos?: string[]; revogados?: string[]; avisos?: string[] }>(
          `/api/usuarios/${id}/permissoes`,
          { method: 'PUT', body: JSON.stringify({ recursos }) },
        )
        recados.push(...(r?.avisos ?? []))
        const n = (r?.concedidos ?? []).length
        const m = (r?.revogados ?? []).length
        if (n || m) recados.push(`${n} item(ns) liberado(s) e ${m} retirado(s).`)
      }
      await carregarUsuarios()
      // mexeu na própria conta (carteira, restrição): a sessão em memória alimenta o
      // menu e o recorte das telas, e ficaria desatualizada até o próximo F5
      if (id === sessao?.id) void recarregarSessao()
      setAviso({
        tom: 'ok',
        texto: 'Alterações salvas — valem já na próxima tela que a pessoa abrir.',
        itens: recados,
      })
    })

  const gerarSenha = (u: Usuario) =>
    comOcupado(async () => {
      const r = await chamar<{ senha_provisoria?: string; senha?: string }>(`/api/usuarios/${u.id}/senha`, {
        method: 'POST',
      })
      const senha = r?.senha_provisoria || r?.senha || ''
      await carregarUsuarios()
      if (!senha) {
        setAviso({
          tom: 'alerta',
          texto: 'O servidor gerou a senha mas não a devolveu. Gere de novo para conseguir anotá-la.',
        })
        return
      }
      setSenhaGerada({ nome: u.nome, login: u.login, senha })
    })

  const pedirSenha = (u: Usuario) => {
    if (!u.tem_senha) return void gerarSenha(u)
    // trocar a senha de quem já tem derruba a sessão aberta dela — não é o que o
    // dono espera quando clica achando que só está "vendo" a senha
    setConfirmacao({
      titulo: 'Gerar uma senha nova?',
      rotulo: 'Gerar senha nova',
      perigo: true,
      corpo: (
        <>
          <p>
            <strong className="font-semibold text-ink">{u.nome}</strong> já tem senha própria. Gerar outra
            invalida a atual na hora, derruba a sessão aberta dela e obriga a trocar no próximo acesso.
          </p>
          <p className="mt-2 text-muted">Faça isso quando a pessoa esqueceu a senha ou você desconfia de vazamento.</p>
        </>
      ),
      acao: () => {
        setConfirmacao(null)
        void gerarSenha(u)
      },
    })
  }

  const alternarAtivo = (u: Usuario) => {
    if (u.ativo) {
      setConfirmacao({
        titulo: `Desativar ${u.nome}?`,
        rotulo: 'Desativar acesso',
        perigo: true,
        corpo: (
          <>
            <p>
              A pessoa deixa de entrar no BI imediatamente e a sessão aberta dela cai no próximo clique. O
              cadastro, as permissões e a carteira continuam guardados — dá para reativar depois.
            </p>
            {desligadoNoErp(u) && (
              <p className="mt-2 text-muted">
                Esta pessoa já consta como desligada no ERP, então o servidor já recusa o login dela.
                Desativar aqui é o que tira a linha vermelha da lista.
              </p>
            )}
          </>
        ),
        acao: () => {
          setConfirmacao(null)
          void comOcupado(async () => {
            await chamar(`/api/usuarios/${u.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ ativo: false }),
            })
            await carregarUsuarios()
            setAviso({ tom: 'ok', texto: `${u.nome} não entra mais no BI.` })
          })
        },
      })
      return
    }
    void comOcupado(async () => {
      await chamar(`/api/usuarios/${u.id}`, { method: 'PATCH', body: JSON.stringify({ ativo: true }) })
      await carregarUsuarios()
      setAviso({
        tom: 'ok',
        texto: u.tem_senha
          ? `${u.nome} voltou a ter acesso.`
          : `${u.nome} foi reativado, mas ainda não tem senha — gere uma para ele entrar.`,
      })
    })
  }

  const importar = (matriculas: number[]) =>
    comOcupado(async () => {
      const r = await chamar<RespostaImportar>('/api/usuarios/importar', {
        method: 'POST',
        body: JSON.stringify({ matriculas }),
      })
      await carregarUsuarios()
      await carregarImportaveis()
      // ★ o backend importa UMA PESSOA POR TRANSAÇÃO e devolve quem ficou de fora,
      //   com o motivo. Dizer só "importado" quando 3 das 12 foram ignoradas é o
      //   tipo de mentira que só aparece semanas depois, quando alguém não entra.
      const criados = r?.criados ?? []
      const ignorados = r?.ignorados ?? []
      const quantos = criados.length || matriculas.length - ignorados.length
      setAviso({
        tom: ignorados.length ? 'alerta' : 'ok',
        texto:
          `${quantos} ${quantos === 1 ? 'pessoa importada' : 'pessoas importadas'} do ERP. `
          + 'Confira papel e carteira de cada uma e gere a senha provisória — sem senha ninguém entra.',
        itens: [
          ...ignorados.map((i) => `Fora: ${i.login ?? `matrícula ${i.matricula}`} — ${i.motivo}.`),
          ...criados.flatMap((c) => (c.alertas ?? []).map((a) => `${c.nome}: ${a}`)),
        ],
      })
    })

  const criar = (dados: NovoUsuarioDados) =>
    comOcupado(async () => {
      setErroNovo(null)
      try {
        const criado = await chamar<Usuario>('/api/usuarios', {
          method: 'POST',
          body: JSON.stringify(dados),
        })
        await carregarUsuarios()
        setNovoAberto(false)
        if (criado?.id) setSelecionado(criado.id)
        setAviso({
          tom: 'ok',
          texto: `${dados.nome} foi cadastrado. Gere a senha provisória para liberar a entrada.`,
          itens: criado?.avisos ?? [],
        })
      } catch (e) {
        // o formulário fica aberto com o que foi digitado: login repetido é o erro
        // mais comum aqui, e reabrir tudo do zero seria castigo
        setErroNovo(mensagemDoErro(e))
      }
    })

  // ── estados de tela ──────────────────────────────────────────────────────
  const lista = usuarios ?? []
  const selecionadoObj = lista.find((u) => u.id === selecionado) ?? null
  const desligados = lista.filter(desligadoNoErp).length
  const semSenha = lista.filter((u) => u.ativo && !u.tem_senha).length
  const ativos = lista.filter((u) => u.ativo).length

  if (!sessao) {
    return (
      <Layout>
        <Cabecalho />
        {situacao === 'erro' ? (
          <Aviso tom="erro">
            Não consegui carregar a sua sessão. {erroSessao ?? ''}
          </Aviso>
        ) : (
          <Esqueleto altura="h-40" />
        )}
      </Layout>
    )
  }

  if (!souAdmin) {
    return (
      <Layout>
        <Cabecalho />
        <Aviso tom="erro">
          <strong className="font-semibold">Esta tela é do administrador do BI.</strong> Seu usuário (
          {sessao.login}) entra como {rotuloPapel(sessao.papel)} e não administra usuários, senhas nem
          permissões. Peça a quem administra o BI.
        </Aviso>
      </Layout>
    )
  }

  return (
    <Layout>
      <Cabecalho />

      <div className="flex flex-col gap-5">
        {erro && (
          <Aviso tom="erro" aoFechar={() => setErro(null)}>
            {erro}
          </Aviso>
        )}
        {aviso && (
          <Aviso tom={aviso.tom === 'ok' ? 'ok' : 'alerta'} aoFechar={() => setAviso(null)}>
            {aviso.texto}
            {(aviso.itens ?? []).length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1 text-ink-soft">
                {(aviso.itens ?? []).map((i) => (
                  <li key={i} className="text-xs leading-relaxed">
                    · {i}
                  </li>
                ))}
              </ul>
            )}
          </Aviso>
        )}
        {sessao.bootstrap && (
          <Aviso tom="alerta">
            Você entrou pela <strong className="font-semibold">conta de emergência</strong> do servidor, que
            não aparece na lista abaixo e não deixa rastro com nome próprio na auditoria. Crie um usuário
            para você — administrador — e passe a entrar por ele.
          </Aviso>
        )}
        {desligados > 0 && (
          <Aviso tom="erro">
            <strong className="font-semibold">
              {desligados} {desligados === 1 ? 'pessoa desligada' : 'pessoas desligadas'} no ERP
            </strong>{' '}
            ainda {desligados === 1 ? 'tem' : 'têm'} cadastro aqui. O login já é recusado pelo servidor;
            desative o cadastro para fechar a conta de vez. {desligados === 1 ? 'Está' : 'Estão'} no topo da
            lista, em vermelho.
          </Aviso>
        )}

        {/* ── 1. lista de usuários ─────────────────────────────────────── */}
        <section className="tile p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Quem tem acesso</h2>
              <p className="text-muted text-sm mt-0.5">
                {usuarios === null
                  ? 'carregando…'
                  : `${lista.length} ${lista.length === 1 ? 'cadastro' : 'cadastros'} · ${ativos} ativo(s)`}
                {semSenha > 0 && ` · ${semSenha} ainda sem senha`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={BOTAO} onClick={() => void carregarTudo()} disabled={ocupado}>
                {ocupado ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} aria-hidden />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                )}
                Atualizar
              </button>
              <button
                className={BOTAO_PRINCIPAL}
                onClick={() => {
                  setErroNovo(null)
                  setNovoAberto(true)
                }}
              >
                <UserPlus className="w-4 h-4" strokeWidth={2} aria-hidden />
                Cadastrar usuário
              </button>
            </div>
          </div>

          {usuarios === null ? (
            <Esqueleto altura="h-32" />
          ) : lista.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="w-8 h-8 mx-auto text-muted" strokeWidth={1.5} aria-hidden />
              <p className="font-display text-lg font-semibold text-ink mt-3">Ninguém foi cadastrado ainda</p>
              <p className="text-muted text-sm mt-1.5 max-w-xl mx-auto leading-relaxed">
                Comece importando as pessoas do WinThor na seção abaixo — a identidade vem do ERP e a senha é
                criada aqui. Quem não tem login no ERP entra pelo botão Cadastrar usuário.
              </p>
            </div>
          ) : (
            <>
              <ListaUsuarios
                usuarios={lista}
                euId={sessao.id}
                selecionado={selecionado}
                ocupado={ocupado}
                aoSelecionar={(id) => setSelecionado((atual) => (atual === id ? null : id))}
                aoGerarSenha={pedirSenha}
                aoAlternarAtivo={alternarAtivo}
              />
              <Nota>
                Clique em alguém para abrir as permissões. A senha nunca é exibida depois de gerada: o BI
                guarda só o resultado criptografado dela, e a senha do WinThor não é usada nem copiada.
              </Nota>
            </>
          )}
        </section>

        {/* ── 2. painel do usuário selecionado ─────────────────────────── */}
        <div ref={painel}>
          {selecionadoObj && (
            <PainelUsuario
              usuario={selecionadoObj}
              catalogo={catalogo}
              euId={sessao.id}
              ocupado={ocupado}
              aoFechar={() => setSelecionado(null)}
              aoSalvar={(patch, recursos) => void salvar(selecionadoObj.id, patch, recursos)}
              aoGerarSenha={pedirSenha}
              aoAlternarAtivo={alternarAtivo}
            />
          )}
        </div>

        {/* ── 3. importação do ERP ─────────────────────────────────────── */}
        <ImportarErp
          itens={importaveis}
          meta={metaImportaveis}
          carregando={usuarios === null}
          ocupado={ocupado}
          erro={erroImportaveis}
          aoImportar={(matriculas) => void importar(matriculas)}
          aoCadastrarManual={() => {
            setErroNovo(null)
            setNovoAberto(true)
          }}
        />
      </div>

      {novoAberto && (
        <NovoUsuario
          ocupado={ocupado}
          erro={erroNovo}
          aoCriar={(dados) => void criar(dados)}
          aoFechar={() => setNovoAberto(false)}
        />
      )}

      {senhaGerada && (
        <SenhaProvisoria
          nome={senhaGerada.nome}
          login={senhaGerada.login}
          senha={senhaGerada.senha}
          aoFechar={() => setSenhaGerada(null)}
        />
      )}

      {confirmacao && (
        <Confirmar
          titulo={confirmacao.titulo}
          rotuloConfirmar={confirmacao.rotulo}
          perigo={confirmacao.perigo}
          ocupado={ocupado}
          aoConfirmar={confirmacao.acao}
          aoCancelar={() => setConfirmacao(null)}
        >
          {confirmacao.corpo}
        </Confirmar>
      )}
    </Layout>
  )
}

function Cabecalho() {
  return (
    <header className="mb-5 sm:mb-6 surgir">
      <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Configurações</h1>
      <p className="text-muted mt-2 text-sm sm:text-base">
        Quem entra no BI, o que cada um enxerga e até onde vai a carteira de cada vendedor
      </p>
    </header>
  )
}
