"""Autenticação do BI: identidade do ERP, senha do BI.

★ A SENHA DO WINTHOR NÃO É USADA — nem lida, nem copiada, nem trafegada.
  Foi decisão do dono e é também o que a base permite: nenhum dos 28 logins de
  PCEMPR é usuário Oracle (0/28 em ALL_USERS), não existe procedure de
  autenticação no ERP, e as colunas SENHABD/SENHAHASH/HASHSENHAWINTHOR foram
  removidas do espelho por segurança (sync/config.py, COLUNAS_PROIBIDAS).
  Do ERP vem só a IDENTIDADE — matrícula, login (PCEMPR.USUARIOBD), nome e
  situação. A credencial é do BI: pbkdf2_sha256 com 390.000 iterações, em
  `app.usuario.senha_hash`.

★ O DESLIGAMENTO NO ERP CORTA O BI NA HORA. A cada requisição o usuário é relido
  do banco e, se a matrícula dele aparecer em `winthor.pcempr` com SITUACAO
  diferente de 'A', o token é recusado. Medido no Oracle em 2026-07-22: 27
  ativos e 1 inativo (JOAO.PEDRO, matrícula 25) — ou seja, hoje exatamente 1
  pessoa seria barrada por esta regra. Não há passo manual: o RH desliga no
  WinThor, o sync traz, e o acesso morre no próximo request.

★ ESTE MÓDULO FALA COM O POSTGRES DIRETO (`from . import pg`), nunca por
  `consulta.consultar()`. Com FONTE_DADOS=oracle aquela camada manda o SQL para
  o Oracle — e `app.usuario` não existe lá. Usuário e permissão são dados DO BI.

O que NÃO está aqui: o catálogo de recursos e as regras de autorização
(`permissoes.py`) e o CRUD de usuários (`routers/usuarios.py`).
"""
import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from . import permissoes, pg
from .config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"

#: Segundos que o usuário fica em cache dentro do processo. Curto de propósito:
#: é o atraso máximo entre desativar alguém na tela e o acesso dele parar. Quem
#: desativa/troca senha ainda chama `invalidar_sessao()`, então na prática o
#: corte é imediato — o TTL cobre o caso de vários workers uvicorn, onde a
#: invalidação de um processo não alcança os outros.
TTL_SESSAO_S = 15

#: Regras de senha. Deliberadamente frouxas em complexidade e firmes em tamanho:
#: exigir símbolo em BI de distribuidora gera senha no post-it, não segurança.
SENHA_MIN = 8

#: Bloqueio progressivo. A 5ª falha seguida bloqueia por 1 min; depois 5, 15, 30
#: e 60. Zera em qualquer login bem-sucedido.
FALHAS_ATE_BLOQUEIO = 5
ESCADA_BLOQUEIO_MIN = (1, 5, 15, 30, 60)

#: id da conta de emergência do .env. Não existe em `app.usuario`.
UID_BOOTSTRAP = 0

#: Hash descartável, só para gastar o mesmo tempo de CPU quando o login não
#: existe (ver `_perde_tempo`).
_HASH_FANTASMA = ("pbkdf2_sha256$390000$"
                  "00000000000000000000000000000000$"
                  "0000000000000000000000000000000000000000000000000000000000000000")


# ---------------------------------------------------------------------------
# Hash de senha  (INALTERADO — já havia senha gerada com este formato)
# ---------------------------------------------------------------------------
def hash_password(password: str, iterations: int = 390000, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def senha_provisoria(tamanho: int = 10) -> str:
    """Senha legível que o admin dita por telefone e o usuário troca no 1º acesso.

    Sem I/l/1/O/0: a pessoa vai ler isto de um bilhete escrito à mão.
    """
    alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(tamanho))


