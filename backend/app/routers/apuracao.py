"""Apuracao de Faturamento — o relatorio que substitui a rotina 1464 do Winthor (§6).

Nao sao 29 telas: e UM relatorio com DIMENSOES CONFIGURAVEIS. Os 29 "tipos" da 1464
viram presets nomeados sobre o mesmo motor (`/dimensoes` devolve o catalogo), e o
gestor pode compor qualquer drill-down ate 5 niveis. O objetivo declarado pelo dono
e aposentar o fluxo "abrir a 1464 -> exportar Excel -> alimentar IA externa".

★ REGRA DE OURO EMBUTIDA: o faturamento e sempre LIQUIDO de devolucao e nao ha
parametro para desligar. O bruto viaja ao lado, sempre rotulado "sem deducao".
Medida canonica em `regras.py` (PCMOV, CODOPER IN ('S','ED'), DTCANCEL IS NULL).

★ COMO O SQL E MONTADO — WHITELIST, NUNCA INTERPOLACAO
Dimensoes, filtros e ordenacoes sao dicionarios chave -> fragmento SQL. A entrada do
usuario so serve para ESCOLHER a chave; nenhum texto dele entra no SQL. Valores vao
por bind (`= ANY(:rcas)`). Os JOINs sao emitidos sob demanda: uma apuracao por RCA
nao paga o join de PCCIDADE nem o de PCPLPAG.

★ DEVOLUCAO ATRIBUIVEL SEM AMBIGUIDADE (medido em 2026-07-21)
As 261 linhas ED do historico trazem CODUSUR/CODCLI/CODPROD da venda de origem, e
tambem NUMTRANSDEV (= NUMTRANSVENDA da nota de venda) e NUMPED (= pedido de origem)
em 261/261 linhas. Por isso ate as dimensoes que so existem na NOTA (plano de
pagamento, origem da venda) conseguem devolver a devolucao para a venda que a gerou:
    nf.numtransvenda = CASE WHEN m.codoper='ED' THEN m.numtransdev ELSE m.numtransvenda END
Quando um dia o vinculo faltar, a linha NAO some: ela cai num grupo rotulado
"Devolucao sem vinculo" e o valor aparece em `meta.devolucao_sem_vinculo`. Esconder
devolucao e exatamente o que a 1464 faz quando o operador desmarca "avulsas" — aqui
o valor fica visivel.

★ CURVA ABC SO SOBRE LINHAS POSITIVAS
O acumulado da curva usa como denominador a SOMA DAS LINHAS POSITIVAS, nao o liquido
total. Sem isso o acumulado estoura 100%: em jan/2026, agrupando Cliente/Produto,
441 linhas incluem 4 negativas e 24 zeradas (devolucao integral); com denominador
liquido (R$ 151.540,80) a ultima linha da curva fechava em 100,49%. Com a soma das
positivas (R$ 152.280,10) fecha em 100,0000%. Linhas <= 0 ficam FORA da curva
(classe_abc nula) e continuam na tabela, somando no total.

★ UF E MUNICIPIO SAEM DE PCCIDADE, NAO DE PCCLIENT.ESTCOM
Os 203 clientes com venda tem CODCIDADE preenchido em 100% dos casos; ESTCOM tem 1
nulo e 1 divergencia (cliente com cidade de SP e ESTCOM='GO'). Usar a mesma fonte
para UF e municipio e o que mantem o preset 25-UF/Municipio coerente consigo mesmo.

PARIDADE FINA COM A 1464 — AINDA NAO DECLARADA
Os totais deste relatorio batem entre si e com a medida canonica do BI: jun/2026,
filial 1, os presets 12-Cliente/Produto (825 linhas), 5-RCA (5), 10-Departamento (8),
3-Fornecedor (40) e 14-Prazo (20) fecham todos em R$ 416.378,65 de liquido, e ligar
os 13 joins de dimensao ao mesmo tempo nao muda o total (zero fan-out).
A paridade com a 1464 so pode ser DECLARADA depois que o cliente emitir o relatorio
na configuracao de referencia — "Deduzir as devolucoes" MARCADA, "Considerar
devolucoes Avulsas" e "Considerar devolucoes TV8" DESMARCADAS, "Lista Clientes
Excluidos" MARCADA, mesmo periodo (mes fechado) e mesma filial — e a diferenca
ficar dentro da tolerancia de 0,1%. Divergencia de configuracao invalida a
comparacao antes de invalidar o BI.

★ SQL DESTE MODULO E POSTGRES (espelho `winthor`), como o resto dos routers.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import require_user
from .. import calendario, consulta, regras

router = APIRouter(prefix="/api/apuracao", tags=["apuracao"], dependencies=[Depends(require_user)])

MAX_DIMENSOES = 5        # acima disso a tabela deixa de ser legivel e o grupo vira o proprio item
LIMITE_PADRAO = 2000     # mesmo teto do motor de analises
LIMITE_MAX = 20000

# ---------------------------------------------------------------------------
# JOINs de dimensao — alias -> (SQL, aliases que ele exige antes)
# Todos LEFT: um INNER num cadastro furado dropa faturamento em silencio e mata a
# paridade. Melhor a linha aparecer como "(sem cadastro)" do que sumir do total.
# ---------------------------------------------------------------------------
JOINS: dict[str, tuple[str, tuple[str, ...]]] = {
    "p":   ("LEFT JOIN {e}.pcprodut p   ON p.codprod = m.codprod", ()),
    "pd":  ("LEFT JOIN {e}.pcdepto pd   ON pd.codepto = p.codepto", ("p",)),
    "ps":  ("LEFT JOIN {e}.pcsecao ps   ON ps.codsec = p.codsec", ("p",)),
    "pf":  ("LEFT JOIN {e}.pcfornec pf  ON pf.codfornec = p.codfornec", ("p",)),
    "pmc": ("LEFT JOIN {e}.pcmarca pmc  ON pmc.codmarca = p.codmarca", ("p",)),
    "cl":  ("LEFT JOIN {e}.pcclient cl  ON cl.codcli = m.codcli", ()),
    "pat": ("LEFT JOIN {e}.pcativi pat  ON pat.codativ = cl.codatv1", ("cl",)),
    "ppr": ("LEFT JOIN {e}.pcpraca ppr  ON ppr.codpraca = cl.codpraca", ("cl",)),
    "ci":  ("LEFT JOIN {e}.pccidade ci  ON ci.codcidade = cl.codcidade", ("cl",)),
    "u":   ("LEFT JOIN {e}.pcusuari u   ON u.codusur = m.codusur", ()),
    # a devolucao (ED) nao tem NUMTRANSVENDA propria: aponta para a venda de origem
    # em NUMTRANSDEV. E assim que o prazo/origem da devolucao volta para a venda.
    "nf":  ("LEFT JOIN {e}.pcnfsaid nf  ON nf.numtransvenda = "
            "CASE WHEN m.codoper = 'ED' THEN m.numtransdev ELSE m.numtransvenda END", ()),
    "pl":  ("LEFT JOIN {e}.pcplpag pl   ON pl.codplpag = nf.codplpag", ("nf",)),
    # PCMOV.NUMPED ja vem com o pedido de ORIGEM tambem nas linhas ED (13/13 em jun/26)
    "pc":  ("LEFT JOIN {e}.pcpedc pc    ON pc.numped = m.numped", ()),
}

#: ordem topologica de emissao (dependencia sempre antes do dependente)
ORDEM_JOINS = ("p", "pd", "ps", "pf", "pmc", "cl", "pat", "ppr", "ci", "u", "nf", "pl", "pc")

# F e T sao os unicos com significado confirmado nesta operacao (885 e 803 pedidos).
# R (14 pedidos) e B (1) aparecem na base sem rotulo confirmado pelo cliente — o BI
# mostra o codigo cru em vez de chutar "Broker"/"Balcao" e induzir leitura errada.
ORIGEM_SQL = ("CASE pc.origemped WHEN 'F' THEN 'Forca de Vendas (Ion Vendas)' "
              "WHEN 'T' THEN 'Telemarketing' "
              "ELSE 'Origem ' || pc.origemped || ' (rotulo nao confirmado)' END")

# ---------------------------------------------------------------------------
# Catalogo de dimensoes. `cardinalidade` e o numero de valores DISTINTOS medidos
# na base em 2026-07-21 — serve para o gestor saber o tamanho da tabela antes de
# pedir, e para justificar o que ficou de fora (ver NAO_IMPLEMENTADAS).
# ---------------------------------------------------------------------------
DIMENSOES: dict[str, dict] = {
    "rca":             {"rotulo": "RCA", "cod": "m.codusur", "desc": regras.nome_rca(),
                        "joins": ("u",), "prefixo": "RCA", "cardinalidade": 5},
    "cliente":         {"rotulo": "Cliente", "cod": "m.codcli", "desc": "cl.cliente",
                        "joins": ("cl",), "prefixo": "Cliente", "cardinalidade": 203},
    "produto":         {"rotulo": "Produto", "cod": "m.codprod", "desc": "p.descricao",
                        "joins": ("p",), "prefixo": "Produto", "cardinalidade": 491},
    "departamento":    {"rotulo": "Departamento", "cod": "p.codepto", "desc": "pd.descricao",
                        "joins": ("pd",), "prefixo": "Depto", "cardinalidade": 8},
    "secao":           {"rotulo": "Secao", "cod": "p.codsec", "desc": "ps.descricao",
                        "joins": ("ps",), "prefixo": "Secao", "cardinalidade": 42},
    "fornecedor":      {"rotulo": "Fornecedor", "cod": "p.codfornec", "desc": "pf.fornecedor",
                        "joins": ("pf",), "prefixo": "Fornecedor", "cardinalidade": 70},
    "marca":           {"rotulo": "Marca", "cod": "p.codmarca", "desc": "pmc.marca",
                        "joins": ("pmc",), "prefixo": "Marca", "cardinalidade": 31},
    "ramo":            {"rotulo": "Ramo de atividade", "cod": "cl.codatv1", "desc": "pat.ramo",
                        "joins": ("pat",), "prefixo": "Ramo", "cardinalidade": 41},
    "praca":           {"rotulo": "Praca", "cod": "cl.codpraca", "desc": "ppr.praca",
                        "joins": ("ppr",), "prefixo": "Praca", "cardinalidade": 5},
    # UF nao tem codigo separado: a sigla E a chave
    "uf":              {"rotulo": "UF", "cod": None, "desc": "ci.uf",
                        "joins": ("ci",), "prefixo": "UF", "cardinalidade": 4},
    "municipio":       {"rotulo": "Municipio", "cod": "ci.codcidade", "desc": "ci.nomecidade",
                        "joins": ("ci",), "prefixo": "Cidade", "cardinalidade": 29},
    # as duas abaixo so existem na NOTA/PEDIDO — ver `na_nota` e meta.devolucao_sem_vinculo
    "plano_pagamento": {"rotulo": "Plano de pagamento", "cod": "nf.codplpag", "desc": "pl.descricao",
                        "joins": ("pl",), "prefixo": "Plano", "cardinalidade": 28, "na_nota": True},
    "origem_venda":    {"rotulo": "Origem da venda", "cod": "pc.origemped", "desc": ORIGEM_SQL,
                        "joins": ("pc",), "prefixo": "Origem", "cardinalidade": 4, "na_nota": True},
}

# ---------------------------------------------------------------------------
# Filtros combinaveis (todos multi-selecao, csv na querystring)
# `rcas` e `deptos` usam os fragmentos canonicos de regras.py para nao divergirem
# do FiltroBar global das outras telas.
# ---------------------------------------------------------------------------
FILTROS: dict[str, dict] = {
    "rcas":         {"rotulo": "RCA", "sql": "m.codusur = ANY(:rcas)", "joins": (), "tipo": "int"},
    "deptos":       {"rotulo": "Departamento", "sql": "p.codepto = ANY(:deptos)", "joins": ("p",), "tipo": "int"},
    "secoes":       {"rotulo": "Secao", "sql": "p.codsec = ANY(:secoes)", "joins": ("p",), "tipo": "int"},
    "fornecedores": {"rotulo": "Fornecedor", "sql": "p.codfornec = ANY(:fornecedores)", "joins": ("p",), "tipo": "int"},
    "marcas":       {"rotulo": "Marca", "sql": "p.codmarca = ANY(:marcas)", "joins": ("p",), "tipo": "int"},
    "clientes":     {"rotulo": "Cliente", "sql": "m.codcli = ANY(:clientes)", "joins": (), "tipo": "int"},
    "ramos":        {"rotulo": "Ramo de atividade", "sql": "cl.codatv1 = ANY(:ramos)", "joins": ("cl",), "tipo": "int"},
    "pracas":       {"rotulo": "Praca", "sql": "cl.codpraca = ANY(:pracas)", "joins": ("cl",), "tipo": "int"},
    "ufs":          {"rotulo": "UF", "sql": "ci.uf = ANY(:ufs)", "joins": ("ci",), "tipo": "texto"},
    "planos":       {"rotulo": "Plano de pagamento", "sql": "nf.codplpag = ANY(:planos)", "joins": ("nf",), "tipo": "int"},
    "origens":      {"rotulo": "Origem da venda", "sql": "pc.origemped = ANY(:origens)", "joins": ("pc",), "tipo": "texto"},
}

ORDENACOES = [
    {"id": "abc_valor", "rotulo": "Curva ABC por valor (padrao)", "criterio": "liquido"},
    {"id": "abc_quantidade", "rotulo": "Curva ABC por quantidade", "criterio": "quantidade"},
    {"id": "alfabetica", "rotulo": "Alfabetica pela dimensao", "criterio": "liquido"},
]

# ---------------------------------------------------------------------------
# Presets = os tipos da 1464 que fazem sentido nesta operacao.
# `tipo_1464` liga o preset ao numero do relatorio original (None = criado no BI).
# `aba` diz onde ele mora, para nenhuma metrica aparecer em duas abas.
# Onde a 1464 abre por Supervisor, o preset entra SEM supervisor: ha um unico
# supervisor na base, entao o nivel so acrescentaria uma coluna constante.
# ---------------------------------------------------------------------------
PRESETS: list[dict] = [
    {"id": "cliente_produto", "tipo_1464": 12, "aba": "comercial", "prioridade": 1,
     "rotulo": "Cliente / Produto",
     "dimensoes": ["cliente", "produto"],
     "obs": "Preset que o dono emite hoje na 1464 — e o ponto de partida da paridade."},
    {"id": "rca", "tipo_1464": 5, "aba": "comercial", "prioridade": 2,
     "rotulo": "RCA", "dimensoes": ["rca"],
     "obs": "Faturamento por representante, sem precisar cavar (§5.1)."},
    {"id": "departamento", "tipo_1464": 10, "aba": "comercial", "prioridade": 3,
     "rotulo": "Departamento", "dimensoes": ["departamento"],
     "obs": "O depto 9999 'TODOS OS DEPARTAMENTOS' nao existe no cadastro dos produtos vendidos."},
    {"id": "fornecedor", "tipo_1464": 3, "aba": "compras", "prioridade": 4,
     "rotulo": "Fornecedor", "dimensoes": ["fornecedor"],
     "obs": "Visao do comprador: quanto cada fornecedor gira."},
    {"id": "prazo", "tipo_1464": 14, "aba": "financeiro", "prioridade": 5,
     "rotulo": "Por Prazo (plano de pagamento)", "dimensoes": ["plano_pagamento"],
     "obs": "Prazo vem da NOTA; a devolucao herda o prazo da venda de origem."},

    {"id": "cliente", "tipo_1464": 1, "aba": "comercial", "rotulo": "Cliente",
     "dimensoes": ["cliente"]},
    {"id": "produto", "tipo_1464": 4, "aba": "compras", "rotulo": "Produto",
     "dimensoes": ["produto"],
     "obs": "Equivale tambem ao tipo 29-Filial/Produto: ha uma unica filial."},
    {"id": "secao", "tipo_1464": 9, "aba": "comercial", "rotulo": "Secao",
     "dimensoes": ["secao"],
     "obs": "Os 'papeis' da reuniao sao secoes do depto 2: 201 PAPEL TOALHA, 202 GUARDANAPO, 203 PAPEL HIGIENICO."},
    {"id": "departamento_secao_produto", "tipo_1464": 8, "aba": "compras",
     "rotulo": "Departamento / Secao / Produto", "dimensoes": ["departamento", "secao", "produto"],
     "obs": "Visao de mix compartilhada com o Comercial."},
    {"id": "praca", "tipo_1464": 19, "aba": "comercial", "rotulo": "Praca",
     "dimensoes": ["praca"]},
    {"id": "ramo", "tipo_1464": 23, "aba": "comercial", "rotulo": "Ramo de atividade",
     "dimensoes": ["ramo"]},
    {"id": "uf", "tipo_1464": 24, "aba": "comercial", "rotulo": "UF", "dimensoes": ["uf"]},
    {"id": "uf_municipio", "tipo_1464": 25, "aba": "comercial", "rotulo": "UF / Municipio",
     "dimensoes": ["uf", "municipio"],
     "obs": "UF e municipio saem do mesmo cadastro (PCCIDADE), entao a hierarquia fecha."},
    {"id": "rca_fornecedor", "tipo_1464": 21, "aba": "compras", "rotulo": "RCA / Fornecedor",
     "dimensoes": ["rca", "fornecedor"],
     "obs": "Ponte comercial <-> compras: quem vende o que cada fornecedor entrega."},
    {"id": "rca_produto", "tipo_1464": 6, "aba": "comercial", "rotulo": "RCA / Produto",
     "dimensoes": ["rca", "produto"],
     "obs": "Base do mix por RCA (§5.2), aqui em valor em vez de contagem de SKUs."},
    {"id": "rca_cliente", "tipo_1464": 7, "aba": "comercial", "rotulo": "RCA / Cliente",
     "dimensoes": ["rca", "cliente"]},
    {"id": "rca_departamento", "tipo_1464": 17, "aba": "comercial", "rotulo": "RCA / Departamento",
     "dimensoes": ["rca", "departamento"],
     "obs": "Faturamento cruzado do §5.3 ('quanto o Sergino faturou em quimicos')."},
    {"id": "rca_departamento_secao", "tipo_1464": 20, "aba": "comercial",
     "rotulo": "RCA / Departamento / Secao", "dimensoes": ["rca", "departamento", "secao"]},
    {"id": "rca_ramo_cliente_produto", "tipo_1464": 16, "aba": "comercial",
     "rotulo": "RCA / Ramo / Cliente / Produto",
     "dimensoes": ["rca", "ramo", "cliente", "produto"],
     "obs": "O mais analitico dos presets — use com filtro de RCA ou de periodo curto."},
    {"id": "rca_cliente_pedidos", "tipo_1464": 18, "aba": "comercial",
     "rotulo": "RCA / Cliente (carteira)", "dimensoes": ["rca", "cliente"],
     "obs": "O tipo 18 da 1464 abre pedido a pedido; aqui a linha e o cliente. "
            "Sem supervisor, o agrupamento coincide com o tipo 7."},

    {"id": "origem_venda", "tipo_1464": None, "aba": "comercial", "rotulo": "Origem da venda",
     "dimensoes": ["origem_venda"],
     "obs": "Nao e um tipo da 1464: e o filtro 'Origem da Venda' da aba F4 promovido a dimensao "
            "(Telemarketing x Ion Vendas)."},
    {"id": "marca", "tipo_1464": None, "aba": "compras", "rotulo": "Marca",
     "dimensoes": ["marca"],
     "obs": "Nao e um tipo da 1464: e o filtro 'Marca' da aba F4 promovido a dimensao."},
]

#: Tipos da 1464 deliberadamente FORA — e o motivo medido na base em 2026-07-21.
#: Nao sao esquecimento: nesta operacao cada um deles devolve UMA UNICA LINHA.
NAO_IMPLEMENTADAS = [
    {"tipos_1464": [13, 11, 15], "rotulo": "Supervisor / Supervisor+RCA",
     "motivo": "ha 1 unico supervisor entre os RCAs com venda — a coluna seria constante "
               "e o relatorio ficaria identico ao preset 5-RCA."},
    {"tipos_1464": [22], "rotulo": "Gerente / Supervisor / RCA",
     "motivo": "mesma razao do supervisor: um unico gerente na hierarquia."},
    {"tipos_1464": [26, 27, 28, 29], "rotulo": "Filial e derivados",
     "motivo": "filial unica ('1' — Hygiene For Care Ltda). O tipo 29-Filial/Produto ja e "
               "entregue pelo preset 4-Produto."},
    {"tipos_1464": [2], "rotulo": "Cliente Principal",
     "motivo": "PCCLIENT.CODCLIPRINC devolve 203 valores distintos para 203 clientes, ou seja, "
               "repete o proprio codigo — agruparia igual ao preset 1-Cliente."},
    {"tipos_1464": None, "rotulo": "Rede de clientes (filtro F4)",
     "motivo": "PCCLIENT.CODREDE nao tem nenhum valor preenchido nos clientes com venda."},
]


# ---------------------------------------------------------------------------
# Parsing da querystring
# ---------------------------------------------------------------------------

MAX_ITENS_FILTRO = 500   # teto so para nao montar array gigante por engano/abuso


def _lista_int(valor: str | None, nome: str) -> list[int]:
    if not valor:
        return []
    try:
        itens = [int(x) for x in str(valor).split(",") if x.strip() != ""]
    except ValueError:
        raise HTTPException(422, f"Filtro '{nome}' aceita apenas numeros separados por virgula")
    if len(itens) > MAX_ITENS_FILTRO:
        raise HTTPException(422, f"Filtro '{nome}' aceita no maximo {MAX_ITENS_FILTRO} valores")
    return itens


def _lista_txt(valor: str | None, nome: str) -> list[str]:
    if not valor:
        return []
    # maiusculas porque UF e ORIGEMPED sao codigos de 1-2 letras no Winthor
    itens = [x.strip().upper() for x in str(valor).split(",") if x.strip() != ""]
    if len(itens) > MAX_ITENS_FILTRO:
        raise HTTPException(422, f"Filtro '{nome}' aceita no maximo {MAX_ITENS_FILTRO} valores")
    return itens


def _dimensoes_pedidas(dimensoes: str) -> list[str]:
    pedidas = [d.strip().lower() for d in (dimensoes or "").split(",") if d.strip()]
    if not pedidas:
        raise HTTPException(422, "Informe ao menos uma dimensao (ex.: dimensoes=cliente,produto)")
    if len(pedidas) > MAX_DIMENSOES:
        raise HTTPException(422, f"Maximo de {MAX_DIMENSOES} dimensoes por apuracao")
    vistas: list[str] = []
    for d in pedidas:
        if d not in DIMENSOES:
            raise HTTPException(422, f"Dimensao desconhecida: {d}. Use /api/apuracao/dimensoes")
        if d not in vistas:      # repetir dimensao nao muda o agrupamento, so polui a tabela
            vistas.append(d)
    return vistas


# ---------------------------------------------------------------------------
# Montagem do SQL
# ---------------------------------------------------------------------------

def _fechar_joins(aliases: set[str]) -> str:
    """Emite so os joins necessarios, ja com os pre-requisitos e na ordem certa."""
    pendentes = set(aliases)
    while True:
        faltam = {req for a in pendentes for req in JOINS[a][1]} - pendentes
        if not faltam:
            break
        pendentes |= faltam
    e = consulta.esquema()
    return "\n    ".join(JOINS[a][0].format(e=e) for a in ORDEM_JOINS if a in pendentes)


def _colunas_chave(dims: list[str]) -> list[str]:
    """Colunas de dimensao no CTE `g`, na ordem do agrupamento (desempate estavel)."""
    out: list[str] = []
    for campo in dims:
        if DIMENSOES[campo]["cod"]:
            out.append(f"{campo}_cod")
        out.append(f"{campo}_desc")
    return out


def _montar_sql(dims: list[str], filtros: dict[str, list], criterio: str, ordenar: str) -> str:
    aliases: set[str] = set()
    selects: list[str] = []
    grupos: list[str] = []
    for campo in dims:
        d = DIMENSOES[campo]
        aliases.update(d["joins"])
        if d["cod"]:
            selects.append(f"{d['cod']} AS {campo}_cod")
            grupos.append(d["cod"])
        selects.append(f"{d['desc']} AS {campo}_desc")
        grupos.append(d["desc"])

    where = [regras.filtro_venda("m")]
    for nome, valores in filtros.items():
        if valores:
            aliases.update(FILTROS[nome]["joins"])
            where.append(FILTROS[nome]["sql"])

    # desempate estavel: sem ele, linhas de mesmo valor podem sair numa ordem na
    # janela do acumulado e noutra na exibicao, e a curva "pula" entre requisicoes
    desempate = ", ".join(f"g.{c}" for c in _colunas_chave(dims))

    # linhas cuja dimensao so existe na nota e nao vinculou: nunca somem, viram grupo proprio
    chaves_nota = [f"{c}_cod" for c in dims if DIMENSOES[c].get("na_nota") and DIMENSOES[c]["cod"]]
    cond_sem_vinculo = " OR ".join(f"g.{c} IS NULL" for c in chaves_nota) or "FALSE"

    # a curva ordena por valor OU por quantidade; nao-positivos vao para o fim e
    # contribuem 0, entao o acumulado dos positivos fecha exatamente em 100%
    ordem_curva = f"CASE WHEN g.{criterio} > 0 THEN 0 ELSE 1 END, g.{criterio} DESC, {desempate}"
    if ordenar == "alfabetica":
        ordem_saida = ", ".join(f"g.{c}_desc ASC NULLS LAST" for c in dims) + f", {desempate}"
    else:
        ordem_saida = ordem_curva

    e = consulta.esquema()
    return f"""
