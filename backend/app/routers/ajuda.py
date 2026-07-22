"""Assistente de ajuda do BI.

Tres camadas, da mais barata para a mais cara. A pergunta so desce de camada
se a anterior nao resolveu:

  C0  verbete    — o texto de ajuda que ja existe na spec, escrito e revisado
                   por humano. Custo: ZERO token, ZERO banco.
  C1  busca      — acha qual analise responde a pergunta (BM25 simples +
                   vocabulario do dono). Custo: ZERO token.
  C2  ia         — so aqui gasta. Prefixo cacheado + ferramentas sob demanda.

A unica fonte de dados do agente e o proprio sistema: ele nao tem acesso a
internet e as ferramentas so devolvem o que os endpoints do BI devolvem.
"""
import json
import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..ajuda import acervo, cliente_llm, compressao, pseudonimos
from .analises import rodar as rodar_analise
from .indicadores import indicadores as rodar_indicadores

router = APIRouter(prefix="/api/ajuda", tags=["ajuda"], dependencies=[Depends(require_user)])


# --- C0/C1: sem custo ----------------------------------------------------------

@router.get("/verbete")
def verbete(id: str):
    """Ficha de ajuda de uma analise/indicador. Texto humano, sem IA."""
    v = acervo.verbete(id)
    if not v:
        raise HTTPException(404, f"{id} não está no catálogo")
    return {"origem": "catalogo", **v}


@router.get("/buscar")
def buscar(q: str, n: int = 3):
    """Qual analise responde esta pergunta? Sem IA."""
    res = acervo.buscar(q, n)
    confianca = "nenhuma"
    if res and res[0]["score"] >= 4:
        confianca = "unica" if len(res) == 1 or res[0]["score"] >= 1.8 * res[1]["score"] else "ambigua"
    elif res:
        confianca = "ambigua"
    return {"origem": "busca", "confianca": confianca, "resultados": res}


@router.get("/saude")
def saude():
    """Existe para provar que o cache esta pegando: cache_lido em zero significa
    conta triplicada em silencio."""
    c = cliente_llm.CONTA
    return {
        "configurado": cliente_llm.configurado(),
        "modelo": cliente_llm.MODELO_PADRAO,
        "modelo_dificil": cliente_llm.MODELO_DIFICIL,
        "prefixo_chars": len(_prefixo()),
        "chamadas_hoje": c.chamadas,
        "usd_hoje": round(c.usd, 4),
        "teto_usd_dia": cliente_llm.TETO_USD_DIA,
        "tokens_lidos_do_cache": c.cache_lido,
        "circuito": "aberto" if cliente_llm.DISJUNTOR.aberto else "fechado",
    }


# --- C2: ramo IA ---------------------------------------------------------------

FERRAMENTAS = [
    {
        "name": "consultar_indicadores",
        "description": ("Numeros do periodo: faturamento (sempre LIQUIDO de devolucao), "
                        "itens vendidos, ticket medio, clientes cadastrados, novos, ativos, "
                        "positivados, % positivados e margem de contribuicao (meta 33%). "
                        "Traz tambem o periodo anterior e a variacao. Use para qualquer "
                        "pergunta de 'quanto foi'."),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "consultar_analise",
        "description": ("Executa UMA analise do catalogo pelo id (ex.: ANA-ABC-01) e devolve "
                        "as linhas resumidas. Use so quando a pergunta pedir detalhe que os "
                        "indicadores nao tem. Uma por vez."),
        "input_schema": {
            "type": "object",
            "properties": {"id": {"type": "string", "description": "id do catalogo, ex.: ANA-RFM-01"}},
            "required": ["id"],
        },
    },
    {
        "name": "abrir_ficha",
        "description": ("Texto de ajuda oficial de uma analise/indicador: para que serve, como "
                        "ler, de onde vem o numero. Use para perguntas de significado, sem "
                        "precisar consultar dados."),
        "input_schema": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
        },
    },
]


