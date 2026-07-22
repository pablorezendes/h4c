"""Administração de usuários do BI: quem entra e o que cada um enxerga.

Autenticação (quem é você) está em `auth.py`; autorização (o que você pode ver)
em `permissoes.py`. Aqui mora o que o DONO faz na tela de Configurações: trazer
gente do ERP, criar quem não existe lá, dar e tirar permissão, definir carteira
e gerar senha provisória.

★ SUGESTÃO NÃO É DECISÃO. Metade deste arquivo existe para PROPOR — papel pelo
  setor, carteira por casamento de nome, recursos pelo acesso real do ERP — e
  nada disso é tratado como verdade. Toda sugestão vem com CONFIANÇA e MOTIVO
  porque quem decide é o dono, olhando a lista. Um caso medido nesta base
  resume o porquê: MATHEUS NUNES SILVA está cadastrado no setor
  VENDEDORES(AS)/CALL CENTER, mas no ERP ele não tem NENHUMA rotina do módulo
  VENDA — tem 88% do ADM. INTERNA DO ESTOQUE e 95% do RECEBIMENTO MERCADORIA.
  O setor diz "vendedor", a operação diz "estoque". Só o dono desempata.

★ NUNCA use PCEMPR.CODUSUR para sugerir carteira. O valor 1 é default de fábrica
  e aparece em 20 das 28 linhas do ERP: COMPRAS, FINANCEIRO, TI e PCADMIN
  herdariam a carteira do MARCELO CURADO, e um "restrito à própria carteira"
  aplicado em cima disso mostraria a carteira do dono para meia empresa. A
  sugestão de RCA sai de casamento de nome com PCUSUARI ('CARTEIRA ' || NOME),
  que acerta 4 dos 5 RCAs que faturam, e é conferida na tela.

★ ESTE MÓDULO FALA COM O POSTGRES DIRETO (`from .. import pg`), inclusive para
  ler `winthor.*`. Não é descuido: as duas consultas que importam aqui são
  ANTI-JOINS entre o ERP e o BI ("quem existe no PCEMPR e ainda não tem usuário",
  "qual carteira já está tomada"), e isso só é possível com os dois schemas no
  mesmo banco. É também o que `auth.py` já faz para conferir desligamento. Com
  FONTE_DADOS=oracle o espelho `winthor` pode estar vazio; por isso toda leitura
  do ERP passa por `_existe()` e degrada com aviso em vez de estourar 500.

★ QUEM FEZ SAI DO TOKEN, NUNCA DO CORPO. `usuario.login` vem de `require_admin`,
  que releu o usuário do banco. Aceitar um campo "quem" no JSON transformaria o
  log de auditoria em campo de texto livre — inútil justamente no dia em que
  alguém precisar dele.
"""
import logging
import re
import time
import unicodedata

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import auth, permissoes, pg
from ..auth import UsuarioSessao

log = logging.getLogger(__name__)

# ★ UMA instância só da dependência, reusada no router e nos handlers que precisam
# saber QUEM está mexendo. `requer_admin()` devolve uma função nova a cada chamada,
# e o cache de dependências do FastAPI é por objeto: duas instâncias fariam a
# releitura do usuário acontecer duas vezes no mesmo request.
REQUER_ADMIN = permissoes.requer_admin()

# ★ Ordem de declaração importa: `/recursos` e `/importaveis` precisam vir ANTES
# de `/{uid}`, senão o FastAPI tenta converter "recursos" para int e responde 422.
router = APIRouter(prefix="/api/usuarios", tags=["usuarios"],
                   dependencies=[Depends(REQUER_ADMIN)])

MSG_SEM_APP = ("Administração de usuários indisponível: o schema `app` do Postgres não está "
               "acessível. Suba o espelho Postgres — as tabelas são criadas no start da API.")


# ---------------------------------------------------------------------------
# Contas do ERP que NÃO viram login
# ---------------------------------------------------------------------------
# ★ Medido na base em 2026-07-22: PCEMPR tem 28 linhas e 12 delas são conta de
# SERVIÇO — cadastro padrão da instalação (PADRAO: OPERADOR(A) DE CAIXA), conta
# do fornecedor do ERP (PCADMIN, e-mail @totvs.com.br), conta de integração (ION,
# 8888 "Força de Vendas") ou conta de setor compartilhada por várias pessoas
# (COMPRAS, VENDAS, FINANCEIRO, RECEBER, CONTAB, MOTORISTA, TI).
#
# Conta compartilhada é veneno para auditoria: `app.acesso_log` passaria a dizer
# que "FINANCEIRO" liberou o vencido para alguém, e ninguém sabe quem é
# FINANCEIRO. Elas ficam de fora da importação — se algum dia uma pessoa real
# usar uma delas, o caminho certo é POST /api/usuarios (cadastro manual) com o
# nome dela.
LOGINS_GENERICOS = frozenset({
    "PCADMIN", "OPERCAIXA", "FISCCAIXA", "COMPRAS", "VENDAS", "FINANCEIRO",
    "RECEBER", "CONTAB", "MOTORISTA", "ION", "8888", "TI",
})

# Ambíguas: nome de sistema, mas uso intenso e humano no ERP (PLANNING tem 956
# rotinas liberadas, PLANNING1 tem 790 — mais que o comprador). Podem ser pessoa
# com login herdado ou conta compartilhada do escritório contábil. Entram na
# lista de importáveis MARCADAS, para o dono confirmar antes de dar senha.
LOGINS_REVISAR = frozenset({"PLANNING", "PLANNING1"})


# ---------------------------------------------------------------------------
# Setor do ERP -> papel no BI
# ---------------------------------------------------------------------------
# PCEMPR.CODSETOR está 100% preenchido e PCSETOR tem 13 setores — é o melhor
# semeador de papel que a base oferece. (PCEMPR.CODPERFIL NÃO serve: é controle
# de licença do WinThor, não função.)
#
# A regra casa por PALAVRA na descrição, e não por código, para que um setor novo
# cadastrado no ERP amanhã ("CREDITO E COBRANCA II") continue caindo na regra
# certa sem ninguém mexer aqui. O código do setor entra só como legenda de
# fallback (`SETOR_MEDIDO`) para quando `winthor.pcsetor` não estiver no espelho.
#
# A ordem é significativa: "FISCAIS DE CAIXA" tem que ser testado antes de
# CONTABILIDADE/FISCAL, senão fiscal de caixa vira contabilidade.
#
# (palavras, papel, funcao, restrito_a_carteira, porque)
REGRAS_SETOR: tuple[tuple[tuple[str, ...], str, str, bool, str], ...] = (
    (("DIRETORIA",), "admin", "dono", False,
     "Setor DIRETORIA: é quem manda no BI e precisa administrar usuários."),
    (("INFORMATICA", "TECNOLOGIA"), "admin", "TI", False,
     "Setor INFORMATICA: quem implanta e mantém o BI. No ERP este setor já tem "
     "praticamente todas as rotinas liberadas."),
    (("CAIXA",), "leitor", "operacional", False,
     "Operação de caixa: começa só com a aba Comercial."),
    (("COMPRAS", "SUPRIMENTO"), "gestor", "comprador", False,
     "Setor COMPRAS: precisa de demanda, curva ABC, sugestão de compra e estoque."),
    (("FINANCEIRO", "TESOURARIA"), "gestor", "financeiro", False,
     "Setor FINANCEIRO/TESOURARIA: prazos, vencido e faturamento por prazo."),
    (("COBRANCA", "CREDITO"), "gestor", "cobrança", False,
     "Crédito e cobrança: sem o relatório de vencido não trabalha."),
    (("CONTABIL", "FISCAL"), "gestor", "contábil/fiscal", False,
     "Contabilidade/fiscal: fecha número e confere apuração."),
    (("VENDEDOR", "CALL CENTER", "VENDAS"), "leitor", "vendedor", True,
     "Setor de vendas: entra restrito à própria carteira — o RCA é forçado no "
     "backend, não escondido na tela."),
)

