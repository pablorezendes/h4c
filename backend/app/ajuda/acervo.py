"""Acervo de ajuda: o texto ja escrito e revisado por humano nas specs.

A maior parte das perguntas de ajuda ("o que e isso?", "como esse numero e
calculado?") ja tem resposta EXATA em analises-spec.json e indicadores-spec.json:
sao ~140 mil caracteres de texto revisado. Servir isso verbatim custa ZERO token
e e mais correto que qualquer parafrase de modelo.

O acervo tambem monta o INDICE que vai no prefixo cacheado do LLM. Atencao ao
contra-intuitivo: o indice vai COMPLETO de proposito. Truncar para "economizar"
derrubaria o prefixo abaixo do minimo cacheavel de 4.096 tokens da API, o
cache_control seria aceito em silencio, cache_creation_input_tokens voltaria 0
e toda pergunta passaria a pagar preco cheio — 3x mais caro que mandar tudo.

★ "COMPLETO" NAO INCLUI O QUE ESTA EM BACKLOG. `status: backlog` na spec nao e
"numero a conferir" (isso e `a_validar`): e decisao de reuniao de que a analise
NAO pode ser publicada ainda — o caso vivo e a projecao de entrada de caixa em
30/60/90 dias, que so pode existir depois da rodada com o BPO financeiro. Antes
disso o bloqueio existia so no filtro da tela React; o assistente indexava a
analise, sugeria por alias e, quando o ramo de IA caia (IA desligada, teto de
custo, disjuntor aberto), respondia com o texto dela como se a funcionalidade
existisse. Governanca que so vale na tela nao e governanca: o filtro esta em
_carregar(), o unico ponto por onde as specs entram neste modulo.
"""
import json
import os
import unicodedata
from functools import lru_cache

from .. import consulta

_DIRS = [
    os.environ.get("DISCOVERY_DIR", ""),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."),  # backend/
    "/discovery",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "discovery"),
]


def _achar(nome: str) -> str | None:
    for d in _DIRS:
        if not d:
            continue
        p = os.path.join(d, nome)
        if os.path.exists(p):
            return p
        p = os.path.join(d, "app", nome)  # specs copiadas para dentro do pacote
        if os.path.exists(p):
            return p
    return None


def _sufixo() -> str:
    return "-pg" if consulta.usando_espelho() else ""


#: Status que tira o item do ar no SERVIDOR inteiro (catalogo, indice, busca e
#: execucao) — nao confundir com "a_validar", que so ganha um selo na tela.
STATUS_BLOQUEADOS = frozenset({"backlog"})


def bloqueada(item: dict) -> bool:
    """A analise/indicador esta barrada por decisao de negocio?

    Generico de proposito: vale para qualquer item que a spec marcar, hoje e no
    futuro. Nenhum ponto do backend pode conhecer o id do item bloqueado — se
    conhecer, a proxima analise que entrar em backlog volta a vazar.
    """
    return str(item.get("status") or "").strip().lower() in STATUS_BLOQUEADOS


@lru_cache(maxsize=4)
def _carregar(tipo: str, sufixo: str) -> list[dict]:
    """Carrega a spec JA sem os itens bloqueados — ver o ★ do cabecalho."""
    nome = f"{tipo}-spec{sufixo}.json"
    caminho = _achar(nome) or _achar(f"{tipo}-spec.json")
    if not caminho:
        return []
    with open(caminho, encoding="utf-8") as f:
        itens = json.load(f)[tipo]
    return [i for i in itens if not bloqueada(i)]


def analises() -> list[dict]:
    return _carregar("analises", _sufixo())


def indicadores() -> list[dict]:
    return _carregar("indicadores", _sufixo())


@lru_cache(maxsize=2)
def _por_id(sufixo: str) -> dict[str, dict]:
    mapa: dict[str, dict] = {}
    for a in _carregar("analises", sufixo):
        mapa[a["id"]] = {"tipo": "analise", **a}
    for i in _carregar("indicadores", sufixo):
        mapa[i["id"]] = {"tipo": "indicador", **i}
    return mapa