def _prefixo() -> str:
    """Bloco estavel que vai cacheado: regras do negocio + catalogo inteiro.

    Vai COMPLETO de proposito — encolher aqui derrubaria o prefixo abaixo do
    minimo cacheavel e triplicaria o custo por pergunta.
    """
    return (acervo.conhecimento()
            + "\n\n=== CATALOGO DO BI (use o id exato ao chamar as ferramentas) ===\n"
            + acervo.indice_atual())


class Contexto(BaseModel):
    tela: str | None = None
    foco_id: str | None = None
    dt_ini: str | None = None
    dt_fim: str | None = None


class Pergunta(BaseModel):
    pergunta: str = Field(min_length=3, max_length=500)
    contexto: Contexto = Contexto()
    permitir_ia: bool = True


def _periodo(ctx: Contexto) -> tuple[date, date]:
    fim = date.fromisoformat(ctx.dt_fim) if ctx.dt_fim else date.today()
    ini = date.fromisoformat(ctx.dt_ini) if ctx.dt_ini else fim - timedelta(days=29)
    if ini > fim:
        raise HTTPException(422, "A data inicial é maior que a final.")
    if (fim - ini).days > 400:
        raise HTTPException(422, "Período longo demais (máximo 400 dias).")
    return ini, fim


def _resposta(origem: str, texto: str, **extra) -> dict:
    base = {"origem": origem, "resposta": texto, "citacoes": [], "ressalvas": [],
            "sugestoes": [], "custo_usd": 0.0, "chamadas": 0}
    base.update(extra)
    return base


@router.post("/perguntar")
def perguntar(req: Pergunta):
    inicio = time.time()
    ini, fim = _periodo(req.contexto)
    periodo = f"{ini.isoformat()}..{fim.isoformat()}"

    # C1 — a pergunta e "o que e isso?" sobre a tela aberta: responde de graca
    achados = acervo.buscar(req.pergunta, 3)
    if not req.permitir_ia:
        return _explicar_sem_ia(req, achados)

    if not cliente_llm.configurado():
        return _explicar_sem_ia(req, achados)

    if cliente_llm.DISJUNTOR.aberto or cliente_llm.CONTA.estourou():
        return _explicar_sem_ia(req, achados, aviso=(
            "A IA está indisponível no momento. Direto do sistema:"))

    citadas: list[str] = []
    # nome de cliente/vendedor nao sai da rede: vira CLI-01/RCA-02 e volta ao
    # nome real aqui no servidor, antes de a resposta chegar a tela
    mapa = pseudonimos.Mapa()

    def executar(nome: str, entrada: dict):
        """As ferramentas do agente. Toda saida passa pelo envelope carimbado."""
        try:
            if nome == "consultar_indicadores":
                r = rodar_indicadores(dt_ini=ini, dt_fim=fim)
                linhas = [f"{i['nome']}: {i.get('valor')}"
                          f" (anterior {i.get('valor_anterior')}, variacao {i.get('variacao_pct')}%)"
                          f"{'' if i.get('status') == 'validado' else ' [A VALIDAR]'}"
                          for i in r["indicadores"] if not i.get("erro")]
                return (f"[indicadores | periodo {periodo}]\n" + "\n".join(linhas)), ["IND"]

            if nome == "abrir_ficha":
                v = acervo.verbete(str(entrada.get("id", "")))
                if not v:
                    return "Esse id nao existe no catalogo.", []
                return json.dumps(v, ensure_ascii=False), [v["id"]]

            if nome == "consultar_analise":
                id_ = str(entrada.get("id", "")).upper()
                if not acervo.existe(id_):
                    sug = ", ".join(a["id"] for a in acervo.buscar(req.pergunta, 3))
                    return f"Id {id_} nao existe. Talvez: {sug}", []
                r = rodar_analise(id_, {"dt_ini": ini.isoformat(), "dt_fim": fim.isoformat()})
                v = acervo.verbete(id_) or {}
                return compressao.envelope(id_, r.get("titulo", id_), periodo,
                                           mapa.mascarar(r.get("rows", [])), r.get("meta"),
                                           v.get("status", "validado")), [id_]
        except HTTPException as e:
            return f"Nao consegui essa consulta: {e.detail}", []
        except Exception as e:  # noqa: BLE001 — falha de uma ferramenta nao derruba a resposta
            return f"Nao consegui essa consulta ({type(e).__name__}).", []
        return "Ferramenta desconhecida.", []

    def executar_e_citar(nome, entrada):
        saida, ids = executar(nome, entrada)
        citadas.extend(ids)
        return saida, ids

    contexto_tela = ""
    if req.contexto.foco_id and acervo.existe(req.contexto.foco_id):
        contexto_tela = f"\nO usuario esta olhando agora: {req.contexto.foco_id}."
    mensagem = (f"Periodo selecionado na tela: {periodo}.{contexto_tela}\n\n"
                f"Pergunta: {req.pergunta}")

    modelo = cliente_llm.escalonar(req.pergunta)
    try:
        r = cliente_llm.conversar(
            _prefixo(), FERRAMENTAS, [{"role": "user", "content": mensagem}],
            modelo, executar_e_citar,
        )
        cliente_llm.DISJUNTOR.registrar_ok()
    except Exception:  # noqa: BLE001 — erro cru da API nunca chega ao dono
        cliente_llm.DISJUNTOR.registrar_falha()
        return _explicar_sem_ia(req, achados, aviso=(
            "Não consegui falar com a IA agora. Direto do sistema:"))

    if not r["texto"]:
        return _explicar_sem_ia(req, achados, aviso="Não consegui formular a resposta. Direto do sistema:")

    fontes = []
    for id_ in dict.fromkeys(citadas):
        v = acervo.verbete(id_)
        if v:
            fontes.append({"id": id_, "titulo": v["titulo"], "status": v.get("status")})
    ressalvas = [f"{f['titulo']}: número ainda não conferido contra o banco."
                 for f in fontes if f.get("status") and f["status"] != "validado"]

    return _resposta("ia", mapa.revelar(r["texto"]), citacoes=fontes, ressalvas=ressalvas,
                     sugestoes=[{"id": a["id"], "titulo": a["titulo"]} for a in achados[:2]],
                     custo_usd=r["custo"], chamadas=r["chamadas"],
                     modelo=modelo, ms=int((time.time() - inicio) * 1000))


