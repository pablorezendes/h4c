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
            ? /* a barra de navegação de baixo só some em lg (1024px), não em sm:
                 com sm: o botão caía em cima do "Sair" entre 640px e 1023px */
              'fixed right-4 bottom-20 lg:bottom-6 z-40 h-12 w-12 rounded-full bg-primary text-floor ' +
              'flex items-center justify-center border border-primary/40'
            : 'text-muted hover:text-primary p-3 -m-1.5'
        }
      >
        <HelpCircle size={flutuante ? 22 : 16} />
      </button>
      <PainelAjuda contexto={contexto} aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  )
}
