"""Churn: risco de abandono, cliente perdido e a anotacao do gestor (§9 das regras).

★ POR QUE NAO USAR PCCLIENT.DTULTCOMP
O ERP atualiza esse campo tambem em nota de remessa (comodato) e em pedido
faturado, entao ele ERRA SEMPRE PARA MAIS e esconde churn: medido nesta base,
cliente com 132 dias reais sem comprar aparecia como ativo. A ultima compra do BI
sai de PCMOV com a regua de venda (CODOPER='S'), a mesma da medida canonica.

★ POR QUE A JANELA DE 90 DIAS E ANCORADA NA ULTIMA COMPRA, NAO EM HOJE
O ciclo medio so existe se houver >= 2 dias distintos de compra dentro da janela.
Ancorando em hoje, quem esta perdido ha meses fica sem NENHUMA compra na janela e
perde o ciclo — justamente o cliente sobre o qual o gestor precisa decidir.
Medido em 2026-07-21: ancorando na ultima compra, 136 dos 203 clientes ganham
ciclo confiavel contra 103 ancorando em hoje, e apenas 2 mudam de status. Ou
seja: mais informacao, mesma classificacao.

★ REGRA (constantes em regras.CHURN_*, nunca numeros soltos)
    ciclo medio      = media dos intervalos entre DIAS DISTINTOS de compra na
                       janela de 90 dias ancorada na ultima compra
                     = (ultimo dia - primeiro dia) / (dias de compra - 1)
    ciclo indefinido = menos de 2 dias de compra na janela -> vale so o teto de 30
    PERDIDO          = dias_sem_compra >= MIN(30, 2,0 x ciclo)
    RISCO            = dias_sem_compra >= 1,6 x ciclo e ainda nao perdido

Caso canonico (Sued Comercio, CODCLI 113): ciclo 4,89 d -> risco no dia 8
(1,6 x 4,89 = 7,8) e perdido no dia 10 (2,0 x 4,89 = 9,8), muito antes do teto de
30. Por isso limite_risco e limite_perdido voltam EM DIAS por cliente: sem eles o
gestor nao entende por que um cliente virou perdido com 10 dias e outro com 30.

★ BASE: cliente com ao menos uma nota de venda e DTEXCLUSAO nula. NAO se filtra
BLOQUEIO='S' — 20 dos 88 bloqueados compraram em junho/2026, o bloqueio aqui e
operacional (credito) e nao significa fim de relacionamento. Cliente cadastrado
que nunca comprou nao e perda: vai para meta.nunca_compraram (35 hoje).

★ RCA RESPONSAVEL = o RCA da ULTIMA VENDA do cliente (PCMOV.CODUSUR), nao
PCCLIENT.CODUSUR1. A carteira do cadastro esta desalinhada da operacao: por
CODUSUR1 o RCA 6 (Bruno Matias) nao tem NENHUM cliente e aparece um RCA 7 que nao
vende ha meses; pelo atendimento real a distribuicao fecha nos 5 RCAs que o filtro
global oferece. E o filtro de RCA seleciona QUAIS clientes aparecem — nunca recorta
o historico de compras, senao "dias sem compra" mentiria.

★ ANOTACAO DO GESTOR: o Oracle e somente leitura; motivo/observacao/silenciamento
moram no schema `app` do Postgres (backend/app/migracoes.py). A leitura NAO passa
por consulta.consultar(): com FONTE_DADOS=oracle o churn roda no Oracle e nao ha
como fazer JOIN com app.*. Buscamos os codcli do resultado e mesclamos em Python.
Sem o schema `app` o /churn continua respondendo (campos de motivo nulos) e os
endpoints de anotacao devolvem 503.

★ AUTORIZACAO: este router mora na aba Comercial, no recurso `comercial.churn`
("Clientes em risco e perdidos"). Nao ha aba /clientes — o prefixo da URL e
historico. Quem nao tem `comercial.churn` nao le nem grava anotacao de cliente.

★ CARTEIRA — SAO DUAS PORTAS, E AS DUAS SAO FECHADAS
A primeira e o filtro `rcas` da lista, que passa por `permissoes.escopo_rca()`.
A segunda e o `codcli` no caminho da URL das anotacoes: sem checagem, o vendedor
restrito ao RCA 3 leria o motivo da perda que o gestor anotou sobre o cliente do
colega — e escreveria por cima. Por isso `_assegurar_cliente(...)` compara o RCA
de atendimento do cliente (o da ULTIMA VENDA, a mesma regra do churn) com a
carteira de quem pediu. So custa uma consulta para quem e restrito.
"""
import logging
from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import consulta, permissoes, pg, regras

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clientes", tags=["clientes"],
                   dependencies=[Depends(permissoes.requer("comercial.churn"))])

