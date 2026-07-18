"""Nome de cliente e de vendedor NAO saem da rede da empresa.

Decisao do dono: quando o ramo de IA estiver ligado, o modelo recebe "CLI-07"
no lugar de "MILHAO INDUSTRIA E COMERCIO...". A troca de volta acontece aqui,
no servidor, antes de a resposta chegar a tela — o usuario le o nome real e a
API externa nunca viu.

Produto e departamento NAO sao mascarados de proposito: nao identificam pessoa
e sem eles a resposta vira "compre mais PRD-12", que e inutil.
"""
import re

# colunas que carregam identidade de pessoa/empresa
_PESSOA = re.compile(r"^(cliente|fantasia|razao|razao_social|nome_cliente|rca|vendedor|"
                     r"rca_carteira|nome_vendedor|fornecedor|nome_fornecedor)$", re.I)

_PREFIXO = {"cliente": "CLI", "fantasia": "CLI", "razao": "CLI", "razao_social": "CLI",
            "nome_cliente": "CLI", "rca": "RCA", "vendedor": "RCA", "rca_carteira": "RCA",
            "nome_vendedor": "RCA", "fornecedor": "FOR", "nome_fornecedor": "FOR"}


class Mapa:
    """Vive um turno de pergunta. Mesmo nome -> mesmo codigo dentro do turno,
    senao o modelo acha que sao empresas diferentes."""

    def __init__(self) -> None:
        self.para_codigo: dict[str, str] = {}
        self.para_nome: dict[str, str] = {}
        self._n: dict[str, int] = {}

    def codificar(self, coluna: str, nome: str) -> str:
        if not nome or not isinstance(nome, str):
            return nome
        if nome in self.para_codigo:
            return self.para_codigo[nome]
        pref = _PREFIXO.get(coluna.lower(), "ITEM")
        self._n[pref] = self._n.get(pref, 0) + 1
        codigo = f"{pref}-{self._n[pref]:02d}"
        self.para_codigo[nome] = codigo
        self.para_nome[codigo] = nome
        return codigo

    def mascarar(self, rows: list[dict]) -> list[dict]:
        if not rows:
            return rows
        alvo = [c for c in rows[0].keys() if _PESSOA.match(c)]
        if not alvo:
            return rows
        return [{**r, **{c: self.codificar(c, r.get(c)) for c in alvo}} for r in rows]

    def revelar(self, texto: str) -> str:
        """Devolve os nomes reais no texto que vai para a tela."""
        if not texto or not self.para_nome:
            return texto
        # do maior para o menor evita "CLI-1" comer o prefixo de "CLI-12"
        for codigo in sorted(self.para_nome, key=len, reverse=True):
            texto = texto.replace(codigo, self.para_nome[codigo])
        return texto