def existe(id_: str) -> bool:
    return id_ in _por_id(_sufixo())


def verbete(id_: str) -> dict | None:
    """Ficha de ajuda de uma analise/indicador — texto humano, sem LLM."""
    it = _por_id(_sufixo()).get(id_)
    if not it:
        return None
    if it["tipo"] == "analise":
        return {
            "id": it["id"], "tipo": "analise", "titulo": it["titulo"],
            "para_que_serve": it.get("pergunta_negocio"),
            "como_ler": it.get("como_ler"),
            "de_onde_vem": it.get("como_calculado"),
            "status": it.get("status", "validado"),
        }
    return {
        "id": it["id"], "tipo": "indicador", "titulo": it.get("nome"),
        "para_que_serve": it.get("definicao"),
        "como_ler": None,
        "de_onde_vem": None,
        "status": it.get("status", "validado"),
    }


# --- indice para o prefixo cacheado do LLM -------------------------------------

@lru_cache(maxsize=2)
def indice(sufixo: str) -> str:
    """Uma linha por analise/indicador: e o mapa que o modelo usa para escolher
    o que consultar. Vai COMPLETO — ver docstring do modulo."""
    linhas = ["ANALISES (id | titulo | para que serve)"]
    for a in _carregar("analises", sufixo):
        p = " ".join((a.get("pergunta_negocio") or "").split())
        selo = "" if a.get("status") == "validado" else " [A VALIDAR]"
        linhas.append(f"{a['id']} | {a['titulo']}{selo} | {p}")
    linhas.append("")
    linhas.append("INDICADORES (id | nome | definicao)")
    for i in _carregar("indicadores", sufixo):
        d = " ".join((i.get("definicao") or "").split())
        selo = "" if i.get("status") == "validado" else " [A VALIDAR]"
        linhas.append(f"{i['id']} | {i.get('nome')}{selo} | {d}")
    return "\n".join(linhas)


def indice_atual() -> str:
    return indice(_sufixo())