MSG_SEM_APP = ("Anotações de cliente indisponíveis: o schema `app` do Postgres não está "
               "acessível. O churn continua funcionando; para registrar motivo da perda é "
               "preciso subir o espelho Postgres (as tabelas são criadas no start da API).")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lista_int(csv: str | None) -> list[int]:
    """'1,3' -> [1, 3]. Vazio = todos (o filtro some do SQL)."""
    if not csv:
        return []
    saida: list[int] = []
    for parte in str(csv).replace(";", ",").split(","):
        parte = parte.strip()
        if not parte:
            continue
        try:
            saida.append(int(parte))
        except ValueError:
            raise HTTPException(422, f"Filtro invalido: {parte!r} nao e um codigo numerico")
    return saida


def _num(v) -> float | None:
    """psycopg devolve Decimal; o JSON do BI trabalha com float."""
    return None if v is None else float(v)


def _rca_de_atendimento(codcli: int) -> int | None:
    """RCA da ULTIMA VENDA do cliente — a mesma definicao do CTE `atendimento`.

    Nunca PCCLIENT.CODUSUR1: por CODUSUR1 o RCA 6 (Bruno Matias) nao tem NENHUM
    cliente apesar de faturar, e um vendedor restrito ficaria trancado para fora
    da propria carteira. ROW_NUMBER em vez de LIMIT para o SQL continuar valendo
    quando FONTE_DADOS=oracle.
    """
    o = consulta.esquema()
    linhas = consulta.consultar(
        f"""SELECT codusur FROM (
              SELECT m.codusur,
                     ROW_NUMBER() OVER (PARTITION BY m.codcli
                                        ORDER BY m.dtmov DESC, m.qt * m.punit DESC, m.codusur) AS rn
              FROM   {o}.pcmov m
              WHERE  m.codcli = :codcli
                AND  m.codoper = '{regras.OPER_VENDA}'
                AND  m.dtcancel IS NULL
                AND  m.codfilial = :filial
            ) x WHERE rn = 1""",
        {"codcli": codcli, "filial": regras.FILIAL},
    )
    if not linhas or linhas[0]["codusur"] is None:
        return None
    return int(linhas[0]["codusur"])


def _assegurar_cliente(usuario, codcli: int) -> None:
    """O cliente do caminho da URL esta na carteira de quem pediu?

    ★ Cliente SEM venda (cadastro novo, "nunca comprou") nao tem RCA de
    atendimento. Para o usuario restrito isso e NEGADO, nao liberado: sem venda
    nao ha como provar que o cliente e dele, e `assegurar_rca(None)` ja falha
    fechado. Quem nao e restrito nem chega a pagar a consulta.
    """
    if not getattr(usuario, "restrito_a_carteira", False):
        return
    permissoes.assegurar_rca(usuario, _rca_de_atendimento(codcli))


def _um_ano_atras(hoje: date) -> date:
    """Mesma data do ano passado (29/02 cai para 28/02)."""
    try:
        return hoje.replace(year=hoje.year - 1)
    except ValueError:
        return hoje.replace(year=hoje.year - 1, day=28)


