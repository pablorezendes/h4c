"""Dimensoes dos filtros globais do BI (listas para combo/multi-selecao).

★ SO ENTRA NA LISTA QUEM DISCRIMINA. Filtro que nao separa nada e ruido na
tela: o cadastro do Winthor traz 225 fornecedores, 71 ramos e 35 marcas, mas
so 70 fornecedores, 41 ramos e 31 marcas tem venda nesta operacao. Cada
endpoint aqui filtra por movimento canonico (PCMOV, CODOPER IN ('S','ED'),
filial da operacao) e devolve so o que aparece no faturamento.

Pelo mesmo motivo NAO existem endpoints de Rede de Clientes, Supervisor,
Gerente, Filial (uma so), Emitente, Comprador, Distribuicao, Produto
Principal, Cliente Principal, TV8 e T.V.10: medidos na base, ou tem um unico
valor ou vem vazios.

Descartes deliberados:
* departamento 9999 "TODOS OS DEPARTAMENTOS" — e um agregador do ERP, nao um
  departamento; entra na lista e o usuario acha que filtrou por tudo;
* ordenacao e sempre por DESCRICAO, nao por codigo: o dono procura "QUIMICOS",
  nao "3".

`cache_key` vai em todas: sao listas pequenas e estaveis. Hoje ele so tem
efeito quando FONTE_DADOS=oracle (o espelho Postgres responde direto), mas
fica declarado para nao se perder na volta atras da fonte.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import require_user
from .. import calendario, consulta, regras

router = APIRouter(prefix="/api/meta", tags=["meta"], dependencies=[Depends(require_user)])

#: agregador do ERP, nunca um departamento de verdade
DEPTO_AGREGADOR = 9999


def _teve_venda(ligacao: str) -> str:
    """EXISTS de movimento canonico. `ligacao` amarra o cadastro ao item, ex.:
    "m.codprod = p.codprod". Sem periodo: a lista de filtros nao pode encolher
    porque o usuario escolheu uma semana."""
    return (f"EXISTS (SELECT 1 FROM {consulta.esquema()}.pcmov m "
            f"WHERE {ligacao} AND {regras.filtro_venda('m', periodo=False)})")


def _binds() -> dict:
    return {"filial": regras.FILIAL}


@router.get("/filiais")
def filiais():
    """Existe uma so (Hygiene For Care Ltda, codigo '1'). Fica publicada porque
    a tela de configuracao a le, mas NAO vira filtro: filtro de um valor so."""
    return consulta.consultar(
        f"""SELECT codigo AS codfilial, razaosocial
            FROM {consulta.esquema()}.pcfilial
            ORDER BY codigo""",
        cache_key="meta:filiais",
    )


@router.get("/rcas")
def rcas():
    """Vendedores com venda faturada. O cadastro tem 8 usuarios; 5 vendem."""
    return consulta.consultar(
        f"""SELECT u.codusur, {regras.nome_rca()} AS nome
            FROM {consulta.esquema()}.pcusuari u
            WHERE {_teve_venda('m.codusur = u.codusur')}
            ORDER BY u.nome""",
        _binds(),
        cache_key="meta:rcas",
    )


@router.get("/departamentos")
def departamentos():
    """Os 8 departamentos reais (DISPENSERS, HIGIENE PESSOAL, QUIMICOS,
    EQUIPAMENTOS E ACESSORIOS, EPIS, LIMPEZA, ALIMENTOS, DESCARTAVEIS)."""
    o = consulta.esquema()
    return consulta.consultar(
        f"""SELECT d.codepto, d.descricao
            FROM {o}.pcdepto d
            WHERE d.codepto <> {DEPTO_AGREGADOR}
            AND   EXISTS (SELECT 1 FROM {o}.pcprodut p
                          WHERE p.codepto = d.codepto AND {_teve_venda('m.codprod = p.codprod')})
            ORDER BY d.descricao""",
        _binds(),
        cache_key="meta:departamentos",
    )


@router.get("/secoes")
def secoes(codepto: int | None = None):
    """Secoes com venda (42 das 43 cadastradas). `codepto` restringe a lista
    quando a tela ja tem departamento escolhido — os "papeis" que o dono cita
    sao secoes do departamento 2: PAPEL TOALHA, PAPEL HIGIENICO, GUARDANAPO."""
    o = consulta.esquema()
    binds = _binds()
    filtro = ""
    if codepto is not None:
        filtro = " AND s.codepto = :codepto"
        binds["codepto"] = codepto
    return consulta.consultar(
        f"""SELECT s.codsec, s.descricao, s.codepto
            FROM {o}.pcsecao s
            WHERE s.codepto <> {DEPTO_AGREGADOR}{filtro}
            AND   EXISTS (SELECT 1 FROM {o}.pcprodut p
                          WHERE p.codsec = s.codsec AND {_teve_venda('m.codprod = p.codprod')})
            ORDER BY s.descricao""",
        binds,
        cache_key=f"meta:secoes:{codepto}",
    )


@router.get("/fornecedores")
def fornecedores():
    """70 fornecedores com produto vendido (de 225 cadastrados)."""
    o = consulta.esquema()
    return consulta.consultar(
        f"""SELECT f.codfornec, f.fornecedor
            FROM {o}.pcfornec f
            WHERE EXISTS (SELECT 1 FROM {o}.pcprodut p
                          WHERE p.codfornec = f.codfornec AND {_teve_venda('m.codprod = p.codprod')})
            ORDER BY f.fornecedor""",
        _binds(),
        cache_key="meta:fornecedores",
    )


@router.get("/planos-pagamento")
def planos_pagamento():
    """Condicoes de pagamento efetivamente usadas em nota. `numdias` e o prazo
    CONCEDIDO no plano — e contra ele que o Financeiro compara o PMR realizado
    (o descompasso entre concedido e recebido e a dor de caixa do dono)."""
    o = consulta.esquema()
    return consulta.consultar(
        f"""SELECT pp.codplpag, pp.descricao, pp.numdias
            FROM {o}.pcplpag pp
            WHERE EXISTS (SELECT 1 FROM {o}.pcnfsaid n
                          WHERE n.codplpag = pp.codplpag
                          AND   n.dtcancel IS NULL
                          AND   n.codfilial = :filial)
            ORDER BY pp.numdias, pp.descricao""",
        _binds(),
        cache_key="meta:planos-pagamento",
    )


@router.get("/ramos")
def ramos():
    """Ramo de atividade do cliente (PCCLIENT.CODATV1 -> PCATIVI). 41 ramos com
    compra. Nesta base a coluna do cadastro chama-se CODATV1, nao CODATIV."""
    o = consulta.esquema()
    return consulta.consultar(
        f"""SELECT a.codativ, a.ramo AS descricao
            FROM {o}.pcativi a
            WHERE EXISTS (SELECT 1 FROM {o}.pcclient c
                          WHERE c.codatv1 = a.codativ AND {_teve_venda('m.codcli = c.codcli')})
            ORDER BY a.ramo""",
        _binds(),
        cache_key="meta:ramos",
    )


@router.get("/marcas")
def marcas():
    """31 marcas com venda (de 35 cadastradas)."""
    o = consulta.esquema()
    return consulta.consultar(
        f"""SELECT mc.codmarca, mc.marca AS descricao
            FROM {o}.pcmarca mc
            WHERE EXISTS (SELECT 1 FROM {o}.pcprodut p
                          WHERE p.codmarca = mc.codmarca AND {_teve_venda('m.codprod = p.codprod')})
            ORDER BY mc.marca""",
        _binds(),
        cache_key="meta:marcas",
    )


# ---------------------------------------------------------------------------
# Dias uteis: contexto da projecao do mes + conferencia contra o ERP
# ---------------------------------------------------------------------------

def _mes(mes: str | None) -> date:
    if not mes:
        return calendario.primeiro_dia(date.today())
    try:
        return date.fromisoformat(f"{mes}-01")
    except ValueError:
        raise HTTPException(422, "Informe o mes no formato AAAA-MM (ex.: 2026-07).") from None


@router.get("/dias-uteis")
def dias_uteis(mes: str | None = Query(None, description="AAAA-MM; padrao = mes corrente")):
    """Dias uteis do mes pela regra do BI, com o que o ERP acha do mesmo mes.

    ★ POR QUE CALENDARIO PROPRIO: PCDIASUTEIS existe e cobre 2025-2026, mas so
    marca DOIS feriados no ano (01/01 e 01/05) — e um esqueleto seg-sex. Em
    2026 ele conta 2 dias uteis a mais em fevereiro (carnaval), 2 em abril
    (sexta-feira santa e Tiradentes) e 1 em junho (Corpus Christi). Projetar o
    fechamento do mes com esses numeros SUBESTIMA o resultado, porque divide o
    realizado por dias que ninguem trabalhou. A divergencia vai na resposta em
    vez de ser escondida: quando o ERP for corrigido, ela zera sozinha.

    Feriados locais (Goiania/GO) nao sao chutados: o gestor cadastra em
    app.feriado e eles entram aqui automaticamente."""
    hoje = date.today()
    ini = _mes(mes)
    fim = calendario.ultimo_dia(ini)
    corrente = ini == calendario.primeiro_dia(hoje)

    nacionais = {d for d in calendario.feriados_nacionais(ini.year) if ini <= d <= fim}
    locais = {d for d in calendario._extras() if ini <= d <= fim}
    feriados = ([{"data": d.isoformat(), "origem": "nacional", "dia_util": d.weekday() < 5}
                 for d in sorted(nacionais)]
                + [{"data": d.isoformat(), "origem": "local", "dia_util": d.weekday() < 5}
                   for d in sorted(locais - nacionais)])

    uteis_total = calendario.dias_uteis(ini, fim)
    # mes passado ja transcorreu inteiro; mes futuro ainda nao comecou
    if corrente:
        transcorridos = calendario.contexto_projecao(hoje)["uteis_transcorridos"]
    else:
        transcorridos = uteis_total if ini < hoje else 0

    # conferencia com o ERP — nunca derruba o endpoint: a tabela pode ainda nao
    # ter sido espelhada, e o calendario do BI e o canonico de qualquer forma
    erp = None
    try:
        erp = int(consulta.consultar(
            f"""SELECT COUNT(*) AS uteis
                FROM {consulta.esquema()}.pcdiasuteis
                WHERE codfilial = :filial
                AND   data >= :dt_ini AND data < :dt_fim_x
                AND   COALESCE(diavendas, 'S') = 'S'""",
            {"filial": regras.FILIAL, "dt_ini": ini, "dt_fim_x": fim + timedelta(days=1)},
            cache_key=f"meta:pcdiasuteis:{ini:%Y-%m}",
        )[0]["uteis"] or 0)
    except Exception:  # noqa: BLE001 — sem a tabela no espelho, so a conferencia fica sem numero
        erp = None

    return {
        "mes": ini.strftime("%Y-%m"),
        "dt_ini": ini.isoformat(),
        "dt_fim": fim.isoformat(),
        "uteis_total": uteis_total,
        "uteis_transcorridos": transcorridos,
        "mes_corrente": corrente,
        "feriados": feriados,
        "conferencia_erp": {
            "uteis_pcdiasuteis": erp,
            "divergencia": None if erp is None else erp - uteis_total,
            "observacao": ("PCDIASUTEIS marca apenas 01/01 e 01/05 como feriado no ano; "
                           "onde houver divergencia, vale o calendario do BI"),
        },
    }