def criticar_senha(nova: str, login: str = "", nome: str = "") -> str | None:
    """Devolve a MENSAGEM do problema, ou None se a senha serve.

    Recusar senha igual ao login é o item que mais aparece na prática: com login
    de ERP curto (TI, ION, 8888) a tentação é exatamente essa.
    """
    nova = nova or ""
    if len(nova) < SENHA_MIN:
        return f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."
    if nova.strip() != nova:
        return "A senha não pode começar nem terminar com espaço."
    baixa = nova.lower()
    if login and baixa == login.strip().lower():
        return "A senha não pode ser igual ao seu usuário."
    if nome and baixa == nome.strip().lower():
        return "A senha não pode ser igual ao seu nome."
    if baixa in {"12345678", "123456789", "1234567890", "senha123", "password",
                 "h4c12345", "trocar123", "qwertyui", "abcd1234"}:
        return "Essa senha é fácil demais — escolha outra."
    if len(set(baixa)) < 4:
        return "A senha repete o mesmo caractere quase inteira — escolha outra."
    return None


# ---------------------------------------------------------------------------
# O usuário da requisição
# ---------------------------------------------------------------------------
class UsuarioSessao(str):
    """Usuário autenticado da requisição.

    ★ HERDA DE `str`, E O VALOR É O LOGIN. Não é firula: dois routers já em
    produção recebem `usuario: str = Depends(require_user)` e gravam esse valor
    em coluna de auditoria — `app.cliente_anotacao.alterado_por`
    (routers/clientes.py) e `app.lead_time.alterado_por` (routers/compras.py).
    Se `require_user` passasse a devolver um objeto comum, aquelas colunas
    receberiam "<app.auth.UsuarioSessao object at 0x...>" e o histórico do motivo
    da perda ficaria ilegível — sem erro nenhum, o que é pior. Herdando de `str`
    os dois usos convivem: `usuario` continua sendo o login para quem só quer o
    nome, e `usuario.papel`/`usuario.codusur` existem para a autorização.
    """

    def __new__(cls, dados: dict) -> "UsuarioSessao":
        obj = super().__new__(cls, dados["login"])
        obj.id = dados["id"]
        obj.login = dados["login"]
        obj.matricula = dados.get("matricula")
        obj.nome = dados.get("nome") or dados["login"]
        obj.email = dados.get("email")
        obj.papel = dados.get("papel") or permissoes.PAPEL_PADRAO
        obj.codusur = dados.get("codusur")
        obj.restrito_a_carteira = bool(dados.get("restrito_a_carteira"))
        obj.deve_trocar_senha = bool(dados.get("deve_trocar_senha"))
        obj.token_versao = dados.get("token_versao") or 1
        obj.situacao_erp = dados.get("situacao_erp")
        obj.permissoes = frozenset(dados.get("permissoes") or ())
        obj.bootstrap = bool(dados.get("bootstrap"))
        return obj

    @property
    def e_admin(self) -> bool:
        return self.papel == "admin"

    def para_tela(self) -> dict:
        """Corpo de /api/auth/eu — o que o frontend precisa para montar o menu."""
        return {
            "id": self.id,
            "login": self.login,
            "nome": self.nome,
            "email": self.email,
            "papel": self.papel,
            "codusur": self.codusur,
            "restrito_a_carteira": self.restrito_a_carteira,
            "deve_trocar_senha": self.deve_trocar_senha,
            "permissoes": permissoes.permitidos(self),
            "abas": permissoes.abas_visiveis(self),
            "escopo": permissoes.descreve_escopo(self),
            "bootstrap": self.bootstrap,
        }


# ---------------------------------------------------------------------------
# Leitura do usuário (Postgres direto)
# ---------------------------------------------------------------------------
_COLUNAS = """u.id, u.login, u.matricula, u.nome, u.email, u.papel, u.codusur,
              u.restrito_a_carteira, u.senha_hash, u.deve_trocar_senha, u.ativo,
              u.falhas_consecutivas, u.bloqueado_ate, u.token_versao"""

_cache_pcempr: tuple[float, bool] = (0.0, False)