PAPEL_SEM_REGRA = ("leitor", "operacional", False,
                   "Setor sem regra específica: entra como leitor, só com a aba Comercial.")

# Legenda dos setores medida no Oracle em 2026-07-22. Existe porque `PCSETOR` NÃO
# está na lista de tabelas espelhadas (sync/config.py): sem isto, o dono veria
# "setor 6" em vez de "VENDEDORES(AS)/CALL CENTER" na tela de importação. Quando
# a tabela existir no espelho, a descrição de lá vence.
SETOR_MEDIDO: dict[int, str] = {
    0: "IMPLANTACAO", 1: "DIRETORIA", 2: "COMPRAS", 3: "FINANCEIRO/TESOURARIA",
    4: "CREDITO E COBRANCA", 5: "MOTORISTAS/ENTREGADORES",
    6: "VENDEDORES(AS)/CALL CENTER", 7: "RECEBIMENTO/EXPEDICAO",
    8: "BALCAO CENTRAL", 9: "INFORMATICA", 10: "CONTABILIDADE/FISCAL",
    11: "OPERADORES(AS) DE CAIXA", 12: "FISCAIS DE CAIXA",
}


# ---------------------------------------------------------------------------
# Módulo do ERP -> recursos do BI  (a sugestão de /{id}/sugestao-erp)
# ---------------------------------------------------------------------------
# ★ POR QUE POR MÓDULO E NÃO ROTINA A ROTINA
# PCCONTRO é a ACL real do WinThor: 14.701 linhas, 26 usuários, 1.581 rotinas.
# Traduzir rotina->relatório seria um dicionário de 1.581 entradas para 15
# recursos, e ainda assim inútil: 5 contas (PCADMIN, TI, JHIONATHAN,
# MARCELO.CURADO, JOAO.PEDRO) têm ~1.550 das 1.581 rotinas. Rotina a rotina, a
# sugestão para eles seria "libera tudo" — e para todo mundo também, porque
# basta UMA rotina solta de um módulo para o relatório inteiro aparecer.
#
# Por MÓDULO com COBERTURA MÍNIMA a informação aparece. Medido em 2026-07-22, a
# proporção de rotinas liberadas por módulo é bimodal — ou a pessoa tem quase
# tudo do módulo, ou tem migalha:
#     ANDREIA (vendas):    VENDA 99%   | FATURAMENTO 2%  | COMPRA 1%
#     SERGINO.NETO:        VENDA 99%   | FATURAMENTO 2%  | RECEBIMENTO 5%
#     MATHEUS.SILVA:       VENDA  0%   | ESTOQUE 88%     | RECEBIMENTO 95%
#     COMPRAS:             COMPRA 97%  | resto 0%
#     FINANCEIRO:          TESOURARIA 100% | A RECEBER 92% | A PAGAR 89%
# Não há NENHUM caso entre 6% e 86%: o corte em 40% separa "trabalha neste
# módulo" de "tem uma rotina avulsa" sem tocar em nenhum caso de fronteira.
LIMIAR_MODULO = 0.40

# codmodulo -> (nome do módulo, recursos do BI que ele sugere)
MODULOS_ERP: dict[int, tuple[str, tuple[str, ...]]] = {
    1:  ("PLANO DE VOO (gerencial)",
         ("comercial", "comercial.resumo", "comercial.serie", "comercial.rca", "analises")),
    2:  ("COMPRA",
         ("compras", "compras.demanda", "compras.abc", "compras.sugestao",
          "estoque", "estoque.posicao")),
    3:  ("VENDA",
         ("comercial", "comercial.resumo", "comercial.serie", "comercial.rca",
          "comercial.mix", "comercial.churn")),
    6:  ("TESOURARIA", ("financeiro", "financeiro.prazos")),
    7:  ("CONTAS A PAGAR", ("financeiro", "financeiro.prazos")),
    11: ("ADM. INTERNA DO ESTOQUE", ("estoque", "estoque.posicao")),
    12: ("CONTAS A RECEBER",
         ("financeiro", "financeiro.prazos", "financeiro.vencido", "financeiro.por-prazo")),
    13: ("RECEBIMENTO MERCADORIA", ("estoque", "estoque.posicao")),
    14: ("FATURAMENTO",
         ("apuracao", "comercial", "comercial.resumo", "comercial.serie")),
    15: ("COBRANCA MAGNETICA", ("financeiro", "financeiro.vencido")),
    17: ("WMS", ("estoque", "estoque.posicao")),
    19: ("CALL CENTER", ("comercial", "comercial.resumo", "comercial.churn")),
    33: ("VENDAS AVANCADO",
         ("comercial", "comercial.rca", "comercial.mix", "comercial.churn")),
    39: ("PLANEJAMENTO ESTRATEGICO", ("analises",)),
}

# ★ `configuracoes` NÃO é sugerido por nenhum módulo, de propósito. Ser
# administrador do BI é decisão do dono, não herança do ERP — senão as 5 contas
# que têm 98% do WinThor viriam com o poder de criar usuário e trocar senha dos
# outros, incluindo contas de serviço.


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_RE_LOGIN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@-]{1,39}$")

_cache_existe: dict[str, tuple[float, bool]] = {}


def _existe(tabela: str) -> bool:
    """A tabela está no espelho?

    Vale para `winthor.pcsetor`, `winthor.pccontro` e `winthor.pcrotina`, que
    NÃO estão na lista de tabelas espelhadas (sync/config.py) — e para o caso do
    espelho recém-criado, em que nem `pcempr` chegou ainda. Perguntar custa uma
    consulta por minuto e evita que a tela de Configurações inteira caia com
    "relation does not exist" por causa de um enfeite.
    """
    agora = time.monotonic()
    achado = _cache_existe.get(tabela)
    if achado and agora - achado[0] < 60:
        return achado[1]
    try:
        ok = bool(pg.consultar("SELECT to_regclass(%(t)s) IS NOT NULL AS ok", {"t": tabela})[0]["ok"])
    except Exception:  # noqa: BLE001
        ok = False
    _cache_existe[tabela] = (agora, ok)
    return ok


def _sem_acento(txt: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", txt or "")
                   if unicodedata.category(c) != "Mn")