def _explicar_sem_ia(req: Pergunta, achados: list[dict], aviso: str | None = None) -> dict:
    """Resposta de custo zero, montada com o texto humano da spec."""
    alvo = req.contexto.foco_id if req.contexto.foco_id and acervo.existe(req.contexto.foco_id) else None
    if not alvo and achados and achados[0]["score"] >= 4:
        alvo = achados[0]["id"]
    if not alvo:
        return _resposta("recusa", (aviso + " " if aviso else "")
                         + "Não encontrei no catálogo uma análise que responda isso. "
                           "Tente com outras palavras — por exemplo: margem, positivado, ruptura, carteira, cobrança.",
                         sugestoes=[{"id": a["id"], "titulo": a["titulo"]} for a in achados[:3]])
    v = acervo.verbete(alvo) or {}
    partes = [p for p in [v.get("para_que_serve"), v.get("como_ler"), v.get("de_onde_vem")] if p]
    texto = (aviso + "\n\n" if aviso else "") + f"**{v.get('titulo')}**\n\n" + "\n\n".join(partes)
    ressalvas = ([f"{v.get('titulo')}: número ainda não conferido contra o banco."]
                 if v.get("status") and v["status"] != "validado" else [])
    return _resposta("catalogo", texto,
                     citacoes=[{"id": alvo, "titulo": v.get("titulo"), "status": v.get("status")}],
                     ressalvas=ressalvas,
                     sugestoes=[{"id": a["id"], "titulo": a["titulo"]} for a in achados[:3] if a["id"] != alvo])
