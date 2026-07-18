"""Unico ponto do sistema que fala com a API da Anthropic.

Economia de token, em ordem de impacto:

1. PROMPT CACHING. O prefixo (regras do negocio + indice das 58 analises e
   indicadores) e estavel e vai marcado com cache_control. Leitura de cache
   custa 10% do preco de entrada. Como uma pergunta faz 2-3 chamadas lendo o
   mesmo prefixo, o cache se paga DENTRO da propria pergunta.
   ARMADILHA: o minimo cacheavel e 4.096 tokens. Prefixo menor e aceito sem
   erro, devolve cache_creation_input_tokens=0 e paga preco cheio para sempre.
   Por isso o indice vai completo — ver acervo.indice().
2. FERRAMENTA SOB DEMANDA. Nenhum dado do banco entra no prompt sem o modelo
   pedir. Pergunta conceitual nao consulta banco nenhum.
3. MODELO BARATO POR PADRAO. Haiku resolve "o que e" e "quanto foi". So sobe
   para Sonnet quando a pergunta pede causa/comparacao (ver escalonar()).
4. RESPOSTA CURTA. max_tokens apertado; o prompt manda responder em 3-5 linhas.
"""
import os
import time

MODELO_PADRAO = os.environ.get("ASSISTENTE_MODELO", "claude-haiku-4-5-20251001")
MODELO_DIFICIL = os.environ.get("ASSISTENTE_MODELO_DIFICIL", "claude-sonnet-5")
TIMEOUT = float(os.environ.get("ASSISTENTE_TIMEOUT", "20"))
MAX_TOKENS = int(os.environ.get("ASSISTENTE_MAX_TOKENS", "600"))
TETO_USD_DIA = float(os.environ.get("ASSISTENTE_TETO_USD_DIA", "1.00"))

# USD por 1M tokens (entrada, saida). Escrita de cache = 1,25x entrada; leitura = 0,1x.
PRECOS = {
    "claude-haiku-4-5-20251001": (1.00, 5.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-opus-4-8": (5.00, 25.00),
}

_GATILHOS_DIFICIL = ("por que", "porque", "por quê", "motivo", "causa", "caiu",
                     "subiu", "comparar", "compare", "versus", "melhor", "pior",
                     "tendencia", "tendência", "explique")


def escalonar(pergunta: str, n_ferramentas: int = 0) -> str:
    """Sobe de modelo so quando a pergunta pede raciocinio causal ou cruzamento."""
    p = pergunta.lower()
    if n_ferramentas > 1 or any(g in p for g in _GATILHOS_DIFICIL):
        return MODELO_DIFICIL
    return MODELO_PADRAO


def configurado() -> bool:
    """Chave definida E pacote instalado. Sem os dois, a ajuda segue na camada
    deterministica em silencio, em vez de errar a cada pergunta."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


class Contabilidade:
    """Gasto do dia, em memoria. Serve para o teto diario e para o painel /saude."""

    def __init__(self) -> None:
        self.dia = time.strftime("%Y-%m-%d")
        self.usd = 0.0
        self.chamadas = 0
        self.cache_lido = 0
        self.entrada = 0

    def _virar_dia(self) -> None:
        hoje = time.strftime("%Y-%m-%d")
        if hoje != self.dia:
            self.__init__()

    def somar(self, modelo: str, usage) -> float:
        self._virar_dia()
        p_in, p_out = PRECOS.get(modelo, PRECOS[MODELO_PADRAO])
        entrada = getattr(usage, "input_tokens", 0) or 0
        criado = getattr(usage, "cache_creation_input_tokens", 0) or 0
        lido = getattr(usage, "cache_read_input_tokens", 0) or 0
        saida = getattr(usage, "output_tokens", 0) or 0
        usd = (entrada * p_in + criado * p_in * 1.25 + lido * p_in * 0.10
               + saida * p_out) / 1_000_000
        self.usd += usd
        self.chamadas += 1
        self.cache_lido += lido
        self.entrada += entrada + criado
        return usd

    def estourou(self) -> bool:
        self._virar_dia()
        return self.usd >= TETO_USD_DIA


CONTA = Contabilidade()


class Disjuntor:
    """3 falhas seguidas desligam o ramo IA por 60s.

    Sem isso, um buraco negro de rede prende os slots do threadpool do FastAPI
    e derruba o login e o dashboard junto com o assistente.
    """

    def __init__(self, limite: int = 3, descanso: int = 60) -> None:
        self.limite, self.descanso = limite, descanso
        self.falhas = 0
        self.aberto_ate = 0.0

    @property
    def aberto(self) -> bool:
        return time.time() < self.aberto_ate

    def registrar_falha(self) -> None:
        self.falhas += 1
        if self.falhas >= self.limite:
            self.aberto_ate = time.time() + self.descanso
            self.falhas = 0

    def registrar_ok(self) -> None:
        self.falhas = 0


DISJUNTOR = Disjuntor()


def _cliente():
    import anthropic  # importado aqui: o BI roda sem o pacote se a IA nao for usada
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=TIMEOUT)


def conversar(prefixo: str, ferramentas: list[dict], mensagens: list[dict],
              modelo: str, executar_ferramenta) -> dict:
    """Roda a conversa ate a resposta final, executando as ferramentas pedidas.

    Devolve {"texto", "citacoes", "custo", "chamadas"}.
    """
    cliente = _cliente()
    # cache_control no ultimo bloco do system: tudo acima dele entra no cache
    system = [{"type": "text", "text": prefixo, "cache_control": {"type": "ephemeral"}}]
    usadas: list[str] = []
    custo = 0.0
    chamadas = 0

    for _ in range(4):  # teto de idas e voltas; na pratica 1-2
        resp = cliente.messages.create(
            model=modelo, max_tokens=MAX_TOKENS, system=system,
            tools=ferramentas, messages=mensagens,
        )
        chamadas += 1
        custo += CONTA.somar(modelo, resp.usage)

        if resp.stop_reason != "tool_use":
            texto = "".join(b.text for b in resp.content if b.type == "text").strip()
            return {"texto": texto, "citacoes": usadas, "custo": round(custo, 6),
                    "chamadas": chamadas}

        mensagens.append({"role": "assistant", "content": resp.content})
        resultados = []
        for bloco in resp.content:
            if bloco.type != "tool_use":
                continue
            saida, citado = executar_ferramenta(bloco.name, bloco.input)
            if citado:
                usadas.extend(citado)
            resultados.append({"type": "tool_result", "tool_use_id": bloco.id,
                               "content": saida})
        mensagens.append({"role": "user", "content": resultados})

    return {"texto": "", "citacoes": usadas, "custo": round(custo, 6), "chamadas": chamadas}