def _sem_app(e: Exception) -> HTTPException:
    log.warning("schema app indisponivel (%s)", e)
    return HTTPException(503, MSG_SEM_APP)


def _funcao_do_setor(descricao: str | None) -> tuple[str, str, bool, str]:
    """(papel, funcao, restrito_a_carteira, porque) a partir da descrição do setor."""
    d = _sem_acento(descricao or "").upper()
    for palavras, papel, funcao, restrito, porque in REGRAS_SETOR:
        if any(p in d for p in palavras):
            return papel, funcao, restrito, porque
    return PAPEL_SEM_REGRA


def _linha_usuario(l: dict, carteiras: dict[int, str] | None = None) -> dict:
    """Uma linha da lista de usuários, como a tela de Configurações consome."""
    codusur = l.get("codusur")
    return {
        "id": l["id"],
        "login": l["login"],
        "matricula": l.get("matricula"),
        "nome": l["nome"],
        "email": l.get("email"),
        "papel": l.get("papel"),
        "codusur": codusur,
        # nome da carteira: sem isto o dono confere "RCA 6" contra a memória dele.
        # ★ O RCA 6 foi reciclado de JOAO PEDRO para BRUNO MATIAS — é exatamente o
        # tipo de coisa que só aparece quando o nome está na tela ao lado do número.
        "carteira_nome": (carteiras or {}).get(codusur) if codusur is not None else None,
        "restrito_a_carteira": bool(l.get("restrito_a_carteira")),
        "ativo": bool(l.get("ativo")),
        # nunca devolvemos o hash — só se existe ou não
        "tem_senha": bool(l.get("senha_hash")),
        "deve_trocar_senha": bool(l.get("deve_trocar_senha")),
        "ultimo_login": l["ultimo_login"].isoformat() if l.get("ultimo_login") else None,
        "origem": "erp" if l.get("matricula") is not None else "manual",
        "situacao_erp": l.get("situacao_erp"),
        "bloqueado": bool(l.get("bloqueado")),
        "permissoes": permissoes.normalizar(l.get("permissoes") or []),
    }


def _carteiras() -> dict[int, str]:
    """{codusur: nome} de PCUSUARI. Vazio quando o espelho ainda não tem a tabela."""
    if not _existe("winthor.pcusuari"):
        return {}
    try:
        return {int(r["codusur"]): (r["nome"] or "").strip()
                for r in pg.consultar("SELECT codusur, nome FROM winthor.pcusuari")}
    except psycopg.Error as e:  # noqa: BLE001
        log.warning("pcusuari indisponivel (%s)", e)
        return {}


def _le_usuario(uid: int) -> dict:
    """Um usuário do BI, com permissões e situação no ERP. 404 se não existir."""
    junta, situacao = "", "NULL::text"
    if _existe("winthor.pcempr"):
        junta = "LEFT JOIN winthor.pcempr e ON e.matricula = u.matricula"
        situacao = "NULLIF(UPPER(TRIM(e.situacao)), '')"
    try:
        linhas = pg.consultar(f"""
            SELECT u.id, u.login, u.matricula, u.nome, u.email, u.papel, u.codusur,
                   u.restrito_a_carteira, u.senha_hash, u.deve_trocar_senha, u.ativo,
                   u.ultimo_login, u.token_versao,
                   (u.bloqueado_ate IS NOT NULL AND u.bloqueado_ate > now()) AS bloqueado,
                   {situacao} AS situacao_erp,
                   COALESCE((SELECT array_agg(p.recurso)
                             FROM   app.usuario_permissao p
                             WHERE  p.usuario_id = u.id), '{{}}'::text[]) AS permissoes
            FROM   app.usuario u
            {junta}
            WHERE  u.id = %(id)s""", {"id": uid})
    except psycopg.Error as e:
        raise _sem_app(e)
    if not linhas:
        raise HTTPException(404, "Usuário não encontrado.")
    return linhas[0]


def _admins_ativos(exceto: int | None = None) -> int:
    """Quantos administradores ATIVOS sobram em `app.usuario`.

    ★ A conta de emergência do .env NÃO conta. Ela existe para destravar um BI
    sem banco, não para ser a rede de segurança de uma decisão de tela: se ela
    contasse, o dono conseguiria se rebaixar sozinho e a administração do BI
    passaria a depender de alguém ter o .env do servidor à mão.
    """
    sql = "SELECT count(*) AS n FROM app.usuario WHERE papel = 'admin' AND ativo"
    binds: dict = {}
    if exceto is not None:
        sql += " AND id <> %(id)s"
        binds["id"] = exceto
    return int(pg.consultar(sql, binds)[0]["n"])


def _rcas_ocupados(exceto: int | None = None) -> dict[int, str]:
    """{codusur: 'login, login'} das carteiras já vinculadas a algum usuário do BI.

    Agrega em vez de pegar uma linha só porque a mesma carteira PODE estar em dois
    usuários — o schema não impede (o índice de `codusur` não é único) e há caso
    legítimo, como o vendedor e o supervisor dele. O aviso da tela precisa dizer
    TODOS os nomes, senão o dono conserta um conflito e o outro continua lá.
    """
    sql = ("SELECT codusur, string_agg(login, ', ' ORDER BY login) AS logins "
           "FROM app.usuario WHERE codusur IS NOT NULL")
    binds: dict = {}
    if exceto is not None:
        sql += " AND id <> %(id)s"
        binds["id"] = exceto
    sql += " GROUP BY codusur"
    return {int(r["codusur"]): r["logins"] for r in pg.consultar(sql, binds)}


def _grava_permissoes(cur, uid: int, recursos: list[str]) -> None:
    """Substitui o conjunto de permissões. Espera um cursor em transação."""
    cur.execute("DELETE FROM app.usuario_permissao WHERE usuario_id = %(id)s", {"id": uid})
    for recurso in recursos:
        cur.execute(
            """INSERT INTO app.usuario_permissao (usuario_id, recurso)
               VALUES (%(id)s, %(r)s) ON CONFLICT DO NOTHING""",
            {"id": uid, "r": recurso},
        )


# ---------------------------------------------------------------------------
# Catálogo de recursos
# ---------------------------------------------------------------------------
@router.get("/recursos")
def recursos():
    """O catálogo que a tela de permissões desenha. Vem do CÓDIGO, não do banco.

    Lista pura, na ordem do catálogo (aba e, logo abaixo, os relatórios dela) —
    é essa ordem que a tela usa para agrupar, e por isso ela não deve ser
    reordenada no cliente.
    """
    return permissoes.catalogo_para_tela()


@router.get("/papeis")
def papeis():
    """Os três papéis, com o rótulo e o conjunto inicial de cada um.

    Serve ao dropdown de papel da tela. É o mesmo dado de `permissoes.PAPEIS` —
    ler daqui em vez de repetir os rótulos no frontend evita a tela dizer
    "Gestor vê tudo" no dia em que o padrão do gestor mudar no backend.
    """
    return [{"id": p, "rotulo": d["rotulo"], "descricao": d["descricao"],
             "padrao": list(d["padrao"])}
            for p, d in permissoes.PAPEIS.items()]


