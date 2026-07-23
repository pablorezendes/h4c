"""Catálogo de recursos e AUTORIZAÇÃO do BI.

Autenticação (quem é você) mora em `auth.py`. Aqui mora a autorização (o que você
pode ver) em três camadas, na ordem em que o dono raciocina na tela:

    1. ABA        — 'comercial', 'financeiro', 'compras', 'estoque', 'apuracao',
                    'analises', 'configuracoes'
    2. RELATÓRIO  — 'comercial.rca', 'financeiro.vencido', ...
    3. CARTEIRA   — o vendedor só enxerga o próprio RCA (`escopo_rca`)

★ ESCONDER A ABA NO FRONTEND NÃO É CONTROLE DE ACESSO. O menu filtrado por
  permissão é conveniência: evita que a pessoa clique no que não pode ver. Quem
  de fato barra é o backend — `Depends(requer('comercial.rca'))` no router e
  `escopo_rca()` dentro da consulta. Qualquer um que abra o DevTools consegue
  chamar /api/comercial/rca na unha; se a única trava fosse o menu, a carteira do
  colega estaria a um `fetch` de distância.

★ O CATÁLOGO É CÓDIGO, NÃO TABELA. Relatório novo é uma linha nova em `CATALOGO`
  — não precisa de migração, de deploy de banco nem de UPDATE em produção. Em
  compensação, remover um id daqui deixa órfãs as linhas de `app.usuario_permissao`
  que o citam: elas simplesmente param de ser reconhecidas (`normalizar` descarta
  desconhecido), o que é o comportamento seguro. Renomear id de recurso é, na
  prática, revogar a permissão de todo mundo naquele relatório.

★ NUNCA use PCEMPR.CODUSUR para decidir carteira. O valor 1 é default de fábrica
  e aparece em 20 das 28 linhas do ERP — COMPRAS, FINANCEIRO, TI e PCADMIN
  herdariam a carteira do MARCELO CURADO. O vínculo pessoa->RCA é do BI
  (`app.usuario.codusur`), semeado por casamento de nome e conferido pelo dono.
"""
from dataclasses import dataclass
from typing import Iterable, Sequence

from fastapi import Depends, HTTPException, status


@dataclass(frozen=True)
class Recurso:
    """Um item da tela de permissões.

    `descricao` é o texto que o DONO lê ao marcar a caixinha — escreva pensando
    em quem não conhece o endpoint, não em quem escreveu o SQL.
    """
    id: str
    rotulo: str
    aba: str
    descricao: str

    @property
    def e_aba(self) -> bool:
        return self.id == self.aba