def _tem_pcempr() -> bool:
    """O espelho já tem `winthor.pcempr`?

    Precisa ser perguntado: numa base recém-criada o sync ainda não rodou, e um
    JOIN com tabela inexistente derrubaria o login de TODO MUNDO — inclusive o
    do admin que iria configurar o BI. Falha aqui só custa a checagem de
    desligamento até o primeiro sync.
    """
    global _cache_pcempr
    agora = time.monotonic()
    if agora - _cache_pcempr[0] < 60:
        return _cache_pcempr[1]
    try:
        ok = bool(pg.consultar("SELECT to_regclass('winthor.pcempr') IS NOT NULL AS ok")[0]["ok"])
    except Exception:  # noqa: BLE001
        ok = False
    _cache_pcempr = (agora, ok)
    return ok


def _buscar(onde: str, binds: dict, ordem: str = "u.id") -> dict | None:
    """SELECT do usuário + permissões + situação no ERP, numa ida só ao banco.

    A situação vem por LEFT JOIN e fica NULL quando a matrícula não está no
    espelho. ★ NULL NÃO BLOQUEIA, de propósito: usuário criado à mão (a Fernanda
    Moura, maior vendedora, não tem linha em PCEMPR) e espelho ainda não
    carregado cairiam os dois no mesmo caso. Só bloqueia quem TEM linha no ERP
    com situação explicitamente diferente de 'A'.
    """
    junta, situacao = "", "NULL::text"
    if _tem_pcempr():
        junta = "LEFT JOIN winthor.pcempr e ON e.matricula = u.matricula"
        situacao = "NULLIF(UPPER(TRIM(e.situacao)), '')"
    sql = f"""
        SELECT {_COLUNAS},
               {situacao} AS situacao_erp,
               COALESCE((SELECT array_agg(p.recurso)
                         FROM   app.usuario_permissao p
                         WHERE  p.usuario_id = u.id), '{{}}'::text[]) AS permissoes
        FROM   app.usuario u
        {junta}
        WHERE  {onde}
        ORDER  BY {ordem}
        LIMIT  1"""
    linhas = pg.consultar(sql, binds)
    return linhas[0] if linhas else None


def _por_identificador(ident: str) -> dict | None:
    """Acha o usuário por LOGIN ou por E-MAIL, sem diferenciar maiúsculas.

    Os logins do ERP são gravados em caixa alta (ADRIEL, ANA.CURADO, 8888) e
    ninguém digita assim. O e-mail entra como alternativa porque só 2 dos 28
    funcionários têm e-mail cadastrado — não dá para exigir e-mail de ninguém.

    O ORDER BY desempata o caso em que o que foi digitado é o LOGIN de alguém e o
    E-MAIL de outra pessoa: ganha quem tem aquele login. Sem ele o banco poderia
    devolver ora um, ora outro, e a mesma senha entraria em contas diferentes.
    """
    try:
        return _buscar("lower(u.login) = lower(%(i)s) OR lower(u.email) = lower(%(i)s)",
                       {"i": ident},
                       ordem="(lower(u.login) = lower(%(i)s)) DESC, u.id")
    except Exception as e:  # noqa: BLE001
        # schema `app` ausente ou Postgres fora do ar: cai na conta de emergência
        log.warning("consulta de usuario falhou (%s) — só a conta de emergência responde", e)
        return None


def _por_id(uid: int) -> dict | None:
    try:
        return _buscar("u.id = %(id)s", {"id": uid})
    except Exception as e:  # noqa: BLE001
        log.warning("releitura do usuario %s falhou (%s)", uid, e)
        return None


def registrar_acesso(quem: str | None, acao: str, alvo: str | None = None,
                     detalhe: dict | None = None) -> None:
    """Grava em `app.acesso_log`. Nunca derruba a requisição que a chamou.

    Auditoria de permissão é o registro de QUEM liberou o quê para quem — é o que
    responde "e por que fulano estava vendo o vencido?" seis meses depois.
    ★ Jamais colocar senha (nem provisória) em `detalhe`.
    """
    try:
        pg.executar(
            """INSERT INTO app.acesso_log (quem, alvo, acao, detalhe)
               VALUES (%(q)s, %(a)s, %(ac)s, %(d)s::jsonb)""",
            {"q": quem, "a": alvo, "ac": acao,
             "d": json.dumps(detalhe or {}, ensure_ascii=False, default=str)},
        )
    except Exception as e:  # noqa: BLE001
        log.warning("acesso_log nao gravado (%s): %s/%s", e, acao, quem)


