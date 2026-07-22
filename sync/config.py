"""Configuração do espelho Winthor (Oracle) -> Postgres.

ESTRATÉGIA POR TABELA — a escolha não é estética, é de correção:

* `completa`  — apaga e recarrega a tabela inteira a cada sync, dentro de uma
  transação. Usada em TUDO que é pequeno (~26 mil linhas somadas). É o único
  método que captura **alterações e exclusões** de registros antigos, coisa que
  um incremental por data NÃO vê: um título antigo pago hoje, uma nota antiga
  cancelada hoje, um pedido que mudou de posição. Como o volume é pequeno,
  recarregar é rápido e sempre correto.

* `incremental` — traz só o que tem data > última marca d'água. Usada apenas em
  PCHISTEST (141 mil linhas, 84% do volume total), que é histórico append-only
  de estoque por dia: registros passados não mudam, então incremental é seguro
  e evita transferir 141 mil linhas a cada rodada.

Colunas binárias (BLOB/RAW/LONG) são descartadas: nenhuma consulta do BI usa e
elas só encarecem a transferência.
"""

import re

OWNER = "U_CMT9GE_WI"

# tipos Oracle que NÃO vão para o espelho (binários / inúteis para BI)
TIPOS_IGNORADOS = {"BLOB", "RAW", "LONG", "LONG RAW", "BFILE"}

# ★ COLUNAS QUE NUNCA SAEM DO ERP, por nome.
#
# O espelho vive num servidor exposto na internet e o BI é analítico: ele não tem
# uso nenhum para credencial nem para documento de pessoa física. Sem esta trava,
# espelhar uma tabela de cadastro por "só preciso do nome" leva junto a senha e o
# CPF de todo mundo — foi o que aconteceu quando PCEMPR entrou para resolver o nome
# do comprador e carregou SENHABD (criptograma da senha do WinThor), CPF, RG, CTPS,
# PIS e nome dos pais dos 28 funcionários.
#
# A regra é por NOME e vale para TODAS as tabelas, presentes e futuras: é a única
# forma de a próxima tabela acrescentada não repetir o vazamento. Se algum dia uma
# consulta precisar de um desses campos, o certo é discutir o campo, não afrouxar
# a regra.
#
# `^cpf`/`^rg` são por PREFIXO porque o WinThor guarda o documento de terceiros em
# CPFCONJUGE, CPFTITULARCC, RGCONJ e afins. Já PIS é ANCORADO (`^pis$`): PISCOFINS*
# e PISRETIDO são tributo, não documento, e o BI precisa deles.
COLUNAS_PROIBIDAS = re.compile(
    r"(senha|password|hashsenha|^cpf|^rg[^_a-z]?$|^rgconj|^rgcontato|^rgorgemissor|"
    r"^rgdtemissao|^ctps|^pis$|^nomemae$|^nomepai$|^tituloeleitor|^cnh)",
    re.IGNORECASE,
)


def coluna_permitida(nome: str) -> bool:
    """Falso para credencial e documento pessoal.

    A trava é deliberadamente conservadora: flags como DTEXPIRASENHA e
    ALTERARSENHAPROXIMOLOGIN não são segredo, mas caem na regra por conterem
    "senha" — e o BI não usa nenhuma das duas. Diante de uma coluna duvidosa com
    nome de credencial, não espelhar é a decisão barata; espelhar é a cara.
    """
    return not COLUNAS_PROIBIDAS.search(nome or "")