def _sql_churn(rcas: list[int], deptos: list[int]) -> str:
    """Monta o SQL do churn (Postgres, espelho `winthor`).

    O JOIN com pcprodut so entra quando ha filtro de departamento: sem ele a
    consulta varre PCMOV uma vez a menos e nao corre risco de duplicar item.
    """
    o = consulta.esquema()
    jp = f"JOIN {o}.pcprodut p ON p.codprod = m.codprod" if deptos else ""
    fd = regras.clausula_depto(deptos)                       # " AND p.codepto = ANY(:deptos)"
    fr = " AND b.codusur = ANY(:rcas)" if rcas else ""       # recorta a LISTA, nao o historico
    janela = regras.DIAS_CLIENTE_ATIVO
    venda = regras.OPER_VENDA
    return f"""
WITH compras AS (
  -- dias DISTINTOS de compra: duas notas no mesmo dia sao um evento de compra so,
  -- senao o ciclo medio despenca em cliente que fatura em varias notas por dia
  SELECT m.codcli, m.dtmov::date AS dia
  FROM   {o}.pcmov m
  {jp}
  WHERE  m.codoper = '{venda}'
    AND  m.dtcancel IS NULL
    AND  m.codfilial = :filial{fd}
  GROUP  BY m.codcli, m.dtmov::date
), ultima AS (
  SELECT codcli, MAX(dia) AS ultima_compra FROM compras GROUP BY codcli
), atendimento AS (
  -- RCA da ultima venda (ver docstring): e quem o gestor cobra pelo resgate
  SELECT codcli, codusur FROM (
    SELECT m.codcli, m.codusur,
           ROW_NUMBER() OVER (PARTITION BY m.codcli
                              ORDER BY m.dtmov DESC, m.qt * m.punit DESC, m.codusur) AS rn
    FROM   {o}.pcmov m
    {jp}
    WHERE  m.codoper = '{venda}'
      AND  m.dtcancel IS NULL
      AND  m.codfilial = :filial{fd}
  ) x WHERE rn = 1
), janela AS (
  -- 90 dias ancorados na ULTIMA COMPRA do cliente, nunca em hoje
  SELECT c.codcli, c.dia
  FROM   compras c
  JOIN   ultima u ON u.codcli = c.codcli
  WHERE  c.dia > u.ultima_compra - {janela}
), ciclo AS (
  SELECT codcli,
         COUNT(*) AS compras_90d,
         CASE WHEN COUNT(*) >= 2
              THEN (MAX(dia) - MIN(dia))::numeric / (COUNT(*) - 1) END AS ciclo_medio
  FROM   janela GROUP BY codcli
), receita AS (
  -- liquido de 12 meses = tamanho da perda; devolucao ja abatida (medida canonica)
  SELECT m.codcli, {regras.valor_liquido()} AS liquido_12m
  FROM   {o}.pcmov m
  {jp}
  WHERE  {regras.filtro_venda()}{fd}
  GROUP  BY m.codcli
), base AS (
  SELECT u.codcli,
         cl.cliente,
         a.codusur,
         {regras.nome_rca('us')} AS rca,
         u.ultima_compra,
         (CURRENT_DATE - u.ultima_compra)              AS dias_sem_compra,
         k.ciclo_medio,
         COALESCE(k.compras_90d, 0)                    AS compras_90d,
         COALESCE(r.liquido_12m, 0)                    AS liquido_12m,
         LEAST({regras.CHURN_TETO_DIAS},
               COALESCE({regras.CHURN_FATOR_PERDIDO} * k.ciclo_medio,
                        {regras.CHURN_TETO_DIAS}))     AS limite_perdido,
         {regras.CHURN_FATOR_RISCO} * k.ciclo_medio    AS limite_risco
  FROM   ultima u
  JOIN   {o}.pcclient cl ON cl.codcli = u.codcli AND cl.dtexclusao IS NULL
  LEFT   JOIN ciclo k        ON k.codcli = u.codcli
  LEFT   JOIN receita r      ON r.codcli = u.codcli
  LEFT   JOIN atendimento a  ON a.codcli = u.codcli
  LEFT   JOIN {o}.pcusuari us ON us.codusur = a.codusur
)
SELECT z.* FROM (
  SELECT b.*,
         CASE WHEN b.dias_sem_compra >= b.limite_perdido THEN 'PERDIDO'
              WHEN b.limite_risco IS NOT NULL
               AND b.dias_sem_compra >= b.limite_risco   THEN 'RISCO'
              ELSE 'ATIVO' END AS status
  FROM   base b
  WHERE  1 = 1{fr}
) z
ORDER BY CASE z.status WHEN 'RISCO' THEN 0 WHEN 'PERDIDO' THEN 1 ELSE 2 END,
         z.liquido_12m DESC, z.codcli
"""


def _sql_nunca_compraram(rcas: list[int], deptos: list[int]) -> str:
    """Cadastrados que nunca faturaram: nao sao perda, sao carteira nao aberta.

    Aqui o RCA so pode vir do cadastro (PCCLIENT.CODUSUR1) — sem venda nao existe
    RCA de atendimento.
    """
    o = consulta.esquema()
    jp = f"JOIN {o}.pcprodut p ON p.codprod = m.codprod" if deptos else ""
    fd = regras.clausula_depto(deptos)
    fr = " AND cl.codusur1 = ANY(:rcas)" if rcas else ""
    return f"""
SELECT COUNT(*) AS clientes
FROM   {o}.pcclient cl
WHERE  cl.dtexclusao IS NULL{fr}
  AND  NOT EXISTS (SELECT 1
                   FROM   {o}.pcmov m
                   {jp}
                   WHERE  m.codcli = cl.codcli
                     AND  m.codoper = '{regras.OPER_VENDA}'
                     AND  m.dtcancel IS NULL
                     AND  m.codfilial = :filial{fd})
"""