# ---------------------------------------------------------------------------
# Cache curto da sessão
# ---------------------------------------------------------------------------
_cache: dict[int, tuple[float, dict]] = {}


def invalidar_sessao(uid: int | None = None) -> None:
    """Derruba o cache de um usuário (ou de todos).

    Chame ao desativar, trocar papel, trocar permissão ou trocar senha — sem
    isto a mudança demora até `TTL_SESSAO_S` para valer. `routers/usuarios.py`
    deve chamar isto em todo PATCH/PUT.
    """
    if uid is None:
        _cache.clear()
    else:
        _cache.pop(uid, None)


def _usuario_atual(uid: int) -> dict | None:
    agora = time.monotonic()
    achado = _cache.get(uid)
    if achado and agora - achado[0] < TTL_SESSAO_S:
        return achado[1]
    dados = _por_id(uid)
    if dados is not None:
        _cache[uid] = (agora, dados)
    return dados


# ---------------------------------------------------------------------------
# Conta de emergência do .env
# ---------------------------------------------------------------------------
def _sessao_bootstrap() -> UsuarioSessao:
    s = get_settings()
    return UsuarioSessao({
        "id": UID_BOOTSTRAP,
        "login": s.admin_email,
        "nome": "Administrador (conta de emergência)",
        "email": s.admin_email,
        "papel": "admin",
        "token_versao": 0,
        "deve_trocar_senha": False,
        "bootstrap": True,
    })


#: Contagem de falhas da conta de emergência. Ela não tem linha em `app.usuario`,
#: então não tem `falhas_consecutivas` — sem isto seria a única porta do BI sem
#: freio nenhum, e justamente a que abre tudo. Em memória, por processo: com
#: vários workers uvicorn o atacante ganha um punhado de tentativas a mais, o que
#: ainda deixa o custo alto o bastante para uma senha decente.
_falhas_bootstrap: dict = {"n": 0, "ate": None}


def _e_bootstrap(ident: str) -> bool:
    s = get_settings()
    return bool(s.admin_email) and ident.strip().lower() == s.admin_email.strip().lower()


def _confere_bootstrap(ident: str, segredo: str) -> bool:
    """A conta ADMIN_EMAIL/ADMIN_PASSWORD_HASH do .env.

    ★ EXISTE SÓ PARA O PRIMEIRO ACESSO E PARA RECUPERAÇÃO. Sem ela, um banco
    vazio (ou um `app.usuario` que ninguém populou ainda, ou um Postgres fora do
    ar) deixaria TODO MUNDO de fora, inclusive quem iria criar os usuários.
    Não é o login do dono, não recebe permissão pela tela e não aparece na lista
    de usuários — quem administra o BI no dia a dia tem que ter usuário próprio,
    senão o log de auditoria vira uma coluna cheia de "admin@h4c.sys".
    É verificada DEPOIS do banco: se alguém criar um usuário real com este
    mesmo identificador, o usuário real vence.
    """
    if not _e_bootstrap(ident):
        return False
    return verify_password(segredo, get_settings().admin_password_hash or "")


def _perde_tempo(segredo: str) -> None:
    """Gasta o mesmo tempo de um pbkdf2 real quando o login não existe.

    Com 390.000 iterações a diferença entre "não achei o usuário" (microssegundos)
    e "achei e a senha está errada" (~100 ms) é grande o bastante para descobrir
    quem existe só cronometrando a resposta. Isto empata o relógio.
    """
    verify_password(segredo or "", _HASH_FANTASMA)