# ---------------------------------------------------------------------------
# Lista de usuários
# ---------------------------------------------------------------------------
@router.get("")
def listar():
    """Todos os usuários do BI.

    A conta de emergência do .env não aparece aqui de propósito: ela não tem
    linha em `app.usuario`, não recebe permissão pela tela e não pode ser
    editada. Quem administra o BI no dia a dia precisa de usuário próprio.
    """
    junta, situacao = "", "NULL::text"
    if _existe("winthor.pcempr"):
        junta = "LEFT JOIN winthor.pcempr e ON e.matricula = u.matricula"
        situacao = "NULLIF(UPPER(TRIM(e.situacao)), '')"
    try:
        linhas = pg.consultar(f"""
            SELECT u.id, u.login, u.matricula, u.nome, u.email, u.papel, u.codusur,
                   u.restrito_a_carteira, u.senha_hash, u.deve_trocar_senha, u.ativo,
                   u.ultimo_login,
                   (u.bloqueado_ate IS NOT NULL AND u.bloqueado_ate > now()) AS bloqueado,
                   {situacao} AS situacao_erp,
                   COALESCE((SELECT array_agg(p.recurso)
                             FROM   app.usuario_permissao p
                             WHERE  p.usuario_id = u.id), '{{}}'::text[]) AS permissoes
            FROM   app.usuario u
            {junta}
            -- inativo no fim: a lista é de trabalho, quem foi desligado só atrapalha
            ORDER  BY u.ativo DESC, u.nome""")
    except psycopg.Error as e:
        raise _sem_app(e)

    # ★ LISTA PURA, sem envelope {rows, meta}. Os routers de relatório deste projeto
    # devolvem {rows, meta} porque a tela precisa da régua do cálculo junto do
    # número; aqui não há régua nenhuma, e o CONTRATO desta rota é uma lista. Os
    # totais que a tela mostra (quantos sem senha, quantos admins) saem de um
    # `filter` no cliente, sem custo.
    carteiras = _carteiras()
    return [_linha_usuario(l, carteiras) for l in linhas]


# ---------------------------------------------------------------------------
# Importáveis do ERP
# ---------------------------------------------------------------------------
def _sql_importaveis() -> str:
    """Monta o SELECT conforme o que existe no espelho.

    `pcsetor` e `pcusuari` entram como enfeite opcional: sem eles a importação
    continua funcionando (o setor cai na legenda medida em `SETOR_MEDIDO` e a
    sugestão de carteira simplesmente não vem), o que é muito melhor do que a
    tela toda falhar porque uma tabela auxiliar não foi espelhada.
    """
    if _existe("winthor.pcsetor"):
        setor = "s.descricao"
        junta_setor = "LEFT JOIN winthor.pcsetor s ON s.codsetor = e.codsetor"
    else:
        setor, junta_setor = "NULL::text", ""

    if _existe("winthor.pcusuari"):
        # LATERAL com `count(*) OVER ()`: a janela é calculada ANTES do LIMIT, então
        # `quantos` conta todos os homônimos mesmo devolvendo uma linha só. Sem isso,
        # dois RCAs com o mesmo nome dariam uma sugestão "alta" arbitrária.
        carteira = "c.codusur AS codusur_sugerido, c.nome AS carteira_nome, c.quantos"
        junta_carteira = """
        LEFT JOIN LATERAL (
            SELECT u.codusur, u.nome, count(*) OVER () AS quantos
            FROM   winthor.pcusuari u
            WHERE  upper(btrim(u.nome)) = upper(btrim('CARTEIRA ' || e.nome))
            ORDER  BY u.codusur
            LIMIT  1
        ) c ON true"""
    else:
        carteira = "NULL::integer AS codusur_sugerido, NULL::text AS carteira_nome, 0 AS quantos"
        junta_carteira = ""

    return f"""
        SELECT e.matricula, btrim(e.usuariobd) AS login, btrim(e.nome) AS nome,
               btrim(e.nome_guerra) AS apelido, NULLIF(btrim(e.email), '') AS email,
               e.codsetor, {setor} AS setor,
               COALESCE(NULLIF(UPPER(TRIM(e.situacao)), ''), 'A') AS situacao,
               {carteira},
               (SELECT min(x.id) FROM app.usuario x
                 WHERE x.matricula = e.matricula
                    OR lower(x.login) = lower(btrim(e.usuariobd))) AS usuario_id
        FROM   winthor.pcempr e
        {junta_setor}
        {junta_carteira}
        ORDER  BY btrim(e.nome)"""


def _classificar(l: dict, ocupados: dict[int, str]) -> dict:
    """Transforma uma linha de PCEMPR em uma sugestão pronta para a tela."""
    login = (l.get("login") or "").strip()
    setor = (l.get("setor") or SETOR_MEDIDO.get(l.get("codsetor")) or "")
    papel, funcao, restrito, porque = _funcao_do_setor(setor)

    motivos = [porque]
    alertas: list[str] = []

    # --- carteira -----------------------------------------------------------
    codusur = l.get("codusur_sugerido")
    codusur = int(codusur) if codusur is not None else None
    quantos = int(l.get("quantos") or 0)
    confianca, origem_rca = "sem sugestão", None
    if codusur is not None and quantos == 1:
        confianca = "alta"
        origem_rca = f"PCUSUARI.NOME = 'CARTEIRA {l.get('nome')}' (casamento exato)"
    elif codusur is not None and quantos > 1:
        # homônimo: sugerir uma das duas é pior que não sugerir nada
        confianca, codusur = "ambígua", None
        origem_rca = f"{quantos} carteiras com o mesmo nome em PCUSUARI — escolha na mão"
    if codusur is not None and codusur in ocupados:
        confianca, origem_rca = "conflito", (
            f"a carteira {codusur} já está vinculada ao usuário {ocupados[codusur]}")
        alertas.append(f"RCA {codusur} já pertence a {ocupados[codusur]} no BI — "
                       f"a sugestão de carteira foi descartada.")
        codusur = None

    # --- restrição ----------------------------------------------------------
    # ★ VENDEDOR SEM CARTEIRA ENTRA RESTRITO ASSIM MESMO, e portanto sem ver nada
    # até alguém vincular o RCA. É de propósito: `escopo_rca()` falha FECHADA e
    # explica o que fazer, enquanto um vendedor não-restrito enxergaria o
    # faturamento de TODOS os colegas. Entre travar e vazar, trava.
    if restrito and codusur is None:
        alertas.append("Vendedor sem carteira identificada: ele entra restrito e não verá "
                       "nenhum número até você definir o RCA em Configurações.")

    revisar = login.upper() in LOGINS_REVISAR
    if revisar:
        alertas.append("Login com cara de conta de sistema, mas com uso intenso no ERP. "
                       "Confirme com quem é antes de dar senha.")

    return {
        "matricula": int(l["matricula"]),
        "login": login,
        "nome": l.get("nome"),
        "apelido": l.get("apelido"),
        "email": l.get("email"),
        "setor": setor or None,
        "codsetor": l.get("codsetor"),
        "papel_sugerido": papel,
        "funcao": funcao,
        "restrito_sugerido": restrito,
        "codusur_sugerido": codusur,
        "carteira_nome": l.get("carteira_nome") if codusur is not None else None,
        "confianca_carteira": confianca,
        "origem_carteira": origem_rca,
        "motivos": motivos,
        "alertas": alertas,
        "revisar": revisar,
        "permissoes_iniciais": permissoes.padrao_do_papel(papel),
    }