def _anotacoes(codclis: list[int]) -> dict[int, dict] | None:
    """Anotacoes do gestor, do schema `app`. None = schema indisponivel.

    Sempre por `codcli = ANY(...)`: o churn pode ter rodado no Oracle, entao o JOIN
    com app.* nao existe e a juncao e feita em Python.
    """
    if not codclis:
        return {}
    try:
        linhas = pg.consultar(
            """SELECT a.codcli, a.motivo, mp.descricao AS motivo_descricao, a.observacao,
                      a.silenciar_ate, a.alterado_por, a.alterado_em
               FROM   app.cliente_anotacao a
               LEFT   JOIN app.motivo_perda mp ON mp.codigo = a.motivo
               WHERE  a.codcli = ANY(%(codclis)s)""",
            {"codclis": codclis},
        )
    except Exception as e:  # noqa: BLE001 — sem espelho o churn nao pode cair
        log.warning("anotacoes de cliente indisponiveis (%s)", e)
        return None
    return {int(r["codcli"]): r for r in linhas}


def _ler_anotacao(codcli: int) -> dict:
    try:
        linhas = pg.consultar(
            """SELECT codcli, motivo, observacao, silenciar_ate, alterado_por, alterado_em
               FROM   app.cliente_anotacao WHERE codcli = %(c)s""",
            {"c": codcli},
        )
    except psycopg.Error as e:
        log.warning("schema app indisponivel (%s)", e)
        raise HTTPException(503, MSG_SEM_APP)
    if not linhas:
        # cliente sem anotacao ainda: devolve o molde vazio (o formulario do gestor
        # abre igual, com ou sem registro) em vez de 404
        return {"codcli": codcli, "motivo": None, "observacao": None,
                "silenciar_ate": None, "alterado_por": None, "alterado_em": None}
    return linhas[0]


# ---------------------------------------------------------------------------
# Churn
# ---------------------------------------------------------------------------