# ---------------------------------------------------------------------------
# Falhas e bloqueio
# ---------------------------------------------------------------------------
def _minutos_bloqueio(falhas: int) -> int:
    if falhas < FALHAS_ATE_BLOQUEIO:
        return 0
    passo = min(falhas - FALHAS_ATE_BLOQUEIO, len(ESCADA_BLOQUEIO_MIN) - 1)
    return ESCADA_BLOQUEIO_MIN[passo]


def _conta_falha(linha: dict) -> None:
    falhas = int(linha.get("falhas_consecutivas") or 0) + 1
    minutos = _minutos_bloqueio(falhas)
    # O instante do desbloqueio é calculado AQUI, não com `now() + make_interval()`
    # no SQL: o psycopg manda inteiro Python com tipo que o Postgres resolve como
    # bigint, e `make_interval(mins => bigint)` não casa com nenhuma assinatura
    # (bigint->integer não é cast implícito). Um datetime tem adaptação direta e,
    # de quebra, usa o MESMO relógio da comparação em `login()`.
    ate = datetime.now(timezone.utc) + timedelta(minutes=minutos) if minutos else None
    try:
        pg.executar(
            """UPDATE app.usuario
               SET falhas_consecutivas = %(f)s,
                   bloqueado_ate = COALESCE(%(ate)s, bloqueado_ate)
               WHERE id = %(id)s""",
            {"f": falhas, "ate": ate, "id": linha["id"]},
        )
    except Exception as e:  # noqa: BLE001
        log.warning("nao consegui contar a falha de login do usuario %s (%s)", linha["id"], e)
    invalidar_sessao(linha["id"])
    if minutos:
        registrar_acesso(linha["login"], "login.bloqueado",
                         detalhe={"falhas": falhas, "minutos": minutos})


