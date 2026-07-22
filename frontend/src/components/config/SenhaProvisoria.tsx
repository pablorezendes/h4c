import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Aviso, BOTAO, BOTAO_PRINCIPAL, Modal, Nota } from './pecas'

/**
 * A senha provisória, mostrada UMA única vez.
 *
 * ★ NÃO EXISTE "VER A SENHA DE NOVO". O banco guarda só o hash pbkdf2; nem o dono,
 *   nem o suporte, nem este código conseguem recuperar o texto depois que esta
 *   janela fecha. Se a pessoa perder, o caminho é gerar outra — e é por isso que o
 *   aviso está em vermelho e o botão de fechar diz "já anotei", em vez de um X
 *   silencioso que se clica sem ler.
 */
export default function SenhaProvisoria({
  nome,
  login,
  senha,
  aoFechar,
}: {
  nome: string
  login: string
  senha: string
  aoFechar: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [falhouCopiar, setFalhouCopiar] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha)
      setCopiado(true)
      setFalhouCopiar(false)
    } catch {
      // navegador sem permissão de área de transferência (ou página sem HTTPS):
      // a senha continua na tela, selecionável — o dono copia na mão
      setFalhouCopiar(true)
    }
  }

  return (
    <Modal titulo="Senha provisória gerada" aoFechar={aoFechar} largura="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft leading-relaxed">
          Senha de <strong className="font-semibold text-ink">{nome}</strong> (usuário{' '}
          <span className="font-mono">{login}</span>). Passe para a pessoa por um canal em que você confia —
          ela será obrigada a trocar no primeiro acesso.
        </p>

        <div className="tile bg-floor p-4 flex flex-wrap items-center justify-between gap-3">
          <code className="font-mono text-2xl text-ink tracking-wider select-all break-all">{senha}</code>
          <button className={BOTAO} onClick={copiar}>
            {copiado ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald" strokeWidth={2} aria-hidden />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                Copiar
              </>
            )}
          </button>
        </div>

        {falhouCopiar && (
          <Aviso tom="alerta">
            O navegador não deixou copiar automaticamente. Selecione a senha acima e copie com Ctrl+C.
          </Aviso>
        )}

        <Aviso tom="erro">
          <strong className="font-semibold">Anote agora: esta senha não será exibida de novo.</strong> O BI
          guarda só o resultado criptografado dela — ninguém, nem você, consegue lê-la depois que esta
          janela fechar. Se perder, gere outra.
        </Aviso>

        <Nota>
          Gerar uma senha nova encerra as sessões abertas dessa pessoa e obriga a troca no próximo acesso.
        </Nota>

        <div className="flex justify-end">
          <button className={BOTAO_PRINCIPAL} onClick={aoFechar}>
            Já anotei
          </button>
        </div>
      </div>
    </Modal>
  )
}
