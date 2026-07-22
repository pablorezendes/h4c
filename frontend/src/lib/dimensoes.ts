import { useEffect, useState } from 'react'
import { api } from './api'

/**
 * Listas de apoio dos filtros globais (RCA, Departamento).
 *
 * São listas minúsculas e praticamente estáticas — 5 RCAs e 8 departamentos — mas o
 * filtro aparece em toda página. Por isso a busca acontece UMA vez por sessão e o
 * resultado fica em memória do módulo; a segunda página a montar o filtro já nasce com
 * as opções prontas, sem piscar.
 *
 * ★ Tolerância a falha é requisito: se o endpoint cair, o filtro aparece desabilitado e
 *   a tela continua funcionando com o período. Nunca deixar a lista derrubar a página.
 */
export interface Opcao {
  valor: number
  rotulo: string
}

export interface Dimensao {
  opcoes: Opcao[]
  carregando: boolean
  erro: boolean
}

const VAZIA: Dimensao = { opcoes: [], carregando: false, erro: false }

/** Já resolvido nesta sessão. */
const CACHE = new Map<string, Opcao[]>()
/** Em voo: duas telas montando o filtro ao mesmo tempo compartilham a mesma requisição. */
const EM_VOO = new Map<string, Promise<Opcao[]>>()

type Linha = Record<string, unknown>

function carregar(caminho: string, mapear: (l: Linha) => Opcao): Promise<Opcao[]> {
  const pronto = CACHE.get(caminho)
  if (pronto) return Promise.resolve(pronto)

  let promessa = EM_VOO.get(caminho)
  if (!promessa) {
    promessa = api<Linha[]>(caminho)
      .then((linhas) => {
        const opcoes = (Array.isArray(linhas) ? linhas : []).map(mapear)
        CACHE.set(caminho, opcoes)
        EM_VOO.delete(caminho)
        return opcoes
      })
      .catch((e) => {
        // não cacheia falha: a próxima tela tenta de novo
        EM_VOO.delete(caminho)
        throw e
      })
    EM_VOO.set(caminho, promessa)
  }
  return promessa
}

/**
 * @param ativo quando falso não busca nada — é assim que uma página que não mostra o
 *              filtro de RCA evita disparar a requisição, sem violar a regra dos hooks.
 */
function useDimensao(caminho: string, mapear: (l: Linha) => Opcao, ativo: boolean): Dimensao {
  const [estado, setEstado] = useState<Dimensao>(() => {
    const pronto = CACHE.get(caminho)
    if (!ativo) return VAZIA
    return pronto
      ? { opcoes: pronto, carregando: false, erro: false }
      : { opcoes: [], carregando: true, erro: false }
  })

  useEffect(() => {
    if (!ativo) {
      setEstado(VAZIA)
      return
    }
    const pronto = CACHE.get(caminho)
    if (pronto) {
      setEstado({ opcoes: pronto, carregando: false, erro: false })
      return
    }
    let vivo = true
    setEstado({ opcoes: [], carregando: true, erro: false })
    carregar(caminho, mapear)
      .then((opcoes) => {
        if (vivo) setEstado({ opcoes, carregando: false, erro: false })
      })
      .catch(() => {
        if (vivo) setEstado({ opcoes: [], carregando: false, erro: true })
      })
    return () => {
      vivo = false
    }
  }, [caminho, mapear, ativo])

  return estado
}

// mapeadores no topo do módulo: identidade estável, senão o efeito reexecuta a cada render
const comoRca = (l: Linha): Opcao => ({
  valor: Number(l.codusur),
  rotulo: String(l.nome ?? `RCA ${l.codusur}`),
})

const comoDepto = (l: Linha): Opcao => ({
  valor: Number(l.codepto),
  rotulo: String(l.descricao ?? `Departamento ${l.codepto}`),
})

/** GET /api/meta/rcas -> [{codusur, nome}] */
export function useRcas(ativo = true): Dimensao {
  return useDimensao('/api/meta/rcas', comoRca, ativo)
}

/**
 * GET /api/meta/departamentos -> [{codepto, descricao}]
 * O backend já exclui o 9999 "TODOS OS DEPARTAMENTOS", que não é departamento real.
 */
export function useDepartamentos(ativo = true): Dimensao {
  return useDimensao('/api/meta/departamentos', comoDepto, ativo)
}

/** Nome da opção a partir do código — para rótulos fora do popover. */
export function rotuloDe(opcoes: Opcao[], valor: number): string {
  return opcoes.find((o) => o.valor === valor)?.rotulo ?? String(valor)
}