def _barra_bootstrap() -> None:
    """423 na conta de emergência, com a mesma escada de minutos dos demais."""
    ate = _falhas_bootstrap.get("ate")
    agora = datetime.now(timezone.utc)
    if ate and ate > agora:
        faltam = max(1, int(-(-(ate - agora).total_seconds() // 60)))
        raise HTTPException(status.HTTP_423_LOCKED,
                            f"Muitas tentativas seguidas. Tente de novo em {faltam} minuto(s).")


def _falha_bootstrap() -> None:
    _falhas_bootstrap["n"] = int(_falhas_bootstrap.get("n") or 0) + 1
    minutos = _minutos_bloqueio(_falhas_bootstrap["n"])
    if minutos:
        _falhas_bootstrap["ate"] = datetime.now(timezone.utc) + timedelta(minutes=minutos)
    log.warning("falha de login na CONTA DE EMERGENCIA (%s tentativas)", _falhas_bootstrap["n"])
    registrar_acesso(get_settings().admin_email, "login.falha",
                     detalhe={"motivo": "conta de emergência", "falhas": _falhas_bootstrap["n"]})


def _zera_falhas(linha: dict) -> None:
    try:
        pg.executar(
            """UPDATE app.usuario
               SET falhas_consecutivas = 0, bloqueado_ate = NULL, ultimo_login = now()
               WHERE id = %(id)s""",
            {"id": linha["id"]},
        )
    except Exception as e:  # noqa: BLE001
        log.warning("nao consegui marcar o ultimo login do usuario %s (%s)", linha["id"], e)
    invalidar_sessao(linha["id"])


# ---------------------------------------------------------------------------
# Contratos HTTP
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    """Aceita `login` ou `email`, e `senha` ou `password`.

    `password` continua aceito porque a tela antiga (pages/Login.tsx) manda esse
    nome; some quando o frontend novo entrar.
    """
    login: str | None = None
    email: str | None = None
    senha: str | None = None
    password: str | None = None

    def identificador(self) -> str:
        return (self.login or self.email or "").strip()

    def segredo(self) -> str:
        return self.senha or self.password or ""


class TrocaSenhaRequest(BaseModel):
    senha_atual: str
    senha_nova: str


#: ★ MENSAGEM ÚNICA. Login inexistente, senha errada, conta desativada e
#: desligado no ERP respondem exatamente isto. Diferenciar seria entregar a
#: lista de quem trabalha na empresa a quem tentar adivinhar.
ERRO_LOGIN = "Usuário ou senha inválidos"


def _token(dados: dict, versao: int) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=s.jwt_expire_minutes)
    return jwt.encode(
        {"sub": dados["login"], "uid": dados["id"], "ver": versao, "exp": exp},
        s.jwt_secret, algorithm=ALGORITHM,
    )


@router.post("/login")
def login(body: LoginRequest):
    ident, segredo = body.identificador(), body.segredo()
    if not ident or not segredo:
        _perde_tempo(segredo)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)

    linha = _por_identificador(ident)

    if linha is None:
        # não existe no BI: ainda pode ser a conta de emergência do .env
        if _e_bootstrap(ident):
            _barra_bootstrap()
            if _confere_bootstrap(ident, segredo):
                _falhas_bootstrap.update(n=0, ate=None)
                usuario = _sessao_bootstrap()
                log.warning("login pela CONTA DE EMERGENCIA (%s) — crie um usuário próprio", ident)
                registrar_acesso(usuario.login, "login.bootstrap")
                return {"access_token": _token({"login": usuario.login, "id": UID_BOOTSTRAP}, 0),
                        "token_type": "bearer", "usuario": usuario.para_tela()}
            _falha_bootstrap()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)
        _perde_tempo(segredo)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)

    # Bloqueio por tentativas. ★ É o ÚNICO erro que distingue uma conta existente,
    # e é assim por decisão de contrato: quem apanha do 423 já errou 5 vezes
    # naquele login, e sem o aviso a pessoa fica tentando e culpando o sistema.
    bloqueio = linha.get("bloqueado_ate")
    agora = datetime.now(timezone.utc)
    if bloqueio and bloqueio > agora:
        # arredonda para cima com a mesma expressao (`-(-x // y)`) para nao dizer
        # "2 minutos" num bloqueio de 1: relogio do Postgres e do processo batem
        # no mesmo milissegundo e a divisao caia exatamente na virada
        faltam = max(1, int(-(-(bloqueio - agora).total_seconds() // 60)))
        raise HTTPException(
            status.HTTP_423_LOCKED,
            f"Muitas tentativas seguidas. Tente de novo em {faltam} minuto(s) ou peça "
            f"uma senha nova ao administrador.",
        )

    # senha_hash NULL = importado do ERP e ainda sem acesso definido. Gasta o mesmo
    # tempo do caso "senha errada" para não denunciar quem já tem senha e quem não tem.
    if not linha.get("senha_hash"):
        _perde_tempo(segredo)
        _conta_falha(linha)
        registrar_acesso(linha["login"], "login.falha", detalhe={"motivo": "sem senha definida"})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)

    if not verify_password(segredo, linha["senha_hash"]):
        _conta_falha(linha)
        registrar_acesso(linha["login"], "login.falha")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)

    # Senha certa, mas a porta pode estar fechada por outro motivo. Resposta
    # genérica na mesma; o log guarda o motivo real para o suporte.
    if not linha.get("ativo"):
        registrar_acesso(linha["login"], "login.negado", detalhe={"motivo": "usuário inativo no BI"})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)
    if linha.get("situacao_erp") and linha["situacao_erp"] != "A":
        registrar_acesso(linha["login"], "login.negado",
                         detalhe={"motivo": "desligado no ERP",
                                  "situacao": linha["situacao_erp"],
                                  "matricula": linha.get("matricula")})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, ERRO_LOGIN)

    _zera_falhas(linha)
    registrar_acesso(linha["login"], "login.ok")
    usuario = UsuarioSessao(linha)
    return {"access_token": _token(linha, usuario.token_versao),
            "token_type": "bearer", "usuario": usuario.para_tela()}