# ---------------------------------------------------------------------------
# O catálogo
# ---------------------------------------------------------------------------
# Ordem = ordem de exibição na tela de Configurações: a aba e, logo abaixo, os
# relatórios dela. Ids são estáveis e minúsculos, com ponto separando aba/filho.
CATALOGO: tuple[Recurso, ...] = (
    Recurso("comercial", "Comercial", "comercial",
            "Aba Comercial inteira: faturamento líquido, margem, positivação e carteira."),
    Recurso("comercial.resumo", "Resumo do período", "comercial",
            "Cartões do topo: faturamento líquido, margem de contribuição, positivação "
            "e projeção do mês."),
    Recurso("comercial.serie", "Faturamento mês a mês", "comercial",
            "Série histórica de faturamento e margem, com comparação entre períodos."),
    Recurso("comercial.rca", "Desempenho por vendedor", "comercial",
            "Faturamento, margem e positivação de cada RCA — e o ranking entre eles."),
    Recurso("comercial.mix", "Mix de produtos por RCA", "comercial",
            "Quantos itens diferentes cada vendedor vende e o que saiu do mix dele."),
    Recurso("comercial.churn", "Clientes em risco e perdidos", "comercial",
            "Quem parou de comprar, há quanto tempo e o motivo da perda anotado pelo gestor."),
    Recurso("comercial.mapa", "Mapa de vendas por cidade", "comercial",
            "Onde está o faturamento no mapa: cada cidade dimensionada pelo que vende, "
            "para enxergar concentração e praça descoberta."),

    Recurso("financeiro", "Financeiro", "financeiro",
            "Aba Financeiro inteira: prazos, inadimplência e faturamento por prazo."),
    Recurso("financeiro.prazos", "Prazos médios", "financeiro",
            "Prazo médio de recebimento e de pagamento, mês a mês."),
    Recurso("financeiro.vencido", "Vencido e quem está devendo", "financeiro",
            "Títulos em atraso por faixa e a lista nominal de clientes devedores. "
            "Informação sensível — libere só para quem cobra."),
    Recurso("financeiro.por-prazo", "Faturamento por prazo", "financeiro",
            "Quanto foi vendido em cada plano de pagamento (à vista, 28 dias, ...)."),

    Recurso("compras", "Compras", "compras",
            "Aba Compras inteira: demanda, curva ABC e sugestão de compra."),
    Recurso("compras.demanda", "Demanda por produto", "compras",
            "Quanto saiu de cada produto na janela escolhida — a base do quanto comprar."),
    Recurso("compras.abc", "Curva ABC", "compras",
            "Classificação A/B/C dos produtos por valor acumulado."),
    Recurso("compras.sugestao", "Sugestão de compra", "compras",
            "O que comprar agora por cobertura e lead time. Também permite cadastrar o "
            "lead time do fornecedor, que muda a sugestão de todo mundo."),
    Recurso("compras.sem-giro", "Itens parados (sem giro)", "compras",
            "Produtos com estoque mas sem venda há mais de 30 dias, com o capital "
            "parado em cada um — o dinheiro que está dormindo na prateleira."),

    Recurso("estoque", "Estoque", "estoque",
            "Aba Estoque: posição atual, cobertura em dias e itens bloqueados."),
    Recurso("estoque.posicao", "Posição de estoque", "estoque",
            "Saldo, reservado e cobertura em dias, produto a produto."),

    Recurso("apuracao", "Apuração", "apuracao",
            "A apuração de faturamento (rotina 1464 do WinThor) aberta por dimensão — "
            "o número oficial que o dono confere com o ERP."),

    Recurso("analises", "Análises", "analises",
            "Consultas avançadas e experimentais sobre a base."),

    Recurso("configuracoes", "Configurações", "configuracoes",
            "Administração do BI: criar usuário, gerar senha, dar e tirar permissão, "
            "definir carteira. Quem tem isto manda em todo mundo."),
)

POR_ID: dict[str, Recurso] = {r.id: r for r in CATALOGO}
ABAS: tuple[str, ...] = tuple(r.id for r in CATALOGO if r.e_aba)
TODOS: tuple[str, ...] = tuple(r.id for r in CATALOGO)


# ---------------------------------------------------------------------------
# Papéis
# ---------------------------------------------------------------------------
# ★ O papel é só o PONTO DE PARTIDA. Ele é lido na CRIAÇÃO do usuário, para
# preencher o conjunto inicial de permissões (`padrao_do_papel`), e nunca é
# reinterpretado depois — exceto 'admin', que sempre pode tudo por definição.
#
# Se o papel valesse em tempo de execução, tirar uma caixinha na tela não teria
# efeito nenhum para um 'gestor', e o dono ficaria clicando sem entender por que
# o relatório continua aparecendo. Marcou/desmarcou na tela = verdade.
_TODOS_MENOS_CONFIG = tuple(r for r in TODOS if r != "configuracoes")
_SO_COMERCIAL = tuple(r for r in TODOS if r == "comercial" or r.startswith("comercial."))

PAPEIS: dict[str, dict] = {
    "admin": {
        "rotulo": "Administrador",
        "descricao": "Vê tudo e administra usuários, senhas e permissões.",
        "padrao": TODOS,
    },
    "gestor": {
        "rotulo": "Gestor",
        "descricao": "Vê todas as abas do BI, mas não administra usuários.",
        "padrao": _TODOS_MENOS_CONFIG,
    },
    "leitor": {
        "rotulo": "Leitor",
        "descricao": "Começa só com a aba Comercial. É o papel do vendedor, que "
                     "normalmente vem junto com a restrição de carteira.",
        "padrao": _SO_COMERCIAL,
    },
}

PAPEL_PADRAO = "leitor"


def papel_valido(papel: str | None) -> bool:
    return (papel or "") in PAPEIS


def padrao_do_papel(papel: str | None) -> list[str]:
    """Conjunto inicial de recursos de quem acaba de ser criado com esse papel."""
    return list(PAPEIS.get(papel or "", PAPEIS[PAPEL_PADRAO])["padrao"])