@router.get("/importaveis")
def importaveis():
    """Pessoas do ERP que ainda não têm usuário no BI, com papel e RCA sugeridos.

    O que sai da lista, e por quê:
      * conta genérica/serviço (`LOGINS_GENERICOS`) — não é pessoa;
      * desligado no ERP (SITUACAO <> 'A') — criar o usuário seria criar um
        acesso que `require_user` recusa no primeiro request;
      * quem já tem usuário no BI (por matrícula OU por login).
    Os três casos são CONTADOS no `meta`: a pergunta seguinte do dono é sempre
    "e cadê o fulano?", e a resposta tem que estar na própria tela.
    """
    if not _existe("winthor.pcempr"):
        return {"rows": [], "meta": {
            "disponivel": False,
            "aviso": "O espelho ainda não tem winthor.pcempr — rode o sincronismo. "
                     "Enquanto isso, cadastre à mão em POST /api/usuarios.",
        }}
    try:
        linhas = pg.consultar(_sql_importaveis())
        ocupados = _rcas_ocupados()
    except psycopg.Error as e:
        raise _sem_app(e)

    rows, genericas, desligados, ja_no_bi, sem_login = [], 0, 0, 0, 0
    for l in linhas:
        login = (l.get("login") or "").strip()
        if not login or l.get("matricula") is None:
            # linha de PCEMPR sem USUARIOBD: existe como funcionário, mas não tem
            # login de ERP nenhum para herdar. É contada para os números do `meta`
            # fecharem — some silenciosamente vira "sumiu gente da lista".
            sem_login += 1
            continue
        if l.get("usuario_id") is not None:
            ja_no_bi += 1
            continue
        if login.upper() in LOGINS_GENERICOS:
            genericas += 1
            continue
        if l["situacao"] != "A":
            desligados += 1
            continue
        rows.append(_classificar(l, ocupados))

    avisos = []
    if not _existe("winthor.pcsetor"):
        avisos.append("winthor.pcsetor não está no espelho: o setor foi resolvido pela "
                      "legenda medida no código (SETOR_MEDIDO). Setor novo no ERP cairia "
                      "em 'leitor' até a tabela ser espelhada.")
    if not _existe("winthor.pcusuari"):
        avisos.append("winthor.pcusuari não está no espelho: nenhuma carteira foi sugerida.")

    return {
        "rows": rows,
        "meta": {
            "disponivel": True,
            "importaveis": len(rows),
            "genericas_ignoradas": genericas,
            "desligados_ignorados": desligados,
            "ja_no_bi": ja_no_bi,
            "sem_login_no_erp": sem_login,
            "total_erp": len(linhas),
            "avisos": avisos,
            "regra": "Papel sugerido pelo setor (PCEMPR.CODSETOR x PCSETOR); carteira "
                     "sugerida por casamento exato de nome ('CARTEIRA ' || PCEMPR.NOME = "
                     "PCUSUARI.NOME). PCEMPR.CODUSUR é ignorado de propósito: o valor 1 é "
                     "default de fábrica em 20 das 28 linhas. Sugestão não é decisão — "
                     "confira antes de importar.",
        },
    }


# ---------------------------------------------------------------------------
# Importação
# ---------------------------------------------------------------------------
class ImportarIn(BaseModel):
    matriculas: list[int] = Field(default_factory=list)


