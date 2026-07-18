/** Botão "?" — o único ponto de entrada da ajuda.
 *
 *  Duas formas: flutuante (global, uma por tela) e discreto (por card, para
 *  perguntar sobre AQUELE número, o que dispensa o usuário de explicar o que
 *  está olhando — e economiza a busca do assistente). */
import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import PainelAjuda, { type ContextoAjuda } from './PainelAjuda'

export default function BotaoAjuda({ contexto, flutuante }: {
  contexto: ContextoAjuda
  flutuante?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        aria-label={contexto.foco_id ? `Ajuda sobre ${contexto.foco_id}` : 'Ajuda'}
        title="Ajuda"
        className={
          flutuante
            ? /* acima da barra de navegação do celular, que tem 64px */
              'fixed right-4 bottom-20 sm:bottom-6 z-30 h-12 w-12 rounded-full bg-primary text-floor ' +
              'flex items-center justify-center border border-primary/40'
            : 'text-muted hover:text-primary p-1'
        }
      >
        <HelpCircle size={flutuante ? 22 : 16} />
      </button>
      <PainelAjuda contexto={contexto} aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  )
}