def catalogo_para_tela() -> list[dict]:
    """O catálogo como a tela de Configurações consome (GET /api/usuarios/recursos)."""
    return [{"id": r.id, "rotulo": r.rotulo, "aba": r.aba, "descricao": r.descricao,
             "e_aba": r.e_aba} for r in CATALOGO]


# ---------------------------------------------------------------------------
# Normalização do conjunto de permissões
# ---------------------------------------------------------------------------
def normalizar(recursos: Iterable[str] | None) -> list[str]:
    """Limpa e completa um conjunto de recursos vindo da tela.

    Faz três coisas, todas para evitar suporte depois:
      1. descarta id desconhecido (recurso removido do catálogo, erro de digitação
         no cliente) — o que não está no código não existe;
      2. acrescenta a ABA de todo filho marcado. Sem isso, marcar
         "Desempenho por vendedor" sem marcar "Comercial" criaria um usuário com
         permissão de um relatório que ele não consegue alcançar, porque a aba
         some do menu — o clássico "eu liberei e ele diz que não aparece";
      3. devolve na ordem do catálogo, sem repetição, para a comparação entre o
         que estava e o que ficou ser estável no log de auditoria.
    """
    pedidos = {str(r).strip().lower() for r in (recursos or [])}
    validos = {r for r in pedidos if r in POR_ID}
    com_abas = set(validos)
    for rid in validos:
        com_abas.add(POR_ID[rid].aba)
    return [r for r in TODOS if r in com_abas]


# ---------------------------------------------------------------------------
# Decisão de acesso
# ---------------------------------------------------------------------------
def permitidos(usuario) -> list[str]:
    """Todos os recursos que este usuário enxerga, na ordem do catálogo."""
    if getattr(usuario, "papel", None) == "admin":
        return list(TODOS)
    concedidos = set(getattr(usuario, "permissoes", ()) or ())
    return [r for r in TODOS if r in concedidos]


def abas_visiveis(usuario) -> list[str]:
    """Só as abas — é o que o menu do frontend precisa."""
    tem = set(permitidos(usuario))
    return [a for a in ABAS if a in tem]


def permitido(usuario, recurso: str) -> bool:
    """★ Falha FECHADA: id fora do catálogo é NEGADO, nunca liberado.

    Vale para o recurso que saiu do catálogo e para o typo que escapou — e
    `requer()` ainda levanta KeyError já no import do router, para o typo quebrar
    na cara de quem programou em vez de virar rota aberta em produção.
    """
    if recurso not in POR_ID:
        return False
    if getattr(usuario, "papel", None) == "admin":
        return True
    return recurso in set(getattr(usuario, "permissoes", ()) or ())


def _exigir_troca_de_senha(usuario) -> None:
    """Senha provisória só serve para trocar a senha.

    ★ Vai aqui e NÃO em `require_user`: /api/auth/eu e /api/auth/trocar-senha
    dependem de `require_user` e são exatamente as duas rotas que a pessoa
    precisa alcançar nesse estado — bloquear lá trancaria a porta com a chave
    dentro. A tela já manda para TrocarSenha quando `deve_trocar_senha` é true;
    isto aqui é o que torna aquilo verdade também para quem chama a API na mão,
    com a senha provisória que foi ditada por telefone.
    """
    if getattr(usuario, "deve_trocar_senha", False):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Defina uma senha própria antes de usar o BI: sua senha ainda é a provisória.",
        )


def _negar(recurso: str):
    r = POR_ID.get(recurso)
    nome = r.rotulo if r else recurso
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        f'Você não tem acesso a "{nome}". Peça ao administrador do BI para liberar '
        f"este item na tela de Configurações.",
    )