WITH g AS (
  SELECT {', '.join(selects)},
         {regras.qt_liquida('m')}      AS quantidade,
         {regras.valor_bruto('m')}     AS bruto,
         {regras.valor_devolucao('m')} AS devolucao,
         {regras.valor_liquido('m')}   AS liquido,
         {regras.custo_liquido('m')}   AS custo
    FROM {e}.pcmov m
    {_fechar_joins(aliases)}
   WHERE {' AND '.join(where)}
   GROUP BY {', '.join(grupos)}
), t AS (
  SELECT COUNT(*)                                             AS linhas,
         SUM(g.liquido)                                       AS tot_liquido,
         SUM(g.bruto)                                         AS tot_bruto,
         SUM(g.devolucao)                                     AS tot_devolucao,
         SUM(g.custo)                                         AS tot_custo,
         SUM(CASE WHEN g.{criterio} > 0 THEN g.{criterio} ELSE 0 END) AS base_curva,
         SUM(CASE WHEN g.{criterio} > 0 THEN 1 ELSE 0 END)    AS linhas_curva,
         SUM(CASE WHEN {cond_sem_vinculo} THEN g.devolucao ELSE 0 END) AS dev_sem_vinculo,
         SUM(CASE WHEN {cond_sem_vinculo} THEN g.liquido ELSE 0 END)   AS liq_sem_vinculo
    FROM g
)
SELECT g.*, t.linhas, t.tot_liquido, t.tot_bruto, t.tot_devolucao, t.tot_custo,
       t.base_curva, t.linhas_curva, t.dev_sem_vinculo, t.liq_sem_vinculo,
       CASE WHEN g.{criterio} > 0 AND t.base_curva > 0 THEN
            100.0 * SUM(CASE WHEN g.{criterio} > 0 THEN g.{criterio} ELSE 0 END)
                    OVER (ORDER BY {ordem_curva} ROWS UNBOUNDED PRECEDING)
            / t.base_curva
       END AS acumulado_pct
  FROM g CROSS JOIN t
 ORDER BY {ordem_saida}
 LIMIT :limite"""


# ---------------------------------------------------------------------------
# Pos-processamento
# ---------------------------------------------------------------------------

def _f(v) -> float:
    return float(v or 0)


def _margem(liquido: float, custo: float) -> float | None:
    """Margem de contribuicao. Sem receita positiva o percentual nao tem leitura."""
    return round(100.0 * (liquido - custo) / liquido, 2) if liquido > 0 else None


def _rotular(campo: str, cod, desc, bruto: float, devolucao: float) -> str:
    if desc is not None and str(desc).strip():
        return str(desc).strip()
    d = DIMENSOES[campo]
    if cod is not None:
        return f"{d['prefixo']} {cod}"
    if d.get("na_nota"):
        # devolucao pura sem vinculo tem nome proprio; o valor NUNCA e escondido
        return "Devolucao sem vinculo" if bruto <= 0 and devolucao > 0 else "Sem vinculo com a nota"
    return "(sem cadastro)"


def _classe_abc(valor_curva: float, base_curva: float, acumulado: float | None) -> str | None:
    """Classe pela posicao na curva. A linha que ATRAVESSA o corte de 80% ainda e A —
    mesma convencao do agrupamento de produtos das analises, para nao existirem duas
    curvas ABC diferentes no mesmo BI."""
    if acumulado is None or valor_curva <= 0 or base_curva <= 0:
        return None
    anterior = acumulado - 100.0 * valor_curva / base_curva
    if anterior < regras.CURVA_A_CORTE_PCT:
        return "A"
    return "B" if anterior < regras.CURVA_B_CORTE_PCT else "C"


def _colunas(dims: list[str]) -> list[dict]:
    cols: list[dict] = []
    for campo in dims:
        d = DIMENSOES[campo]
        if d["cod"]:
            cols.append({"campo": f"{campo}_cod", "rotulo": f"Cod. {d['rotulo']}", "tipo": "codigo"})
        cols.append({"campo": campo, "rotulo": d["rotulo"], "tipo": "texto"})
    cols += [
        {"campo": "quantidade", "rotulo": "Quantidade", "tipo": "numero"},
        {"campo": "bruto", "rotulo": "Bruto (sem deducao de devolucao)", "tipo": "moeda"},
        {"campo": "devolucao", "rotulo": "Devolucao", "tipo": "moeda"},
        {"campo": "liquido", "rotulo": "Faturamento liquido", "tipo": "moeda"},
        {"campo": "custo", "rotulo": "Custo", "tipo": "moeda"},
        {"campo": "margem_pct", "rotulo": "Margem %", "tipo": "percentual"},
        {"campo": "share_pct", "rotulo": "Participacao %", "tipo": "percentual"},
        {"campo": "acumulado_pct", "rotulo": "Acumulado %", "tipo": "percentual"},
        {"campo": "classe_abc", "rotulo": "Curva", "tipo": "texto"},
    ]
    return cols


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dimensoes")
def dimensoes():
    """Catalogo do relatorio: dimensoes, presets da 1464, filtros e ordenacoes.

    Inclui `nao_implementadas` com o MOTIVO medido de cada tipo da 1464 que ficou de
    fora — o gestor precisa saber que a ausencia foi decidida, nao esquecida.
    """
    return {
        "dimensoes": [
            {"campo": campo, "rotulo": d["rotulo"],
             "tipo": "texto" if d["cod"] is None else "codigo+texto",
             "valores_distintos": d["cardinalidade"],
             "so_na_nota": bool(d.get("na_nota"))}
            for campo, d in DIMENSOES.items()
        ],
        "presets": [
            {"id": p["id"], "rotulo": p["rotulo"], "dimensoes": p["dimensoes"], "aba": p["aba"],
             "tipo_1464": p["tipo_1464"], "prioridade": p.get("prioridade"), "obs": p.get("obs")}
            for p in PRESETS
        ],
        "ordenacoes": [{"id": o["id"], "rotulo": o["rotulo"]} for o in ORDENACOES],
        "filtros": [{"campo": nome, "rotulo": f["rotulo"], "tipo": f["tipo"]}
                    for nome, f in FILTROS.items()],
        "nao_implementadas": NAO_IMPLEMENTADAS,
        "regra": ("Faturamento sempre liquido de devolucao, sem opcao de desligar. "
                  "Paridade fina com a rotina 1464 exige a emissao de referencia "
                  "(Deduzir devolucoes marcada; Avulsas e TV8 desmarcadas; Lista Clientes "
                  "Excluidos marcada), tolerancia de 0,1%."),
    }


@router.get("")
def apurar(
    dt_ini: date | None = None,
    dt_fim: date | None = None,
    dimensoes: str = "cliente,produto",
    ordenar: str = "abc_valor",
    limite: int = Query(LIMITE_PADRAO, ge=1, le=LIMITE_MAX),
    rcas: str = "",
    deptos: str = "",
    secoes: str = "",
    fornecedores: str = "",
    marcas: str = "",
    clientes: str = "",
    ramos: str = "",
    pracas: str = "",
    ufs: str = "",
    planos: str = "",
    origens: str = "",
):
    """Apuracao de faturamento com dimensoes configuraveis (drill-down da 1464).

    Sem periodo informado, vale o ultimo mes FECHADO — o ciclo mensal e o principio
    geral do BI, e comparar contra um mes corrente pela metade e o erro mais caro
    que esse relatorio pode induzir.
    """
    if dt_ini is None or dt_fim is None:
        ini, fim = calendario.mes_fechado()
        dt_ini, dt_fim = dt_ini or ini, dt_fim or fim
    if dt_fim < dt_ini:
        raise HTTPException(422, "dt_fim anterior a dt_ini")

    dims = _dimensoes_pedidas(dimensoes)
    if ordenar not in {o["id"] for o in ORDENACOES}:
        raise HTTPException(422, f"Ordenacao desconhecida: {ordenar}")
    criterio = next(o["criterio"] for o in ORDENACOES if o["id"] == ordenar)

    filtros: dict[str, list] = {
        "rcas": _lista_int(rcas, "rcas"),
        "deptos": _lista_int(deptos, "deptos"),
        "secoes": _lista_int(secoes, "secoes"),
        "fornecedores": _lista_int(fornecedores, "fornecedores"),
        "marcas": _lista_int(marcas, "marcas"),
        "clientes": _lista_int(clientes, "clientes"),
        "ramos": _lista_int(ramos, "ramos"),
        "pracas": _lista_int(pracas, "pracas"),
        "ufs": _lista_txt(ufs, "ufs"),
        "planos": _lista_int(planos, "planos"),
        "origens": _lista_txt(origens, "origens"),
    }
    ativos = {k: v for k, v in filtros.items() if v}

    sql = _montar_sql(dims, ativos, criterio, ordenar)
    binds: dict = regras.periodo_binds(dt_ini, dt_fim)
    binds["limite"] = limite
    binds.update(ativos)

    chave = ("apuracao:" + ",".join(dims) + f":{ordenar}:{dt_ini}:{dt_fim}:{limite}:"
             + ";".join(f"{k}={v}" for k, v in sorted(ativos.items())))
    brutos = consulta.consultar(sql, binds, cache_key=chave)

    if not brutos:
        return {
            "colunas": _colunas(dims),
            "rows": [],
            "meta": _meta_base(dims, ordenar, criterio, dt_ini, dt_fim, ativos, limite),
        }

    cab = brutos[0]
    tot_liquido = _f(cab["tot_liquido"])
    tot_bruto = _f(cab["tot_bruto"])
    tot_devolucao = _f(cab["tot_devolucao"])
    tot_custo = _f(cab["tot_custo"])
    base_curva = _f(cab["base_curva"])
    linhas = int(cab["linhas"] or 0)

    rows: list[dict] = []
    for r in brutos:
        liquido, custo = _f(r["liquido"]), _f(r["custo"])
        bruto, devolucao = _f(r["bruto"]), _f(r["devolucao"])
        acumulado = None if r["acumulado_pct"] is None else round(_f(r["acumulado_pct"]), 2)
        linha: dict = {}
        for campo in dims:
            cod = r.get(f"{campo}_cod")
            linha[campo] = _rotular(campo, cod, r.get(f"{campo}_desc"), bruto, devolucao)
            if DIMENSOES[campo]["cod"]:
                linha[f"{campo}_cod"] = cod
        linha.update({
            "quantidade": round(_f(r["quantidade"]), 3),
            "bruto": round(bruto, 2),
            "devolucao": round(devolucao, 2),
            "liquido": round(liquido, 2),
            "custo": round(custo, 2),
            "margem_pct": _margem(liquido, custo),
            # participacao e sempre sobre o LIQUIDO total do relatorio (o numero do
            # topo da tela); a curva ABC usa outro denominador, ver docstring
            "share_pct": round(100.0 * liquido / tot_liquido, 2) if tot_liquido else None,
            "acumulado_pct": acumulado,
            "classe_abc": _classe_abc(_f(r[criterio]), base_curva, acumulado),
        })
        rows.append(linha)

    meta = _meta_base(dims, ordenar, criterio, dt_ini, dt_fim, ativos, limite)
    meta.update({
        "total_liquido": round(tot_liquido, 2),
        "total_bruto": round(tot_bruto, 2),
        "total_devolucao": round(tot_devolucao, 2),
        "total_custo": round(tot_custo, 2),
        "devolucao_pct": round(100.0 * tot_devolucao / tot_bruto, 2) if tot_bruto else None,
        "margem_pct": _margem(tot_liquido, tot_custo),
        "linhas": linhas,
        "truncado_em": limite if linhas > limite else None,
    })
    meta["abc"].update({
        "linhas_na_curva": int(cab["linhas_curva"] or 0),
        "linhas_fora_da_curva": linhas - int(cab["linhas_curva"] or 0),
        "base_curva": round(base_curva, 2),
    })
    meta["devolucao_sem_vinculo"] = round(_f(cab["dev_sem_vinculo"]), 2)
    meta["sem_vinculo"]["liquido"] = round(_f(cab["liq_sem_vinculo"]), 2)
    return {"colunas": _colunas(dims), "rows": rows, "meta": meta}


def _meta_base(dims: list[str], ordenar: str, criterio: str, dt_ini: date, dt_fim: date,
               ativos: dict, limite: int) -> dict:
    """Esqueleto do meta, com os campos que existem mesmo sem nenhuma linha.

    `fechado` marca se o periodo terminou antes do mes corrente. A tela precisa dele
    para nunca apresentar um mes pela metade como se fosse mes fechado.
    """
    fechado = dt_fim < calendario.primeiro_dia(date.today())
    nota_dims = [c for c in dims if DIMENSOES[c].get("na_nota")]
    return {
        "total_liquido": 0.0, "total_bruto": 0.0, "total_devolucao": 0.0, "total_custo": 0.0,
        "devolucao_pct": None, "margem_pct": None,
        "linhas": 0, "truncado_em": None,
        "dimensoes": dims,
        "ordenar": ordenar,
        "limite": limite,
        "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(), "fechado": fechado},
        "filtros": ativos,
        "abc": {
            "criterio": criterio,
            "corte_a_pct": regras.CURVA_A_CORTE_PCT,
            "corte_b_pct": regras.CURVA_B_CORTE_PCT,
            "linhas_na_curva": 0, "linhas_fora_da_curva": 0, "base_curva": 0.0,
            "nota": ("acumulado calculado so sobre as linhas com valor positivo — linhas "
                     "zeradas ou negativas por devolucao ficam fora da curva para o "
                     "acumulado fechar em 100%"),
        },
        "devolucao_sem_vinculo": 0.0,
        "sem_vinculo": {
            "aplicavel": bool(nota_dims),
            "dimensoes": nota_dims,
            "liquido": 0.0,
            "rotulo": "Devolucao sem vinculo",
            "nota": ("plano de pagamento e origem da venda so existem na nota/pedido. Se uma "
                     "devolucao nao re-vincular a venda de origem, ela aparece numa linha "
                     "propria em vez de sumir do relatorio. Hoje as 261 linhas de devolucao "
                     "do historico vinculam em 100%."),
        },
        "medida": ("faturamento liquido = venda (CODOPER='S') menos devolucao de cliente "
                   "(CODOPER='ED'), sem opcao de desligar"),
    }