TABELAS: dict[str, dict] = {
    # ---------- dimensões / cadastros ----------
    "PCFILIAL":     {"estrategia": "completa", "pk": ["CODIGO"]},
    "PCCLIENT":     {"estrategia": "completa", "pk": ["CODCLI"]},
    "PCPRODUT":     {"estrategia": "completa", "pk": ["CODPROD"]},
    "PCUSUARI":     {"estrategia": "completa", "pk": ["CODUSUR"]},
    "PCFORNEC":     {"estrategia": "completa", "pk": ["CODFORNEC"]},
    "PCDEPTO":      {"estrategia": "completa", "pk": ["CODEPTO"]},
    "PCSECAO":      {"estrategia": "completa", "pk": ["CODSEC"]},
    "PCPRACA":      {"estrategia": "completa", "pk": ["CODPRACA"]},
    "PCCOB":        {"estrategia": "completa", "pk": ["CODCOB"]},
    # dimensões exigidas pelas correções validadas com o cliente (skill
    # `correcoes-bi-distribuidora`): filtros da rotina 1464 (§6), relatório
    # 14-Por Prazo (§8) e o plano de contas que separa "compra mercadoria" das
    # demais despesas no PMP. Somam ~5,9 mil linhas — custo irrisório de sync.
    "PCATIVI":      {"estrategia": "completa", "pk": ["CODATIV"]},        # ramo de atividade
    "PCMARCA":      {"estrategia": "completa", "pk": ["CODMARCA"]},
    "PCREGIAO":     {"estrategia": "completa", "pk": ["NUMREGIAO"]},
    "PCSUPERV":     {"estrategia": "completa", "pk": ["CODSUPERVISOR"]},
    "PCGERENTE":    {"estrategia": "completa", "pk": ["CODGERENTE"]},
    "PCEMPR":       {"estrategia": "completa", "pk": ["MATRICULA"]},      # comprador
    "PCCIDADE":     {"estrategia": "completa", "pk": ["CODCIDADE"]},      # UF/município normalizado
    "PCPLPAG":      {"estrategia": "completa", "pk": ["CODPLPAG"]},       # plano de pagamento (rel. 14)
    "PCCONTA":      {"estrategia": "completa", "pk": ["CODCONTA"]},       # plano de contas do a pagar
    # PCDIASUTEIS entra como CONFERÊNCIA do calendário: a tabela do ERP só marca
    # 2 feriados no ano inteiro, então o calendário canônico do BI é próprio
    # (backend/app/calendario.py). Ver /api/meta/dias-uteis.
    "PCDIASUTEIS":  {"estrategia": "completa", "pk": ["CODFILIAL", "DATA"]},

    # ---------- estoque (snapshot) ----------
    "PCEST":        {"estrategia": "completa", "pk": ["CODFILIAL", "CODPROD"]},
    "PCPRODFILIAL": {"estrategia": "completa", "pk": ["CODPROD", "CODFILIAL"]},

    # ---------- fatos de venda / compra / financeiro ----------
    # PCMOV não tem PK (só índice único com nulos) -> recarga completa resolve
    "PCMOV":        {"estrategia": "completa", "pk": ["NUMTRANSITEM"]},
    "PCNFSAID":     {"estrategia": "completa", "pk": ["NUMTRANSVENDA"]},
    "PCNFENT":      {"estrategia": "completa", "pk": ["NUMTRANSENT", "CODCONT"]},
    "PCPEDC":       {"estrategia": "completa", "pk": ["NUMPED"]},
    "PCPEDI":       {"estrategia": "completa", "pk": ["NUMPED", "CODPROD", "NUMSEQ"]},
    "PCPEDIDO":     {"estrategia": "completa", "pk": ["NUMPED"]},
    # itens do pedido de COMPRA — sem eles PCPEDIDO no espelho não responde
    # "quanto já foi pedido e ainda não chegou" (§10, sugestão de compra)
    "PCITEM":       {"estrategia": "completa", "pk": ["NUMPED", "CODPROD", "NUMSEQ"]},
    "PCPREST":      {"estrategia": "completa", "pk": ["NUMTRANSVENDA", "PREST"]},
    # contas a PAGAR — base do Prazo Médio de Pagamento (§8). A base não tem
    # PCPAGAR; o a pagar do Winthor mora em PCLANC. Recarga completa é
    # obrigatória: baixas retroativas alteram linhas antigas.
    "PCLANC":       {"estrategia": "completa", "pk": ["RECNUM"]},

    # ---------- histórico grande: o único incremental ----------
    "PCHISTEST":    {"estrategia": "incremental", "pk": ["CODFILIAL", "CODPROD", "DATA"],
                     "coluna_data": "DATA",
                     # relê os últimos N dias além da marca d'água, por segurança
                     # (lançamentos retroativos do dia anterior)
                     "reprocessa_dias": 3},
}

# Oracle -> Postgres
def tipo_postgres(data_type: str, precisao, escala, tamanho) -> str:
    t = (data_type or "").upper()
    if t in ("VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR"):
        return f"varchar({max(int(tamanho or 1), 1)})"
    if t == "CLOB":
        return "text"
    if t == "DATE":
        return "timestamp"
    if t.startswith("TIMESTAMP"):
        return "timestamp"
    if t in ("NUMBER", "FLOAT"):
        if precisao is None:
            return "numeric"
        if (escala or 0) == 0:
            p = int(precisao)
            return "integer" if p <= 9 else "bigint"
        return f"numeric({int(precisao)},{int(escala)})"
    return "text"