@router.get("/churn")
def churn(rcas: str | None = Query(None, description="csv de CODUSUR; vazio = todos"),
          deptos: str | None = Query(None, description="csv de CODEPTO; vazio = todos"),
          usuario=Depends(permissoes.requer("comercial.churn"))):
    """Lista acionavel de risco de abandono e clientes perdidos.

    Churn e SNAPSHOT de hoje: dt_ini/dt_fim do filtro global nao se aplicam (a
    pergunta e "quem parou de comprar ate agora", nao "no mes X"). O filtro de
    departamento, quando usado, restringe as compras consideradas — a leitura
    passa a ser "parou de comprar QUIMICOS", e meta.regra avisa isso na tela.

    ★ O escopo de carteira entra na MESMA porta do filtro manual (`fr` recorta a
    LISTA por `b.codusur`, nunca o historico de compras), entao "dias sem compra"
    continua verdadeiro para o vendedor restrito. As duas cache_keys ja levam a
    lista de RCAs, e como ela agora e a efetiva, a lista do dono nao e reaproveitada.
    """
    lista_rcas, lista_deptos = permissoes.escopo_rca(usuario, _lista_int(rcas)), _lista_int(deptos)
    hoje = date.today()

    binds = regras.periodo_binds(_um_ano_atras(hoje), hoje)   # dt_ini/dt_fim_x/filial
    binds.update(regras.binds_dimensao(lista_rcas, lista_deptos))
    chave = f"clientes:churn:{hoje}:{sorted(lista_rcas)}:{sorted(lista_deptos)}"

    linhas = consulta.consultar(_sql_churn(lista_rcas, lista_deptos), binds, cache_key=chave)
    anotacoes = _anotacoes([int(l["codcli"]) for l in linhas])

    rows: list[dict] = []
    ativos = risco = perdidos = silenciados = 0
    receita_perdida = 0.0
    receita_total = 0.0

    for l in linhas:
        status = l["status"]
        liquido = _num(l["liquido_12m"]) or 0.0
        receita_total += liquido
        if status == "PERDIDO":
            perdidos += 1
            receita_perdida += liquido
        elif status == "RISCO":
            risco += 1
        else:
            ativos += 1

        nota = (anotacoes or {}).get(int(l["codcli"])) or {}
        silenciar_ate = nota.get("silenciar_ate")
        # "ate" e inclusivo: silenciado ate 21/07 ainda esta silenciado no dia 21
        silenciado = bool(silenciar_ate and silenciar_ate >= hoje)
        if silenciado:
            silenciados += 1

        ciclo = _num(l["ciclo_medio"])
        # [:10] normaliza: no espelho vem `date`, no Oracle legado vem `datetime`
        ultima = l["ultima_compra"]
        rows.append({
            "codcli": int(l["codcli"]),
            "cliente": l["cliente"],
            "codusur": l["codusur"],
            "rca": l["rca"],
            "ultima_compra": ultima.isoformat()[:10] if ultima else None,
            "dias_sem_compra": int(l["dias_sem_compra"]),
            "ciclo_medio": round(ciclo, 2) if ciclo is not None else None,
            # sem 2 dias de compra na janela nao ha ciclo confiavel: a tela precisa
            # dizer isso, senao o gestor le "perdido" como se fosse quebra de ritmo
            "ciclo_indefinido": ciclo is None,
            "compras_90d": int(l["compras_90d"]),
            "status": status,
            "limite_risco": round(_num(l["limite_risco"]), 1) if l["limite_risco"] is not None else None,
            "limite_perdido": round(_num(l["limite_perdido"]), 1),
            "liquido_12m": round(liquido, 2),
            "motivo": nota.get("motivo"),
            "motivo_descricao": nota.get("motivo_descricao"),
            "observacao": nota.get("observacao"),
            "silenciado_ate": silenciar_ate.isoformat() if silenciar_ate else None,
            "silenciado": silenciado,
        })

    # o gestor trabalha a lista de cima para baixo: quem ele mandou silenciar
    # desce para o fim sem sumir (a ordem de dentro de cada grupo vem do SQL)
    rows.sort(key=lambda r: r["silenciado"])

    nunca = consulta.consultar(
        _sql_nunca_compraram(lista_rcas, lista_deptos),
        {k: v for k, v in binds.items() if k in ("filial", "rcas", "deptos")},
        cache_key=f"clientes:nunca:{hoje}:{sorted(lista_rcas)}:{sorted(lista_deptos)}",
    )

    regra = (f"Perdido: dias sem compra >= MIN({regras.CHURN_TETO_DIAS}; "
             f"{regras.CHURN_FATOR_PERDIDO:.1f} x ciclo). "
             f"Risco: >= {regras.CHURN_FATOR_RISCO:.1f} x ciclo e ainda não perdido. "
             f"Ciclo médio = média dos intervalos entre dias distintos de compra na janela de "
             f"{regras.DIAS_CLIENTE_ATIVO} dias ancorada na última compra do cliente; com menos "
             f"de 2 dias de compra na janela o ciclo é indefinido e vale só o teto de "
             f"{regras.CHURN_TETO_DIAS} dias. Última compra apurada em PCMOV (venda faturada), "
             f"não em PCCLIENT.DTULTCOMP.")
    if lista_deptos:
        regra += " Filtro de departamento ativo: a leitura é 'parou de comprar deste departamento'."
    # ★ "nunca compraram" sai por PCCLIENT.CODUSUR1 (cadastro) e a lista de churn por
    # PCMOV.CODUSUR (atendimento) — as duas carteiras DIVERGEM nesta base. Sob escopo
    # o mesmo RCA e aplicado nas duas, entao um vendedor cuja carteira de cadastro
    # esta vazia (o caso do RCA 6, reciclado do Joao Pedro) ve zero em
    # `nunca_compraram` e a lista de churn cheia. Nao e erro: sao duas perguntas.
    if lista_rcas:
        regra += (" Carteira: a lista usa o RCA da última venda (atendimento) e "
                  "'nunca compraram' usa o RCA do cadastro (PCCLIENT.CODUSUR1) — "
                  "as duas definições divergem nesta base.")

    return {
        "rows": rows,
        "meta": {
            "ativos": ativos,
            "risco": risco,
            "perdidos": perdidos,
            "nunca_compraram": int(nunca[0]["clientes"]) if nunca else 0,
            "receita_perdida": round(receita_perdida, 2),
            "receita_total_12m": round(receita_total, 2),
            "receita_perdida_pct": (round(receita_perdida / receita_total * 100, 2)
                                    if receita_total else None),
            "silenciados": silenciados,
            "anotacoes_disponiveis": anotacoes is not None,
            "referencia": hoje.isoformat(),
            "regra": regra,
            "escopo_carteira": permissoes.descreve_escopo(usuario),
        },
    }