@router.post("/importar", status_code=201)
def importar(body: ImportarIn, quem: UsuarioSessao = Depends(REQUER_ADMIN)):
    """Cria usuários a partir do ERP, com a MESMA sugestão que a tela mostrou.

    ★ NASCE SEM SENHA (`senha_hash` NULL) e com `deve_trocar_senha` = true. O
    acesso só passa a existir quando o admin gerar a senha provisória em
    POST /{id}/senha — importar é dizer "esta pessoa existe", não "esta pessoa
    entra". Quem tem `senha_hash` NULL apanha do mesmo 401 genérico de senha
    errada (auth.login), então importar em massa não abre porta nenhuma.

    A sugestão é RECALCULADA aqui, no servidor, e não recebida do cliente: o
    corpo traz só matrículas. Papel e carteira são decisão de autorização — se
    viessem no JSON, qualquer um que chamasse a API na unha escolheria o próprio.
    """
    pedidas = {int(m) for m in (body.matriculas or [])}
    if not pedidas:
        raise HTTPException(422, "Nenhuma matrícula informada.")
    if not _existe("winthor.pcempr"):
        raise HTTPException(503, "O espelho ainda não tem winthor.pcempr — rode o sincronismo.")

    try:
        linhas = pg.consultar(_sql_importaveis())
        ocupados = _rcas_ocupados()
    except psycopg.Error as e:
        raise _sem_app(e)

    por_matricula = {int(l["matricula"]): l for l in linhas if l.get("matricula") is not None}
    criados, ignorados = [], []

    for matricula in sorted(pedidas):
        l = por_matricula.get(matricula)
        if l is None:
            ignorados.append({"matricula": matricula, "motivo": "não existe em winthor.pcempr"})
            continue
        login = (l.get("login") or "").strip()
        if l.get("usuario_id") is not None:
            ignorados.append({"matricula": matricula, "login": login,
                              "motivo": "já tem usuário no BI"})
            continue
        if login.upper() in LOGINS_GENERICOS:
            ignorados.append({"matricula": matricula, "login": login,
                              "motivo": "conta genérica/serviço — cadastre a pessoa à mão"})
            continue
        if l["situacao"] != "A":
            ignorados.append({"matricula": matricula, "login": login,
                              "motivo": f"desligado no ERP (situação {l['situacao']})"})
            continue

        s = _classificar(l, ocupados)
        # ★ UMA TRANSAÇÃO POR PESSOA, não uma para o lote inteiro. O dono marca 12
        # caixinhas e manda; se a nona esbarrar num e-mail repetido, as oito
        # anteriores já estão criadas e a resposta diz exatamente qual falhou. Um
        # lote transacional devolveria "deu erro" e nada feito — e ele marcaria as
        # 12 de novo sem saber qual era o problema.
        try:
            with pg.conexao() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO app.usuario
                                (login, matricula, nome, email, papel, codusur,
                                 restrito_a_carteira, senha_hash, deve_trocar_senha,
                                 ativo, alterado_por)
                           VALUES (%(login)s, %(mat)s, %(nome)s, %(email)s, %(papel)s,
                                   %(rca)s, %(restrito)s, NULL, true, true, %(quem)s)
                           RETURNING id""",
                        {"login": login, "mat": matricula, "nome": s["nome"] or login,
                         "email": s["email"], "papel": s["papel_sugerido"],
                         "rca": s["codusur_sugerido"], "restrito": s["restrito_sugerido"],
                         "quem": quem.login},
                    )
                    uid = cur.fetchone()["id"]
                    _grava_permissoes(cur, uid, s["permissoes_iniciais"])
        except psycopg.errors.UniqueViolation:
            ignorados.append({"matricula": matricula, "login": login,
                              "motivo": "login, matrícula ou e-mail já usado por outro usuário"})
            continue
        except psycopg.Error as e:
            raise _sem_app(e)

        if s["codusur_sugerido"] is not None:
            ocupados[s["codusur_sugerido"]] = login
        auth.registrar_acesso(quem.login, "usuario.importado", alvo=login, detalhe={
            "matricula": matricula, "papel": s["papel_sugerido"],
            "codusur": s["codusur_sugerido"], "restrito": s["restrito_sugerido"],
            "confianca_carteira": s["confianca_carteira"], "setor": s["setor"],
        })
        criados.append({"id": uid, **{k: s[k] for k in (
            "login", "nome", "matricula", "papel_sugerido", "codusur_sugerido",
            "restrito_sugerido", "confianca_carteira", "alertas")}})

    return {
        "criados": criados,
        "ignorados": ignorados,
        "meta": {
            "criados": len(criados), "ignorados": len(ignorados),
            "proximo_passo": "Os usuários nascem SEM senha. Gere a senha provisória em "
                             "POST /api/usuarios/{id}/senha para cada um — é ela que "
                             "libera o primeiro acesso.",
        },
    }


# ---------------------------------------------------------------------------
# Cadastro manual
# ---------------------------------------------------------------------------
class UsuarioIn(BaseModel):
    login: str
    nome: str
    email: str | None = None
    papel: str = permissoes.PAPEL_PADRAO
    codusur: int | None = None
    restrito_a_carteira: bool = False


@router.post("", status_code=201)
def criar(body: UsuarioIn, quem: UsuarioSessao = Depends(REQUER_ADMIN)):
    """Cria usuário sem vínculo com o ERP (`matricula` NULL).

    ★ NÃO É EXCEÇÃO RARA. FERNANDA MOURA é a maior vendedora da empresa (RCA 5,
    612 notas) e NÃO TEM linha em PCEMPR — não existe login de ERP para ela. Sem
    este caminho, a pessoa que mais fatura simplesmente não existiria no BI.
    Como não há matrícula, `auth._buscar` não encontra situação no ERP e o
    desligamento dela não corta o acesso sozinho: quem cria à mão desativa à mão.
    """
    login = (body.login or "").strip()
    nome = (body.nome or "").strip()
    email = (body.email or "").strip() or None

    if not _RE_LOGIN.match(login):
        raise HTTPException(422, "Usuário inválido: use de 2 a 40 caracteres, sem espaço "
                                 "(letras, números, ponto, traço, sublinhado ou @).")
    if len(nome) < 2:
        raise HTTPException(422, "Informe o nome da pessoa — é o que aparece no log de acesso.")
    if not permissoes.papel_valido(body.papel):
        raise HTTPException(422, f"Papel inválido: {body.papel!r}. "
                                 f"Use um de {', '.join(permissoes.PAPEIS)}.")

    try:
        with pg.conexao() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO app.usuario
                            (login, matricula, nome, email, papel, codusur,
                             restrito_a_carteira, senha_hash, deve_trocar_senha,
                             ativo, alterado_por)
                       VALUES (%(login)s, NULL, %(nome)s, %(email)s, %(papel)s, %(rca)s,
                               %(restrito)s, NULL, true, true, %(quem)s)
                       RETURNING id""",
                    {"login": login, "nome": nome, "email": email, "papel": body.papel,
                     "rca": body.codusur, "restrito": body.restrito_a_carteira,
                     "quem": quem.login},
                )
                uid = cur.fetchone()["id"]
                _grava_permissoes(cur, uid, permissoes.padrao_do_papel(body.papel))
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, f"Já existe usuário com o login {login!r} ou com este e-mail.")
    except psycopg.Error as e:
        raise _sem_app(e)

    auth.registrar_acesso(quem.login, "usuario.criado", alvo=login, detalhe={
        "origem": "manual", "papel": body.papel, "codusur": body.codusur,
        "restrito": body.restrito_a_carteira,
    })
    resposta = _linha_usuario(_le_usuario(uid), _carteiras())
    avisos = ["Usuário criado SEM senha. Gere a senha provisória em "
              "POST /api/usuarios/{id}/senha — é ela que libera o primeiro acesso."]
    if body.restrito_a_carteira and body.codusur is None:
        avisos.append("Está restrito à carteira e sem RCA vinculado: ele não verá nenhum "
                      "número até você definir a carteira.")
    if body.codusur is not None:
        dono = _rcas_ocupados(exceto=uid).get(int(body.codusur))
        if dono:
            avisos.append(f"A carteira {body.codusur} também está vinculada a {dono}. "
                          f"Os dois passam a ver os mesmos números.")
    resposta["avisos"] = avisos
    return resposta


# ---------------------------------------------------------------------------
# Um usuário
# ---------------------------------------------------------------------------
@router.get("/{uid}")
def detalhar(uid: int):
    return _linha_usuario(_le_usuario(uid), _carteiras())


class UsuarioPatch(BaseModel):
    """Campo ausente = não mexe; campo enviado como null = limpa.

    A distinção existe porque a tela grava um campo por vez (o dono escolhe o
    papel agora e a carteira depois) — um PATCH parcial não pode zerar o resto.
    """
    nome: str | None = None
    email: str | None = None
    papel: str | None = None
    codusur: int | None = None
    restrito_a_carteira: bool | None = None
    ativo: bool | None = None