def requer(recurso: str):
    """Dependência FastAPI que exige um recurso do catálogo.

        router = APIRouter(..., dependencies=[Depends(permissoes.requer('comercial'))])

        @router.get('/rca', dependencies=[Depends(permissoes.requer('comercial.rca'))])

    Devolve o usuário autenticado, então também serve como
    `usuario = Depends(permissoes.requer('comercial.rca'))` quando o handler
    precisa do RCA para o `escopo_rca`.
    """
    if recurso not in POR_ID:  # erro de programação: falha já no import do router
        raise KeyError(f"recurso '{recurso}' não existe em permissoes.CATALOGO")

    # ★ import tardio de propósito: `auth` importa `permissoes` no topo (precisa do
    # catálogo para montar /api/auth/eu). Importar `auth` aqui no topo fecharia o
    # ciclo. Quando `requer()` é chamado — na definição dos routers — os dois
    # módulos já estão carregados.
    from .auth import require_user

    def dependencia(usuario=Depends(require_user)):
        _exigir_troca_de_senha(usuario)
        if not permitido(usuario, recurso):
            _negar(recurso)
        return usuario

    dependencia.__name__ = f"requer_{recurso.replace('.', '_').replace('-', '_')}"
    return dependencia


def requer_admin():
    """Dependência das rotas de administração (/api/usuarios/*).

    Separada de `requer('configuracoes')` de propósito: administração é papel, não
    caixinha. Assim ninguém libera a tela de usuários por engano marcando um item
    na lista de permissões de um gestor.
    """
    from .auth import require_user

    def dependencia(usuario=Depends(require_user)):
        _exigir_troca_de_senha(usuario)
        if getattr(usuario, "papel", None) != "admin":
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Somente o administrador do BI pode gerenciar usuários e permissões.",
            )
        return usuario

    dependencia.__name__ = "requer_admin"
    return dependencia


# ---------------------------------------------------------------------------
# Terceira camada: a carteira
# ---------------------------------------------------------------------------
def escopo_rca(usuario, rcas_pedidos: Sequence[int] | None = None) -> list[int]:
    """Decide, NO SERVIDOR, quais RCAs esta requisição pode enxergar.

    Uso obrigatório em toda consulta que aceite filtro de vendedor:

        rcas = permissoes.escopo_rca(usuario, lista_rcas)
        ...  consulta.consultar(sql, {'rcas': rcas, ...})

    Quando o usuário é `restrito_a_carteira`, o que veio na querystring é
    IGNORADO — não filtrado, não validado: ignorado. Devolvemos `[codusur]` e
    pronto. Validar o pedido em vez de substituí-lo abriria a brecha de sempre:
    bastaria mandar `?rcas=` vazio para cair no caminho "sem filtro".

    ★ POR QUE ESTA FUNÇÃO NÃO DEVOLVE LISTA VAZIA QUANDO NÃO HÁ CARTEIRA
    Em `regras.clausula_rca()` a regra é `if rcas` — lista vazia significa
    "sem filtro", ou seja, TODOS os vendedores. Se um usuário restrito e sem
    `codusur` recebesse `[]`, ele veria a base inteira: exatamente o oposto do
    que a restrição promete. Como não existe valor de lista que signifique
    "nenhum RCA" para o resto do código, falhar fechado aqui é recusar a
    requisição — com uma mensagem que diz ao dono o que fazer.
    Caso real: FERNANDA MOURA, a maior vendedora, não tem linha em PCEMPR; o
    usuário dela nasce sem RCA até alguém vincular na tela.
    """
    pedidos = [int(r) for r in (rcas_pedidos or [])]
    if not getattr(usuario, "restrito_a_carteira", False):
        return pedidos

    meu = getattr(usuario, "codusur", None)
    if meu is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Seu usuário está restrito à própria carteira, mas nenhum vendedor (RCA) "
            "foi vinculado a ele. Peça ao administrador do BI para definir a carteira "
            "em Configurações.",
        )
    return [int(meu)]


def assegurar_rca(usuario, codusur: int | None) -> None:
    """Barra o acesso a um RCA específico (rotas do tipo /rca/{codusur}).

    `escopo_rca` resolve as listagens; esta resolve o detalhe, onde o RCA vem no
    caminho da URL e não há lista para substituir.
    """
    if not getattr(usuario, "restrito_a_carteira", False):
        return
    meu = getattr(usuario, "codusur", None)
    if meu is None or codusur is None or int(codusur) != int(meu):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Você só tem acesso à sua própria carteira.",
        )


def descreve_escopo(usuario) -> str | None:
    """Frase curta para a tela avisar por que os números são menores que o esperado.

    A UI precisa dizer isto em algum canto: número filtrado sem aviso vira
    chamado de 'o BI está errado'.
    """
    if not getattr(usuario, "restrito_a_carteira", False):
        return None
    return f"Dados limitados à carteira do RCA {getattr(usuario, 'codusur', None)}."