# ---------------------------------------------------------------------------
# Anotacao do gestor (schema `app` do Postgres)
# ---------------------------------------------------------------------------

@router.get("/motivos")
def motivos():
    """Catalogo do dropdown de motivo da perda (semeado em migracoes.py)."""
    try:
        return pg.consultar(
            """SELECT codigo, descricao, recuperavel, ordem
               FROM   app.motivo_perda ORDER BY ordem, descricao"""
        )
    except psycopg.Error as e:
        log.warning("schema app indisponivel (%s)", e)
        raise HTTPException(503, MSG_SEM_APP)


class AnotacaoIn(BaseModel):
    """Campo ausente = nao mexe; campo enviado como null = limpa.

    A distincao existe porque a tela grava um campo de cada vez (o gestor escolhe
    o motivo agora e escreve a observacao depois) — um PUT parcial nao pode apagar
    o que ja estava gravado.
    """
    motivo: str | None = None
    observacao: str | None = Field(None, max_length=2000)
    silenciar_ate: date | None = None


@router.get("/{codcli}/anotacao")
def ler_anotacao(codcli: int, usuario=Depends(permissoes.requer("comercial.churn"))):
    _assegurar_cliente(usuario, codcli)
    return _ler_anotacao(codcli)


@router.put("/{codcli}/anotacao")
def gravar_anotacao(codcli: int, body: AnotacaoIn,
                    usuario: str = Depends(permissoes.requer("comercial.churn"))):
    """Grava motivo/observacao/silenciamento e versiona na MESMA transacao.

    O historico existe porque motivo da perda e informacao de gestao: se alguem
    troca "perdeu licitacao" por "preco", a leitura do mes anterior muda sem
    rastro. `alterado_por` e o login de quem gravou — `usuario` E o login, porque
    `UsuarioSessao` herda de `str` (ver a nota da classe em auth.py); a anotacao
    da dependencia continua `str` para deixar isso explicito para quem ler.
    """
    _assegurar_cliente(usuario, codcli)
    enviados = body.model_fields_set
    try:
        with pg.conexao() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT motivo, observacao, silenciar_ate
                       FROM   app.cliente_anotacao WHERE codcli = %(c)s FOR UPDATE""",
                    {"c": codcli},
                )
                atual = cur.fetchone() or {}
                dados = {
                    "c": codcli,
                    "m": ((body.motivo or "").strip() or None) if "motivo" in enviados
                         else atual.get("motivo"),
                    "o": ((body.observacao or "").strip() or None) if "observacao" in enviados
                         else atual.get("observacao"),
                    "s": body.silenciar_ate if "silenciar_ate" in enviados
                         else atual.get("silenciar_ate"),
                    "u": usuario,
                }
                cur.execute(
                    """INSERT INTO app.cliente_anotacao
                            (codcli, motivo, observacao, silenciar_ate, alterado_por, alterado_em)
                       VALUES (%(c)s, %(m)s, %(o)s, %(s)s, %(u)s, now())
                       ON CONFLICT (codcli) DO UPDATE
                          SET motivo = EXCLUDED.motivo,
                              observacao = EXCLUDED.observacao,
                              silenciar_ate = EXCLUDED.silenciar_ate,
                              alterado_por = EXCLUDED.alterado_por,
                              alterado_em = now()""",
                    dados,
                )
                cur.execute(
                    """INSERT INTO app.cliente_anotacao_hist
                            (codcli, motivo, observacao, silenciar_ate, alterado_por)
                       VALUES (%(c)s, %(m)s, %(o)s, %(s)s, %(u)s)""",
                    dados,
                )
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(422, f"Motivo desconhecido: {body.motivo!r}. "
                                 f"Use um código de GET /api/clientes/motivos.")
    except psycopg.Error as e:
        log.warning("falha ao gravar anotacao do cliente %s (%s)", codcli, e)
        raise HTTPException(503, MSG_SEM_APP)
    return _ler_anotacao(codcli)
