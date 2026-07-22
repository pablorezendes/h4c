import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Aviso, BOTAO, BOTAO_PRINCIPAL, Campo, CLASSE_INPUT, Marcar, Modal, Nota } from './pecas'
import { PAPEIS, type Papel } from './tipos'

export interface NovoUsuarioDados {
  login: string
  nome: string
  email: string | null
  papel: Papel
  codusur: number | null
  restrito_a_carteira: boolean
}

/**
 * Cadastro manual — a saída para quem não existe no ERP.
 *
 * ★ ESTE FORMULÁRIO NÃO É EXCEÇÃO RARA. A maior vendedora da empresa (RCA 5) fatura
 *   todo mês e não tem linha em PCEMPR: sem cadastro manual ela simplesmente não
 *   existe no BI. Vale também para sócio, contador e BPO — gente que precisa de
 *   relatório e nunca vai ter usuário de ERP.
 *
 * Sem campo de senha, de propósito: a senha nasce provisória, é gerada pelo botão
 * da lista e mostrada uma única vez. Assim ninguém escolhe a senha do outro.
 */
export default function NovoUsuario({
  ocupado,
  erro,
  aoCriar,
  aoFechar,
}: {
  ocupado: boolean
  erro: string | null
  aoCriar: (dados: NovoUsuarioDados) => void
  aoFechar: () => void
}) {
  const [login, setLogin] = useState('')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('leitor')
  const [codusur, setCodusur] = useState('')
  const [restrito, setRestrito] = useState(false)

  const loginLimpo = login.trim()
  // o login é o que a pessoa digita para entrar: espaço no meio vira suporte no
  // primeiro dia ("eu digitei igual e não entra")
  const loginValido = /^[\w.@-]{2,40}$/.test(loginLimpo)
  const rca = codusur.trim() === '' ? null : Number(codusur)
  const pronto = loginValido && nome.trim().length >= 2 && !ocupado

  return (
    <Modal titulo="Cadastrar usuário manualmente" aoFechar={aoFechar}>
      <div className="flex flex-col gap-4">
        <Aviso tom="info">
          Use este cadastro para quem <strong className="font-semibold">não tem login no WinThor</strong> —
          a maior vendedora da empresa está nesse caso. Quem tem login no ERP deve vir pela importação, para
          o BI conseguir cortar o acesso sozinho no dia em que a pessoa for desligada.
        </Aviso>

        {erro && <Aviso tom="alerta">{erro}</Aviso>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            rotulo="Usuário (login)"
            htmlFor="novo-login"
            dica="É o que a pessoa digita na tela de entrada. Letras, números, ponto, hífen e arroba."
          >
            <input
              id="novo-login"
              className={CLASSE_INPUT}
              value={login}
              maxLength={40}
              autoFocus
              placeholder="ex.: fernanda.moura"
              onChange={(e) => setLogin(e.target.value.replace(/\s/g, ''))}
            />
            {login !== '' && !loginValido && (
              <p className="text-danger text-xs mt-1.5">
                Use de 2 a 40 caracteres, sem espaço e sem acento.
              </p>
            )}
          </Campo>

          <Campo rotulo="Nome" htmlFor="novo-nome" dica="Como aparece na lista de usuários e na auditoria.">
            <input
              id="novo-nome"
              className={CLASSE_INPUT}
              value={nome}
              maxLength={80}
              placeholder="ex.: Fernanda Moura"
              onChange={(e) => setNome(e.target.value)}
            />
          </Campo>

          <Campo rotulo="E-mail (opcional)" htmlFor="novo-email" dica="Identificador alternativo no login.">
            <input
              id="novo-email"
              className={CLASSE_INPUT}
              value={email}
              maxLength={120}
              inputMode="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Papel" htmlFor="novo-papel" dica={PAPEIS.find((p) => p.id === papel)?.descricao}>
            <select
              id="novo-papel"
              className={CLASSE_INPUT}
              value={papel}
              onChange={(e) => setPapel(e.target.value as Papel)}
            >
              {PAPEIS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            rotulo="Carteira (RCA)"
            htmlFor="novo-rca"
            dica="Código do vendedor no WinThor. Vazio para quem não vende."
          >
            <input
              id="novo-rca"
              className={CLASSE_INPUT}
              value={codusur}
              inputMode="numeric"
              maxLength={6}
              placeholder="ex.: 5"
              onChange={(e) => setCodusur(e.target.value.replace(/\D/g, ''))}
            />
          </Campo>
        </div>

        <div className="border border-line rounded p-3.5">
          <Marcar
            marcado={restrito}
            aoMudar={setRestrito}
            rotulo="Restringir à própria carteira"
            dica="O filtro é aplicado no servidor: a pessoa não vê o número dos outros vendedores nem trocando o endereço da página."
          />
          {restrito && rca === null && (
            <p className="text-amber text-xs mt-2 pl-6.5">
              Sem RCA preenchido, o servidor vai recusar as consultas dessa pessoa até você vincular a
              carteira.
            </p>
          )}
        </div>

        <Nota>
          O cadastro nasce <strong className="font-semibold text-ink-soft">sem senha</strong>. Depois de
          criar, use o botão de chave na lista para gerar a senha provisória e passá-la à pessoa.
        </Nota>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button className={BOTAO} onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            className={BOTAO_PRINCIPAL}
            disabled={!pronto}
            onClick={() =>
              aoCriar({
                login: loginLimpo,
                nome: nome.trim(),
                email: email.trim() || null,
                papel,
                codusur: rca,
                restrito_a_carteira: restrito,
              })
            }
          >
            {ocupado && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} aria-hidden />}
            Criar usuário
          </button>
        </div>
      </div>
    </Modal>
  )
}