@lru_cache(maxsize=1)
def conhecimento() -> str:
    """Pacote de regras de negocio e armadilhas (kb.txt)."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb.txt")
    with open(p, encoding="utf-8") as f:
        return f.read().strip()


# --- busca deterministica ------------------------------------------------------

def normalizar(t: str) -> str:
    t = unicodedata.normalize("NFD", (t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return "".join(c if c.isalnum() else " " for c in t)


# vocabulario do dono -> ids. Alimentado pelo que ele efetivamente pergunta.
#
# ★ Um alias so pode apontar para o que EXISTE. "caixa" apontava para a projecao
# de entrada de caixa (backlog): a palavra que o dono mais usa levava direto ao
# unico item proibido, com reforco de 4,0 pontos — acima do limiar de aceite —,
# e o assistente entregava a funcionalidade como pronta. Agora leva a carteira
# que de fato vira caixa (quem cobrar hoje). A regua de prazos concedido/PMR/PMP
# nao tem id de catalogo: mora em /api/financeiro/prazos, e o kb.txt ja instrui o
# modelo a oferecer vencido, PMR, PMP e faturamento por prazo quando perguntarem
# quanto vai entrar de caixa.
ALIASES: dict[str, list[str]] = {
    "deve": ["ANA-FCR-09"], "devendo": ["ANA-FCR-09"], "divida": ["ANA-FCR-09"],
    "inadimplencia": ["ANA-FCR-09"], "calote": ["ANA-FCR-10", "ANA-FCR-07"],
    "atrasado": ["ANA-FCR-09"], "atraso": ["ANA-FCR-09"], "vencido": ["ANA-FCR-09"],
    "cobrar": ["ANA-FCR-09"], "cobranca": ["ANA-FCR-09"], "receber": ["ANA-FCR-09"],
    "caixa": ["ANA-FCR-09"],
    "positivado": ["IND-07", "IND-08"], "positivacao": ["IND-07", "IND-08"],
    "cliente novo": ["IND-05"], "cliente ativo": ["IND-06"],
    "faturamento": ["IND-01"], "vendeu": ["IND-01"], "venda": ["IND-01"],
    "ticket": ["IND-03"], "margem": ["IND-09", "ANA-MRG-02"], "lucro": ["IND-09", "ANA-MRG-02"],
    "sumiu": ["ANA-RFM-01"], "parou de comprar": ["ANA-RFM-01"], "churn": ["ANA-RFM-02"],
    "estoque": ["ANA-REP-04"], "ruptura": ["ANA-REP-04"], "faltou": ["ANA-REP-04"],
    "comprar": ["ANA-REP-06"], "reposicao": ["ANA-REP-06"],
    "curva abc": ["ANA-ABC-01"], "melhores produtos": ["ANA-ABC-01"],
    "melhores clientes": ["ANA-ABC-02"], "vendedor": ["ANA-CRZ-03"], "rca": ["ANA-CRZ-03"],
    "equipe": ["ANA-CRZ-03"], "horario": ["ANA-INT-01"], "hora": ["ANA-INT-01"],
    "cancelamento": ["ANA-CAN-02"], "devolucao": ["ANA-DEV-04"],
    "combo": ["ANA-CRZ-02"], "junto": ["ANA-CRZ-02"], "previsao": ["ANA-PRE-01"],
    "futuro": ["ANA-PRE-01"], "peso morto": ["ANA-MRG-02"], "desconto": ["ANA-MRG-05"],
}

# radical grosseiro pt-BR: "sumindo", "sumiu" e "sumir" viram "sum", senao o
# alias so pega a forma exata que alguem lembrou de cadastrar
_SUFIXOS = ("indo", "ando", "endo", "aram", "iram", "ados", "idas", "ando",
            "ido", "ida", "ado", "ada", "iu", "ou", "am", "ar", "er", "ir", "es", "s")


def raiz(palavra: str) -> str:
    for suf in _SUFIXOS:
        if palavra.endswith(suf) and len(palavra) - len(suf) >= 3:
            return palavra[: -len(suf)]
    return palavra


_PARADAS = {"o", "a", "os", "as", "de", "do", "da", "e", "em", "no", "na", "que", "qual",
            "quais", "meu", "minha", "meus", "para", "por", "com", "um", "uma", "esta",
            "esse", "essa", "isso", "como", "quanto", "quantos", "mais", "menos", "ver"}


@lru_cache(maxsize=2)
def _docs(sufixo: str) -> list[tuple[str, str, set[str]]]:
    saida = []
    for a in _carregar("analises", sufixo):
        texto = " ".join([a.get("titulo", ""), a.get("pergunta_negocio", ""),
                          a.get("como_ler", ""), a.get("tecnica", "")])
        saida.append((a["id"], a["titulo"], set(normalizar(texto).split()) - _PARADAS))
    for i in _carregar("indicadores", sufixo):
        texto = " ".join([i.get("nome", ""), i.get("definicao", "")])
        saida.append((i["id"], i.get("nome", ""), set(normalizar(texto).split()) - _PARADAS))
    return saida


def buscar(q: str, n: int = 3) -> list[dict]:
    """Acha a analise que responde a pergunta, sem gastar token."""
    alvo = normalizar(q)
    termos = set(alvo.split()) - _PARADAS
    if not termos:
        return []
    reforco: dict[str, float] = {}
    for frase, ids in ALIASES.items():
        chave = normalizar(frase)
        # frase inteira OU (alias de uma palavra) a mesma raiz de alguma palavra
        casou = (chave in alvo if " " in chave
                 else raiz(chave) in {raiz(t) for t in termos})
        if casou:
            for i in ids:
                reforco[i] = reforco.get(i, 0) + 4.0
    pontos = []
    for id_, titulo, palavras in _docs(_sufixo()):
        comum = termos & palavras
        if not comum and id_ not in reforco:
            continue
        pontos.append({"id": id_, "titulo": titulo,
                       "score": round(len(comum) + reforco.get(id_, 0), 2)})
    pontos.sort(key=lambda p: -p["score"])
    return pontos[:n]