@router.patch("/{uid}")
def atualizar(uid: int, body: UsuarioPatch,
              quem: UsuarioSessao = Depends(REQUER_ADMIN)):
    """Atualiza um usuário, com as travas que evitam o BI ficar sem dono.

    As três regras de proteção, e o estrago que cada uma evita:
      1. NINGUÉM MUDA O PRÓPRIO PAPEL — nem para cima nem para baixo. Sem isso,
         "gestor" nenhum precisaria de admin: bastaria um PATCH em si mesmo.
      2. O ÚLTIMO ADMIN ATIVO NÃO PODE SER REBAIXADO NEM DESATIVADO. Restaria
         apenas a conta de emergência do .env para reabrir a porta — e ela mora
         num arquivo do servidor, não na mão de quem usa o BI.
      3. NINGUÉM SE DESATIVA. É sempre engano, e desfazer exige outro admin.
    """
    atual = _le_usuario(uid)
    enviados = body.model_fields_set
    eu_mesmo = (quem.id == atual["id"])

    if "papel" in enviados and body.papel is not None and body.papel != atual["papel"]:
        if eu_mesmo:
            raise HTTPException(403, "Você não pode alterar o seu próprio papel. Peça a outro "
                                     "administrador.")
        if not permissoes.papel_valido(body.papel):
            raise HTTPException(422, f"Papel inválido: {body.papel!r}.")
        if atual["papel"] == "admin" and atual["ativo"] and _admins_ativos(exceto=uid) == 0:
            raise HTTPException(409, "Este é o último administrador ativo do BI. Promova outra "
                                     "pessoa a administrador antes de rebaixar esta.")
    if "ativo" in enviados and body.ativo is False and atual["ativo"]:
        if eu_mesmo:
            raise HTTPException(403, "Você não pode desativar a própria conta.")
        if atual["papel"] == "admin" and _admins_ativos(exceto=uid) == 0:
            raise HTTPException(409, "Este é o último administrador ativo do BI — desativá-lo "
                                     "deixaria o BI sem quem administre.")

    novo = {
        "nome": (body.nome or "").strip() if "nome" in enviados else atual["nome"],
        "email": ((body.email or "").strip() or None) if "email" in enviados else atual["email"],
        "papel": body.papel if "papel" in enviados and body.papel else atual["papel"],
        "codusur": body.codusur if "codusur" in enviados else atual["codusur"],
        "restrito": (bool(body.restrito_a_carteira) if "restrito_a_carteira" in enviados
                     else bool(atual["restrito_a_carteira"])),
        "ativo": bool(body.ativo) if "ativo" in enviados and body.ativo is not None
                 else bool(atual["ativo"]),
    }
    if not novo["nome"] or len(novo["nome"]) < 2:
        raise HTTPException(422, "Informe o nome da pessoa — é o que aparece no log de acesso.")

    # de -> para, campo a campo: é isto que responde "e por que fulano estava
    # vendo o vencido?" seis meses depois. Só os campos que MUDARAM entram.
    mudancas = {
        campo: [atual[coluna], novo[campo]]
        for campo, coluna in (("nome", "nome"), ("email", "email"), ("papel", "papel"),
                              ("codusur", "codusur"), ("restrito", "restrito_a_carteira"),
                              ("ativo", "ativo"))
        if atual[coluna] != novo[campo]
    }
    if not mudancas:
        return _linha_usuario(atual, _carteiras())

    # Desativar tem que derrubar a sessão em curso, não esperar o token expirar:
    # `token_versao` diferente do `ver` do JWT faz `require_user` recusar na hora.
    sobe_versao = novo["ativo"] is False and atual["ativo"]
    try:
        pg.executar(
            f"""UPDATE app.usuario
                SET nome = %(nome)s, email = %(email)s, papel = %(papel)s,
                    codusur = %(codusur)s, restrito_a_carteira = %(restrito)s,
                    ativo = %(ativo)s,
                    token_versao = token_versao + {1 if sobe_versao else 0},
                    atualizado_em = now(), alterado_por = %(quem)s
                WHERE id = %(id)s""",
            {**novo, "quem": quem.login, "id": uid},
        )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "Este e-mail já está em uso por outro usuário.")
    except psycopg.Error as e:
        raise _sem_app(e)

    # ★ Sem isto a mudança demora até TTL_SESSAO_S para valer — e "tirei o acesso
    # e ele continua vendo" é exatamente o chamado que destrói a confiança na tela.
    auth.invalidar_sessao(uid)
    auth.registrar_acesso(quem.login, "usuario.alterado", alvo=atual["login"],
                          detalhe={"mudancas": mudancas})

    resposta = _linha_usuario(_le_usuario(uid), _carteiras())
    avisos = []
    if novo["restrito"] and novo["codusur"] is None:
        avisos.append("Restrito à carteira e sem RCA vinculado: ele não verá nenhum número "
                      "até você definir a carteira.")
    if novo["codusur"] is not None:
        dono = _rcas_ocupados(exceto=uid).get(int(novo["codusur"]))
        if dono:
            avisos.append(f"A carteira {novo['codusur']} também está vinculada a {dono}. "
                          f"Os dois passam a ver os mesmos números.")
    if novo["papel"] == "admin":
        avisos.append("Administrador vê TODAS as abas, independentemente das caixinhas de "
                      "permissão, e pode criar usuário e trocar senha dos outros.")
    resposta["avisos"] = avisos
    return resposta


# ---------------------------------------------------------------------------
# Permissões
# ---------------------------------------------------------------------------
class PermissoesIn(BaseModel):
    recursos: list[str] = Field(default_factory=list)


@router.put("/{uid}/permissoes")
def definir_permissoes(uid: int, body: PermissoesIn,
                       quem: UsuarioSessao = Depends(REQUER_ADMIN)):
    """Substitui o conjunto de permissões (não é merge: o que não veio, saiu).

    `permissoes.normalizar()` descarta id desconhecido e ACRESCENTA a aba de todo
    relatório marcado — marcar "Desempenho por vendedor" sem marcar "Comercial"
    criaria alguém com permissão de um relatório que ele não alcança, porque a
    aba some do menu.
    """
    atual = _le_usuario(uid)
    antes = permissoes.normalizar(atual.get("permissoes") or [])
    depois = permissoes.normalizar(body.recursos)

    try:
        with pg.conexao() as conn:
            with conn.cursor() as cur:
                _grava_permissoes(cur, uid, depois)
    except psycopg.Error as e:
        raise _sem_app(e)

    auth.invalidar_sessao(uid)
    if antes != depois:
        auth.registrar_acesso(quem.login, "permissao.alterada", alvo=atual["login"], detalhe={
            "de": antes, "para": depois,
            "concedidos": [r for r in depois if r not in antes],
            "revogados": [r for r in antes if r not in depois],
        })

    resposta = {"id": uid, "login": atual["login"], "permissoes": depois,
                "abas": [r for r in depois if r in permissoes.ABAS],
                "concedidos": [r for r in depois if r not in antes],
                "revogados": [r for r in antes if r not in depois], "avisos": []}
    if atual["papel"] == "admin":
        # guardar mesmo assim é útil: se ele for rebaixado depois, estas caixinhas
        # passam a valer sem ninguém ter que remarcá-las
        resposta["avisos"].append("Este usuário é administrador e vê tudo, independentemente "
                                  "destas caixinhas. Elas só passam a valer se o papel dele "
                                  "mudar para gestor ou leitor.")
    return resposta