# ---------------------------------------------------------------------------
# A dependência que protege todo o resto
# ---------------------------------------------------------------------------
def require_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> UsuarioSessao:
    """Valida o JWT e RELÊ o usuário do banco (cache de `TTL_SESSAO_S` segundos).

    Reler é o ponto todo. Um JWT de 8 horas assinado hoje de manhã continuaria
    valendo à noite para quem foi desligado ao meio-dia se a decisão morasse
    dentro do token. Aqui o token diz apenas QUEM é; o BANCO diz se ainda pode:

      - `ativo = false`                      -> desativado na tela do BI
      - `ver` do token != `token_versao`     -> senha trocada ou acesso revogado
      - `winthor.pcempr.situacao <> 'A'`     -> desligado no ERP (corta na hora)

    Devolve `UsuarioSessao`, que É um `str` com o login — ver a nota na classe.
    """
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token ausente")
    try:
        payload = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=[ALGORITHM])
        sub = payload["sub"]
        uid = int(payload.get("uid", UID_BOOTSTRAP))
        ver = int(payload.get("ver", 0))
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou expirado")

    if uid == UID_BOOTSTRAP:
        s = get_settings()
        if (sub or "").strip().lower() != (s.admin_email or "").strip().lower():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou expirado")
        return _sessao_bootstrap()

    dados = _usuario_atual(uid)
    if dados is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida — entre de novo")
    if not dados.get("ativo"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário desativado no BI")
    if int(dados.get("token_versao") or 1) != ver:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Sua sessão foi encerrada. Entre de novo.")
    if dados.get("situacao_erp") and dados["situacao_erp"] != "A":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Usuário desligado no ERP — acesso encerrado.")
    return UsuarioSessao(dados)


@router.get("/eu")
def eu(usuario: UsuarioSessao = Depends(require_user)):
    """Quem sou eu e o que posso ver. O frontend carrega uma vez e monta o menu.

    ★ A lista `permissoes` daqui é conveniência para a TELA. O backend não confia
    nela: cada rota confere de novo com `permissoes.requer(...)`.
    """
    return usuario.para_tela()


@router.post("/trocar-senha", status_code=status.HTTP_204_NO_CONTENT)
def trocar_senha(body: TrocaSenhaRequest, usuario: UsuarioSessao = Depends(require_user)):
    """Troca a própria senha.

    ★ INVALIDA O TOKEN ATUAL (token_versao++). É o comportamento correto — trocar
    senha depois de desconfiar de vazamento tem que derrubar a sessão de quem
    estava usando a senha antiga, inclusive a sua. O frontend deve limpar o token
    e mandar para /login com "senha alterada, entre de novo".
    """
    if usuario.bootstrap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "A conta de emergência tem a senha no arquivo .env do servidor e não pode ser "
            "trocada por aqui. Crie um usuário próprio na tela de Configurações.",
        )

    atual = _por_id(usuario.id)
    if atual is None or not atual.get("senha_hash"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Usuário sem senha definida.")
    if not verify_password(body.senha_atual or "", atual["senha_hash"]):
        # não conta falha aqui: quem chegou até este ponto já provou quem é com o
        # token — contar bloquearia a própria pessoa por errar a senha antiga.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Senha atual incorreta.")
    if (body.senha_nova or "") == (body.senha_atual or ""):
        # 422 na unha: o starlette novo depreciou HTTP_422_UNPROCESSABLE_ENTITY e
        # renomeou para ..._CONTENT, que não existe nas versões anteriores.
        raise HTTPException(422, "A senha nova precisa ser diferente da atual.")
    problema = criticar_senha(body.senha_nova, atual["login"], atual.get("nome") or "")
    if problema:
        raise HTTPException(422, problema)

    pg.executar(
        """UPDATE app.usuario
           SET senha_hash = %(h)s,
               deve_trocar_senha = false,
               token_versao = token_versao + 1,
               falhas_consecutivas = 0,
               bloqueado_ate = NULL,
               atualizado_em = now(),
               alterado_por = %(u)s
           WHERE id = %(id)s""",
        {"h": hash_password(body.senha_nova), "u": atual["login"], "id": usuario.id},
    )
    invalidar_sessao(usuario.id)
    registrar_acesso(atual["login"], "senha.trocada", alvo=atual["login"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)
