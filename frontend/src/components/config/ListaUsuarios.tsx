import { KeyRound, Power, PowerOff, SlidersHorizontal } from 'lucide-react'
import { Vazio } from './pecas'
import {
  carteiraTexto,
  dataHora,
  desligadoNoErp,
  estadoDoAcesso,
  porQueNaoPodeGerarSenha,
  restricaoSemCarteira,
  rotuloPapel,
  type Usuario,
} from './tipos'

/**
 * Quem tem acesso ao BI.
 *
 * A lista responde, em uma passada de olho, as quatro perguntas que o dono faz:
 * quem é, o que essa pessoa vê (papel + carteira), se ela já consegue entrar
 * (senha) e se ainda deveria conseguir (situação no ERP).
 *
 * ★ DESLIGADO NO ERP VEM PRIMEIRO E EM VERMELHO. Esse é o caso que custa caro:
 *   a pessoa saiu da empresa e o cadastro dela continua aqui. O backend já recusa
 *   o login (auth.require_user relê PCEMPR a cada requisição), mas quem tem que
 *   apagar o cadastro é o dono — e ele só faz isso se a linha saltar aos olhos.
 */
export default function ListaUsuarios({
  usuarios,
  euId,
  selecionado,
  ocupado,
  aoSelecionar,
  aoGerarSenha,
  aoAlternarAtivo,
}: {
  usuarios: Usuario[]
  euId: number | null
  selecionado: number | null
  ocupado: boolean
  aoSelecionar: (id: number) => void
  aoGerarSenha: (u: Usuario) => void
  aoAlternarAtivo: (u: Usuario) => void
}) {
  if (!usuarios.length) return <Vazio>nenhum usuário cadastrado ainda</Vazio>

  // desligado no ERP no topo, depois desativado, depois em ordem de nome
  const ordenados = [...usuarios].sort((a, b) => {
    const peso = (u: Usuario) => (desligadoNoErp(u) ? 0 : !u.ativo ? 1 : 2)
    return peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR')
  })

  const acao = 'p-2 rounded-sm text-muted hover:text-ink hover:bg-primary-wash transition-colors '
    + 'disabled:opacity-30 disabled:pointer-events-none'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr>
            {['Pessoa', 'Papel', 'Carteira', 'Situação', 'Último acesso', 'Origem', ''].map((c, i) => (
              <th
                key={c || i}
                className={`font-display text-ink font-semibold px-3 py-2 border-b border-line-strong ${
                  i === 6 ? 'text-right' : 'text-left'
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((u) => {
            const estado = estadoDoAcesso(u)
            const fora = desligadoNoErp(u)
            const eleMesmo = euId !== null && u.id === euId
            const travaSenha = porQueNaoPodeGerarSenha(u, euId)
            return (
              <tr
                key={u.id}
                onClick={() => aoSelecionar(u.id)}
                className={`cursor-pointer transition-colors align-top ${
                  selecionado === u.id ? 'bg-primary-wash' : 'hover:bg-primary-wash'
                } ${!u.ativo ? 'opacity-70' : ''}`}
              >
                <td
                  className={`px-3 py-2.5 border-b border-line ${
                    fora ? 'border-l-2 border-l-danger' : ''
                  }`}
                >
                  <span className="text-ink-soft font-semibold">{u.nome}</span>
                  {eleMesmo && <span className="text-primary text-[11px] font-mono ml-2">você</span>}
                  <span className="block text-muted text-[11px] font-mono mt-0.5">
                    {u.login}
                    {u.email ? ` · ${u.email}` : ''}
                  </span>
                </td>

                <td className="px-3 py-2.5 border-b border-line whitespace-nowrap">
                  <span
                    className={`chip border border-line ${
                      u.papel === 'admin' ? 'bg-primary-wash text-ink font-semibold' : 'text-muted'
                    }`}
                  >
                    {rotuloPapel(u.papel)}
                  </span>
                </td>

                <td className="px-3 py-2.5 border-b border-line whitespace-nowrap font-mono text-[12px]">
                  <span className={u.codusur === null ? 'text-muted' : 'text-ink-soft'}>
                    {carteiraTexto(u)}
                  </span>
                  {/* o nome confirma o número: o RCA 6 mudou de dono no ERP */}
                  {u.carteira_nome && (
                    <span className="block text-muted text-[11px] mt-0.5 font-sans">{u.carteira_nome}</span>
                  )}
                  {u.restrito_a_carteira && (
                    <span
                      className={`block text-[11px] mt-0.5 ${
                        restricaoSemCarteira(u) ? 'text-danger font-semibold' : 'text-muted'
                      }`}
                      title={
                        restricaoSemCarteira(u)
                          ? 'Restrito à própria carteira, mas sem RCA vinculado: o servidor recusa as consultas dessa pessoa.'
                          : 'Só enxerga os números do próprio RCA — filtro aplicado no servidor.'
                      }
                    >
                      {restricaoSemCarteira(u) ? 'restrito sem RCA' : 'só a própria'}
                    </span>
                  )}
                </td>

                <td className="px-3 py-2.5 border-b border-line whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${estado.classe}`}
                    title={estado.dica}
                  >
                    <span className={`dot ${estado.dot}`} aria-hidden />
                    {estado.rotulo}
                  </span>
                </td>

                <td className="px-3 py-2.5 border-b border-line whitespace-nowrap font-mono text-[12px] text-muted">
                  {u.ultimo_login ? dataHora(u.ultimo_login) : 'nunca entrou'}
                </td>

                <td className="px-3 py-2.5 border-b border-line whitespace-nowrap font-mono text-[11px] text-muted">
                  {u.origem === 'manual' ? (
                    <span title="Criado à mão nesta tela — não existe em PCEMPR">cadastro manual</span>
                  ) : (
                    <span title="Importado do WinThor">ERP · matrícula {u.matricula ?? '—'}</span>
                  )}
                </td>

                <td
                  className="px-3 py-2.5 border-b border-line text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-0.5">
                    <button
                      className={acao}
                      onClick={() => aoSelecionar(u.id)}
                      title="Abrir permissões e dados"
                      aria-label={`Abrir permissões de ${u.nome}`}
                    >
                      <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                    <button
                      className={acao}
                      disabled={ocupado || travaSenha !== null}
                      onClick={() => aoGerarSenha(u)}
                      title={
                        travaSenha
                          ?? (u.tem_senha
                            ? 'Gerar nova senha provisória'
                            : 'Gerar a senha provisória de acesso')
                      }
                      aria-label={`Gerar senha provisória de ${u.nome}`}
                    >
                      <KeyRound className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                    <button
                      className={acao}
                      disabled={ocupado || eleMesmo}
                      onClick={() => aoAlternarAtivo(u)}
                      title={
                        eleMesmo
                          ? 'Você não pode desativar o próprio usuário'
                          : u.ativo
                            ? 'Desativar o acesso'
                            : 'Reativar o acesso'
                      }
                      aria-label={`${u.ativo ? 'Desativar' : 'Reativar'} ${u.nome}`}
                    >
                      {u.ativo ? (
                        <Power className="w-4 h-4" strokeWidth={1.75} />
                      ) : (
                        <PowerOff className="w-4 h-4 text-danger" strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
