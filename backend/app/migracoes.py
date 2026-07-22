"""Schema `app`: o pouco que o BI precisa GRAVAR (o Winthor continua read-only).

Tres razoes para um schema proprio, separado do espelho:

1. o sincronismo roda `TRUNCATE winthor.<tabela>` e `DROP TABLE ... CASCADE` a cada
   carga — qualquer dado de usuario dentro de `winthor` seria apagado, e uma FK
   apontando para la bloquearia a carga;
2. o Oracle do cliente e somente leitura por contrato (backend/app/db.py);
3. o gestor precisa registrar coisas que o ERP nao guarda: o MOTIVO DA PERDA do
   cliente (§9 da skill — "para o alerta nao ficar poluido com clientes que
   sabidamente nao voltam"), o LEAD TIME por fornecedor/secao (§10) e os feriados
   locais que faltam no calendario.

O DDL e idempotente e roda no startup do FastAPI. Nao basta deixar em
`sync/sql/`: aquele diretorio e montado em /docker-entrypoint-initdb.d, que o
Postgres so executa quando o volume e novo — num ambiente ja rodando o arquivo
nunca seria aplicado.
"""
import logging

from . import pg

log = logging.getLogger(__name__)

DDL = """
CREATE SCHEMA IF NOT EXISTS app;

-- Catalogo do dropdown de motivo da perda. Semeado uma vez; o gestor pode ampliar.
CREATE TABLE IF NOT EXISTS app.motivo_perda (
  codigo      text PRIMARY KEY,
  descricao   text NOT NULL,
  recuperavel boolean NOT NULL DEFAULT true,
  ordem       integer NOT NULL DEFAULT 100
);

-- Anotacao do gestor sobre o cliente. SEM foreign key para winthor.pcclient:
-- o sync trunca aquele schema e a FK impediria a carga.
CREATE TABLE IF NOT EXISTS app.cliente_anotacao (
  codcli        integer PRIMARY KEY,
  motivo        text REFERENCES app.motivo_perda(codigo),
  observacao    text,
  -- tira o cliente do alerta ate a data, sem apagar o registro: e o pedido
  -- literal da §9 (caso Sued, que perdeu a licitacao e saiu do estado)
  silenciar_ate date,
  alterado_por  text,
  alterado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.cliente_anotacao_hist (
  id            bigserial PRIMARY KEY,
  codcli        integer NOT NULL,
  motivo        text,
  observacao    text,
  silenciar_ate date,
  alterado_por  text,
  alterado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cliente_anotacao_hist_codcli ON app.cliente_anotacao_hist (codcli, alterado_em DESC);

-- Feriados locais (GO/Goiania e pontos facultativos). Os nacionais sao calculados
-- em calendario.py a partir da Pascoa e NAO precisam ser cadastrados aqui.
CREATE TABLE IF NOT EXISTS app.feriado (
  data      date PRIMARY KEY,
  descricao text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Lead time de compra (§10): papel e quimico nao podem ter o mesmo gatilho.
-- Escopo 'fornecedor' ou 'secao'; o mais especifico vence.
CREATE TABLE IF NOT EXISTS app.lead_time (
  escopo    text    NOT NULL CHECK (escopo IN ('fornecedor','secao','departamento')),
  codigo    integer NOT NULL,
  dias      integer NOT NULL CHECK (dias >= 0),
  origem    text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (escopo, codigo)
);
-- quem mexeu no parametro: lead time errado vira ordem de compra errada, e o
-- PUT /api/compras/lead-time e aberto a qualquer usuario autenticado.
-- ADD COLUMN IF NOT EXISTS para nao quebrar base que ja criou a tabela sem ele.
ALTER TABLE app.lead_time ADD COLUMN IF NOT EXISTS alterado_por text;
"""

# codigo, descricao, recuperavel, ordem
MOTIVOS = [
    ("preco", "Preço / perdeu para concorrente", True, 10),
    ("atendimento", "Problema de atendimento ou entrega", True, 20),
    ("ruptura", "Faltou produto (ruptura)", True, 30),
    ("credito", "Bloqueio de crédito / inadimplência", True, 40),
    ("licitacao", "Perdeu contrato ou licitação", False, 50),
    ("fechou", "Cliente fechou ou saiu da região", False, 60),
    ("sazonal", "Compra sazonal — volta no período", True, 70),
    ("outro", "Outro (ver observação)", True, 99),
]

# escopo, codigo, dias, origem
#
# ★ SEMENTE MINIMA E DELIBERADA — SO O QUE ESTA CONFIRMADO NA BASE
# Sem nenhuma linha aqui, `_resolver_lead()` devolvia (None, None) para 100% dos
# produtos, o status "comprar agora" de /api/compras/sugestao era codigo morto e
# papel e quimico ficavam com RIGOROSAMENTE o mesmo gatilho — o anti-padrao do
# §10/§11. Basta um caso real para a regra passar a existir na pratica.
#
# O caso real medido no Oracle de producao em 2026-07-21: PCFORNEC.PRAZOENTREGA
# do fornecedor 13 (INDAIAL PAPEL EMBALAGENS LTDA) = 30 dias — o unico fornecedor
# da base fora do padrao, e justamente o gargalo do papel do §10 (29 produtos nas
# secoes 201 PAPEL TOALHA, 202 GUARDANAPO e 203 PAPEL HIGIENICO).
#
# Os demais NAO sao semeados de proposito: 210 fornecedores estao no default 7 e
# 11 no default 14 do cadastro (2 em 10, 1 em 5). Sao valores de instalacao, nao
# prazo negociado — semea-los daria ao quimico um gatilho inventado com cara de
# medido, que e pior que gatilho ausente. Eles entram pelo PUT
# /api/compras/lead-time quando o comprador confirmar fornecedor a fornecedor.
LEAD_TIMES = [
    ("fornecedor", 13, 30,
     "PCFORNEC.PRAZOENTREGA (INDAIAL PAPEL EMBALAGENS) — medido na base em 2026-07-21; "
     "gargalo do papel (§10). Confirmar com o Adriel."),
]


def aplicar() -> bool:
    """Cria o schema `app` se faltar. Nunca derruba o boot da API: sem espelho
    Postgres o BI continua servindo tudo que le do Winthor."""
    try:
        pg.executar(DDL)
        for codigo, descricao, recuperavel, ordem in MOTIVOS:
            pg.executar(
                """INSERT INTO app.motivo_perda (codigo, descricao, recuperavel, ordem)
                   VALUES (%(c)s, %(d)s, %(r)s, %(o)s)
                   ON CONFLICT (codigo) DO NOTHING""",
                {"c": codigo, "d": descricao, "r": recuperavel, "o": ordem},
            )
        for escopo, codigo, dias, origem in LEAD_TIMES:
            # DO NOTHING (e nao DO UPDATE): a semente e so o ponto de partida — se
            # o comprador ja ajustou o prazo pela tela, um restart nao pode
            # sobrescrever a decisao dele com o valor do cadastro do ERP.
            pg.executar(
                """INSERT INTO app.lead_time (escopo, codigo, dias, origem, alterado_por)
                   VALUES (%(e)s, %(c)s, %(d)s, %(o)s, 'seed')
                   ON CONFLICT (escopo, codigo) DO NOTHING""",
                {"e": escopo, "c": codigo, "d": dias, "o": origem},
            )
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("schema app nao aplicado (%s) — anotacoes de cliente e lead time de compra "
                    "ficam indisponiveis", e)
        return False