# ---------------------------------------------------------------------------
# Senha provisória
# ---------------------------------------------------------------------------
@router.post("/{uid}/senha")
def gerar_senha(uid: int, quem: UsuarioSessao = Depends(REQUER_ADMIN)):
    """Gera a senha provisória e a devolve UMA ÚNICA VEZ.

    ★ NÃO É GRAVADA EM LUGAR NENHUM em texto claro: no banco fica só o
    pbkdf2_sha256, e `app.acesso_log` registra que a senha foi gerada — nunca
    qual foi. Se o admin perder o bilhete, o caminho é gerar outra. A alternativa
    (guardar para reexibir) transformaria o log de auditoria num arquivo de
    senhas em claro.

    Sobe `token_versao`, o que derruba qualquer sessão aberta com a senha antiga
    — que é o comportamento certo quando se troca senha por suspeita de vazamento
    — e zera o bloqueio por tentativas, para a pessoa não apanhar do 423 logo
    depois de receber a senha nova.
    """
    atual = _le_usuario(uid)
    if quem.id == atual["id"]:
        raise HTTPException(403, "Para trocar a sua própria senha use a tela de troca de senha "
                                 "(POST /api/auth/trocar-senha).")
    if not atual["ativo"]:
        raise HTTPException(409, "Usuário desativado: reative antes de gerar uma senha, senão "
                                 "a senha nova não serve para nada.")
    if atual.get("situacao_erp") and atual["situacao_erp"] != "A":
        raise HTTPException(409, f"Este usuário está desligado no ERP (situação "
                                 f"{atual['situacao_erp']}) e o login dele é recusado a cada "
                                 f"requisição. Gerar senha não resolveria.")

    senha = auth.senha_provisoria()
    try:
        pg.executar(
            """UPDATE app.usuario
               SET senha_hash = %(h)s, deve_trocar_senha = true,
                   falhas_consecutivas = 0, bloqueado_ate = NULL,
                   token_versao = token_versao + 1,
                   atualizado_em = now(), alterado_por = %(quem)s
               WHERE id = %(id)s""",
            {"h": auth.hash_password(senha), "quem": quem.login, "id": uid},
        )
    except psycopg.Error as e:
        raise _sem_app(e)

    auth.invalidar_sessao(uid)
    # detalhe SEM a senha — ver o ★ no topo da função
    auth.registrar_acesso(quem.login, "senha.gerada", alvo=atual["login"],
                          detalhe={"primeiro_acesso": not atual.get("senha_hash")})
    return {
        "id": uid,
        "login": atual["login"],
        "nome": atual["nome"],
        "senha_provisoria": senha,
        "aviso": "Anote agora: esta senha não será mostrada de novo. Ela só serve para o "
                 "primeiro acesso — o sistema exige que a pessoa defina uma senha própria "
                 "antes de abrir qualquer relatório.",
    }


# ---------------------------------------------------------------------------
# Sugestão de permissões a partir da ACL do ERP
# ---------------------------------------------------------------------------
@router.get("/{uid}/sugestao-erp")
def sugestao_erp(uid: int):
    """Recursos do BI sugeridos a partir do acesso REAL da pessoa no WinThor.

    É a segunda opinião sobre o palpite do setor, e vale mais que ele: o setor é
    cadastro, a ACL é o que a pessoa de fato abre todo dia. Ver o ★ do topo do
    arquivo (caso MATHEUS.SILVA, cadastrado em vendas e operando estoque).

    Lê PCCONTRO (ACL) x PCROTINA (a que módulo a rotina pertence) e considera um
    módulo "usado" quando a pessoa tem ao menos `LIMIAR_MODULO` das rotinas dele
    — ver a nota em MODULOS_ERP sobre por que o corte é por módulo e não por
    rotina.
    """
    atual = _le_usuario(uid)
    if atual.get("matricula") is None:
        return {"recursos": [], "modulos": [], "meta": {
            "disponivel": False,
            "aviso": "Usuário criado à mão, sem vínculo com o ERP — não há acesso do WinThor "
                     "para consultar. Marque as permissões na mão.",
        }}

    faltando = [t for t in ("winthor.pccontro", "winthor.pcrotina") if not _existe(t)]
    if faltando:
        # ★ Nem PCCONTRO nem PCROTINA estão na lista de tabelas espelhadas
        # (sync/config.py). Devolver vazio com aviso é melhor que 500: a tela de
        # permissões continua funcionando, só perde o botão de sugestão.
        return {"recursos": [], "modulos": [], "meta": {
            "disponivel": False,
            "aviso": f"A ACL do ERP não está no espelho ({', '.join(faltando)}). Para ligar "
                     f"esta sugestão, acrescente PCCONTRO e PCROTINA ao sincronismo "
                     f"(sync/config.py).",
        }}

    try:
        linhas = pg.consultar("""
            WITH total AS (
              SELECT codmodulo, count(*)::numeric AS rotinas
              FROM   winthor.pcrotina GROUP BY codmodulo
            ), meu AS (
              SELECT r.codmodulo, count(*)::numeric AS liberadas
              FROM   winthor.pccontro c
              JOIN   winthor.pcrotina r ON r.codigo = c.codrotina
              -- ACESSO só tem 'S' e 'N' nesta base (22 linhas 'N' em 14.701);
              -- COALESCE trata o nulo como liberado, que é o default do ERP
              WHERE  c.codusuario = %(m)s AND upper(coalesce(c.acesso, 'S')) <> 'N'
              GROUP  BY r.codmodulo
            )
            SELECT t.codmodulo, m.liberadas, t.rotinas,
                   round(100 * m.liberadas / t.rotinas) AS cobertura
            FROM   meu m JOIN total t ON t.codmodulo = m.codmodulo
            ORDER  BY cobertura DESC, t.codmodulo""",
            {"m": int(atual["matricula"])})
    except psycopg.Error as e:
        log.warning("ACL do ERP indisponivel (%s)", e)
        return {"recursos": [], "modulos": [], "meta": {
            "disponivel": False, "aviso": "Não foi possível ler a ACL do ERP no espelho."}}

    recursos_sugeridos: set[str] = set()
    modulos = []
    for l in linhas:
        codmodulo = int(l["codmodulo"])
        cobertura = float(l["cobertura"] or 0)
        conhecido = MODULOS_ERP.get(codmodulo)
        # float() explícito: `count(*)::numeric` volta como Decimal do psycopg, e
        # comparar Decimal com float funciona mas devolve tipo que não serializa
        usa = float(l["liberadas"]) / float(l["rotinas"]) >= LIMIAR_MODULO
        if usa and conhecido:
            recursos_sugeridos.update(conhecido[1])
        # devolvemos TODOS os módulos, inclusive os que não viraram recurso: é o
        # que permite ao dono entender por que a sugestão saiu magra
        modulos.append({
            "codmodulo": codmodulo,
            "modulo": conhecido[0] if conhecido else f"módulo {codmodulo}",
            "liberadas": int(l["liberadas"]),
            "rotinas": int(l["rotinas"]),
            "cobertura": cobertura,
            "usado": usa,
            "mapeado": conhecido is not None,
            "recursos": list(conhecido[1]) if (usa and conhecido) else [],
        })

    sugeridos = permissoes.normalizar(recursos_sugeridos)
    atuais = permissoes.normalizar(atual.get("permissoes") or [])
    return {
        "recursos": sugeridos,
        "modulos": modulos,
        "meta": {
            "disponivel": True,
            "matricula": int(atual["matricula"]),
            "limiar": LIMIAR_MODULO,
            "a_conceder": [r for r in sugeridos if r not in atuais],
            "a_mais_hoje": [r for r in atuais if r not in sugeridos],
            "regra": f"Um módulo do WinThor conta quando a pessoa tem pelo menos "
                     f"{int(LIMIAR_MODULO * 100)}% das rotinas dele liberadas em PCCONTRO. "
                     f"A administração do BI (Configurações) nunca é sugerida por aqui — "
                     f"é decisão do dono, não herança do ERP.",
            "aviso": "Sugestão, não decisão: a ACL do ERP diz o que a pessoa abre no WinThor, "
                     "que nem sempre é o que ela precisa ver no BI.",
        },
    }
