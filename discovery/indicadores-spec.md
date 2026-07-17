# Indicadores comerciais - BI h4c (Hygiene For Care)

**Gerado em:** 2026-07-17 &nbsp;|&nbsp; **Fonte:** 9 specs de especialistas + 3 auditorias (individual x2 + coerencia de conjunto) &nbsp;|&nbsp; **Base:** Winthor/Oracle, ~9 meses de historico (out/2025 -> jul/2026)

> **Contrato tecnico:** todo SQL usa apenas os binds `:dt_ini` e `:dt_fim`, retorna **exatamente 1 linha** (inclusive em janela vazia) com a coluna `VALOR` + auxiliares, e pode ser reexecutado pelo backend na janela anterior para calcular a variacao. Percentuais na escala 0-100. Nenhum SQL foi **executado** contra o Oracle (sem acesso, por instrucao): `validado` significa estrutura conferida contra o dicionario e logica auditada contra as armadilhas conhecidas.

## Tabela-resumo

| ID | INDICADOR | DEFINICAO | GRAO | FORMATO | STATUS |
|---|---|---|---|---|---|
| IND-01 | Faturamento | Soma do valor cheio (VLTOTAL) das NFs de venda nao canceladas emitidas no periodo | nota fiscal -> 1 linha/periodo | moeda | `a_validar` |
| IND-02 | Itens vendidos | Soma das quantidades (PCMOV.QT) dos itens de venda das NFs validas do periodo, na unidade de venda | item de venda -> 1 linha/periodo | inteiro | `a_validar` |
| IND-03 | Ticket medio por cliente | Faturamento do periodo dividido pelo numero de clientes DIFERENTES que compraram (nao por notas) | cliente -> 1 linha/periodo | moeda | `a_validar` |
| IND-04 | Clientes cadastrados | Foto de hoje da base viva do cadastro: clientes com DTEXCLUSAO nula (bloqueado continua contando) | cliente (snapshot de hoje) | inteiro | `validado` |
| IND-05 | Novos clientes (com venda) | Clientes cuja PRIMEIRA compra da historia (MIN(DTSAIDA) de todo o historico) caiu dentro do periodo | cliente -> 1 linha/periodo | inteiro | `a_validar` |
| IND-06 | Clientes ativos | Clientes distintos com NF de venda valida nos ultimos 90 dias contados para tras a partir de :dt_fim | cliente (janela rolante 90d) | inteiro | `a_validar` |
| IND-07 | Clientes positivados | Clientes distintos com ao menos uma NF de venda nao cancelada no periodo (cada cliente conta 1 vez) | cliente -> 1 linha/periodo | inteiro | `a_validar` |
| IND-08 | % clientes positivados (cobertura da carteira) | Positivados do periodo dividido pela carteira cadastral apta (viva e sem bloqueio definitivo), em % | empresa/periodo (base: cliente) | percentual | `a_validar` |
| IND-09 | % margem de lucro (margem bruta de mercadoria) | (venda de item - custo de item) / venda de item x 100, sobre PUNIT e CUSTOREAL das NFs de venda validas | item de venda -> 1 linha/periodo | percentual | `a_validar` |

**Placar:** 1 validado (IND-04) - 8 a_validar. Nenhum reprovado.

Os 8 `a_validar` **nao tem defeito de SQL** - todos foram aprovados ou corrigidos na auditoria individual. Eles dependem de **duas medicoes** que a consolidacao tornou bloqueantes ao unificar as reguas divergentes (ver a secao seguinte). As duas rodam em segundos.

## Correcoes de coerencia aplicadas (prioridade maxima)

A auditoria de conjunto encontrou um padrao: **as identidades do painel fechavam por acidente, nao por construcao.** Todas as contas batiam (ticket x positivados = faturamento; 4.127,89 x 114 = R$ 470.579 ~ R$ 470.580) - mas apenas porque os filtros divergentes entre os indicadores eram *no-op nesta base*. Bastava abrir a 2a filial ou aparecer uma nota de remessa para o painel se contradizer **silenciosamente, sem erro nenhum**. As correcoes abaixo fazem as identidades valerem por construcao.

### 1. Regua unica de "nota de venda" (afeta IND-01, 03, 05, 06, 07, 08)

O painel calculava "clientes que compraram" de **tres** formas: IND-01 (NF + `EXISTS codoper='S'` + `codfilial='1'`), IND-03 (NF + EXISTS, sem filial) e IND-07/05/06/08 (**NF pura**, sem EXISTS). Por construcao (a) contido em (b) contido em (c) - logo IND-01 e IND-03 **nunca** poderiam ser maiores que IND-07 - e os tres declaravam esperar **114**. Matematicamente, no maximo um estava certo.

**Adotado o EXISTS `codoper='S' AND dtcancel IS NULL` nos seis**, conforme recomendacao da auditoria: e a definicao mais defensavel (quem so recebeu remessa nao positivou), e o proprio IND-01 justificava o EXISTS afirmando que PCNFSAID guarda remessa, transferencia e devolucao a fornecedor - se isso for verdade, o card **oficial** de positivados estava superestimado.

### 2. Regua unica de "item de venda" (afeta IND-01, 02, 09)

`IND-01.FATURAMENTO_ITENS` e `IND-09.venda_itens` eram exibidos como o **mesmo** ~R$ 439 mil, mas IND-01 recortava os itens pela **data da nota** (amarrado a PCNFSAID nao cancelada) e IND-02/IND-09 por **`PCMOV.DTMOV`** - que e `NULLABLE=Y`. Item com DTMOV nula entrava em IND-01 e **sumia em silencio** de IND-02/IND-09; e se DTMOV != DTSAIDA (normal no Winthor na virada de mes), os dois numeros com o mesmo rotulo divergiam.

**Adotada a regua da NOTA para os tres.** Fecha de quebra uma pendencia aberta do proprio IND-09 (item vivo de NF cancelada entrava na margem). Custo: os valores de referencia 7.244 e 31,59% foram medidos com DTMOV e precisam ser reprocessados - **e por isso, e so por isso, que IND-02 foi rebaixado de `validado` para `a_validar`** (a unica vez em que a consolidacao contraria um veredito individual).

### 3. Regua unica de "carteira" (afeta IND-04, 06, 08)

A mais grave apontada: `IND-06.ativos_por_cadastro` excluia `BLOQUEIO='S'`; `IND-08.qt_carteira_base` **deliberadamente o mantinha** e argumentava por escrito que exclui-lo permite *gaming* (bloqueia-se o cliente morto e a cobertura "melhora" sem uma venda a mais). Os dois seriam exibidos como "carteira" no mesmo painel e nao bateriam. Cada autor documentou sua divergencia em relacao ao VEN-05 do catalogo - **nenhum viu a divergencia em relacao ao outro indicador do proprio lote.**

**Adotado o criterio do IND-08 como CARTEIRA APTA CANONICA** (so saem `DTEXCLUSAO` preenchida e `BLOQUEIODEFINITIVO='S'`), pelo argumento anti-gaming. A leitura antiga do IND-06 virou `base_comercializavel`, que agora bate com `IND-04.base_comercializavel`.

### 4. Ponte do % positivados (afeta IND-04, 08)

O painel mostraria *Positivados = 114*, *Clientes cadastrados = X* e *% positivados = Y%* - e o dono que fizesse `114/X` na calculadora **nao obteria Y**, porque o IND-08 usa um denominador que nao era exibido em card nenhum. Acrescentado o auxiliar `IND-04.carteira_apta` (= denominador do IND-08). Tooltip obrigatorio do IND-08:

> `cadastro bruto 235 -> menos excluidos -> base viva (IND-04.VALOR) -> menos bloqueio definitivo -> carteira apta N -> positivados 114 -> Y%`

### 5. Filial: 2 de 9 filtravam, com justificativas contraditorias (afeta IND-01, 02)

IND-01 filtrava `codfilial='1'` justificando *"a filial 99 **poderia duplicar valores**"*; IND-03/05/06/07/08 nao filtravam justificando o oposto - *"a 99 **nao tem fato**, filtrar seria inocuo e quebraria no dia da 2a filial"*. As duas nao podem ser verdadeiras. O fato validado (`codfilial='1'` em todas as fatos) resolve: o filtro e no-op e a justificativa do IND-01 estava errada. **Filtro removido de IND-01 e IND-02** (7 contra 2). O risco nao era o numero de hoje: era a assimetria - no dia da 2a filial, Faturamento e Itens mostrariam so a filial 1 enquanto Positivados, Ativos e Margem mostrariam a empresa toda, e o dono veria a margem subir sem o faturamento subir.

### 6. TRUNC nos binds (afeta IND-01)

IND-01 era o **unico dos 9** sem `TRUNC` nos binds. Se o backend entregar DATE com hora, ele mediria uma janela deslocada e a identidade `ticket x clientes = faturamento` quebraria por uma diferenca de horas que ninguem conseguiria explicar. Correcao mais barata da auditoria: duas palavras.

### 7. Outras

- **IND-05 nao executava** (`ORA-22818`: subquery escalar dentro de `WHEN` de `CASE`, dentro de agregado). O status `validado` original foi dado com base apenas em existencia de colunas - nenhuma checagem sintatica. Corrigido.
- **IND-06.pct_ativos_sobre_cadastro** misturava populacoes (numerador sem restricao de cadastro, denominador com): podia passar de 100% e era **cego** para o que dizia medir. Ironia: o SQL ja calculava a intersecao correta e nao a usava. Renomeado para `pct_ativos_sobre_carteira`.
- **IND-08.qt_positivados** renomeado para `qt_positivados_na_carteira` - convivia com `qt_positivados_nf_total` e com o card IND-07: tres nomes quase identicos, populacoes diferentes.
- **Faixas esperadas unificadas**: `IND-06.valor` e `IND-08.qt_base_ativa_90d` sao o mesmo numero por construcao mas declaravam 140-170 e 140-200. Unificado em **140-170**.
- **Auxiliares do IND-01 renomeados** (`CLIENTES_POSITIVADOS` -> `CLIENTES_COM_NF_VENDA`, `TICKET_MEDIO` -> `TICKET_MEDIO_NOTA`) para ninguem comparar cegamente com o card ao lado.

### Identidades que agora fecham por construcao (usar como teste de regressao)

```
IND-01.VALOR                      = IND-03.faturamento
IND-01.QTD_NOTAS                  = IND-03.notas = IND-07.qt_notas
IND-01.TICKET_MEDIO_NOTA          = IND-03.ticket_medio_nota
IND-01.CLIENTES_COM_NF_VENDA      = IND-03.clientes_distintos = IND-07.VALOR
                                  = IND-06.positivados_periodo = IND-08.qt_positivados_nf_total
IND-01.FATURAMENTO_ITENS_DA_NOTA  = IND-09.venda_itens
IND-02.linhas_item                = IND-09.linhas_item
IND-02.skus_distintos             = IND-09.skus
IND-04.carteira_apta              = IND-06.carteira_apta = IND-08.qt_carteira_base
IND-04.base_comercializavel       = IND-06.base_comercializavel
IND-04.total_bruto_cadastro       = IND-06.base_cadastro_total = IND-08.qt_cadastro_total = 235
IND-06.valor                      = IND-08.qt_base_ativa_90d
IND-03.valor x IND-07.VALOR       = IND-01.VALOR      (4.127,89 x 114 = 470.579 ~ 470.580)
IND-01.TICKET_MEDIO_NOTA x IND-01.QTD_NOTAS = IND-01.VALOR
IND-05.VALOR <= IND-07.VALOR <= IND-06.valor <= IND-04.VALOR <= 235   (janela <= 90d)
IND-04.VALOR + IND-04.excluidos   = 235
```

### As duas medicoes que destravam os 8 `a_validar`

```sql
-- (1) P-IND01-D: o EXISTS codoper='S' remove alguma nota?
--     Se nf_com_venda = nf_todas, o 114 e os R$ 470.580 continuam validos
--     e IND-01/03/05/06/07/08 sobem para validado.
SELECT COUNT(*)                    AS nf_todas,
       ROUND(SUM(n.vltotal),2)     AS vl_todas,
       COUNT(DISTINCT n.codcli)    AS cli_todos,
       COUNT(CASE WHEN EXISTS (SELECT 1 FROM pcmov m
                                WHERE m.numtransvenda = n.numtransvenda
                                  AND m.codoper = 'S'
                                  AND m.dtcancel IS NULL) THEN 1 END) AS nf_com_venda
  FROM pcnfsaid n
 WHERE n.dtcancel IS NULL
   AND n.dtsaida >= TRUNC(SYSDATE)-30
   AND n.dtsaida <  TRUNC(SYSDATE)+1;

-- (2) P-IND02/09-REGUA: DTMOV e equivalente a DTSAIDA?
--     Se os tres contadores derem 0, o 7.244 e o 31,59% valem
--     e IND-02/IND-09 sobem para validado.
SELECT COUNT(*) AS itens_s,
       SUM(CASE WHEN m.dtmov IS NULL THEN 1 ELSE 0 END)                        AS sem_dtmov,
       SUM(CASE WHEN TRUNC(m.dtmov) <> TRUNC(n.dtsaida) THEN 1 ELSE 0 END)     AS dtmov_difere,
       SUM(CASE WHEN n.dtcancel IS NOT NULL THEN 1 ELSE 0 END)                 AS item_vivo_de_nf_cancelada
  FROM pcmov m
  JOIN pcnfsaid n ON n.numtransvenda = m.numtransvenda
 WHERE m.codoper = 'S' AND m.dtcancel IS NULL;
```

### Contaminacao do catalogo existente (fora do escopo, mas descoberto aqui)

As tres auditorias confirmaram, independentemente, que **`PCCLIENT.DTULTCOMP` EXISTE** (DATE, rotulo *Data da Ultima Compra*) - o `ORA-00904` do briefing foi na grafia `DTULTCOMPRA`, que e outro nome. O briefing generalizou um erro de digitacao para "o conceito nao existe". Impacto: **DIM-08 do catalogo esta marcado `validado` e depende de DTULTCOMP estar populada, o que nunca foi medido** - se estiver nula/defasada, DIM-08 devolve todo mundo como inativo e diverge do IND-06. **Recomendacao: rebaixar DIM-08 para `a_validar`** ou reescreve-lo sobre PCNFSAID. Tambem: **VEN-03** (ticket por nota) usa `BETWEEN` e ficou de fora da correcao de `dtcancel` aplicada em VEN-01/DIM-01/DIM-02; e **VEN-07** (margem) fica resolvido por IND-09 e deve ser marcado como tal.

## Decisoes que o DONO precisa confirmar

Apenas as que **mudam o numero de forma relevante**. As demais estao nas pendencias de cada indicador.

| # | Decisao | Entregue como | Se o dono decidir o contrario | Impacto |
|---|---|---|---|---|
| D1 | **"Faturei quanto?"** = nota cheia (com ICMS-ST, IPI, frete) ou so mercadoria? | Nota cheia: **R$ 470.580** | R$ 439.000 | **-6,8% (~R$ 31,6 mil/mes)**. Muda o card de topo. |
| D2 | **Bonificacao/brinde/remessa conta como venda e como cliente positivado?** | **Sim** (TIPOVENDA/CONDVENDA nao filtrados, para preservar a ancora dos 114 medidos) | Filtrar | Derruba faturamento **e** positivados. Muda **6 indicadores + VEN-05/DIM-02 no mesmo commit**. Tamanho nao medido (P-07A). |
| D3 | **"Cliente ativo" = comprou nos ultimos quantos dias?** | **90 dias** (3 ciclos de recompra) | 60d / 120d | 60d aproxima do IND-07 e o duplica; 120d mascara churn. Faixa hoje ~140-170. Calibravel com dado (SQL na pendencia). |
| D4 | **Carteira do % positivados inclui cliente bloqueado por credito/inatividade?** | **Sim** (so saem excluido e bloqueio definitivo) - defesa anti-gaming: bloquear cliente morto nao pode "melhorar" a cobertura | Excluir bloqueados | Sobe o % artificialmente. Muda IND-04/06/08 juntos. |
| D5 | **"Clientes cadastrados" inclui bloqueado definitivo?** | **Sim** (VALOR = base viva) | Trocar pelo `carteira_apta` | Se `bloqueados_definitivo` for irrisorio (0-3), a discussao e academica. Nao medido (P-02). |
| D6 | **Margem: bruta, liquida de devolucoes, ou de contribuicao?** | **Bruta de mercadoria: 31,6%** (antes de impostos, frete e comissao) | Liquida / contribuicao | **31,6% NAO e o que sobra no bolso.** Devolucao tende a decimos de ponto; impostos+frete ja pesam ~6,8% so no cabecalho. Recomendado publicar IND-09b e IND-09c como **irmaos**, nunca sobrescrevendo. |
| D7 | **Ticket por cliente: por CNPJ pagador ou por grupo economico/matriz?** | **Pagador (CODCLI): R$ 4.128** | Matriz (CODCLIPRINC) | So reduz o denominador e **infla** o ticket. Preenchimento de CODCLIPRINC nunca medido (P-IND03-A) - se for 0, a discussao morre. |
| D8 | **"Novos clientes" = primeira COMPRA ou primeiro CADASTRO?** | **Primeira compra** (IND-05); cadastro fica como `IND-04.cadastrados_no_periodo` | Cadastro | Sao metricas diferentes e nao devem ser somadas. O DIM-04 do catalogo chama de "novos" o **cadastro** - fonte de confusao garantida. |
| D9 | **A serie de "novos clientes" so e confiavel a partir de ~jan/2026** - a base comeca em out/2025, entao a carteira antiga inteira desfila como "nova" nos primeiros meses | Publicado com o semaforo `qt_novos_suspeitos`, que se autodesliga conforme o historico amadurece | Publicar a serie inteira | Out-dez/2025 mostra pico artificial de dezenas. A variacao vs. periodo anterior vira **ruido puro** ("-85% de novos clientes" = so o pico artificial passando). Sugerido **desabilitar a comparacao** quando a janela anterior cair antes de jan/2026. |

**Risco de leitura no painel (nao e decisao, e rotulo obrigatorio):** o dono vera *Faturamento R$ 470.580* e *Margem 31,6%* e multiplicara os dois, obtendo **R$ 148,7 mil** - quando o lucro bruto real e **R$ 139 mil** (`IND-09.margem_valor`). Erro de ~R$ 9,7 mil por multiplicar margem-de-item por faturamento-de-nota. O card de margem **deve** exibir `margem_valor` em R$ ao lado do % e rotular: *"sobre mercadoria (base R$ 439 mil, nao o faturamento de R$ 470 mil)"*.

---

## Detalhamento por indicador

---

## IND-01 - Faturamento

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** moeda &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** nota fiscal -> 1 linha/periodo

### Definicao

Soma do valor cheio das notas fiscais de venda emitidas no periodo - o mesmo valor impresso na DANFE e que entra no contas a receber do cliente. Inclui os impostos e o frete lancados no cabecalho da nota (ICMS-ST, IPI, frete, despesas acessorias) e exclui notas canceladas e saidas que nao sao venda (remessas, transferencias, devolucao a fornecedor). E a resposta a pergunta do dono: "quanto eu faturei nesse periodo?"

### Por que essa definicao

Escolhida PCNFSAID.VLTOTAL (nota cheia) como medida oficial, e nao SUM(PCMOV.QT*PUNIT). Motivos: (1) e o valor que a distribuidora efetivamente cobra do cliente - bate com a DANFE, com a duplicata (PCPREST) e com o livro fiscal; quando o dono diz "faturei 470 mil", ele soma notas, nao itens; (2) a nota e o fato fiscal consumado; (3) o grao e limpo - PCNFSAID tem PK NUMTRANSVENDA (1 linha por nota), entao somar VLTOTAL sem JOIN nao multiplica. A soma dos itens mede outra coisa: a receita de mercadoria, liquida do que foi acrescentado no cabecalho. A diferenca de ~6,8% (R$ 470.580 por nota vs ~R$ 439.000 por item, em 30d = ~R$ 31,6 mil) e exatamente esse acrescimo: ICMS-ST, IPI, frete e despesas acessorias, que somam no total da nota mas NAO estao dentro do PUNIT do item. (O ICMS proprio e "por dentro" e ja esta no PUNIT - por isso a diferenca e 6,8% e nao 18%; esse e o sanity check da explicacao.) A soma dos itens nao foi descartada: virou a auxiliar FATURAMENTO_ITENS_DA_NOTA, que e a base correta da margem (IND-09).

### Alternativas descartadas

- SUM(PCMOV.QT*PUNIT) com CODOPER='S' (~R$ 439 mil/30d) - DESCARTADA como oficial: e a receita de mercadoria, 6,8% menor que a nota, e nao bate com o que o cliente paga nem com o contas a receber. Nao foi jogada fora: virou a auxiliar FATURAMENTO_ITENS_DA_NOTA e e a base da margem (IND-09). Equivale ao VEN-01 do catalogo - IND-01 nao o duplica, o encapsula.
- PCNFSAID.VLTOTGER / VLTOTALNF - DESCARTADAS: o briefing valida VLTOTAL como o valor da nota, e a evidencia empirica confirma (VLTOTAL esta 6,8% ACIMA da soma dos itens, ou seja, ja carrega ST/IPI/frete; se fosse so mercadoria, bateria com os itens). Ficam como conferencia (P-IND01-C).
- PCPEDC.VLTOTAL com POSICAO='F' (pedido faturado) - DESCARTADA: pedido nao e nota. Sofre corte/atendimento parcial e diverge do fato fiscal - a base mostra 110 clientes positivados via PCPEDC contra 114 via PCNFSAID. Pedido e intencao; faturamento e nota emitida.
- PCCONSOLIDAMES / PCAUXVENDA (agregados nativos do Winthor) - DESCARTADAS como fonte primaria: sao agregados opacos, com regra de composicao propria do ERP que nao controlamos e que pode divergir dos nossos filtros de cancelamento. Servem para conciliacao, nao para ser a origem do KPI.
- Faturamento LIQUIDO (nota menos devolucoes e menos ICMS/PIS/COFINS/ST/IPI via PCCONSOLIDARECEITA) - DESCARTADA: e outro indicador (VEN-02 do catalogo). IND-01 e o faturamento BRUTO, o numero de topo. Misturar as duas coisas numa metrica so e o que faz o dono desconfiar do BI.

### Grao e fontes

1 linha agregada do periodo. Grao da fonte: 1 linha por nota fiscal de saida (PCNFSAID, PK NUMTRANSVENDA). A auxiliar de itens e agregada de PCMOV (grao item) sobre EXATAMENTE o mesmo conjunto de notas - mesma regua do IND-02 e do IND-09.

- PCNFSAID - medida oficial (VLTOTAL), cabecalho da NF de saida, PK NUMTRANSVENDA, 1.920 linhas
- PCMOV - (a) filtro "e venda de verdade" via EXISTS CODOPER='S'; (b) auxiliar FATURAMENTO_ITENS_DA_NOTA via SUM(QT*PUNIT), 12.243 linhas

### Armadilhas

- NOTAS CANCELADAS: PCNFSAID.DTCANCEL IS NULL - 210 NFs canceladas na base. Cinto-e-suspensorio: elas estao com VLTOTAL zerado (nao inflariam VALOR), mas inflariam QTD_NOTAS e afundariam o TICKET_MEDIO_NOTA.
- ITENS CANCELADOS: PCMOV.DTCANCEL IS NULL nos DOIS usos de PCMOV (EXISTS e auxiliar de itens) - 24% das linhas CODOPER='S' sao canceladas. Sem isso, o faturamento de itens estoura e DIF_CABECALHO_PCT vira negativa.
- DUPLA CONTAGEM (a mais cara aqui): NAO se faz JOIN de PCNFSAID com PCMOV. Um JOIN multiplicaria o VLTOTAL do cabecalho pelo numero de itens da nota (~4 itens/nota -> faturamento ~4x inflado). Por isso o filtro de venda e EXISTS (semi-join) e a soma dos itens vive numa CTE agregada a parte, reunida por CROSS JOIN de dois agregados de 1 linha.
- SAIDA QUE NAO E VENDA: PCNFSAID tambem guarda remessa, transferencia e devolucao a fornecedor. O EXISTS com CODOPER='S' restringe a notas com item de venda efetivo.
- JANELA DE DATA SARGABLE: dtsaida >= TRUNC(:dt_ini) AND dtsaida < TRUNC(:dt_fim)+1. O TRUNC vai no BIND, nunca na coluna. CORRIGIDO na auditoria: o SQL original usava o bind cru e, se o backend entregar DATE com hora, media uma janela DESLOCADA em relacao aos outros 8 indicadores - e a identidade ticket x clientes = faturamento quebrava por horas que ninguem conseguiria explicar.
- FILIAL: codfilial REMOVIDO na consolidacao. Era o unico (com IND-02) a filtrar '1'; 7 dos 9 nao filtram. Hoje e no-op (100% das fatos em '1'), mas manter faria o Faturamento medir so a filial 1 enquanto Positivados/Margem mediriam a empresa toda no dia de uma 2a filial real.
- DIVISAO POR ZERO: NULLIF em TICKET_MEDIO_NOTA e DIF_CABECALHO_PCT - janela sem faturamento devolve 0, nao ORA-01476.
- ZERO LINHAS x UMA LINHA: cab e itens sao agregados sem GROUP BY (sempre 1 linha) e o CROSS JOIN 1x1 garante o contrato de 1 linha. Os NVL convertem SUM nulo em 0.
- PUNIT, NAO PVENDA: PCMOV nao tem coluna PVENDA (confirmado no dicionario). NVL(qt,0)*NVL(punit,0) evita que item com preco nulo anule a parcela.
- IN COM NULL: PCMOV.NUMTRANSVENDA e nullable, mas nf_venda.numtransvenda e a PK (NOT NULL), entao o IN nao cai na armadilha do NULL do Oracle.
- RISCO RESIDUAL ACEITO: o EXISTS qualifica a NOTA e o VALOR soma o VLTOTAL INTEIRO dela. Numa nota mista (item S + item SB bonificado), a bonificacao entra no faturamento. Impacto presumido irrisorio (~8 linhas SB na base toda), mas e presuncao, nao medicao - P-IND01-B.

### SQL

```sql
WITH nf_venda AS (
    -- REGUA CANONICA DE "NOTA DE VENDA" (unificada pela auditoria de coerencia):
    -- NF nao cancelada + EXISTS de item de venda vivo. TRUNC nos binds. SEM codfilial.
    SELECT n.numtransvenda,
           n.codcli,
           NVL(n.vltotal, 0) AS vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.dtsaida  >= TRUNC(:dt_ini)
       AND n.dtsaida  <  TRUNC(:dt_fim) + 1
       AND EXISTS (SELECT 1
                     FROM pcmov m
                    WHERE m.numtransvenda = n.numtransvenda
                      AND m.codoper       = 'S'
                      AND m.dtcancel IS NULL)
), cab AS (
    SELECT SUM(v.vltotal)           AS vl_nota,
           COUNT(*)                 AS qtd_notas,
           COUNT(DISTINCT v.codcli) AS qtd_clientes
      FROM nf_venda v
), itens AS (
    -- Itens recortados pela NOTA (regua unica com IND-02/IND-09), nao por DTMOV.
    SELECT SUM(NVL(m.qt, 0) * NVL(m.punit, 0)) AS vl_itens
      FROM pcmov m
     WHERE m.codoper = 'S'
       AND m.dtcancel IS NULL
       AND m.numtransvenda IN (SELECT v.numtransvenda FROM nf_venda v)
)
SELECT ROUND(NVL(c.vl_nota, 0), 2)   AS valor,
       ROUND(NVL(i.vl_itens, 0), 2)  AS faturamento_itens_da_nota,
       NVL(ROUND(100 * (NVL(c.vl_nota,0) - NVL(i.vl_itens,0))
                 / NULLIF(c.vl_nota, 0), 2), 0) AS dif_cabecalho_pct,
       NVL(c.qtd_notas, 0)           AS qtd_notas,
       NVL(ROUND(NVL(c.vl_nota,0) / NULLIF(c.qtd_notas, 0), 2), 0) AS ticket_medio_nota,
       NVL(c.qtd_clientes, 0)        AS clientes_com_nf_venda
  FROM cab c
 CROSS JOIN itens i
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `FATURAMENTO_ITENS_DA_NOTA` | Receita de mercadoria: SUM(QT*PUNIT) dos itens de venda das MESMAS notas contadas em VALOR (~R$ 439 mil em 30d). E a base correta da margem (IND-09.venda_itens usa a MESMA regua e tem de bater exatamente). Nunca usar VALOR contra SUM(QT*CUSTOREAL). |
| `DIF_CABECALHO_PCT` | Percentual do total da nota que e imposto/frete/despesa acessoria e nao mercadoria: (VALOR - FATURAMENTO_ITENS_DA_NOTA) / VALOR * 100. Esperado ~6,8%. Explica ao dono por que a nota e maior que a soma dos produtos. |
| `QTD_NOTAS` | Notas fiscais de venda validas no periodo (~318 em 30d). Tem de bater com IND-07.QT_NOTAS. |
| `TICKET_MEDIO_NOTA` | VALOR / QTD_NOTAS - valor medio por nota (~R$ 1.479). Renomeado na consolidacao para nao ser confundido com o IND-03 (ticket por CLIENTE). Tem de bater com IND-03.ticket_medio_nota. |
| `CLIENTES_COM_NF_VENDA` | Clientes distintos com NF de venda no periodo (~114). Renomeado (era CLIENTES_POSITIVADOS) para nao competir com o card oficial IND-07; com a regua unificada os dois passam a ser identicos por construcao. |

### Valor esperado e sanidade

Em 30d: VALOR ~ R$ 470 mil (medido R$ 470.580, ANTES da remocao do codfilial e do TRUNC - reconferir) - QTD_NOTAS ~ 318 - TICKET_MEDIO_NOTA ~ R$ 1.479 - FATURAMENTO_ITENS_DA_NOTA ~ R$ 439 mil - DIF_CABECALHO_PCT ~ 6,8% - CLIENTES_COM_NF_VENDA ~ 114. Sanidade: DIF_CABECALHO_PCT tem de cair entre ~5% e ~9% e ser POSITIVA. Negativa -> item cancelado entrando ou VLTOTAL zerado de nota cancelada. Acima de 10% -> nota nao-venda somando no cabecalho, ou VLTOTAL trocada por VLTOTGER. ~0% -> o EXISTS ou o filtro de cancelamento nao pegou. IDENTIDADES DE CONJUNTO (obrigatorias): VALOR = IND-03.faturamento; TICKET_MEDIO_NOTA = IND-03.ticket_medio_nota; QTD_NOTAS = IND-07.QT_NOTAS; CLIENTES_COM_NF_VENDA = IND-07.VALOR; FATURAMENTO_ITENS_DA_NOTA = IND-09.venda_itens.

### Observacoes

STATUS a_validar POR DECISAO DA AUDITORIA DE COERENCIA, nao por defeito proprio: o SQL e solido, mas o valor de referencia R$ 470.580 foi medido com a regua ANTIGA (bind cru, codfilial='1'). Reexecutar apos as correcoes.

CORRECOES APLICADAS NA CONSOLIDACAO: (1) TRUNC nos binds - IND-01 era o UNICO dos 9 sem TRUNC, o que fazia sua janela divergir das demais se o bind trouxesse hora (pendencia P-IND03-C, ainda nao medida); (2) removido codfilial='1' - o indicador justificava o filtro dizendo que a filial 99 "poderia duplicar valores", afirmacao contraditoria com IND-03/05/06/07/08, que dizem que a 99 nao tem fato; o fato validado (codfilial='1' em todas as fatos) confirma que o filtro e no-op e que a justificativa estava errada; (3) auxiliares renomeados - CLIENTES_POSITIVADOS -> CLIENTES_COM_NF_VENDA, TICKET_MEDIO -> TICKET_MEDIO_NOTA, FATURAMENTO_ITENS -> FATURAMENTO_ITENS_DA_NOTA, para que ninguem compare cegamente com o card ao lado; (4) a auxiliar de itens passa a ser a MESMA regua consumida por IND-02 e IND-09 (recorte pela NOTA via DTSAIDA + amarracao a PCNFSAID, nao por PCMOV.DTMOV, que e NULLABLE=Y).

POR QUE A REGUA UNICA IMPORTA: antes da consolidacao o painel calculava "clientes que compraram" de tres formas (IND-01 com EXISTS+filial, IND-03 com EXISTS sem filial, IND-07 com NF pura), e as tres declaravam esperar 114 - matematicamente no maximo uma podia estar certa. Agora as seis fontes (IND-01/03/05/06/07/08) usam o MESMO conjunto nf_venda, entao as identidades fecham POR CONSTRUCAO e nao por acidente da base.

PENDENCIA BLOQUEANTE P-IND01-D: medir quanto o EXISTS CODOPER='S' remove. SELECT COUNT(*) nf_todas, ROUND(SUM(n.vltotal),2) vl_todas, COUNT(CASE WHEN EXISTS (SELECT 1 FROM pcmov m WHERE m.numtransvenda=n.numtransvenda AND m.codoper='S' AND m.dtcancel IS NULL) THEN 1 END) nf_venda FROM pcnfsaid n WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(:dt_ini) AND n.dtsaida < TRUNC(:dt_fim)+1; Se nf_venda=318 e vl_todas=470.580, o EXISTS nao tira nada, o 114 de referencia continua valido para os seis indicadores e todos sobem para validado.

VALIDACAO ESTRUTURAL: 12/12 referencias fisicas conferidas em Z:\\h4c-bi\\discovery\\output\\fase2_dicionario.csv. Grao conferido em fase6_pks.csv (PCNFSAID PK = NUMTRANSVENDA, coluna unica). Contraprova do metodo: PCMOV.PVENDA confirmado inexistente.

AVISO PARA O CARD DE MARGEM: use FATURAMENTO_ITENS_DA_NOTA como base, nunca VALOR. VALOR contra SUM(QT*CUSTOREAL) infla a margem em ~6,8 p.p. (daria ~38% em vez dos ~31,6% esperados).

### Pendencias

- **P-IND01-D (BLOQUEANTE - fecha o status de SEIS indicadores)** - medir quanto o EXISTS CODOPER='S' remove. Se nao remover nada, o 114 e os R$ 470.580 continuam validos e IND-01/03/05/06/07/08 sobem para validado. SQL no `obs` do IND-07.
- P-IND01-A (dominio de TIPOVENDA/ESPECIE) - confirmar se dentro das ~318 notas existe bonificacao, remessa ou entrega futura que nao deveria contar como receita. `SELECT n.tipovenda, n.especie, COUNT(*) qt_nf, ROUND(SUM(n.vltotal),2) vl FROM pcnfsaid n WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(:dt_ini) AND n.dtsaida < TRUNC(:dt_fim)+1 GROUP BY n.tipovenda, n.especie ORDER BY vl DESC;`
- P-IND01-B (nota mista S + SB) - se uma NF tem item de venda e item bonificado, o EXISTS aceita a nota inteira e o VLTOTAL carrega junto a bonificacao. Impacto presumido irrisorio (~8 linhas SB na base toda), mas nao medido.
- P-IND01-C (conciliacao do valor da nota) - confirmar que VLTOTAL e o total cheio e nao uma variante, comparando com VLTOTGER/VLTOTALNF/VLFRETE/VLOUTRAS e com PCCONSOLIDARECEITA.VLTOTALNOTA. Confirma de quebra a decomposicao dos 6,8%.
- P-IND01-E (devolucoes) - IND-01 e bruto e NAO desconta devolucao de cliente. Decidir com o dono se o painel quer um indicador separado de faturamento liquido - nao alterar o IND-01 por isso.
- P-IND01-F (decomposicao dos 6,8% no tooltip) - medir SUM(VLICMS+VLPIS+VLCOFINS+VLST+VLIPI) em PCCONSOLIDARECEITA contra SUM(VLFRETE) em PCNFSAID; a soma das duas deve reconstruir os ~R$ 31,6 mil.

---

## IND-02 - Itens vendidos

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** inteiro &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** item de venda -> 1 linha/periodo

### Definicao

Quantas unidades de produto sairam vendidas (faturadas) no periodo. E a soma da quantidade de cada item das vendas, na unidade de venda em que a distribuidora controla o estoque de cada produto (UN, CX, FD...). Nao entram itens cancelados, devolucoes de cliente, bonificacoes/brindes nem entradas de compra.

### Por que essa definicao

A pergunta do dono e de VOLUME FISICO ("quanto saiu do armazem"), e so SUM(QT) responde isso - por isso e o VALOR. As outras leituras viram auxiliares: numero de linhas de item (~1.272) mede esforco operacional de separacao/conferencia, e SKUs distintos (~238) mede amplitude do mix. Sobre a armadilha de embalagem: PCMOV.QT JA esta na unidade de venda e NAO deve ser multiplicado por QTUNIT. Duas provas independentes: (1) o dicionario separa as visoes - PCPRODUT.UNIDADE = 'Unidade de venda (controle do estoque)' e QTUNIT = 'Qtde unit.embalagem(Venda)', e a visao embalagem tem colunas proprias em PCMOV (QTVENDAEMB, QTEMBALAGEM, PVENDAEMBALAGEM); (2) prova aritmetica - SUM(QT*PUNIT) ~ R$ 439k concilia com a NF (R$ 470k) com gap de apenas 6,8%; se QT estivesse em embalagem e PUNIT por unidade, o desvio seria fator de 6x-24x, nao 6,8%. Logo QT e PUNIT estao na MESMA base. CONSOLIDACAO: o recorte temporal deixou de ser PCMOV.DTMOV e passou a ser a NOTA (mesma CTE nf_venda de IND-01/09) - ver obs.

### Alternativas descartadas

- Numero de linhas de item (~1.272) como VALOR - descartada: responde 'quantos itens foram bipados', nao 'quantas unidades'. Vira auxiliar.
- SKUs distintos (~238) como VALOR - descartada: mede amplitude do mix, nao volume, e ja e o objeto do VEN-06. Vira auxiliar.
- SUM(QT * PCPRODUT.QTUNIT) para converter tudo em pecas - descartada: QTUNIT e cadastral e mutavel, entao reescreveria o passado a cada alteracao de cadastro; pode estar nulo/zerado; e quebraria a coerencia com faturamento/margem/CMV/giro, que usam QT x PUNIT na unidade de venda. Fica como KPI complementar futuro, se o dono pedir 'pecas'.
- Unidades liquidas de devolucao (SUM S - SUM ED) - descartada: a missao pede excluir devolucoes, nao compensa-las; devolucao ja tem KPI proprio (VEN-08); e 'ED = devolucao de cliente' ainda e hipotese pendente (P-01).
- PCDTPROD.QTVENDA (agregado diario pronto) - descartada como fonte oficial: e agregado derivado e sem coluna de cancelamento visivel no dicionario. Excelente como fonte de CONFERENCIA cruzada.
- Recorte por PCMOV.DTMOV (era a regua ORIGINAL) - DESCARTADA na consolidacao: DTMOV e NULLABLE=Y e nao ha garantia de que DTMOV = DTSAIDA. Substituida pela regua da NOTA, que e a mesma de IND-01 e IND-09.

### Grao e fontes

1 linha por item de movimentacao de venda em PCMOV, restrito as notas de venda validas do periodo. O indicador agrega para 1 numero; drill natural: dia, produto, RCA, cliente.

- PCNFSAID - define a janela e o conjunto de notas de venda validas (regua canonica compartilhada com IND-01/09)
- PCMOV (fato, 12.243 linhas - QT, CODOPER, DTCANCEL, CODPROD, NUMTRANSVENDA)
- PCPRODUT (dimensao, PK CODPROD - UNIDADE, apenas para o diagnostico de mistura de unidades)

### Armadilhas

- Cancelados: DTCANCEL IS NULL - 24% das linhas 'S' sao canceladas; sem o filtro o indicador infla ~30%.
- Bonificacao/brinde: CODOPER='S' exclui SB (8 linhas). Unidade doada nao e unidade vendida.
- Devolucoes: CODOPER='S' exclui ED (253, devolucao de cliente) e SD (42) - excluir, nao compensar.
- Entradas de compra: CODOPER='S' exclui E (1.738) e demais E*, que tambem tem QT preenchida e dobrariam o numero.
- Confusao embalagem x unidade de venda (a armadilha central): usa QT puro, sem multiplicar por PCPRODUT.QTUNIT e sem usar QTVENDAEMB/QTEMBALAGEM/PVENDAEMBALAGEM, que estao em OUTRA base.
- Mistura de unidades entre SKUs: nao e eliminavel no numero, entao e EXPOSTA no auxiliar unidades_medida_distintas em vez de virar nota de rodape que ninguem le.
- DTMOV NULLABLE (a armadilha que motivou a correcao de conjunto): PCMOV.DTMOV e NULLABLE=Y. O SQL original recortava a janela por DTMOV, entao item de venda com DTMOV nula sumia em silencio do IND-02 e do IND-09 mas continuava contado pelo IND-01 (que recorta pela nota). Corrigido: a janela agora vem de PCNFSAID.DTSAIDA, imune a DTMOV nula e a divergencia DTMOV<>DTSAIDA na virada de mes.
- Fan-out no join: PCPRODUT.CODPROD e PK declarada (fase6_pks), entao o join casa no maximo 1 linha e nao duplica QT; LEFT JOIN garante que produto sem cadastro nao suma da contagem.
- Divisao por zero: NULLIF(COUNT(*),0) em qt_media_por_linha.
- Periodo vazio retornando NULL: NVL(...,0) garante VALOR sempre numerico - sem isso a variacao contra o periodo anterior quebra.
- Filial: filtro codfilial='1' REMOVIDO na consolidacao para igualar a regua do IND-09, que le a MESMA populacao de itens e nao filtrava. Filtro era no-op hoje; mante-lo em 2 dos 9 indicadores criava divergencia silenciosa no futuro.
- Dupla contagem: PCMOV ja e 1 linha por item, entao SUM direto - DISTINCT em QT seria erro grave (colapsaria quantidades iguais).

### SQL

```sql
WITH nf_venda AS (
    -- REGUA CANONICA DE "NOTA DE VENDA" (unificada pela auditoria de coerencia):
    -- NF nao cancelada + EXISTS de item de venda vivo. TRUNC nos binds. SEM codfilial.
    SELECT n.numtransvenda,
           n.codcli,
           NVL(n.vltotal, 0) AS vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.dtsaida  >= TRUNC(:dt_ini)
       AND n.dtsaida  <  TRUNC(:dt_fim) + 1
       AND EXISTS (SELECT 1
                     FROM pcmov m
                    WHERE m.numtransvenda = n.numtransvenda
                      AND m.codoper       = 'S'
                      AND m.dtcancel IS NULL)
)
-- IND-02 - Itens vendidos (unidades de venda)
-- QT esta na unidade de venda do produto (PCPRODUT.UNIDADE); NAO multiplicar por QTUNIT.
-- Agregado sem GROUP BY => sempre exatamente 1 linha, inclusive em janela vazia.
SELECT NVL(ROUND(SUM(m.qt), 2), 0)                       AS valor,
       COUNT(*)                                          AS linhas_item,
       COUNT(DISTINCT m.codprod)                         AS skus_distintos,
       COUNT(DISTINCT p.unidade)                         AS unidades_medida_distintas,
       NVL(ROUND(SUM(m.qt) / NULLIF(COUNT(*), 0), 2), 0) AS qt_media_por_linha
FROM   pcmov m
LEFT   JOIN pcprodut p ON p.codprod = m.codprod   -- PK CODPROD (fase6_pks) => 1:1, nao infla QT
WHERE  m.codoper   = 'S'        -- so venda: exclui SB (bonificacao), ED/SD (devolucao), E* (compras), SR
AND    m.dtcancel IS NULL       -- 24% das linhas 'S' sao canceladas
AND    m.numtransvenda IN (SELECT v.numtransvenda FROM nf_venda v)
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `linhas_item` | Numero de linhas de item vendidas (~1.272 em 30d). Mede esforco operacional de separacao/conferencia, nao volume. Tem de bater com IND-09.linhas_item (mesma regua). |
| `skus_distintos` | Produtos diferentes vendidos (~238 em 30d). Mede amplitude do mix. Tem de bater com IND-09.skus. |
| `unidades_medida_distintas` | Quantas unidades de medida diferentes (UN, CX, FD, KG...) a soma esta misturando. SEMAFORO: se vier > 1, o VALOR e 'unidades de venda' e nao 'pecas' - 1 CX com 12 dentro soma 1, igual a 1 UN. |
| `qt_media_por_linha` | Unidades por linha de item (~5,7). Se o VALOR sobe mas as linhas nao, o cliente comprou mais fundo por item. |

### Valor esperado e sanidade

~7.244 unidades em 30d (~240/dia), com ~1.272 linhas de item, ~238 SKUs e ~5,7 unidades por linha - MAS esses numeros foram medidos com a regua antiga (DTMOV + codfilial) e precisam ser reprocessados com a regua da nota. Espera-se desvio pequeno (unidades/decimos de %). Sanidade por desvio: se VALOR ~ 1.272, trocaram SUM(QT) por COUNT(*); se VALOR ~ 9.500 (+30%), o filtro DTCANCEL IS NULL caiu; se vier em dezenas de milhares, multiplicaram QT por QTUNIT/QTEMBALAGEM.

### Observacoes

REBAIXADO DE validado PARA a_validar NA CONSOLIDACAO - decisao deliberada, e a unica no lote que contraria um veredito individual. Motivo: a auditoria de coerencia apontou que IND-01.FATURAMENTO_ITENS e IND-09.venda_itens sao apresentados como o MESMO numero (~R$ 439 mil) mas eram calculados com reguas diferentes - IND-01 recorta os itens pela DATA DA NOTA e amarra a PCNFSAID; IND-02 e IND-09 recortavam por PCMOV.DTMOV, solto, sem amarracao. Como DTMOV e NULLABLE=Y (confirmado no dicionario), item com DTMOV nula entrava em IND-01 e sumia de IND-02/IND-09; e se DTMOV <> DTSAIDA (normal no Winthor na virada de mes), os numeros divergiam por deslocamento de janela. A recomendacao da auditoria foi explicita: adotar a regua da NOTA para os tres. Aplicada. Consequencia honesta: o valor de referencia 7.244 foi medido com DTMOV + codfilial, entao precisa ser reprocessado - dai o a_validar. O desvio esperado e pequeno; se for grande, o proprio desvio e a descoberta.

GANHO DE CONJUNTO: IND-02 e IND-09 agora leem literalmente a mesma populacao de itens (pcmov, codoper='S', dtcancel IS NULL, numtransvenda nas notas de venda da janela), entao linhas_item e skus batem por construcao, e nao por coincidencia do filtro ser no-op.

PENDENCIA QUE FECHA O a_validar (medir de uma vez, resolve IND-01/02/09 juntos): SELECT COUNT(*) itens_s, SUM(CASE WHEN m.dtmov IS NULL THEN 1 ELSE 0 END) sem_dtmov, SUM(CASE WHEN TRUNC(m.dtmov) <> TRUNC(n.dtsaida) THEN 1 ELSE 0 END) dtmov_difere, SUM(CASE WHEN n.dtcancel IS NOT NULL THEN 1 ELSE 0 END) item_vivo_de_nf_cancelada FROM pcmov m JOIN pcnfsaid n ON n.numtransvenda = m.numtransvenda WHERE m.codoper='S' AND m.dtcancel IS NULL; Se os tres contadores derem 0, as duas reguas eram equivalentes, os numeros medidos valem e IND-02/IND-09 sobem para validado.

RESSALVAS MANTIDAS: (1) formato='inteiro' assume QT sem casas decimais (7.244 medido e inteiro e produtos de higiene sao discretos) - o SQL devolve ROUND(...,2) para nao perder o valor real caso exista fracionario; confirmar com P-IND02-B. (2) 'Unidades' aqui = unidade de venda do ERP, nao pecas - o auxiliar unidades_medida_distintas torna isso visivel no tooltip. (3) Nao duplica o VEN-06 (Mix por produto, grao produto x periodo): IND-02 e o numero-manchete do periodo.

VALIDACAO ESTRUTURAL: colunas conferidas por script contra fase2_dicionario.csv; a checagem negativa reproduziu os fatos conhecidos (PCMOV.PVENDA e PCCLIENT.DTULTCOMPRA nao existem), o que valida o metodo de leitura do dicionario.

### Pendencias

- **P-IND02-REGUA (BLOQUEANTE - fecha IND-02 e IND-09 juntos)** - medir itens 'S' com DTMOV nula, com TRUNC(DTMOV) <> TRUNC(DTSAIDA) e itens vivos de NF cancelada. Se os tres derem 0, as duas reguas eram equivalentes e os valores medidos valem. SQL no `obs`.
- P-IND02-A (quantifica a mistura de unidades) - `SELECT NVL(p.unidade,'(sem cadastro)') unidade, COUNT(DISTINCT m.codprod) skus, SUM(m.qt) qt FROM pcmov m LEFT JOIN pcprodut p ON p.codprod=m.codprod WHERE m.codoper='S' AND m.dtcancel IS NULL GROUP BY NVL(p.unidade,'(sem cadastro)') ORDER BY qt DESC;` - se der 1 so unidade, o rotulo do card pode ser 'unidades' puro; se der varias, rotular 'unidades de venda'.
- P-IND02-B (define formato inteiro vs decimal) - `SELECT COUNT(*) linhas_fracionarias, MIN(m.qt) menor_qt FROM pcmov m WHERE m.codoper='S' AND m.dtcancel IS NULL AND m.qt <> TRUNC(m.qt);` - se houver produto vendido por peso/volume, QT e fracionaria e o formato deve virar 'decimal'.
- P-IND02-C (SR = 898 linhas, 3o maior CODOPER, nao decodificado) - se for alguma saida de venda, o indicador muda. Fecha a P-01 do catalogo via PCCFO e confirma que 'S' e a unica operacao de venda faturada.
- P-IND02-D (conferencia cruzada) - comparar SUM(m.qt) contra SUM(d.qtvenda) de PCDTPROD no mesmo periodo. Divergencia grande indica que PCDTPROD inclui cancelados ou que 'S' nao cobre toda a venda.

---

## IND-03 - Ticket medio por cliente

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** moeda &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** cliente -> 1 linha/periodo

### Definicao

Quanto cada cliente que comprou no periodo deixou, em media, na distribuidora. E o faturamento total do periodo dividido pelo numero de clientes DIFERENTES que compraram - nao pelo numero de notas. Um cliente que fez 5 notas conta como 1 cliente. Diferente do "ticket medio por nota" (IND-01.ticket_medio_nota / VEN-03), que mede o tamanho da compra; este mede o valor do cliente no periodo, e vale por definicao: ticket por nota x notas por cliente (frequencia). Se sobe, e porque o cliente comprou mais caro OU comprou mais vezes - os dois auxiliares mostram qual dos dois.

### Por que essa definicao

Oficial: cliente = PCNFSAID.CODCLI (o PAGADOR da nota), faturamento = SUM(PCNFSAID.VLTOTAL) das NFs de venda validas. Tres razoes. (1) CODCLI e quem e faturado e quem gera o titulo a receber - e a unidade de decisao comercial do RCA e o mesmo conceito usado na positivacao (IND-07), entao "faturamento / positivacao" fecha e o BI nao fica com duas nocoes de cliente. (2) E NOT NULL e esta na propria PCNFSAID: sem join, sem fallback, sem linha perdida. A alternativa matriz (PCCLIENT.CODCLIPRINC) e NULLABLE e sua taxa de preenchimento NAO foi medida - adota-la como oficial seria fazer o numero depender de campo cadastral possivelmente vazio. (3) Numerador e denominador saem do MESMO conjunto de linhas (CTE nf_venda), entao e impossivel o ticket incluir faturamento de cliente ausente do denominador. Faturamento por VLTOTAL (e nao por SUM(qt*punit)) para bater com o IND-01 e com o caixa real. Confere: 470.580 / 114 = R$ 4.127,89.

### Alternativas descartadas

- Cliente-matriz PCCLIENT.CODCLIPRINC (NULLABLE) - descartada como oficial: exigiria join + NVL(codcliprinc, codcli), e com preenchimento nao medido o ticket ficaria refem de um campo cadastral talvez vazio. Alem disso responde outra pergunta ('quanto vale o GRUPO ECONOMICO'), que so reduz o denominador e infla o ticket. Vira IND futuro apos P-IND03-A.
- Rede via PCCLIENT.CODREDE / PCREDECLIENTE - mesma logica da matriz; agrupamento comercial, nao pagador.
- Raiz do CNPJ (8 primeiros digitos de CGCENT) para unificar filiais do mesmo grupo - heuristica de texto, quebra com CPF e com CGCENT nulo/mal digitado, e resolveria por conta propria algo que o ERP ja modela em CODCLIPRINC. Nao se inventa chave de negocio com SUBSTR quando existe campo cadastral.
- PCNFSAID.CODCLIRECEBEDOR ou CODCLINF - sao o recebedor da entrega e o cliente da NF; em venda com entrega em endereco de terceiro medem logistica, nao quem paga.
- Faturamento via PCMOV SUM(qt*punit) ~ R$ 439 mil -> daria R$ 3.851 por cliente. Descartado: ignora impostos/frete (~6,8%), nao e o que o cliente deve, e brigaria com o IND-01.
- Denominador via PCPEDC (110 clientes) -> R$ 4.278. Descartado: pedido != faturamento; pedido faturado parcialmente ou em duas notas descasa numerador e denominador.
- Denominador = carteira cadastrada (235) -> R$ 2.002. Descartado: isso e 'faturamento por cliente cadastrado', mede cobertura, nao ticket. Quem quer essa leitura ja tem o IND-08.
- MEDIAN(vl_cliente) como VALOR oficial - mais robusta a outliers, mas nao e aditiva (nao reconstroi o faturamento) e quebra a identidade ticket_nota x frequencia. Mantida como auxiliar, que e onde ela ajuda sem enganar.

### Grao e fontes

Uma linha por periodo (agregado da janela, sem quebra). Unidade de contagem = cliente pagador (PCNFSAID.CODCLI). Grao da fonte = 1 linha por NF (PK NUMTRANSVENDA). Binds apenas :dt_ini/:dt_fim - o mesmo SQL roda para o periodo anterior.

- PCNFSAID (cabecalho da NF: VLTOTAL, CODCLI, DTSAIDA, DTCANCEL, NUMTRANSVENDA)
- PCMOV (so no EXISTS, para restringir a CODOPER='S' = venda e excluir itens cancelados)

### Armadilhas

- NF cancelada inflando o DENOMINADOR (a pior aqui): as 210 NFs canceladas tem VLTOTAL zerado - sem DTCANCEL IS NULL elas nao somariam faturamento nenhum, mas trariam seus clientes para o COUNT(DISTINCT codcli). O ticket cairia sem que nada tivesse acontecido no negocio. Armadilha assimetrica: so estraga o denominador, por isso passa despercebida.
- Fan-out do JOIN com PCMOV: JOIN em vez de EXISTS multiplicaria VLTOTAL pelo numero de itens da nota (~4 itens/NF -> faturamento ~4x maior). EXISTS e semi-join: filtra sem duplicar. (fase6_pks confirma que PCMOV nao tem PK declarada, o que reforca a escolha.)
- Itens cancelados no EXISTS: 24% das linhas CODOPER='S' sao canceladas. Sem m.dtcancel IS NULL, uma NF com todos os itens cancelados ainda 'existiria' como venda e seu cliente positivaria.
- Dupla contagem do cliente: COUNT(DISTINCT codcli) via CTE por_cliente - cliente com 5 notas conta 1 vez. Contar notas no denominador daria o ticket por nota, que e outro indicador.
- Contar nota por NUMNOTA: NUMNOTA e NULLABLE=Y e repete entre series/filiais - COUNT(DISTINCT numnota) descartaria nulos e fundiria notas homonimas. Usado NUMTRANSVENDA (PK, NOT NULL).
- Hora em DTSAIDA: BETWEEN :dt_ini AND :dt_fim perderia as notas do ultimo dia emitidas apos 00:00:00. Usado >= TRUNC(:dt_ini) AND < TRUNC(:dt_fim)+1.
- Indice em DTSAIDA: o TRUNC esta aplicado ao BIND, nunca a coluna - a coluna fica 'nua' e o indice continua utilizavel.
- Notas que nao sao venda: PCNFSAID tambem guarda remessa, devolucao a fornecedor e transferencia - entrariam no faturamento E criariam 'clientes' que nao compraram. Restringido por EXISTS CODOPER='S'.
- Divisao por zero: NULLIF nos dois divisores. Periodo sem venda retorna 1 linha com VALOR nulo (honesto), nao erro.
- VLTOTAL nulo (NULLABLE=Y): sem NVL, um cliente cujas notas tivessem VLTOTAL nulo entraria no denominador com SUM nulo, puxando o ticket para baixo.
- Numerador e denominador de fontes diferentes: ambos saem da mesma CTE nf_venda. Somar VLTOTAL de PCNFSAID e contar cliente de PCMOV (ou de PCPEDC) mistura conjuntos e da um ticket que nao fecha com nenhuma das duas tabelas.
- CONTRATO EM JANELA VAZIA: e o unico do lote que devolve VALOR = NULL em vez de 0 (por_cliente devolve 0 linhas e o agregado externo devolve 1 linha com NULL). E deliberado e defensavel - media de zero clientes nao e zero -, mas o front precisa saber: a regra do projeto e NULL para razoes/medias (IND-03, IND-09) e 0 para somas/contagens (IND-01, IND-02, IND-04).

### SQL

```sql
WITH nf_venda AS (
    -- REGUA CANONICA DE "NOTA DE VENDA" (unificada pela auditoria de coerencia):
    -- NF nao cancelada + EXISTS de item de venda vivo. TRUNC nos binds. SEM codfilial.
    SELECT n.numtransvenda,
           n.codcli,
           NVL(n.vltotal, 0) AS vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.dtsaida  >= TRUNC(:dt_ini)
       AND n.dtsaida  <  TRUNC(:dt_fim) + 1
       AND EXISTS (SELECT 1
                     FROM pcmov m
                    WHERE m.numtransvenda = n.numtransvenda
                      AND m.codoper       = 'S'
                      AND m.dtcancel IS NULL)
),
por_cliente AS (
    -- 1 linha por cliente pagador: colapsa as N notas do cliente em 1 (evita dupla contagem)
    SELECT v.codcli,
           SUM(v.vltotal)                  AS vl_cliente,
           COUNT(DISTINCT v.numtransvenda) AS qt_notas_cliente
    FROM   nf_venda v
    GROUP  BY v.codcli
)
SELECT ROUND(SUM(p.vl_cliente) / NULLIF(COUNT(p.codcli), 0), 2)         AS valor,
       COUNT(p.codcli)                                                  AS clientes_distintos,
       ROUND(SUM(p.qt_notas_cliente) / NULLIF(COUNT(p.codcli), 0), 2)   AS notas_por_cliente,
       ROUND(SUM(p.vl_cliente), 2)                                      AS faturamento,
       SUM(p.qt_notas_cliente)                                          AS notas,
       ROUND(SUM(p.vl_cliente) / NULLIF(SUM(p.qt_notas_cliente), 0), 2) AS ticket_medio_nota,
       ROUND(MEDIAN(p.vl_cliente), 2)                                   AS mediana_por_cliente
FROM   por_cliente p
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `clientes_distintos` | Clientes pagadores diferentes que compraram no periodo (~114). E o denominador. Com a regua unificada, tem de ser IDENTICO a IND-07.VALOR e a IND-01.CLIENTES_COM_NF_VENDA. |
| `notas_por_cliente` | Frequencia de compra: notas / clientes distintos (~2,79 em 30d). Junto com ticket_medio_nota explica o VALOR: ticket_nota x notas_por_cliente = ticket por cliente. |
| `faturamento` | Numerador: soma de VLTOTAL das NFs de venda validas (~R$ 470.580 em 30d). Exposto para o dono auditar a conta de cabeca. Tem de ser IDENTICO a IND-01.VALOR. |
| `notas` | NFs de venda validas no periodo (~318). Tem de bater com IND-01.QTD_NOTAS e IND-07.QT_NOTAS. |
| `ticket_medio_nota` | Ponte de consistencia com IND-01.ticket_medio_nota e com o VEN-03 (R$ 1.479). Se nao bater, os indicadores estao usando conjuntos de notas diferentes - e o teste de regressao embutido do painel. |
| `mediana_por_cliente` | Mediana do valor gasto por cliente. Deve ficar BEM abaixo do VALOR - poucos clientes grandes puxam a media. Se media e mediana forem parecidas, desconfie (carteira uniforme demais para atacado). Impede o dono de ler R$ 4.128 como 'o cliente tipico'. |

### Valor esperado e sanidade

~R$ 4.128 em 30d (470.580 / 114 = R$ 4.127,89). Auxiliares: clientes_distintos ~ 114, notas ~ 318, notas_por_cliente ~ 2,79, ticket_medio_nota ~ R$ 1.479,81, mediana_por_cliente bem abaixo de R$ 4.128. Testes de sanidade: (a) ticket_medio_nota x notas_por_cliente = valor (identidade exata: 1.479,81 x 2,79 = 4.127,89); (b) valor > ticket_medio_nota SEMPRE (senao os clientes comprariam menos de 1 nota); (c) clientes_distintos <= 235 (carteira cadastrada) - se passar, o filtro CODOPER='S' vazou. Faixa plausivel em 30d: R$ 3.000-6.000. Fora disso, suspeite do filtro de cancelamento antes de acreditar no numero.

### Observacoes

SQL APROVADO SEM CORRECAO nas duas auditorias que o olharam - internamente e um dos mais solidos do lote. O a_validar vem EXCLUSIVAMENTE da decisao de conjunto: com a regua unificada, IND-03.clientes_distintos, IND-01.CLIENTES_COM_NF_VENDA e IND-07.VALOR passam a ser o mesmo COUNT sobre o mesmo conjunto - mas o valor de referencia 114 foi medido SEM o EXISTS. Fechar P-IND01-D reprocessa o 114 e sobe IND-01/03/05/06/07/08 para validado de uma vez.

O QUE MUDOU NA CONSOLIDACAO: nada no calculo. A CTE nf_venda foi textualmente alinhada a canonica (mesma ordem de predicados dos demais); o SQL original ja usava EXISTS + TRUNC e ja nao filtrava filial, ou seja, IND-03 era o mais proximo da regua canonica e serviu de referencia para corrigir o IND-01.

IDENTIDADES QUE AGORA FECHAM POR CONSTRUCAO: IND-03.faturamento = IND-01.VALOR; IND-03.notas = IND-01.QTD_NOTAS = IND-07.QT_NOTAS; IND-03.clientes_distintos = IND-07.VALOR; IND-03.ticket_medio_nota = IND-01.TICKET_MEDIO_NOTA; e IND-03.valor x IND-07.valor = IND-01.valor (4.127,89 x 114 = R$ 470.579 ~ 470.580, a diferenca e so arredondamento). ANTES da consolidacao essas identidades fechavam por ACIDENTE - so porque os filtros divergentes (codfilial, EXISTS) eram no-op NESTA base; bastava abrir a 2a filial ou aparecer uma nota de remessa para o painel se contradizer silenciosamente.

PENDENCIA P-IND03-A (destrava o indicador de rede/matriz): SELECT COUNT(*) total, COUNT(codcliprinc) com_princ, COUNT(codrede) com_rede FROM pcclient; - se com_princ = 0, a discussao CODCLI vs matriz morre e IND-03 fica definitivo.

PENDENCIA P-IND03-C (mede o risco que motivou o TRUNC no IND-01): SELECT COUNT(*) total, SUM(CASE WHEN dtsaida = TRUNC(dtsaida) THEN 1 ELSE 0 END) sem_hora FROM pcnfsaid WHERE dtsaida >= TRUNC(SYSDATE)-30; - se sem_hora < total, o VEN-03 do catalogo esta perdendo notas do ultimo dia e precisa da mesma correcao.

VALIDACAO: 8/8 colunas conferidas em fase2_dicionario.csv; MEDIAN e agregado valido no Oracle 19c e convive com SUM/COUNT no mesmo bloco.

LEITURA PARA O DONO: com ~9 meses de base e apenas 235 clientes cadastrados / 114 ativos no mes, este numero e sensivel a UM cliente grande entrar ou sair no periodo - sempre olhar VALOR junto com clientes_distintos e mediana_por_cliente antes de comemorar ou se assustar com a variacao.

### Pendencias

- **P-IND01-D (BLOQUEANTE)** - o mesmo do IND-01: reprocessar o 114 com o EXISTS.
- P-IND03-A (destrava o indicador de rede/matriz) - `SELECT COUNT(*) total, COUNT(codcliprinc) com_princ, COUNT(codrede) com_rede, COUNT(DISTINCT NVL(codcliprinc, codcli)) matrizes_distintas FROM pcclient;` - se com_princ = 0, a discussao CODCLI vs matriz morre e IND-03 fica definitivo.
- P-IND03-B (bonificacao inflando o ticket) - verificar TIPOVENDA e CODOPER='SB'. Impacto hoje presumido baixo (8 linhas).
- P-IND03-C (DTSAIDA tem componente de hora?) - `SELECT COUNT(*) total, SUM(CASE WHEN dtsaida = TRUNC(dtsaida) THEN 1 ELSE 0 END) sem_hora FROM pcnfsaid WHERE dtsaida >= TRUNC(SYSDATE)-30;` - se sem_hora < total, o VEN-03 do catalogo esta perdendo notas do ultimo dia e precisa da mesma correcao de TRUNC aplicada ao IND-01.
- P-IND03-D (quantificar a armadilha do denominador) - numero de clientes que entrariam no denominador so por nota cancelada. Confirma o tamanho do erro que o filtro evita.

---

## IND-04 - Clientes cadastrados

**Status:** `validado` &nbsp;|&nbsp; **Formato:** inteiro &nbsp;|&nbsp; **Depende do periodo:** **nao (snapshot)** &nbsp;|&nbsp; **Grao:** cliente (snapshot de hoje)

### Definicao

Tamanho da base de clientes da distribuidora: quantos clientes existem hoje na ficha cadastral, contando apenas os que nao foram excluidos. Cliente bloqueado CONTINUA contando - ele e seu cliente, apenas esta com as vendas travadas neste momento (bloqueio e reversivel, tem ate data de desbloqueio). Cliente excluido NAO conta - a exclusao e a baixa definitiva do cadastro no ERP. E uma foto do cadastro de hoje, nao um numero do mes.

### Por que essa definicao

Escolhida "base viva = DTEXCLUSAO IS NULL, sem filtrar bloqueio" por quatro razoes. (1) SEMANTICA: o indicador se chama "clientes CADASTRADOS", nao "clientes liberados para vender". Bloqueio e estado de credito/comercial, reversivel (existem DTBLOQ e DTDESBLOQUEIO no cadastro); exclusao e o delete logico do Winthor. Se os bloqueados saissem, o dono veria a base ENCOLHER porque um cliente atrasou uma duplicata e CRESCER de novo quando ele pagou - um KPI de tamanho de base nao pode oscilar com a operacao de cobranca. (2) ROBUSTEZ: DTEXCLUSAO IS NULL e teste de DATE, estrutural e sem ambiguidade. Os flags de bloqueio sao VARCHAR2(1) SEM dominio documentado - o dicionario-dados.md registra a pendencia P-44 em aberto sobre o dominio de PCCLIENT.BLOQUEIO, e BLOQUEIODEFINITIVO nem rotulo tem. Pendurar o numero de manchete num dominio nao confirmado e fragil; por isso os bloqueios entram como auxiliares, onde um dominio errado e visivel e barato. (3) SNAPSHOT e nao acumulado ate :dt_fim, porque PCCLIENT NAO TEM HISTORICO/SCD: DTEXCLUSAO e os flags refletem so o estado de HOJE. Filtrar DTCADASTRO <= :dt_fim e aplicar o estado atual produziria um numero frankenstein - um cliente cadastrado em 2024 e excluido semana passada sumiria da contagem "de dezembro/2025", quando naquela data ele existia. Pior: DTCADASTRO e NULLABLE, entao a regra descartaria em silencio todo legado migrado sem data. (4) COERENCIA: o auxiliar carteira_apta foi acrescentado na consolidacao para ser a PONTE explicita com o denominador do IND-08 - ver obs.

### Alternativas descartadas

- COUNT(*) cru de PCCLIENT = 235. DESCARTADA: inclui clientes com DTEXCLUSAO preenchida, ou seja, baixados do cadastro. Fica exposta como auxiliar total_bruto_cadastro so para conferencia.
- Base viva MENOS bloqueados (regua de 'carteira ativa' do VEN-05). DESCARTADA como VALOR: mistura estado de credito com tamanho de base - o numero subiria e desceria conforme a cobranca bloqueia/desbloqueia, e ainda depende do dominio nao confirmado (P-44/P-01). Entregue como base_comercializavel.
- Base viva MENOS bloqueio definitivo. DESCARTADA como VALOR, e e a alternativa mais defensavel das tres: bloqueio definitivo e de fato irreversivel. Nao virou oficial porque BLOQUEIODEFINITIVO nao tem rotulo nem descricao no dicionario (dominio 100% presumido) e porque um cliente definitivamente bloqueado ainda ESTA cadastrado. Exposta como carteira_apta (que e o denominador do IND-08); se o dono preferir esta regua, e trocar o VALOR por ela (P-02).
- Acumulado ate :dt_fim via DTCADASTRO <= :dt_fim. DESCARTADA: sem tabela de historico, aplicaria o estado de exclusao/bloqueio de HOJE a uma janela do passado, e DTCADASTRO NULLABLE derrubaria os legados migrados. E um ponto-no-tempo falso - pior que assumir o snapshot honestamente.
- COUNT(DISTINCT CGCENT) para deduplicar CNPJ/CPF repetido. DESCARTADA: muda o grao de 'cadastro' para 'entidade juridica', CGCENT e NULLABLE e o Winthor ja tem CODCLIPRINC para hierarquia. Vira pendencia P-04 em vez de decisao silenciosa.

### Grao e fontes

1 linha por cliente (PK PCCLIENT.CODCLI, confirmada em fase6_pks.csv como PK de coluna unica). O indicador retorna 1 linha agregada, snapshot do cadastro na data da consulta.

- PCCLIENT (235 linhas, dimensao, PK CODCLI)

### Armadilhas

- COUNT(*) cru de PCCLIENT (235) conta clientes EXCLUIDOS: DTEXCLUSAO e o delete logico do Winthor. O SQL isola os excluidos no auxiliar e o VALOR usa DTEXCLUSAO IS NULL. Conferencia embutida: valor + excluidos = total_bruto_cadastro = 235.
- Confundir bloqueio com exclusao e derrubar bloqueados do VALOR: faria a base encolher/crescer ao sabor da cobranca. Bloqueio e reversivel (DTBLOQ/DTDESBLOQUEIO existem) e foi isolado em auxiliares.
- Ponto-no-tempo falso: PCCLIENT nao tem historico/SCD - DTEXCLUSAO e os flags sao o estado de HOJE. Filtrar DTCADASTRO <= :dt_fim misturaria passado (cadastro) com presente (exclusao/bloqueio) e apagaria do passado quem foi excluido depois. Por isso o VALOR e snapshot declarado.
- DTCADASTRO e NULLABLE: qualquer regra 'DTCADASTRO <= :dt_fim' descartaria em silencio os legados migrados sem data. O auxiliar sem_dtcadastro expoe o tamanho desse buraco.
- DTCADASTRO e 'Data e Hora': BETWEEN perderia os cadastros do proprio dia :dt_fim feitos apos 00:00:00. Uso do intervalo semiaberto.
- Flags nulos: NVL(flag,'N') evita que um NULL escape tanto do teste = 'S' quanto do <> 'S' (em SQL, NULL <> 'S' e UNKNOWN, nao TRUE) - sem isso, carteira_apta e base_comercializavel perderiam todo cliente com flag nulo. Erro classico.
- Dupla contagem: PK de coluna unica CODCLI garante 1 linha/cliente; ainda assim uso COUNT(DISTINCT c.codcli) para documentar o grao e blindar contra futura view/join.
- Filial 99 consolidadora: PCCLIENT NAO tem CODFILIAL (verificado no dicionario) - cadastro e global, entao nao ha duplicacao por filial nem filtro a aplicar. Filtrar por filial neste indicador seria erro.
- Divisao por zero em pct_bloqueados: protegida com NULLIF e NVL(...,0), na escala 0-100.
- Retorno vazio: agregacao sem GROUP BY e sem WHERE devolve sempre exatamente 1 linha (zeros se a tabela estiver vazia) - o cartao nunca quebra por ausencia de linha.
- Nao confundir com IND-07/positivacao: aquele e 'clientes que compraram' (114 em 30d). Aqui nao ha fato de venda envolvido, portanto nenhum filtro de cancelamento se aplica - este indicador nao toca PCMOV/PCNFSAID/PCPEDC.
- RISCO DE APRESENTACAO (nao e defeito do SQL): o backend PRECISA honrar depende_do_periodo=false. O VALOR nao referencia os binds, entao rodar o mesmo SQL na janela anterior devolve o MESMO numero e a variacao sera sempre 0,0% - o dono leria 'base estagnada'. Suprimir a seta de variacao no card.

### SQL

```sql
/* IND-04 - Clientes cadastrados (base viva do cadastro)
   Grao: 1 linha por cliente (PK PCCLIENT.CODCLI).
   VALOR e SNAPSHOT: nao depende de :dt_ini/:dt_fim (o backend deve suprimir
   a comparacao com o periodo anterior - depende_do_periodo = false).
   Os binds alimentam APENAS o auxiliar cadastrados_no_periodo.
   PCCLIENT nao tem CODFILIAL (cadastro global) -> sem risco de filial 99.
   Sem WHERE: a agregacao condicional da tudo na mesma passada e garante
   exatamente 1 linha de retorno mesmo com tabela vazia. */
SELECT
    /* ---------- VALOR OFICIAL: base viva = nao excluida logicamente ---------- */
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                        THEN c.codcli END)                                AS valor,

    /* ---------- movimento do periodo (unico auxiliar sensivel aos binds) ----------
       DTCADASTRO e 'Data e Hora de Cadastro': tem componente de hora.
       BETWEEN :dt_ini AND :dt_fim perderia os cadastros feitos em :dt_fim
       apos 00:00:00 -> intervalo semiaberto [dt_ini, dt_fim+1). */
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND c.dtcadastro >= TRUNC(:dt_ini)
                         AND c.dtcadastro <  TRUNC(:dt_fim) + 1
                        THEN c.codcli END)                                AS cadastrados_no_periodo,

    /* ---------- PONTE COM O IND-08 (acrescentada na consolidacao) ----------
       CARTEIRA APTA CANONICA do projeto = viva E sem bloqueio definitivo.
       E o MESMO criterio do denominador do IND-08 e do IND-06.carteira_apta.
       Exposto aqui para o dono conseguir refazer a conta 114 / N = % positivados. */
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND NVL(c.bloqueiodefinitivo,'N') <> 'S'
                        THEN c.codcli END)                                AS carteira_apta,

    /* ---------- composicao do snapshot ---------- */
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND NVL(c.bloqueio,'N') = 'S'
                        THEN c.codcli END)                                AS bloqueados,
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND NVL(c.bloqueiodefinitivo,'N') = 'S'
                        THEN c.codcli END)                                AS bloqueados_definitivo,
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND NVL(c.bloqueioinatividade,'N') = 'S'
                        THEN c.codcli END)                                AS bloqueados_inatividade,
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NOT NULL
                        THEN c.codcli END)                                AS excluidos,
    COUNT(*)                                                              AS total_bruto_cadastro,

    /* base efetivamente comercializavel hoje (tira bloqueio corrente E definitivo).
       NAO e o VALOR nem o denominador do IND-08 - e a leitura operacional
       "posso vender para quantos hoje". */
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND NVL(c.bloqueio,'N')           <> 'S'
                         AND NVL(c.bloqueiodefinitivo,'N') <> 'S'
                        THEN c.codcli END)                                AS base_comercializavel,

    /* % de bloqueados sobre a base viva - escala 0..100, divisao protegida */
    NVL(ROUND(100 * COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                                         AND NVL(c.bloqueio,'N') = 'S'
                                        THEN c.codcli END)
                  / NULLIF(COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                                               THEN c.codcli END), 0), 2), 0)
                                                                          AS pct_bloqueados,

    /* diagnostico: clientes vivos SEM data de cadastro (legado migrado).
       Se > 0, comprova por que o VALOR nao pode usar DTCADASTRO <= :dt_fim. */
    COUNT(DISTINCT CASE WHEN c.dtexclusao IS NULL
                         AND c.dtcadastro IS NULL
                        THEN c.codcli END)                                AS sem_dtcadastro
FROM pcclient c
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `cadastrados_no_periodo` | Clientes novos com DTCADASTRO dentro de [:dt_ini, :dt_fim] - unico numero sensivel ao periodo. E a leitura de PROSPECCAO (cadastro), que NAO e a mesma coisa que IND-05 (primeira COMPRA). Cliente cadastrado que nunca comprou entra aqui e nao entra no IND-05. |
| `carteira_apta` | PONTE COM O IND-08 (acrescentada na consolidacao): base viva E sem bloqueio definitivo. E exatamente o denominador do IND-08 (a menos da guarda de anacronismo) e o mesmo criterio do IND-06.carteira_apta. Permite ao dono refazer a conta do % positivados na calculadora. |
| `bloqueados` | Clientes vivos com BLOQUEIO='S' - bloqueio corrente/reversivel. Contam no VALOR e no denominador do IND-08, mas nao se pode vender para eles agora. |
| `bloqueados_definitivo` | Clientes vivos com BLOQUEIODEFINITIVO='S' - bloqueio irreversivel. Ainda estao no cadastro (contam no VALOR), mas estao comercialmente mortos e por isso saem da carteira_apta. |
| `bloqueados_inatividade` | Clientes vivos com BLOQUEIOINATIVIDADE='S' - bloqueio automatico por nao comprar ha X dias (parametro 1402 da rotina 132). E sintoma de churn, nao de credito, e e DERIVADO da ultima compra - por isso nunca entra em regra de carteira (seria circular). |
| `excluidos` | Clientes com DTEXCLUSAO preenchida - baixados do cadastro. E exatamente o que o COUNT(*) cru de 235 inflava indevidamente. |
| `total_bruto_cadastro` | COUNT(*) cru de PCCLIENT (= 235). Conferencia embutida: valor + excluidos tem de fechar exatamente com este numero. |
| `base_comercializavel` | Base viva menos bloqueio corrente e definitivo - para quantos clientes da para faturar hoje. Igual a IND-06.base_comercializavel. |
| `pct_bloqueados` | Percentual da base viva que esta bloqueada (0-100). Termometro de saude de credito/cobranca. |
| `sem_dtcadastro` | Clientes vivos sem DTCADASTRO (legado migrado). Se > 0, cadastrados_no_periodo nunca somara a base inteira - e prova que a versao acumulada por DTCADASTRO seria furada. |

### Valor esperado e sanidade

VALOR (snapshot, independe da janela): esperado entre ~200 e 235 - total_bruto_cadastro e exatamente 235 (fase1_inventario.csv), logo valor = 235 - excluidos. Conferencia obrigatoria: valor + excluidos = 235. Coerencia de ordem de grandeza: a positivacao de 30d e ~114 clientes, logo o VALOR tem de ser confortavelmente maior que 114; se vier <= 114, a regra esta cortando demais. carteira_apta: entre 114 e o VALOR, e tem de bater com IND-06.carteira_apta e com IND-08.qt_carteira_base. cadastrados_no_periodo em 30d: esperado baixo, ~0 a 15. bloqueados: tipicamente 5-20% da base viva. base_comercializavel entre a positivacao (114) e o VALOR. Se bloqueados/bloqueados_definitivo vierem 0 em TODAS as linhas, suspeitar de dominio diferente de 'S'/'N' (P-01) e nao concluir que ninguem esta bloqueado.

### Observacoes

APROVADO SEM CORRECAO na auditoria individual - resistiu a todos os ataques: PCCLIENT.CODFILIAL de fato NAO EXISTE (a afirmacao do indicador e verdadeira, nao presuncao); multiplos COUNT(DISTINCT CASE...) no mesmo bloco sao validos no Oracle (a restricao de 'um so DISTINCT por query' e de outro SGBD); NVL(flag,'N') aplicado nos DOIS sentidos; 11/11 colunas conferidas em fase2_dicionario.csv; conferencia embutida valor + excluidos = 235 bate com fase1_inventario.csv.

UNICA MUDANCA DA CONSOLIDACAO (nao altera o VALOR, por isso o status continua validado): acrescentado o auxiliar carteira_apta. Motivo: a auditoria de coerencia apontou que o painel exibiria 'Clientes positivados = 114', 'Clientes cadastrados = X' e '% positivados = Y%', e o dono que fizesse 114/X na calculadora NAO obteria Y - porque o IND-08 usa um denominador (viva menos bloqueio definitivo) que nao era exibido em card nenhum. carteira_apta e exatamente esse denominador, agora visivel. A ponte do tooltip fica: 'cadastro bruto 235 -> menos excluidos -> VALOR (base viva) -> menos bloqueio definitivo -> carteira_apta N -> positivados 114 -> N% (IND-08)'.

TRES REGUAS DE CARTEIRA CONVIVEM DE PROPOSITO, e agora estao reconciliadas: VALOR (viva, inclui bloqueio definitivo) = tamanho da base; carteira_apta (viva - bloq. definitivo) = denominador do % positivados; base_comercializavel (viva - bloq. definitivo - bloq. credito) = para quem da para vender hoje. Nenhuma e errada; o defeito era nao existir ponte entre elas.

SNAPSHOT - depende_do_periodo = false: se o BI quiser um cartao com comparativo mes vs mes anterior, promova o auxiliar cadastrados_no_periodo a indicador proprio (e o DIM-04 do catalogo, prospeccao), mantendo IND-04 como cartao de foto sem seta. Os binds continuam referenciados no SQL, entao o backend pode passa-los sem erro de bind nao usado.

PENDENCIAS: P-01 (ALTA) dominio dos flags nao confirmado - SELECT NVL(bloqueio,'<NULL>') f, COUNT(*) FROM pcclient GROUP BY NVL(bloqueio,'<NULL>'); repetir para bloqueiodefinitivo/bloqueioinatividade. Se o dominio for 0/1 ou A/I, os auxiliares e o denominador do IND-08 saem errados (o VALOR permanece correto de qualquer forma - foi exatamente por isso que ele nao foi pendurado nos flags). P-02 (MEDIA) confirmar com o dono se 'cadastrados' inclui bloqueado definitivo (entregue que SIM). P-03 (MEDIA) quantificar excluidos e legados sem data. P-04 (BAIXA) duplicidade de CNPJ. P-05 (BAIXA) clientes vivos que nunca compraram.

DESCOBERTA COLATERAL relevante para o catalogo: o briefing afirma que DTULTCOMPRA nao existe - correto quanto ao NOME, mas PCCLIENT.DTULTCOMP (DATE, 'Data da Ultima Compra') e PCCLIENT.DTPRIMCOMPRA EXISTEM. O ORA-00904 foi erro de grafia, nao ausencia do conceito. O DIM-08 do catalogo esta marcado validado e depende de DTULTCOMP sem que o frescor do campo tenha sido medido - recomendacao das tres auditorias: rebaixar DIM-08 para a_validar.

LGPD: PCCLIENT contem dados pessoais (CGCENT/CPF, EMAIL, telefones) - este indicador expoe apenas contagens agregadas, sem PII, e assim deve permanecer.

### Pendencias

- P-01 (ALTA) - dominio dos flags de bloqueio nao confirmado (VARCHAR2(1) sem dominio documentado; P-44 em aberto no dicionario-dados.md; BLOQUEIODEFINITIVO nem rotulo tem). `SELECT NVL(bloqueio,'<NULL>') f, COUNT(*) FROM pcclient GROUP BY NVL(bloqueio,'<NULL>') ORDER BY 2 DESC;` repetir para bloqueiodefinitivo e bloqueioinatividade. Se aparecer valor fora de S/N, corrigir os CASEs dos auxiliares - **o VALOR permanece correto de qualquer forma**, foi por isso que ele nao foi pendurado nos flags. Afeta o denominador do IND-08.
- P-02 (MEDIA) - confirmar com o DONO a regua oficial: 'cadastrados' inclui bloqueado definitivo? Entregue que SIM. Se ele disser nao, trocar a expressao do VALOR pela de carteira_apta.
- P-03 (MEDIA) - quantificar excluidos e legados sem data: `SELECT COUNT(*) bruto, SUM(CASE WHEN dtexclusao IS NOT NULL THEN 1 ELSE 0 END) excluidos, SUM(CASE WHEN dtexclusao IS NULL AND dtcadastro IS NULL THEN 1 ELSE 0 END) vivos_sem_dtcadastro, MIN(dtcadastro) primeiro_cad, MAX(dtcadastro) ultimo_cad FROM pcclient;` - se excluidos = 0, VALOR = 235 e a regua e inocua HOJE (mas continua correta para o futuro).
- P-04 (BAIXA) - duplicidade de CNPJ/CPF na base (mesmo cliente com varios codigos infla o VALOR).
- P-05 (BAIXA) - aderencia do cadastro a operacao: quantos clientes vivos nunca compraram (cadastro-fantasma).

---

## IND-05 - Novos clientes (com venda)

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** inteiro &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** cliente -> 1 linha/periodo

### Definicao

Quantidade de clientes que fizeram a PRIMEIRA COMPRA da historia dentro do periodo. Um cliente so e "novo" uma unica vez na vida: se ja comprou alguma vez antes de :dt_ini, nao entra, mesmo que tenha comprado bastante no periodo. E o indicador de conquista de mercado - mede se a distribuidora esta entrando em clientes novos ou apenas revendendo para a carteira que ja tem.

### Por que essa definicao

Escolhida "primeira compra faturada de toda a historia (MIN(dtsaida) em NF de venda valida) caindo dentro do periodo" porque e a unica definicao que responde a pergunta do dono ("estou conquistando cliente novo?") sem se confundir com "quem comprou no periodo" (positivacao, IND-07) nem com "quem foi cadastrado" (IND-04.cadastrados_no_periodo - cadastro nao e venda; ha cliente cadastrado que nunca comprou). Ancorada na NF e nao no pedido: a NF e o fato fiscal definitivo e e o mesmo grao da positivacao (114 clientes/30d via PCNFSAID vs 110 via PCPEDC) - usar PCPEDC criaria dois conceitos de "comprou" no mesmo BI. O ponto tecnico central: o MIN e calculado sobre TODO o historico, sem nenhum filtro de :dt_ini/:dt_fim dentro do agrupamento; o periodo so e aplicado DEPOIS, para testar se aquele MIN caiu na janela. Filtrar o periodo antes do MIN e o erro classico que transforma silenciosamente "novos" em "positivados" (daria ~114 em vez de poucas unidades).

### Alternativas descartadas

- Cliente CADASTRADO no periodo (PCCLIENT.DTCADASTRO na janela): descartada porque mede o trabalho do cadastro, nao a venda - cliente cadastrado que nunca comprou entraria, e cliente cadastrado ha 6 meses que so comprou agora (a conquista real) ficaria de fora. E o IND-04.cadastrados_no_periodo / DIM-04.
- Primeira compra pelo PEDIDO (MIN(PCPEDC.DATA)): descartada por coerencia de grao - a base mede 'comprou' por NF (114/30d) contra 110 por pedido; usar pedido faria 'novo' e 'positivado' viverem em universos diferentes e permitiria contar como novo quem fez pedido que nunca foi faturado.
- 'Novo' = comprou no periodo e nao comprava ha 12 meses (janela movel): descartada - conceitualmente isso e RECOMPRA/REATIVACAO, nao cliente novo, e a base tem so ~9 meses, entao uma janela de 12 meses nao existe no historico. Merece indicador proprio quando houver historico.
- Contar a partir de PCMOV (codoper='S') em vez de PCNFSAID: descartada porque PCMOV e grao de ITEM e exigiria DISTINCT para voltar ao grao de cliente, com risco de dupla contagem e sem ganho.
- Exigir VLTOTAL > 0 na 1a compra: descartada porque NF cancelada (o caso conhecido de VLTOTAL zerado) ja sai por DTCANCEL IS NULL; o filtro so mascararia notas legitimas de valor zero sem diagnostico. Virou a pendencia P-05.2.
- Omitir o EXISTS CODOPER='S' (era o desenho ORIGINAL) - DESCARTADA na consolidacao: aceitar qualquer NF permitia que remessa/transferencia ancorasse a 'primeira compra' e EXCLUISSE um novo cliente legitimo, alem de dar ao denominador do pct uma regua diferente do IND-07.

### Grao e fontes

Cliente (CODCLI). Uma linha por cliente cuja 1a compra da historia caiu no periodo; VALOR = contagem desses clientes. Retorno agregado de 1 linha.

- PCNFSAID (fato: 1a compra via MIN(DTSAIDA) e faturamento do periodo; PK NUMTRANSVENDA)
- PCMOV (so no EXISTS da regua canonica de venda: CODOPER='S', DTCANCEL IS NULL)
- PCCLIENT (nome do cliente; PK CODCLI, join 1:1)
- PCUSUARI (nome do RCA que conquistou; PK CODUSUR, join 1:1, 8 linhas)

### Armadilhas

- FILTRAR O PERIODO ANTES DO MIN (o erro classico deste indicador): se :dt_ini/:dt_fim entrassem no CTE primeira_compra, o MIN viraria 'a primeira compra DENTRO da janela' e todo cliente que comprasse no periodo viraria 'novo' - o indicador viraria silenciosamente uma copia da positivacao (~114 em vez de poucas unidades). Aqui o MIN varre 100% do historico e o periodo so e aplicado depois, no CTE novos.
- ORA-22818 (era ERRO FATAL, corrigido pela auditoria): o SQL original tinha subquery escalar DENTRO da condicao WHEN de um CASE, dentro de funcao de grupo - local explicitamente nao suportado pelo Oracle. O SQL NAO EXECUTAVA. Corrigido promovendo MIN(dtsaida) a CTE base e trazendo dt0 como COLUNA via CROSS JOIN.
- JUSTIFICATIVA FALSA que sustentava o desenho quebrado: o autor afirmava que 'um CROSS JOIN com CTE de escalares retornaria ZERO linhas em janela vazia'. E factualmente errado - agregado sem GROUP BY SEMPRE devolve exatamente 1 linha, mesmo sobre conjunto vazio; logo agg CROSS JOIN base CROSS JOIN pos CROSS JOIN rcas e 1x1x1x1 = 1 linha garantida. O autor inventou um problema inexistente e, para resolve-lo, escolheu justamente a construcao que quebra.
- NF cancelada: DTCANCEL IS NULL na CTE nf, unica porta de entrada (protege MIN e faturamento). Sem isso, um cliente cuja unica nota foi cancelada seria contado como novo; e pior, se a NF cancelada fosse a mais antiga dele, ela ancoraria o MIN na data errada e o EXPULSARIA do periodo - perdendo um novo cliente de verdade.
- Dupla contagem de cliente: GROUP BY codcli em primeira_compra garante 1 linha por cliente; joins com PCCLIENT (PK CODCLI) e PCUSUARI (PK CODUSUR) sao 1:1 confirmados em fase6_pks.csv - nao ha fan-out inflando o COUNT(*), mesmo que o cliente tenha varias NFs no periodo.
- Divisao por zero: NULLIF(COUNT(*),0) em ticket_medio_novo e NULLIF(p.qt_pos,0) em pct_novos_sobre_positivados.
- Hora na data: >= TRUNC(:dt_ini) e < TRUNC(:dt_fim)+1 - NFs emitidas com hora no ultimo dia nao sao perdidas.
- LISTAGG estourando 4000 caracteres: ON OVERFLOW TRUNCATE ... WITH COUNT evita ORA-01489 em janelas longas.
- Formatacao de moeda: TO_CHAR(...,'FM9999990.00') estourava em '#######' acima de R$ 9.999.999,99 e usava ponto decimal em card pt-BR. Trocado por 'FM999G999G990D00', que respeita o NLS.
- Janela movel do backend: como nao ha data fixa e o MIN e sempre historico completo, o mesmo SQL roda corretamente no periodo anterior - um cliente novo em jun/2026 NAO reaparece como novo em jul/2026.
- RCA errado: usa o CODUSUR da propria NF da 1a compra (via MIN ... KEEP DENSE_RANK FIRST), nao PCCLIENT.CODUSUR1, que e o RCA ATUAL - se o cliente trocou de RCA depois, CODUSUR1 daria credito ao vendedor errado.
- Nome ausente: NVL(c.cliente, 'CLIENTE '||codcli) e LEFT JOIN garantem que cliente sem cadastro ainda seja contado no VALOR.

### SQL

```sql
WITH nf AS (
    -- REGUA CANONICA DE VENDA (unificada na consolidacao): NF nao cancelada COM item de
    -- venda vivo. SEM filtro de periodo aqui, de proposito - o MIN precisa do historico todo.
    -- O EXISTS impede que remessa/transferencia/devolucao-a-fornecedor ancore a "1a compra".
    SELECT n.codcli, n.dtsaida, n.vltotal, n.codusur, n.numnota
    FROM   pcnfsaid n
    WHERE  n.dtcancel IS NULL
      AND  EXISTS (SELECT 1
                     FROM pcmov m
                    WHERE m.numtransvenda = n.numtransvenda
                      AND m.codoper       = 'S'
                      AND m.dtcancel IS NULL)
),
base AS (
    -- CORRECAO ORA-22818: inicio real do historico vira COLUNA, nao subquery escalar
    -- dentro de CASE. Agregado sem GROUP BY => sempre exatamente 1 linha.
    SELECT MIN(f.dtsaida) AS dt0
    FROM   nf f
),
pos AS (
    -- Positivados do periodo (denominador do pct). MESMA regua do IND-07 => mesmo numero.
    SELECT COUNT(DISTINCT f.codcli) AS qt_pos
    FROM   nf f
    WHERE  f.dtsaida >= TRUNC(:dt_ini)
      AND  f.dtsaida <  TRUNC(:dt_fim) + 1
),
primeira_compra AS (
    -- *** O MIN VARRE TODO O HISTORICO: NENHUM :dt_ini/:dt_fim NESTE BLOCO. ***
    -- Filtrar o periodo aqui transformaria "novo cliente" em "cliente que comprou no periodo".
    SELECT f.codcli,
           MIN(f.dtsaida) AS dt_primeira,
           MIN(f.codusur) KEEP (DENSE_RANK FIRST ORDER BY f.dtsaida, f.numnota) AS codusur_1a
    FROM   nf f
    GROUP  BY f.codcli
),
novos AS (
    -- So agora o periodo entra: quem tem a 1a compra da vida dentro da janela.
    SELECT p.codcli, p.dt_primeira, p.codusur_1a
    FROM   primeira_compra p
    WHERE  p.dt_primeira >= TRUNC(:dt_ini)
      AND  p.dt_primeira <  TRUNC(:dt_fim) + 1
),
rcas AS (
    -- Isolado do LISTAGG (evita conflito COUNT(DISTINCT) + LISTAGG no mesmo bloco).
    SELECT COUNT(DISTINCT nv.codusur_1a) AS qt_rcas
    FROM   novos nv
),
fat_periodo AS (
    SELECT f.codcli, SUM(f.vltotal) AS vl_periodo
    FROM   nf f
    WHERE  f.dtsaida >= TRUNC(:dt_ini)
      AND  f.dtsaida <  TRUNC(:dt_fim) + 1
    GROUP  BY f.codcli
),
novos_det AS (
    SELECT nv.codcli,
           nv.dt_primeira,
           nv.codusur_1a,
           b.dt0,                                   -- dt0 como COLUNA: usavel dentro de agregado
           NVL(c.cliente, 'CLIENTE ' || nv.codcli) AS nome_cliente,
           u.nome                                  AS nome_rca,
           NVL(fp.vl_periodo, 0)                   AS vl_periodo
    FROM   novos nv
    CROSS  JOIN base b                                      -- 1 linha => nao multiplica novos
    LEFT   JOIN pcclient    c  ON c.codcli  = nv.codcli      -- PK CODCLI  -> 1:1, nao duplica
    LEFT   JOIN pcusuari    u  ON u.codusur = nv.codusur_1a  -- PK CODUSUR -> 1:1, nao duplica
    LEFT   JOIN fat_periodo fp ON fp.codcli = nv.codcli
),
agg AS (
    -- Agregado sem GROUP BY => SEMPRE 1 linha (VALOR = 0 quando nao ha novos no periodo).
    SELECT COUNT(*)                            AS qt_novos,
           ROUND(NVL(SUM(d.vl_periodo), 0), 2) AS vl_novos,
           COUNT(CASE WHEN d.dt_primeira < d.dt0 + 90 THEN 1 END) AS qt_susp,
           LISTAGG(d.nome_cliente
                   || ' (RCA ' || NVL(TO_CHAR(d.codusur_1a), '?')
                   || CASE WHEN d.nome_rca IS NOT NULL THEN ' - ' || d.nome_rca END
                   || ' | 1a compra ' || TO_CHAR(d.dt_primeira, 'DD/MM/YYYY')
                   || ' | R$ ' || TO_CHAR(d.vl_periodo, 'FM999G999G990D00') || ')',
                   '; ' ON OVERFLOW TRUNCATE '...(demais)' WITH COUNT)
             WITHIN GROUP (ORDER BY d.vl_periodo DESC, d.nome_cliente) AS lista
    FROM   novos_det d
)
-- CROSS JOIN de quatro agregados de 1 linha => contrato de 1 linha garantido em qualquer janela.
SELECT a.qt_novos                                       AS valor,
       a.vl_novos                                       AS vl_faturamento_novos,
       ROUND(a.vl_novos / NULLIF(a.qt_novos, 0), 2)     AS ticket_medio_novo,
       ROUND(a.qt_novos * 100 / NULLIF(p.qt_pos, 0), 2) AS pct_novos_sobre_positivados,
       a.qt_susp                                        AS qt_novos_suspeitos,
       TO_CHAR(b.dt0, 'DD/MM/YYYY')                     AS dt_inicio_base,
       r.qt_rcas                                        AS qt_rcas_conquistaram,
       a.lista                                          AS lista_novos
FROM   agg a
CROSS  JOIN base b
CROSS  JOIN pos  p
CROSS  JOIN rcas r
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `lista_novos` | Lista dos novos clientes para o tooltip: nome + RCA (codigo e nome) que fez a 1a venda + data da 1a compra + quanto faturou no periodo, ordenada do maior faturamento para o menor. ON OVERFLOW TRUNCATE ... WITH COUNT evita ORA-01489 (limite de 4000 caracteres). |
| `vl_faturamento_novos` | Faturamento gerado pelos novos clientes dentro do periodo. Mostra se os novos sao relevantes em dinheiro ou so em quantidade. |
| `ticket_medio_novo` | Faturamento dos novos / quantidade de novos. Comparar com o ticket medio por nota da casa (~R$ 1.479) para ver se o cliente novo entra comprando pouco (compra-teste) ou pesado. |
| `pct_novos_sobre_positivados` | Percentual (0-100) dos clientes positivados no periodo que sao novos. Denominador = MESMA regua do IND-07, entao pct nunca passa de 100 por construcao. Responde: do que vendi, quanto veio de gente nova vs carteira. |
| `qt_novos_suspeitos` | SEMAFORO DA LIMITACAO: quantos dos 'novos' tem 1a compra nos primeiros 90 dias da base. Sao provaveis FALSOS novos (clientes antigos que so parecem novos porque a base comeca em out/2025). Se > 0, o VALOR e teto, nao conquista. O corte e derivado do MIN(dtsaida) real, entao o alerta se autodesliga conforme o historico amadurece. |
| `dt_inicio_base` | Data da NF mais antiga existente na base (inicio real do historico). Explica de onde vem o corte dos 'suspeitos'. |
| `qt_rcas_conquistaram` | Quantos RCAs distintos trouxeram pelo menos um cliente novo no periodo. Mostra se a conquista esta concentrada em um vendedor ou distribuida. |

### Valor esperado e sanidade

Numa janela recente de 30d: poucas unidades - ordem de 2 a 10 clientes novos, com qt_novos_suspeitos = 0. Sanidade: VALOR tem de ser MUITO menor que a positivacao de 30d (~114) e pct_novos_sobre_positivados deve ficar na casa de ~2% a 9%; se der perto de 100 clientes ou ~100%, o MIN esta sendo filtrado pelo periodo (erro classico). Teto absoluto: a soma de VALOR de toda a serie historica nao pode passar de IND-04.total_bruto_cadastro (235) - ATENCAO, o teto e o cadastro BRUTO e NAO IND-04.VALOR: um cliente com NF pode ter DTEXCLUSAO preenchida e ficar fora da base viva do IND-04, mas continua contado como novo aqui (o IND-05 nem toca PCCLIENT para filtrar exclusao). Se excluidos > 0, o historico do IND-05 pode legitimamente exceder IND-04.VALOR - nao e bug, e definicao. ATENCAO 2: numa janela do inicio da base (out-dez/2025) o valor explode para dezenas e qt_novos_suspeitos vem alto - artefato do truncamento da base, nao conquista.

### Observacoes

LIMITACAO CRITICA - LEIA ANTES DE USAR: a base comeca em out/2025 (~9 meses de historico). O SQL calcula "primeira compra da historia" com os dados que EXISTEM, entao TODO cliente cuja 1a compra real aconteceu antes de out/2025 aparece falsamente como "novo" na primeira vez que compra dentro da base. Na pratica, out-dez/2025 mostram um pico artificial de dezenas de "novos" que na verdade e a carteira antiga inteira desfilando. RECOMENDACAO: so considerar o indicador confiavel a partir de ~jan/2026 (>= 90 dias de historico acumulado), e no front sinalizar/desabilitar a comparacao com periodo anterior quando a janela anterior cair antes de jan/2026 - senao a variacao % vira ruido puro (ex.: '-85% de novos clientes' que so significa que o pico artificial passou). qt_novos_suspeitos automatiza esse alerta.

CORRECOES APLICADAS: (1) ORA-22818 - o SQL original NAO EXECUTAVA (subquery escalar dentro de WHEN de CASE dentro de agregado). O status 'validado' original foi concedido com base APENAS em existencia de colunas ('12/12 conferidas por script') - nenhuma checagem sintatica foi feita, e e exatamente ai que o indicador caia. Correcao: MIN(dtsaida) promovido a CTE e trazido como coluna dt0. (2) COUNT(DISTINCT codusur_1a) movido para CTE propria (rcas), por precaucao contra restricoes de convivencia com LISTAGG. (3) formato de moeda do LISTAGG. (4) CONSOLIDACAO - acrescentado o EXISTS CODOPER='S' na CTE nf.

POR QUE O EXISTS FOI ACRESCENTADO (correcao de coerencia): a CTE nf aceitava QUALQUER NF nao cancelada, ao contrario de IND-01/IND-03. Consequencia dupla: (a) o denominador de pct_novos_sobre_positivados era diferente do IND-03.clientes_distintos e do IND-01, embora os tres afirmassem ~114 - matematicamente no maximo um podia estar certo; (b) pior que inflar, a omissao podia EXCLUIR um novo cliente legitimo: se ele recebeu uma remessa meses antes, sua 1a 'compra' ja passou e ele nunca seria contado. O autor defendia a omissao como conservadora, mas ela so e conservadora numa direcao. Com o EXISTS aplicado na UNICA porta de entrada (CTE nf), numerador e denominador continuam saindo do mesmo universo - a objecao da auditoria individual (que pct poderia passar de 100) nao se aplica, porque o filtro nao foi posto em so um dos lados. E 'primeira compra' passa a significar primeira VENDA de verdade, que e o que o indicador afirma medir.

STATUS a_validar por DOIS motivos independentes: (1) a limitacao semantica do inicio da base (P-05.1); (2) o valor de referencia da positivacao (114) foi medido sem o EXISTS - P-IND01-D.

PENDENCIAS: P-05.1 (ALTA) confirmar o inicio do historico e a distribuicao dos novos por mes: WITH nf AS (SELECT codcli, dtsaida FROM pcnfsaid WHERE dtcancel IS NULL), p AS (SELECT codcli, MIN(dtsaida) dt1 FROM nf GROUP BY codcli) SELECT TO_CHAR(dt1,'YYYY-MM') mes, COUNT(*) novos FROM p GROUP BY TO_CHAR(dt1,'YYYY-MM') ORDER BY 1; - o esperado e um pico artificial gigante em out/2025 decaindo para um patamar baixo e estavel; o mes em que estabiliza e a partir de quando a serie e confiavel. P-05.2 (MEDIA) bonificacao/remessa inflando: SELECT condvenda, tipovenda, COUNT(*) qt, COUNT(DISTINCT codcli) cli FROM pcnfsaid WHERE dtcancel IS NULL AND dtsaida >= ADD_MONTHS(TRUNC(SYSDATE),-3) GROUP BY condvenda, tipovenda ORDER BY qt DESC; - se houver volume relevante fora da venda normal, o filtro entra AQUI E no IND-07/IND-06/IND-08 no MESMO commit. P-05.3 (BAIXA) cliente que comprou e devolveu tudo continua contado como novo. P-05.5 (BAIXA) cliente duplicado no cadastro (mesmo CNPJ, dois CODCLI) e contado como novo duas vezes.

DECISAO TECNICA - ausencia proposital do filtro codfilial: num MIN sobre todo o historico, restringir a varredura so pode ANTECIPAR falsamente a 'primeira compra'. Varrer o historico inteiro e a direcao conservadora. Coerente com os outros 8 apos a consolidacao (nenhum filtra filial).

Nao duplica o IND-04.cadastrados_no_periodo (que e o DIM-04 do catalogo, prospeccao por DTCADASTRO): cadastro nao e compra. E por construcao VALOR <= IND-07.VALOR sempre.

### Pendencias

- **P-05.1 (ALTA - a limitacao critica)** - confirmar a data real de inicio do historico e a distribuicao dos 'novos' por mes. O esperado e um pico artificial gigante em out/2025 decaindo para um patamar baixo e estavel; o mes em que estabiliza e a partir de quando a serie e confiavel. SQL no `obs`.
- **P-IND01-D (BLOQUEANTE)** - reprocessar o denominador (positivados) com o EXISTS.
- P-05.2 (MEDIA - pode inflar o VALOR) - CONDVENDA/TIPOVENDA nao sao filtrados; se houver notas de bonificacao/brinde/remessa, um cliente pode virar 'novo' sem compra real. Se o filtro entrar, tem de entrar TAMBEM em IND-06/07/08 no mesmo commit.
- P-05.3 (BAIXA) - cliente que comprou e devolveu tudo continua contado como novo (devolucao vive em PCMOV como ED/SD, hipotese nao confirmada).
- P-05.4 (BAIXA) - PCUSUARI tem 8 linhas e PK CODUSUR, entao o join e 1:1 e seguro; se houver RCA fora do cadastro, nome_rca vem NULL e a lista mostra so o codigo - o VALOR nao e afetado (LEFT JOIN).
- P-05.5 (BAIXA) - cliente duplicado no cadastro (mesmo CNPJ com dois CODCLI) seria contado como novo duas vezes, em datas diferentes.

---

## IND-06 - Clientes ativos

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** inteiro &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** cliente (janela rolante 90d)

### Definicao

Quantidade de clientes diferentes que compraram pelo menos uma vez nos ultimos 90 dias, contados para tras a partir do fim do periodo consultado. Comprar = ter pelo menos uma nota fiscal de venda nao cancelada. E a foto de "quantos clientes a casa realmente tem hoje" - nao e quantos estao cadastrados, e quantos estao comprando.

### Por que essa definicao

Havia duas leituras e elas respondem a perguntas diferentes. (A) COMERCIAL/RECENCIA: comprou nos ultimos 90 dias. (B) CADASTRAL: cadastro nao bloqueado e nao excluido. Escolhida (A) por tres razoes. (1) E o padrao do varejo/distribuicao e o unico numero acionavel: cadastro liberado so diz que o cliente PODE comprar, nao que compra - numa base de 235 cadastros com ~114 positivados em 30d, a leitura cadastral infla o numero com clientes que sumiram ha meses e o dono toma decisao errada sobre a carteira. (2) A janela de 90d e o padrao do setor e cai bem aqui: com ciclo de recompra mensal, 90d = 3 ciclos, ou seja, quem nao comprou em 90 dias furou tres oportunidades seguidas - isso e perda, nao sazonalidade. Janela de 30d apenas duplicaria o IND-07; 180d/365d mascarariam churn e, nesta base de ~9 meses, 365d nem teria historico para ancorar. (3) A leitura cadastral e fragil aqui: BLOQUEIOINATIVIDADE - o candidato natural a marcar 'inativo' - NAO e status, e flag de CONFIGURACAO ('Bloquear Cliente por Inatividade. Considerando a data da ultima compra com relacao ao parametro na 132 (1402...)') e alem disso e DERIVADA da ultima compra, o que tornaria (B) circular em relacao a (A). A leitura (B) nao foi jogada fora: entra como carteira_apta, e o cruzamento (ativos_compra_e_cadastro) e o numero mais acionavel do tooltip - cliente que comprou nos 90d E tem cadastro apto e o que o RCA visita amanha. A diferenca entre carteira_apta e valor e o tamanho da ilusao da carteira.

### Alternativas descartadas

- LEITURA CADASTRAL como oficial (cadastro nao bloqueado/nao excluido): descartada porque mede permissao de compra, nao comportamento. Numa base de 235 cadastros devolveria ~200-220 'ativos' enquanto so ~114 compram por mes - numero bonito e inutil. Mantida como carteira_apta, que e o valor da comparacao.
- Janela de 30 dias: descartada por duplicar o IND-07 - seriam dois indicadores com o mesmo numero e nomes diferentes, o pior tipo de ruido num BI. Alem disso 1 ciclo de recompra e curto demais: cliente que atrasou uma semana viraria 'inativo'.
- Janela de 180 ou 365 dias: descartada por mascarar churn - com recompra mensal, 6 a 12 ciclos sem comprar e cliente perdido. E a base so tem ~9 meses, entao 365d nao teria historico para ancorar.
- Janela igual ao periodo consultado: descartada porque o indicador viraria funcao do filtro de datas do usuario - mudaria de 40 para 150 conforme se consultasse 7 ou 90 dias, sem nada ter mudado no negocio. E exatamente a definicao de 'positivados' (IND-07).
- PCCLIENT.DTULTCOMP como fonte da recencia (caminho do DIM-08): descartada por depender de campo mantido pelo ERP cujo preenchimento nao foi medido; derivar de PCNFSAID usa o fato e mantem coerencia com a positivacao.
- PCPEDC (pedidos) como fato de compra: descartada porque pedido nao e compra - mede intencao (110 via PCPEDC contra 114 via PCNFSAID).
- PCMOV com CODOPER='S' como FONTE (caminho do VEN-05): descartada porque para CONTAR CLIENTES a granularidade de item e desnecessaria e mais cara - a NF ja e 1 linha por venda. PCMOV entra so no EXISTS.
- Segmentacao RFM ou faixas de recencia (0-30/31-60/61-90/90+): descartada por nao caber em 1 numero de topo - e analise de carteira, nao KPI. Candidata a drill proprio.
- Excluir BLOQUEIO='S' da carteira (era a regua ORIGINAL do IND-06): DESCARTADA na consolidacao em favor do criterio do IND-08 - bloqueio de credito e temporario e reversivel, e exclui-lo permite maquiar cobertura bloqueando cliente morto. Ver 'Correcoes de coerencia'.

### Grao e fontes

Cliente distinto (CODCLI), agregado em 1 linha. Snapshot ROLANTE de 90 dias ancorado em TRUNC(:dt_fim) - NAO e um agregado do periodo consultado.

- PCNFSAID (CODCLI, DTSAIDA, DTCANCEL) - recencia de compra pelo fato
- PCMOV (so no EXISTS da regua canonica de venda)
- PCCLIENT (CODCLI, DTEXCLUSAO, BLOQUEIO, BLOQUEIODEFINITIVO) - 235 linhas, leitura cadastral auxiliar

### Armadilhas

- NF cancelada positivando cliente: DTCANCEL IS NULL exclui as 210 NFs canceladas. Sem isso, cliente cuja unica nota foi cancelada apareceria como ativo - cliente fantasma na carteira.
- Dupla contagem: COUNT sobre SELECT DISTINCT n.codcli. Cliente com 12 notas na janela conta 1 vez. Contar NFs inflaria em ~3x (318 notas para 114 clientes em 30d).
- PERCENTUAL COM POPULACOES MISTURADAS (era DEFEITO REAL, corrigido): pct_ativos_sobre_cadastro usava numerador SEM restricao de cadastro e denominador COM - o numerador nao era subconjunto do denominador. Consequencias: (a) podia passar de 100 e violar o contrato (valor=150 / cad_ok=140 -> 107,14%); (b) pior, era CEGO para o que dizia medir - o resultado ficava travado quer 0, 8 ou 20 clientes ativos estivessem bloqueados, subestimando o gap ate ~14pp. Ironia: o SQL JA calculava a intersecao correta e nao a usava. Corrigido: numerador = ativos_compra_e_cadastro.
- CALIBRACAO DA JANELA EM DOIS LITERAIS (era claim falso, corrigido): as obs afirmavam que '90 dias estao fixos num unico ponto', mas estavam em DOIS literais independentes (o 90 de janela_dias e o -89 de dt_ini_jan). Trocar para 60d mexendo so no 90 nao mudava a janela real e fazia janela_usada MENTIR no tooltip. Corrigido: dt_ini_jan = dt_ref - (janela_dias - 1).
- Confundir ativo com positivado (a armadilha central): positivado e do PERIODO consultado e encolhe/cresce conforme o usuario muda o filtro; ativo e janela FIXA de 90d ancorada em :dt_fim. Se a janela fosse :dt_ini..:dt_fim, consultar 7 dias devolveria ~40 e consultar 90 dias devolveria ~150 para o MESMO negocio no mesmo dia - o indicador viraria funcao do filtro, nao do negocio.
- Comparacao periodo atual x anterior quebrada: a janela e ancorada em TRUNC(:dt_fim), entao quando o backend roda o MESMO SQL para o periodo anterior (:dt_fim_ant = :dt_ini - 1), a janela desliza para [:dt_ini-90, :dt_ini-1] - 90d contra 90d, comparacao honesta. Janela fixa por datas literais ou ancorada em SYSDATE devolveria o mesmo numero nos dois periodos e a variacao apareceria sempre como 0%.
- SYSDATE em vez de :dt_fim: tornaria o indicador nao-reprodutivel (valor muda sozinho amanha) e impossivel de comparar historicamente. O DIM-08 do catalogo usa TRUNC(SYSDATE) - este SQL nao.
- BLOQUEIOINATIVIDADE tratado como status: NAO e status, e flag de configuracao da rotina 1402 e e DERIVADA da ultima compra - usa-la na leitura cadastral tornaria (B) circular em relacao a (A) e as duas leituras deixariam de ser independentes. Fora do SQL de proposito.
- Depender de PCCLIENT.DTULTCOMP para recencia: a coluna EXISTE (o ORA-00904 foi em DTULTCOMPRA, nome diferente), mas e campo mantido por rotina do ERP e seu preenchimento nao foi medido. O SQL deriva a recencia de PCNFSAID (fato), imune a DTULTCOMP defasada ou nula.
- Hora em DTSAIDA: usa n.dtsaida < j.dt_ref + 1 em vez de <= :dt_fim (BETWEEN perderia as notas emitidas depois das 00:00 do dia :dt_fim). TRUNC(:dt_fim) normaliza a ancora, garantindo 90 dias-calendario exatos independentemente de como o backend monta o DATE.
- Fencepost: dt_ini_jan = dt_ref - 89, nao -90. Com -90 a janela teria 91 dias inclusivos. [dt_fim-89, dt_fim] fechado dos dois lados = 90 dias exatos.
- ANACRONISMO (nao corrigido, por decisao): o CTE cadastro ignora o periodo, enquanto o IND-08 aplica guarda (DTCADASTRO < :dt_fim+1, DTEXCLUSAO >= :dt_ini). Ao consultar periodos passados, IND-06 aplica o cadastro de HOJE ao passado. Efeito pequeno e restrito aos auxiliares (o VALOR nao e afetado), mas e divergencia residual com o IND-08 - ver pendencias.
- PERFORMANCE (nao correcao): a promessa de 'sargable' e otimista - com CROSS JOIN a uma CTE, o predicado compara contra coluna de outra fonte, nao contra bind literal, e o Oracle pode nao gerar o range scan. Com PCNFSAID em 1.920 linhas e irrelevante hoje.

### SQL

```sql
WITH janela_base AS (
  SELECT TRUNC(:dt_fim) AS dt_ref,
         90             AS janela_dias,   -- PONTO UNICO DE CALIBRACAO DA JANELA
         TRUNC(:dt_ini) AS dt_ini_per
  FROM   dual
),
janela AS (
  -- dt_ini_jan DERIVADO de janela_dias: intervalo fechado dos dois lados
  -- [dt_ref-(n-1), dt_ref] = exatamente n dias-calendario. Mudar janela_dias
  -- acima reconfigura a janela E o tooltip juntos (antes eram 2 literais soltos).
  SELECT dt_ref,
         janela_dias,
         dt_ini_per,
         dt_ref - (janela_dias - 1) AS dt_ini_jan
  FROM   janela_base
),
-- (A) LEITURA OFICIAL: clientes com NF de venda valida na janela rolante,
--     ancorada em :dt_fim (independe da DURACAO do periodo consultado).
--     EXISTS CODOPER='S' = regua canonica de venda, unificada com IND-01/03/05/07/08.
ativos_compra AS (
  SELECT DISTINCT n.codcli
  FROM   pcnfsaid n
  CROSS  JOIN janela j
  WHERE  n.dtsaida >= j.dt_ini_jan
  AND    n.dtsaida <  j.dt_ref + 1
  AND    n.dtcancel IS NULL
  AND    EXISTS (SELECT 1 FROM pcmov m
                  WHERE m.numtransvenda = n.numtransvenda
                    AND m.codoper = 'S' AND m.dtcancel IS NULL)
),
-- Clientes positivados NO PERIODO CONSULTADO (:dt_ini..:dt_fim).
-- Deve bater EXATAMENTE com IND-07.valor e IND-08.qt_positivados_nf_total.
positivados AS (
  SELECT DISTINCT n.codcli
  FROM   pcnfsaid n
  CROSS  JOIN janela j
  WHERE  n.dtsaida >= j.dt_ini_per
  AND    n.dtsaida <  j.dt_ref + 1
  AND    n.dtcancel IS NULL
  AND    EXISTS (SELECT 1 FROM pcmov m
                  WHERE m.numtransvenda = n.numtransvenda
                    AND m.codoper = 'S' AND m.dtcancel IS NULL)
),
-- (B) LEITURA CADASTRAL (auxiliar): CARTEIRA APTA CANONICA DO PROJETO.
-- Criterio unico adotado na consolidacao (= IND-08.qt_carteira_base e IND-04.carteira_apta):
-- so saem DTEXCLUSAO preenchida e BLOQUEIODEFINITIVO='S'.
-- BLOQUEIO='S' (credito) PERMANECE na carteira: e temporario e reversivel, e exclui-lo
-- permitiria maquiar cobertura bloqueando cliente morto.
-- BLOQUEIOINATIVIDADE fica FORA da regra: e flag de configuracao da rotina 1402
-- (confirmado na DESCRICAO_CAMPO do dicionario) e derivada da ultima compra (circular).
cadastro AS (
  SELECT c.codcli,
         CASE WHEN c.dtexclusao IS NULL
               AND NVL(c.bloqueiodefinitivo,'N') <> 'S'
              THEN 1 ELSE 0 END AS cadastro_ok,
         CASE WHEN c.dtexclusao IS NULL
               AND NVL(c.bloqueio,'N')           <> 'S'
               AND NVL(c.bloqueiodefinitivo,'N') <> 'S'
              THEN 1 ELSE 0 END AS comercializavel
  FROM   pcclient c
),
m AS (
  SELECT (SELECT COUNT(*) FROM ativos_compra)                    AS qt_ativos,
         (SELECT COUNT(*) FROM cadastro WHERE cadastro_ok = 1)   AS qt_cad_ok,
         (SELECT COUNT(*) FROM cadastro WHERE comercializavel=1) AS qt_comerc,
         (SELECT COUNT(*) FROM cadastro)                         AS qt_cad_tot,
         (SELECT COUNT(*) FROM positivados)                      AS qt_positivados,
         (SELECT COUNT(*) FROM ativos_compra a
                          JOIN cadastro c ON c.codcli = a.codcli
                         WHERE c.cadastro_ok = 1)                AS qt_ativos_cad_ok
  FROM   dual
)
SELECT m.qt_ativos                                        AS valor,
       j.janela_dias                                      AS janela_dias,
       TO_CHAR(j.dt_ini_jan,'DD/MM/YYYY') || ' a ' ||
       TO_CHAR(j.dt_ref,'DD/MM/YYYY')                     AS janela_usada,
       m.qt_cad_ok                                        AS carteira_apta,
       m.qt_comerc                                        AS base_comercializavel,
       m.qt_ativos_cad_ok                                 AS ativos_compra_e_cadastro,
       m.qt_positivados                                   AS positivados_periodo,
       m.qt_cad_tot                                       AS base_cadastro_total,
       -- Numerador = INTERSECAO (comprou 90d E cadastro apto), nao qt_ativos:
       -- numerador e subconjunto do denominador, o percentual nunca passa de 100
       -- e reage a cliente ativo fora da carteira.
       ROUND(100 * m.qt_ativos_cad_ok
             / NULLIF(m.qt_cad_ok, 0), 2)                 AS pct_ativos_sobre_carteira
FROM   m
CROSS  JOIN janela j
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `janela_dias` | Tamanho da janela de recencia em dias (90). E o PONTO UNICO de calibracao - dt_ini_jan e derivado dele. Se o dono quiser 60d ou 120d, muda so aqui e janela_usada reflete sozinho no tooltip. |
| `janela_usada` | Janela efetivamente aplicada, formatada 'DD/MM/AAAA a DD/MM/AAAA' (= :dt_fim-89 ate :dt_fim). Torna explicito no tooltip que o numero NAO e do periodo consultado. |
| `carteira_apta` | CARTEIRA APTA CANONICA (renomeada e realinhada na consolidacao; era 'ativos_por_cadastro'): viva e sem bloqueio definitivo. Tem de ser IDENTICA a IND-04.carteira_apta e a IND-08.qt_carteira_base (a menos da guarda de anacronismo do IND-08). Exibir ao lado de VALOR: a diferenca e o tamanho da carteira que existe no papel mas nao compra. |
| `base_comercializavel` | Carteira apta menos bloqueio de credito - para quantos da para faturar hoje. Tem de bater com IND-04.base_comercializavel. Se for bem menor que carteira_apta, a cobranca esta travando a operacao. |
| `ativos_compra_e_cadastro` | Intersecao: comprou nos 90d E esta na carteira apta. E a carteira acionavel (o RCA vende amanha) e o numerador de pct_ativos_sobre_carteira. Se for bem menor que VALOR, ha clientes comprando com cadastro bloqueado definitivamente - anomalia cadastral. |
| `positivados_periodo` | Clientes distintos com NF de venda valida no periodo consultado. Tem de ser IDENTICO a IND-07.valor, IND-08.qt_positivados_nf_total e IND-01.CLIENTES_COM_NF_VENDA. Serve para ler ativo x positivado no mesmo tooltip. |
| `base_cadastro_total` | Total de linhas em PCCLIENT (~235), incluindo excluidos. Denominador de referencia e teto absoluto. Igual a IND-04.total_bruto_cadastro. |
| `pct_ativos_sobre_carteira` | 100 * ativos_compra_e_cadastro / carteira_apta, protegido por NULLIF. Percentual 0-100. Mede o aproveitamento da carteira: quanto do cadastro apto esta de fato comprando. |

### Valor esperado e sanidade

Consultando 30d sobre a base atual: VALOR ~ 140 a 170 clientes ativos (faixa UNIFICADA na consolidacao com IND-08.qt_base_ativa_90d, que e o MESMO numero por construcao e declarava 140-200). Sanidade: o numero TEM de ficar entre positivados_periodo (~114 em 30d) e base_cadastro_total (235) - a janela de 90d captura os de recompra mensal mais os de ciclo bimestral/trimestral, entao ~1,2x a 1,5x os positivados de 30d. pct_ativos_sobre_carteira ~ 65% a 80%. Sinais de erro: VALOR < 114 (janela ou filtro de cancelamento errado); VALOR > 235 (dupla contagem - o DISTINCT falhou); VALOR ~ 114 (a janela colou em 30d - provavelmente usou :dt_ini em vez de :dt_fim-89); VALOR igual em qualquer :dt_fim consultado (a ancora nao esta funcionando). Ancorar em :dt_fim anterior a jan/2026 devolve valor artificialmente baixo (a janela cai parcialmente antes do inicio do historico) - nao e queda de carteira, e falta de dado.

### Observacoes

COMO LER JUNTO COM 'POSITIVADOS' (a duvida que o dono vai ter): positivado = comprou NO PERIODO QUE VOCE FILTROU na tela; ativo = comprou nos ULTIMOS 90 DIAS contados a partir do fim desse periodo. Positivado e subconjunto de ativo sempre que o periodo consultado couber dentro dos 90 dias - por isso positivados_periodo <= valor. Exemplo: filtrando julho/2026, positivados_periodo ~114 e valor ~150. A leitura gerencial e a DIFERENCA: ~36 clientes estao ativos mas nao compraram no mes - e essa a lista de ligacao do RCA. Se o usuario filtrar um periodo MAIOR que 90 dias (ex.: 6 meses), positivados_periodo passa a ser MAIOR que valor e a relacao se inverte - nao e bug, e a definicao: ativo continua sendo janela fixa de 90d. Deixar isso no tooltip.

DEPENDENCIA DO PERIODO - sutileza para o backend: depende_do_periodo=true, mas a dependencia e so da ANCORA (:dt_fim), nao da DURACAO. Consultar 7 dias ou 60 dias terminando no mesmo :dt_fim devolve o MESMO valor - correto e intencional (snapshot rolante, nao agregado do periodo). O comparativo com o periodo anterior funciona naturalmente. So :dt_ini entra no calculo de positivados_periodo.

CORRECOES APLICADAS: (1) pct_ativos_sobre_cadastro tinha populacoes misturadas - numerador trocado pela intersecao e coluna renomeada para pct_ativos_sobre_carteira; (2) janela derivada de janela_dias (era claim falso de 'ponto unico'); (3) CONSOLIDACAO - EXISTS CODOPER='S' acrescentado aos dois CTEs de fato (regua canonica); (4) CONSOLIDACAO - o CTE cadastro passou a usar a CARTEIRA APTA CANONICA.

POR QUE A CARTEIRA MUDOU (a correcao de coerencia mais grave do lote): IND-06.ativos_por_cadastro excluia BLOQUEIO='S'; IND-08.qt_carteira_base DELIBERADAMENTE mantinha BLOQUEIO='S' e argumentava por escrito que exclui-lo permite gaming (bloqueia-se o cliente morto e a cobertura 'melhora' sem uma venda a mais). Os dois numeros seriam exibidos como 'carteira' no mesmo painel e NAO bateriam. Cada autor documentou sua divergencia em relacao ao VEN-05 do catalogo, mas nenhum viu a divergencia em relacao ao OUTRO indicador do proprio lote. Adotado o criterio do IND-08 (so DTEXCLUSAO e BLOQUEIODEFINITIVO saem) como definicao unica, e a leitura antiga preservada como base_comercializavel - que agora bate com IND-04.base_comercializavel.

FAIXA ESPERADA UNIFICADA: IND-06.valor e IND-08.qt_base_ativa_90d sao NUMERICAMENTE IDENTICOS por construcao (mesma janela, mesma fonte, mesmo filtro - conferido predicado a predicado), mas declaravam faixas diferentes (140-170 vs 140-200). Unificado em 140-170.

STATUS a_validar: o VALOR depende do 114/EXISTS (P-IND01-D) e o dominio de BLOQUEIODEFINITIVO e assumido 'S'/'N' sem medicao.

PENDENCIAS: dominio dos flags - SELECT NVL(bloqueio,'<null>') bloq, NVL(bloqueiodefinitivo,'<null>') bloqdef, COUNT(*) FROM pcclient GROUP BY 1,2; DTDESBLOQUEIO ignorado (cliente com bloqueio vencido pode estar de fato liberado); CODCLI orfao (NF sem cliente em PCCLIENT faria ativos_compra_e_cadastro < VALOR sem que a causa seja bloqueio); CALIBRAR A JANELA com o ciclo real de recompra (confirma ou refuta os 90d com dado em vez de convencao): WITH x AS (SELECT codcli, dtsaida, LAG(dtsaida) OVER (PARTITION BY codcli ORDER BY dtsaida) ant FROM (SELECT DISTINCT codcli, TRUNC(dtsaida) dtsaida FROM pcnfsaid WHERE dtcancel IS NULL)) SELECT ROUND(MEDIAN(dtsaida-ant),1) mediana_dias, ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dtsaida-ant),1) p75 FROM x WHERE ant IS NOT NULL; - se P75 passar de 90d, a janela corta clientes saudaveis.

RISCO CRUZADO NO CATALOGO: DIM-08 ('Clientes inativos') esta validado e depende de PCCLIENT.DTULTCOMP estar populada, o que nunca foi medido. Se estiver nula/defasada, DIM-08 devolve todo mundo como inativo e diverge do IND-06. Rebaixar DIM-08 para a_validar ou reescreve-lo sobre PCNFSAID.

RESSALVA HONESTA sobre o rotulo: 'validado/a_validar' aqui significa que a ESTRUTURA foi conferida contra o dicionario e a logica evita as armadilhas conhecidas - o SQL nao foi executado (sem acesso ao Oracle, por instrucao). O primeiro que rodar deve bater o resultado contra o valor_esperado antes de publicar.

### Pendencias

- **P-IND01-D (BLOQUEANTE)** - reprocessar o VALOR com o EXISTS.
- **Dominio de BLOQUEIO/BLOQUEIODEFINITIVO** - assumido 'S' com NVL(...,'N'). Se o dominio for numerico (0/1) ou outro literal, carteira_apta e pct_ativos_sobre_carteira saem errados (o VALOR nao e afetado).
- Bonificacao/TIPOVENDA - mesma pendencia do IND-05/07/08. Nao filtrado de proposito, para manter o VALOR reconciliavel com os 114 medidos; se filtrar, os seis indicadores + VEN-05/DIM-02 mudam no MESMO commit.
- DTDESBLOQUEIO ignorado - cliente com BLOQUEIO='S' pode ter data de desbloqueio ja vencida e estar de fato liberado; carteira_apta estaria subestimada.
- CODCLI orfao (NF sem correspondente em PCCLIENT) - faria ativos_compra_e_cadastro < VALOR sem que a causa seja bloqueio.
- **Calibrar a janela com o ciclo real de recompra** (confirma ou refuta os 90d com dado em vez de convencao) - se o P75 do intervalo entre compras passar de 90d, a janela corta clientes saudaveis. SQL no `obs`.
- Anacronismo - o CTE cadastro ignora o periodo, enquanto o IND-08 aplica guarda. Ao consultar periodos passados, IND-06 aplica o cadastro de HOJE ao passado (afeta so os auxiliares).
- **RISCO CRUZADO NO CATALOGO** - DIM-08 ('Clientes inativos') esta validado e depende de PCCLIENT.DTULTCOMP estar populada, o que nunca foi medido. Rebaixar para a_validar ou reescrever sobre PCNFSAID.

---

## IND-07 - Clientes positivados

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** inteiro &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** cliente -> 1 linha/periodo

### Definicao

Quantidade de clientes diferentes que compraram de fato no periodo, contada pela nota fiscal de saida: se o cliente recebeu pelo menos uma NF nao cancelada com item de venda e data de saida dentro da janela, ele esta positivado. Cada cliente conta uma unica vez, nao importa quantas notas tenha recebido. E a resposta para "quantos clientes da minha base efetivamente compraram neste mes?".

### Por que essa definicao

Positivacao e medida sobre venda FATURADA (PCNFSAID.DTSAIDA), nao sobre pedido. Tres razoes: (1) pedido e intencao - pode ser cortado, bloqueado por credito ou nao faturar, e cliente que pediu mas nao recebeu nota nao gerou receita nem positivou; (2) positivacao precisa reconciliar com o faturamento do periodo (R$ 470.580 / 318 notas em 30d), e so a NF garante essa amarracao - pedido e nota podem cair em janelas diferentes; (3) o cabecalho da NF tem grao de 1 linha por nota (PK NUMTRANSVENDA), entao nao ha risco de inflar contagem por item, e PCNFSAID.CODCLI e NOT NULL, enquanto PCMOV.CODCLI e NULLABLE - contar pelo item poderia perder cliente. O caminho por pedido foi preservado como auxiliar (positivados_via_pedido) porque a diferenca NF vs pedido e informacao de gestao util, nao ruido. CONSOLIDACAO: acrescentado o EXISTS CODOPER='S' - ver obs.

### Alternativas descartadas

- Positivacao por PEDIDO (PCPEDC, ~110 clientes): descartada como oficial - pedido e intencao, nao receita; cliente que pediu e nao faturou nao positivou. Mantida como auxiliar positivados_via_pedido, que e justamente o que revela pedido represado.
- Positivacao por PCMOV com CODOPER='S' (caminho de VEN-05 e DIM-02): descartada como FONTE porque PCMOV e grao de item - CODCLI e NULLABLE e a tabela nao permite contar notas por cliente sem DISTINCT extra. Deve convergir para o mesmo numero; a reconciliacao e a P-07B.
- PCCLIENT.DTULTCOMP entre :dt_ini e :dt_fim: descartada por construcao. O campo guarda apenas a ULTIMA compra, entao um cliente que comprou dentro da janela mas voltou a comprar depois teria DTULTCOMP fora da janela e sumiria da contagem - o numero so bateria para a janela mais recente.
- Contar NUMNOTA distinto em vez de usar a PK: descartada - NUMNOTA e apenas o numero impresso, unico por serie/filial, nao globalmente.
- Filtrar TIPOVENDA/CONDVENDA para excluir bonificacao/troca/remessa: NAO aplicada agora, deliberadamente. Seria conceitualmente mais pura (brinde nao e positivacao comercial), mas o valor medido de 114 foi apurado sem esse corte; aplicar um filtro nao medido quebraria a ancora de sanidade. Virou P-07A - so entra depois de conhecido o tamanho do efeito, e nesse dia muda em SEIS indicadores no mesmo commit.
- Omitir o EXISTS CODOPER='S' (era o desenho ORIGINAL): DESCARTADO na consolidacao - IND-07 era o card oficial e o unico da trinca sem o EXISTS, enquanto IND-01 e IND-03 o aplicavam para o mesmo conceito.

### Grao e fontes

Cliente distinto x periodo (1 linha agregada; drills naturais por RCA/praca reaproveitam DIM-02).

- PCNFSAID (oficial - cabecalho da NF de saida; PK NUMTRANSVENDA = 1 linha por nota)
- PCMOV (regua canonica de venda via EXISTS CODOPER='S')
- PCPEDC (apenas para o auxiliar positivados_via_pedido e o diagnostico da diferenca NF vs pedido; PK NUMPED)

### Armadilhas

- NF cancelada positivando cliente indevidamente: 210 NFs canceladas na base, com VLTOTAL zerado e portanto invisiveis a um filtro por valor. DTCANCEL IS NULL impede que um cliente cuja unica nota foi cancelada entre na contagem - numa contagem DISTINCT o cancelamento NAO se dilui como se diluiria num SUM: ele cria um cliente fantasma.
- Pedido cancelado no auxiliar: PCPEDC.POSICAO <> 'C' (100 pedidos cancelados na base).
- Dupla contagem por JOIN entre NF e PEDIDO: um pedido pode gerar varias notas e uma nota pode consolidar varios pedidos. O SQL nunca faz esse JOIN - usa conjuntos independentes combinados por INTERSECT/MINUS, o que torna o resultado imune a fan-out. E a decisao tecnica mais forte do lote.
- Fan-out de item: contar positivacao em PCMOV (grao de item, ~1.272 linhas em 30d) inflaria qualquer metrica agregada em conjunto; alem disso PCMOV.CODCLI e NULLABLE enquanto PCNFSAID.CODCLI e NOT NULL. O SQL fica no cabecalho e usa PCMOV so no EXISTS (semi-join).
- Cliente com varias notas contado varias vezes: resolvido por COUNT sobre conjunto DISTINCT, nao por COUNT(*) das notas.
- Divisao por zero na media de notas quando a janela nao tem faturamento: NULLIF -> retorna NULL, nao ORA-01476.
- Perda do ultimo dia da janela: dtsaida < TRUNC(:dt_fim) + 1 em vez de <= :dt_fim, entao notas com componente de hora no dia final entram.
- Indice descartado por funcao na coluna: TRUNC aplicado nos binds, nunca em DTSAIDA/DATA, preservando o range scan.
- Janela vazia retornando zero linhas e quebrando o card: os agregados sao subconsultas escalares sobre DUAL, entao o SQL sempre devolve exatamente 1 linha (VALOR = 0).
- Contar NUMNOTA distinto: NUMNOTA e apenas o numero impresso, unico por serie/filial, nao globalmente. A PK real e NUMTRANSVENDA, entao COUNT(*) sobre o cabecalho ja e a contagem correta de notas.
- Filial: deliberadamente sem filtro CODFILIAL. Hoje seria no-op (todas as fatos sao filial '1'; a 99 e so cadastro consolidador e nao emite NF), mas fixar '1' faria o indicador excluir silenciosamente uma futura filial. Coerente com os outros 8 apos a consolidacao.
- BONIFICACAO NAO FILTRADA (risco residual assumido): TIPOVENDA/CONDVENDA nao entram no WHERE, de proposito, para o VALOR continuar reconciliavel com os 114 medidos. Se houver volume relevante de bonificacao, cliente que so recebeu brinde conta como positivado e o VALOR esta superestimado - P-07A.

### SQL

```sql
WITH nf AS (
    /* REGUA CANONICA DE NOTA DE VENDA (unificada na consolidacao):
       NF de saida nao cancelada, na janela, COM item de venda vivo.
       TRUNC aplicado nos BINDS (nunca na coluna) para preservar indice em DTSAIDA,
       e o limite superior usa "< dt_fim + 1" para incluir o ultimo dia INTEIRO,
       mesmo que DTSAIDA venha com componente de hora. */
    SELECT n.numtransvenda,
           n.codcli
    FROM   pcnfsaid n
    WHERE  n.dtsaida  >= TRUNC(:dt_ini)
      AND  n.dtsaida  <  TRUNC(:dt_fim) + 1
      AND  n.dtcancel IS NULL
      AND  EXISTS (SELECT 1
                     FROM pcmov m
                    WHERE m.numtransvenda = n.numtransvenda
                      AND m.codoper       = 'S'
                      AND m.dtcancel IS NULL)
),
cli_nf AS (
    /* Conjunto oficial: clientes distintos com venda faturada. */
    SELECT DISTINCT codcli FROM nf
),
cli_ped AS (
    /* Conjunto auxiliar: clientes com pedido nao cancelado na janela.
       PCPEDC.POSICAO e NOT NULL (verificado no dicionario) -> "<> 'C'" nao
       descarta linha por NULL, dispensando NVL. */
    SELECT DISTINCT p.codcli
    FROM   pcpedc p
    WHERE  p.data    >= TRUNC(:dt_ini)
      AND  p.data    <  TRUNC(:dt_fim) + 1
      AND  p.posicao <> 'C'
)
/* Os conjuntos sao combinados por INTERSECT/MINUS e subconsultas escalares --
   nunca por JOIN entre NF e PEDIDO -- porque 1 pedido pode gerar N notas e 1 nota
   pode consolidar N pedidos: um JOIN causaria fan-out e dupla contagem. */
SELECT
    (SELECT COUNT(*) FROM cli_nf)                                      AS valor,
    (SELECT COUNT(*) FROM cli_ped)                                     AS positivados_via_pedido,
    (SELECT COUNT(*) FROM nf)                                          AS qt_notas,
    ROUND( (SELECT COUNT(*) FROM nf)
           / NULLIF((SELECT COUNT(*) FROM cli_nf), 0), 2)              AS media_notas_por_positivado,
    (SELECT COUNT(*) FROM (SELECT codcli FROM cli_nf
                           INTERSECT
                           SELECT codcli FROM cli_ped))                AS positivados_nf_e_pedido,
    (SELECT COUNT(*) FROM (SELECT codcli FROM cli_nf
                           MINUS
                           SELECT codcli FROM cli_ped))                AS positivados_so_nf,
    (SELECT COUNT(*) FROM (SELECT codcli FROM cli_ped
                           MINUS
                           SELECT codcli FROM cli_nf))                 AS positivados_so_pedido
FROM dual
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `positivados_via_pedido` | Clientes distintos com pedido nao cancelado (POSICAO <> 'C') na mesma janela. Visao comercial/esforco de venda, contraponto a visao faturada. Esperado ~110 em 30d. |
| `qt_notas` | Notas fiscais de venda validas emitidas no periodo (COUNT(*) e seguro: PK NUMTRANSVENDA = 1 linha por nota). Esperado ~318. Tem de bater com IND-01.QTD_NOTAS e IND-03.notas. |
| `media_notas_por_positivado` | qt_notas / valor = frequencia de compra no periodo (~2,79 em 30d). Subir esse numero e vender mais vezes para a mesma base; e o complemento da positivacao, que mede a largura da base. Tem de bater com IND-03.notas_por_cliente. |
| `positivados_nf_e_pedido` | Clientes nas duas visoes - o nucleo coerente (pedido registrado e faturado dentro da janela). |
| `positivados_so_nf` | Faturaram mas nao tem pedido na janela. Explica parte da diferenca 114 vs 110: NF sem pedido (venda balcao/faturamento manual) ou pedido feito ANTES do inicio da janela e faturado dentro dela. |
| `positivados_so_pedido` | Pediram mas nao foram faturados na janela - pedido em aberto, cortado, preso em credito, ou que so vai faturar no periodo seguinte. E a fila de positivacao que ainda pode virar receita. |

### Valor esperado e sanidade

VALOR ~ 114 clientes em 30d (medido na base real, MAS ANTES do EXISTS - reconferir; ver P-IND01-D). Auxiliares em 30d: positivados_via_pedido ~ 110, qt_notas ~ 318, media_notas_por_positivado ~ 2,79. Sanidade estrutural: VALOR nunca pode passar de 235 (IND-04.total_bruto_cadastro) - se passar, ha dupla contagem; e positivados_nf_e_pedido + positivados_so_nf tem de ser exatamente igual a VALOR (algebra de conjuntos). IDENTIDADES DE CONJUNTO (obrigatorias apos a unificacao da regua): VALOR = IND-01.CLIENTES_COM_NF_VENDA = IND-03.clientes_distintos = IND-06.positivados_periodo = IND-08.qt_positivados_nf_total; qt_notas = IND-01.QTD_NOTAS = IND-03.notas; e IND-03.valor x VALOR = IND-01.valor. Os tres cortes de conjunto (nf_e_pedido / so_nf / so_pedido) nao foram medidos individualmente - P-07C.

### Observacoes

SQL APROVADO SEM CORRECAO na auditoria individual - a auditora tentou reprovar e nao conseguiu: 7/7 colunas existem; PCNFSAID.CODCLI e PCPEDC.POSICAO sao NOT NULL (os NVL sao mesmo dispensaveis); PKs confirmadas em fase6_pks.csv; a identidade positivados_nf_e_pedido + positivados_so_nf = valor e verdadeira por algebra de conjuntos; 318/114 = 2,79 confere.

UNICA MUDANCA DA CONSOLIDACAO: acrescentado o EXISTS CODOPER='S' na CTE nf. Motivo (a correcao de coerencia numero 1 do lote): IND-07 e o card OFICIAL de 'Clientes positivados' e era o UNICO da trinca que NAO aplicava o EXISTS, enquanto IND-01 e IND-03 aplicavam para o MESMO conceito. Por construcao, (NF+EXISTS) esta contido em (NF pura): IND-01 e IND-03 NUNCA poderiam ser maiores que IND-07 - e os tres declaravam esperar 114. Matematicamente, no maximo um estava certo. Pior: IND-01 justifica o EXISTS afirmando que PCNFSAID guarda remessa, transferencia e devolucao a fornecedor - se isso for verdade, o IND-07 contava como 'positivado' o cliente que so recebeu remessa, e o numero OFICIAL do painel estava superestimado. Adotado o EXISTS em todos os seis indicadores que contam 'quem comprou' (IND-01/03/05/06/07/08), porque e a definicao mais defensavel: quem so recebeu remessa nao positivou.

STATUS a_validar: consequencia direta e honesta da unificacao - o valor de referencia 114 foi medido SEM o EXISTS, entao precisa ser reprocessado. Nao e defeito do SQL.

PENDENCIA QUE FECHA TUDO (P-IND01-D, prioridade maxima, roda em segundos): SELECT COUNT(*) nf_todas, ROUND(SUM(n.vltotal),2) vl_todas, COUNT(CASE WHEN EXISTS (SELECT 1 FROM pcmov m WHERE m.numtransvenda=n.numtransvenda AND m.codoper='S' AND m.dtcancel IS NULL) THEN 1 END) nf_com_venda, COUNT(DISTINCT n.codcli) cli_todos FROM pcnfsaid n WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-30 AND n.dtsaida < TRUNC(SYSDATE)+1; - se nf_com_venda = nf_todas = 318, o EXISTS nao remove nada, o 114 continua valido e SEIS indicadores sobem para validado de uma vez. Se remover algo, o 114 e os 470.580 mudam e TODOS os cards devem ser republicados juntos.

OUTRAS PENDENCIAS: P-07A (bonificacao/TIPOVENDA - se o filtro entrar, IND-01/03/05/06/07/08 + VEN-05/DIM-02 mudam no MESMO commit, senao a positivacao passa a ter dois valores oficiais); P-07B (reconciliar com VEN-05/DIM-02, que medem o mesmo conceito via PCMOV - devem bater); P-07C (explicar a diferenca 114 vs 110 nominalmente).

DIFERENCA CONCEITUAL - os tres indicadores de cliente que sao confundidos: POSITIVADOS (IND-07) = FLUXO dentro da janela, zera e recomeca a cada mes, mede a largura da base atendida no mes. ATIVOS (IND-06) = ESTOQUE de relacionamento por RECENCIA numa janela de 90d ancorada em :dt_fim - um cliente que comprou ha 40 dias esta ATIVO mas NAO esta positivado no mes corrente, por isso positivados <= ativos. NOVOS (IND-05) = PRIMEIRA COMPRA da historia caindo na janela; e SUBCONJUNTO estrito dos positivados (todo novo positiva; quase nenhum positivado e novo). ARMADILHA: o DIM-04 do catalogo chama de 'novos clientes' a contagem por PCCLIENT.DTCADASTRO - isso e PROSPECCAO/cadastro (= IND-04.cadastrados_no_periodo), nao primeira compra. Sao metricas diferentes e nao devem ser somadas nem comparadas diretamente.

COSMETICO: os auxiliares foram padronizados em minuscula neste arquivo (o SQL declara sem aspas e o Oracle devolve MAIUSCULA) - se o backend casar nome de coluna case-sensitive, usar upper().

### Pendencias

- **P-IND01-D (BLOQUEANTE, prioridade maxima do lote)** - medir se o EXISTS remove alguma nota. Roda em segundos e fecha o status de SEIS indicadores. SQL no `obs`.
- P-07A (bonificacao/TIPOVENDA) - se houver volume relevante fora da venda mercantil, o VALOR esta superestimado. `SELECT tipovenda, condvenda, COUNT(*) qt_notas, COUNT(DISTINCT codcli) clientes, ROUND(SUM(vltotal),2) valor FROM pcnfsaid WHERE dtsaida >= TRUNC(SYSDATE)-30 AND dtcancel IS NULL GROUP BY tipovenda, condvenda ORDER BY qt_notas DESC;` Se o filtro entrar, muda em SEIS indicadores + VEN-05/DIM-02 no mesmo commit.
- P-07B - reconciliar IND-07 (PCNFSAID) com VEN-05/DIM-02 (PCMOV), que medem o mesmo conceito por outra fonte. Devem bater; divergencia indica filtro errado em um dos dois.
- P-07C - explicar a diferenca 114 (NF) vs 110 (pedido): identificar nominalmente os clientes so-NF e so-pedido para saber se e venda sem pedido, pedido de janela anterior faturado agora, ou pedido represado. Os auxiliares positivados_so_nf / positivados_so_pedido ja entregam os numeros; falta a lista.
- P-07D (CORRECAO DE PREMISSA) - DTULTCOMPRA realmente nao existe, MAS PCCLIENT.DTULTCOMP (sem o 'RA') EXISTE e o DIM-08 do catalogo ja depende dele sem que o frescor tenha sido medido.

---

## IND-08 - % clientes positivados (cobertura da carteira)

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** percentual &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** empresa/periodo (base: cliente)

### Definicao

De cada 100 clientes da minha carteira, quantos compraram no periodo. Numerador: clientes distintos com ao menos uma NF de venda nao cancelada no periodo, restrito a carteira. Denominador: carteira cadastral apta - clientes ja cadastrados ate o fim do periodo, ainda nao excluidos e nao bloqueados definitivamente (continuam contando os bloqueados por credito e por inatividade, que sao justamente os que o comercial precisa recuperar).

### Por que essa definicao

Escolhido o denominador (a) carteira cadastral apta, e NAO a base ativa 90d, por um motivo matematico que inviabiliza (b) como oficial neste BI: o backend roda o MESMO SQL para qualquer janela e para o periodo anterior. Com denominador 'ativos nos ultimos 90d encerrando em :dt_fim', o numerador e subconjunto do denominador e o KPI DEGENERA - janela de 90d devolve exatamente 100,00% SEMPRE, e janela de 180d ultrapassa 100% (viola o contrato 0-100). Ancorar os 90d antes de :dt_ini corrige o teto mas joga fora do denominador os clientes novos/reativados que estao no numerador, e exige 90d de historia antes da janela: com dados so a partir de out/2025, uma analise de nov/2025 teria denominador irrisorio. A carteira cadastral e window-independent: o denominador e praticamente estavel entre periodo atual e anterior, entao a variacao do KPI isola o que o dono quer ver (mudou o esforco comercial, nao mudou a regua). E tambem a traducao literal da pergunta do dono ('de TODOS os meus clientes, quantos % compraram') e, com apenas 235 cadastros, o ruido cadastral que destroi essa definicao em distribuidoras de dezenas de milhares de clientes e auditavel a olho nu. DECISAO DELIBERADA dentro do denominador: mantidos BLOQUEIO='S' (bloqueio de credito - temporario e reversivel pelo proprio comercial) e BLOQUEIOINATIVIDADE='S' (cliente parado e exatamente a falha que o KPI existe para expor). Tirar inativos do denominador cria o gaming classico da cobertura: bloqueia-se o cliente morto e o indicador 'melhora' sem uma venda a mais. So saem quem esta estruturalmente fora do jogo: DTEXCLUSAO preenchida e BLOQUEIODEFINITIVO='S'. Este criterio virou a CARTEIRA APTA CANONICA do projeto - IND-04.carteira_apta e IND-06.carteira_apta foram alinhados a ele.

### Alternativas descartadas

- (b) Denominador = clientes ATIVOS na janela de 90d. Descartado como OFICIAL por defeito matematico: o numerador e subconjunto do denominador - janela de 90d devolve 100,00% sempre, janela maior passa de 100%. Tambem e auto-referente (numerador e denominador saem do mesmo fato: um mes fraco encolhe o denominador do trimestre e mascara a queda) e, com ~9 meses de historia, uma janela no comeco da base teria denominador irreal. Entregue como pct_sobre_base_ativa_90d + qt_base_ativa_90d, com intersecao explicita.
- (b') Base ativa ancorada nos 90d ANTERIORES a :dt_ini. Resolve o teto, mas exclui do denominador os clientes novos e reativados que estao no numerador, e o numero deixaria de bater com a positivacao de manchete sem explicacao obvia. Complexidade alta, explicabilidade baixa.
- (c) Denominador = carteira do RCA. Nao serve como numero oficial da empresa: e uma quebra, nao um total. Entregue como cobertura_por_rca, reconciliando exatamente com o total.
- Denominador = 235 cru (COUNT(*) de PCCLIENT sem filtro). Descartado: conta cliente excluido e bloqueado definitivamente, que nao tem como comprar. Fica visivel como qt_cadastro_total.
- Denominador filtrando BLOQUEIO <> 'S' (criterio do VEN-05 e do IND-06 original). Descartado: bloqueio de credito e temporario e reversivel, e tirar bloqueado por inatividade do denominador permite maquiar cobertura bloqueando cliente morto. ESTE CRITERIO VENCEU e virou o canonico do projeto.
- Numerador via PCPEDC (110 clientes em 30d contra 114 por NF): positivacao e venda concretizada, nao pedido.
- Numerador via PCMOV codoper='S': equivalente em clientes distintos, mas PCNFSAID e a fonte natural do faturamento (1 linha por nota, nao por item), mais barata e alinhada aos 114 medidos.
- Recencia via PCCLIENT.DTULTCOMP: coluna existe, mas depende de manutencao do ERP; a base ativa 90d e calculada do fato.

### Grao e fontes

Empresa / periodo (1 linha). Grao-base de contagem = cliente (CODCLI). Auxiliar quebrado por RCA titular (PCCLIENT.CODUSUR1).

- PCNFSAID (numerador: NF de saida nao cancelada - CODCLI, DTSAIDA, DTCANCEL)
- PCMOV (regua canonica de venda via EXISTS CODOPER='S')
- PCCLIENT (denominador: carteira - CODCLI, CODUSUR1, DTCADASTRO, DTEXCLUSAO, BLOQUEIODEFINITIVO)
- PCUSUARI (nome do RCA no auxiliar por vendedor - CODUSUR, NOME; PK CODUSUR, 8 linhas)

### Armadilhas

- DENOMINADOR QUE DEGENERA CONFORME A JANELA (o raciocinio central deste indicador): e o motivo de a base ativa 90d ter sido descartada como oficial - janela de 90d -> 100,00% fixo; 180d -> passa de 100. O denominador oficial nao depende da duracao da janela, entao o SQL funciona para qualquer :dt_ini/:dt_fim e a comparacao automatica com o periodo anterior e honesta.
- KPI passar de 100%: o numerador e a INTERSECAO com a carteira (LEFT JOIN a partir de base, contando so quem esta nela), entao cliente que comprou e depois foi excluido/bloqueado definitivamente nao estoura o teto - a diferenca fica visivel em qt_positivados_nf_total em vez de virar 103%.
- GAMING DO DENOMINADOR: bloquear cliente por inatividade NAO melhora o indicador - BLOQUEIOINATIVIDADE e BLOQUEIO (credito) continuam contando na carteira; so saem exclusao e bloqueio definitivo.
- ANACRONISMO DE CADASTRO: DTCADASTRO < :dt_fim+1 impede que cliente cadastrado DEPOIS do periodo entre no denominador de um periodo passado (sem isso, o KPI historico afundaria sozinho a cada cliente novo); DTEXCLUSAO >= :dt_ini mantem na base quem foi excluido durante ou depois da janela.
- NF cancelada positivando cliente: DTCANCEL IS NULL em todos os CTEs (210 NFs canceladas, com VLTOTAL zerado - sem o filtro, cliente que teve a nota estornada contaria como atendido).
- Dupla contagem: PCNFSAID tem grao NUMTRANSVENDA (varias notas por cliente); uso SELECT DISTINCT codcli e LEFT JOIN contra PCCLIENT, cuja PK e CODCLI - o join nao pode fazer fan-out. CRITICO tambem no LEFT JOIN pcusuari: qt_carteira e qt_pos sao SOMADOS sobre esse join, entao CODUSUR duplicado faria o VALOR (media ponderada) sair errado - PCUSUARI tem PK CODUSUR e 8 linhas, sem fan-out.
- Divisao por zero: NULLIF no denominador oficial, no percentual por RCA e no percentual da base ativa 90d.
- ATRIBUICAO CRUZADA DE RCA: carteira e positivacao sao atribuidas pelo MESMO criterio (PCCLIENT.CODUSUR1, o RCA titular). O DIM-03 do catalogo mistura carteira por CODUSUR1 com positivados por CODUSUR do movimento, e por isso a soma das linhas nao fecha com o total quando um RCA vende para cliente de outro; aqui fecha por construcao.
- Corte de data perdendo o ultimo dia: DTSAIDA e DATE e pode ter hora; intervalo semiaberto (>= TRUNC(:dt_ini) e < TRUNC(:dt_fim)+1) em vez de BETWEEN.
- Bind inexistente: nao uso :codfilial (so :dt_ini/:dt_fim existem no contrato). O KPI e da empresa; omitir o filtro da o mesmo numero hoje e nao quebra se abrir uma segunda filial.
- LISTAGG estourando 4000 chars: ON OVERFLOW TRUNCATE.
- PCCLIENT.DTULTCOMP como atalho de recencia: nao usado. A coluna existe, mas e campo mantido pelo faturamento do ERP e sem frescor verificado - a base ativa 90d e derivada do fato (PCNFSAID).
- NLS no tooltip: TO_CHAR(..., 'FM990D0') usa 'D' = separador decimal do NLS da sessao, entao mostrara '75,0' ou '75.0' conforme NLS_NUMERIC_CHARACTERS do pool do backend. Cosmetico, mas fixar NLS evita inconsistencia entre ambientes.
- BLOQUEIODEFINITIVO e flag de estado ATUAL, nao historica: consultar periodo passado aplica o cadastro de hoje ao passado. Aceitavel (o efeito e despresivel perto do erro de usar denominador instavel) e qt_positivados_nf_total expoe qualquer distorcao.

### SQL

```sql
WITH par AS (
  SELECT TRUNC(:dt_ini) AS d_ini, TRUNC(:dt_fim) AS d_fim FROM dual
),
base AS (
  -- CARTEIRA APTA CANONICA DO PROJETO (= IND-04.carteira_apta = IND-06.carteira_apta),
  -- acrescida da guarda de anacronismo: cliente cadastrado DEPOIS do periodo nao entra
  -- no denominador de um periodo passado; quem foi excluido durante/depois continua.
  SELECT c.codcli, NVL(c.codusur1, -1) AS codusur
  FROM   pcclient c CROSS JOIN par p
  WHERE  (c.dtcadastro IS NULL OR c.dtcadastro < p.d_fim + 1)
  AND    (c.dtexclusao IS NULL OR c.dtexclusao >= p.d_ini)
  AND    NVL(c.bloqueiodefinitivo, 'N') <> 'S'
),
pos AS (
  -- REGUA CANONICA DE VENDA (EXISTS CODOPER='S' unificado na consolidacao)
  SELECT DISTINCT d.codcli
  FROM   pcnfsaid d CROSS JOIN par p
  WHERE  d.dtcancel IS NULL
  AND    d.dtsaida >= p.d_ini
  AND    d.dtsaida <  p.d_fim + 1
  AND    EXISTS (SELECT 1 FROM pcmov m
                  WHERE m.numtransvenda = d.numtransvenda
                    AND m.codoper = 'S' AND m.dtcancel IS NULL)
),
ativos90 AS (
  -- Mesma janela e mesma regua do IND-06.valor => os dois numeros sao identicos.
  SELECT DISTINCT d.codcli
  FROM   pcnfsaid d CROSS JOIN par p
  WHERE  d.dtcancel IS NULL
  AND    d.dtsaida >= p.d_fim - 89
  AND    d.dtsaida <  p.d_fim + 1
  AND    EXISTS (SELECT 1 FROM pcmov m
                  WHERE m.numtransvenda = d.numtransvenda
                    AND m.codoper = 'S' AND m.dtcancel IS NULL)
),
por_rca AS (
  -- Carteira E positivacao atribuidas pelo MESMO criterio (CODUSUR1, o RCA titular),
  -- para que a quebra SOME exatamente o total (o DIM-03 do catalogo mistura os criterios
  -- e por isso as linhas dele nao fecham com o total).
  SELECT b.codusur,
         COUNT(*) AS qt_carteira,
         COUNT(po.codcli) AS qt_pos
  FROM   base b
  LEFT   JOIN pos po ON po.codcli = b.codcli
  GROUP  BY b.codusur
),
rca_fmt AS (
  SELECT r.codusur, r.qt_carteira, r.qt_pos,
         CASE WHEN r.codusur = -1 THEN 'SEM RCA'
              ELSE NVL(u.nome, 'RCA ' || r.codusur) END
         || ': ' || r.qt_pos || '/' || r.qt_carteira || ' ('
         || TO_CHAR(ROUND(100 * r.qt_pos / NULLIF(r.qt_carteira,0), 1), 'FM990D0') || '%)' AS txt,
         ROUND(100 * r.qt_pos / NULLIF(r.qt_carteira,0), 1) AS pct
  FROM   por_rca r
  LEFT   JOIN pcusuari u ON u.codusur = r.codusur   -- PK CODUSUR => sem fan-out no SUM
)
SELECT ROUND(100 * SUM(f.qt_pos) / NULLIF(SUM(f.qt_carteira), 0), 2)      AS valor,
       SUM(f.qt_pos)                                                      AS qt_positivados_na_carteira,
       SUM(f.qt_carteira)                                                 AS qt_carteira_base,
       (SELECT COUNT(*) FROM pos)                                         AS qt_positivados_nf_total,
       (SELECT COUNT(*) FROM ativos90)                                    AS qt_base_ativa_90d,
       ROUND(100 * (SELECT COUNT(*) FROM pos p2
                    WHERE EXISTS (SELECT 1 FROM ativos90 a WHERE a.codcli = p2.codcli))
             / NULLIF((SELECT COUNT(*) FROM ativos90), 0), 2)             AS pct_sobre_base_ativa_90d,
       (SELECT COUNT(*) FROM pcclient)                                    AS qt_cadastro_total,
       LISTAGG(f.txt, ' | ' ON OVERFLOW TRUNCATE '...' WITHOUT COUNT)
         WITHIN GROUP (ORDER BY f.pct DESC NULLS LAST, f.codusur)
         AS cobertura_por_rca
FROM   rca_fmt f
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `qt_positivados_na_carteira` | Numerador: clientes da carteira apta com NF de venda no periodo (~114). RENOMEADO na consolidacao (era qt_positivados) para nao ser confundido com qt_positivados_nf_total nem com o card IND-07 - sao populacoes diferentes com nomes quase identicos no mesmo painel. |
| `qt_carteira_base` | Denominador oficial: carteira apta no periodo (<= 235). Tem de bater com IND-04.carteira_apta e IND-06.carteira_apta (a menos da guarda de anacronismo, que so difere ao consultar periodos passados). |
| `qt_positivados_nf_total` | Clientes distintos com NF de venda no periodo SEM cruzar com a carteira. Tem de ser IDENTICO a IND-07.valor, IND-06.positivados_periodo, IND-03.clientes_distintos e IND-01.CLIENTES_COM_NF_VENDA. Reconciliacao: se ficar ACIMA de qt_positivados_na_carteira, existe cliente que comprou e esta excluido/bloqueado definitivamente no cadastro - anomalia que merece revisao cadastral. |
| `qt_base_ativa_90d` | Alternativa (b): clientes com ao menos uma compra nos 90 dias encerrando em :dt_fim. E NUMERICAMENTE IDENTICO a IND-06.valor por construcao (mesma janela, fonte e regua) - se divergir, um dos dois SQLs foi alterado sem o outro. |
| `pct_sobre_base_ativa_90d` | Alternativa (b) calculada para comparacao: positivados INTERSECAO base ativa 90d / base ativa 90d. Intersecao explicita para nunca passar de 100. So e interpretavel com janela < 90d; em janela de exatamente 90d retorna 100,00% por construcao - que e exatamente o motivo de (b) ter sido descartada como oficial. |
| `qt_cadastro_total` | Total bruto de linhas em PCCLIENT (235). Comparado com qt_carteira_base mostra quanto o cadastro foi limpo pelos filtros. Igual a IND-04.total_bruto_cadastro. |
| `cobertura_por_rca` | Alternativa (c) como quebra, que e como se cobra a equipe: string 'Nome RCA: positivados/carteira (%)' por RCA titular (CODUSUR1), ordenada da maior para a menor cobertura. Soma exata: soma dos positivados = qt_positivados_na_carteira e soma das carteiras = qt_carteira_base. |

### Valor esperado e sanidade

~48% a 55% em 30d. Referencia empirica: 114 positivados / 235 cadastros = 48,5%; como o denominador so encolhe (excluidos e bloqueio definitivo saem), o valor tende a ficar igual ou acima disso - MAS isso e piso EMPIRICO, nao garantido: quando um cliente e removido da carteira, ele sai do numerador TAMBEM se for positivado. Formalmente, com j positivados removidos de k clientes, o piso 114/235 so se sustenta se j/k <= 0,485. Na pratica j~0 (excluido/bloqueado definitivo raramente compra). NAO inventar teto/piso duro no card. Auxiliares esperados: qt_positivados_na_carteira ~ 114, qt_carteira_base <= 235, qt_base_ativa_90d entre ~140 e ~170 (faixa unificada com IND-06), pct_sobre_base_ativa_90d ~ 60-80%. Se VALOR passar de 100 ou qt_positivados_na_carteira > qt_carteira_base, ha bug.

### Observacoes

SQL APROVADO SEM CORRECAO na auditoria individual - o raciocinio sobre a degeneracao do denominador e o melhor do lote e sustenta a escolha. 10/10 colunas conferidas; PKs conferidas (checagem CRITICA aqui por causa do SUM sobre o join com PCUSUARI).

MUDANCAS DA CONSOLIDACAO: (1) acrescentado o EXISTS CODOPER='S' aos CTEs pos e ativos90 (regua canonica); (2) qt_positivados RENOMEADO para qt_positivados_na_carteira - a auditoria apontou que qt_positivados (restrito a carteira) e qt_positivados_nf_total (sem restricao) e o card IND-07 sao colunas de nomes quase identicos com populacoes diferentes no mesmo painel; so divergem se houver cliente comprando com cadastro excluido/bloqueado definitivamente, mas quando divergirem ninguem saberia qual esta certo.

O CRITERIO DE CARTEIRA DESTE INDICADOR VIROU O CANONICO DO PROJETO: a auditoria de coerencia apontou que IND-06 excluia BLOQUEIO='S' da carteira e IND-08 nao, e que os dois numeros seriam exibidos como 'carteira' e nao bateriam. Adotado o criterio do IND-08 (so DTEXCLUSAO e BLOQUEIODEFINITIVO saem), por causa do argumento anti-gaming, e IND-04/IND-06 foram alinhados.

PONTE OBRIGATORIA NO TOOLTIP (a correcao de coerencia que evita o dono desconfiar do BI): o painel mostra 'Positivados = 114', 'Clientes cadastrados = X' e '% positivados = Y%'; se o dono fizer 114/X na calculadora NAO obtem Y, porque o denominador daqui nao era exibido em card nenhum. Agora IND-04.carteira_apta expoe o mesmo N, e o tooltip do IND-08 deve mostrar: 'cadastro bruto 235 -> menos excluidos -> base viva -> menos bloqueio definitivo -> carteira apta N -> positivados 114 -> Y%'.

STATUS a_validar por dois motivos: (1) o numerador depende do 114/EXISTS (P-IND01-D); (2) o dominio de BLOQUEIODEFINITIVO e assumido 'S'/'N' sem medicao - se for 0/1, o denominador sai errado e o % com ele.

PENDENCIAS: contar quantos clientes os filtros removem (SELECT COUNT(*) total, SUM(CASE WHEN dtexclusao IS NOT NULL THEN 1 ELSE 0 END) excluidos, SUM(CASE WHEN NVL(bloqueiodefinitivo,'N')='S' THEN 1 ELSE 0 END) bloq_definitivo, SUM(CASE WHEN NVL(bloqueio,'N')='S' THEN 1 ELSE 0 END) bloq_credito FROM pcclient; - se bloq_definitivo = 0, VALOR em 30d = exatamente 48,51% e a definicao vira identica ao 114/235 do briefing); confirmar o dominio de BLOQUEIODEFINITIVO; validar se TIPOVENDA precisa entrar no numerador (P-07A, mesma pendencia dos outros); verificar hierarquia matriz/filial (CODCLIPRINC) causando contagem dobrada da mesma empresa; aferir o frescor de DTULTCOMP (corrige o DIM-08 do catalogo); checar clientes com CODUSUR1 nulo (caem no bucket 'SEM RCA').

Nao duplica VEN-05 (contagem de positivados por RCA) nem DIM-03 (cobertura por RCA) - e o percentual unico da empresa, e absorve os dois como auxiliares em uma linha.

### Pendencias

- **P-IND01-D (BLOQUEANTE)** - reprocessar o numerador com o EXISTS.
- **Dominio de BLOQUEIODEFINITIVO** - assumido 'S'/'N' sem medicao. Se for 0/1, o denominador sai errado e o % com ele. `SELECT NVL(bloqueiodefinitivo,'(null)') v, COUNT(*) FROM pcclient GROUP BY NVL(bloqueiodefinitivo,'(null)');`
- Contar quantos clientes os filtros do denominador removem, para fechar o valor esperado: `SELECT COUNT(*) total, SUM(CASE WHEN dtexclusao IS NOT NULL THEN 1 ELSE 0 END) excluidos, SUM(CASE WHEN NVL(bloqueiodefinitivo,'N')='S' THEN 1 ELSE 0 END) bloq_definitivo, SUM(CASE WHEN NVL(bloqueio,'N')='S' THEN 1 ELSE 0 END) bloq_credito, SUM(CASE WHEN NVL(bloqueioinatividade,'N')='S' THEN 1 ELSE 0 END) bloq_inatividade FROM pcclient;` - **se bloq_definitivo = 0, VALOR em 30d = exatamente 48,51% e a definicao vira identica ao 114/235 do briefing.**
- P-07A (bonificacao/TIPOVENDA) - deixado sem filtro para bater com os 114 medidos. Mesma pendencia dos outros cinco.
- Hierarquia matriz/filial (CODCLIPRINC) causando contagem dobrada da mesma empresa - `SELECT COUNT(*) FROM pcclient WHERE codcliprinc IS NOT NULL AND codcliprinc <> codcli;` Nao gera erro de >100% (o SQL mede tudo por CODCLI dos dois lados), so muda a granularidade do que se chama 'cliente'.
- Frescor de PCCLIENT.DTULTCOMP contra o fato (corrige o DIM-08 do catalogo).
- Clientes com CODUSUR1 nulo (caem no bucket 'SEM RCA' do auxiliar) - se houver muitos, e falha de cadastro que distorce a cobranca por RCA.

---

## IND-09 - % margem de lucro (margem bruta de mercadoria)

**Status:** `a_validar` &nbsp;|&nbsp; **Formato:** percentual &nbsp;|&nbsp; **Depende do periodo:** sim &nbsp;|&nbsp; **Grao:** item de venda -> 1 linha/periodo

### Definicao

De cada R$ 100 vendidos em produtos no periodo, quanto sobra depois de pagar o custo da mercadoria vendida. E calculada item a item nas vendas faturadas: (preco do item x quantidade - custo do item x quantidade) / (preco x quantidade) x 100. E margem BRUTA de mercadoria: ainda NAO desconta impostos, frete, comissao de RCA nem despesas fixas - o que sobra de verdade no bolso e menor.

### Por que essa definicao

Tres decisoes fechadas. (1) GRAO = ITEM (PCMOV), nao a nota: so o item tem custo (PCNFSAID nao tem coluna de custo), entao a margem tem de nascer do item. Consequencia aceita: a base de venda e SUM(qt*punit) ~ R$ 439 mil em 30d, e nao o VLTOTAL da nota (~R$ 470 mil) - a diferenca de ~6,8% e imposto/frete de cabecalho, que nao e receita de mercadoria e portanto nao pertence nem ao numerador nem ao denominador da margem bruta. (2) CUSTO = CUSTOREAL, com NVL(custoreal, custofin) por seguranca. Medicao em 90d sobre PCMOV codoper='S': CUSTOFIN e CUSTOREAL sao IDENTICOS (media 53,4348; 3533/3533 linhas preenchidas, zero nulos e zero zerados) -> margem 31,59%. CUSTOCONT e a visao CONTABIL/fiscal (media 34,7499) -> margem 54,81%, que NAO e margem comercial e infla o resultado em 23 pontos. Como hoje CUSTOREAL e CUSTOFIN dao o mesmo numero, a ordem do NVL nao muda o valor - ela DECLARA a politica: o custo oficial da casa e o real, e o financeiro e so rede de protecao. Isso resolve a pendencia P-03 e substitui o VEN-07 do catalogo, que estava a_validar com o NVL invertido. (3) VENDA BRUTA, sem abater devolucoes - ver obs. CONSOLIDACAO: o recorte dos itens deixou de ser PCMOV.DTMOV e passou a ser a NOTA - ver obs.

### Alternativas descartadas

- CUSTOCONT como custo oficial - da 54,81% em 90d. E a visao contabil/fiscal (media 34,7499 contra 53,4348 do real); serve para balanco, nao para decidir preco. DESCARTADA: superestima a margem comercial em 23 pontos.
- CUSTOULTENT / CUSTOREP / CUSTOULTENTMED - custo da ultima entrada e de reposicao. Servem para PRECIFICAR a proxima venda (margem prospectiva), nao para medir a margem REALIZADA. DESCARTADOS: fariam a margem historica oscilar a cada compra nova, sem nada ter mudado nas vendas passadas.
- NVL(custofin, custoreal), como esta no VEN-07 do catalogo - hoje da exatamente o mesmo numero (colunas identicas em 3533/3533 linhas), mas declara a politica errada: a ordem do NVL e o que documenta qual e o custo oficial da casa. DESCARTADA em favor de NVL(custoreal, custofin).
- Margem sobre PCNFSAID.VLTOTAL (grao da nota) - impossivel: o cabecalho nao tem coluna de custo e VLTOTAL inclui impostos e frete. Obrigaria a misturar receita com imposto no denominador.
- Margem LIQUIDA de devolucoes (abatendo CODOPER='ED') - conceitualmente superior, mas depende da P-01 (confirmar via PCCFO que 'ED' e devolucao de cliente) e romperia a conciliacao com o faturamento bruto. DESCARTADA COMO OFICIAL AGORA, recomendada como indicador IRMAO (IND-09b).
- Margem liquida de impostos/comissao (margem de contribuicao) - e o numero que o dono realmente quer no fim, mas exige PCCONSOLIDARECEITA e a regra de comissao, e depende de duas pendencias. DESCARTADA neste indicador: seria vender como 'validado' um numero construido sobre hipoteses. Vira IND-09c.
- MARKUP sobre custo - (venda - custo)/custo x 100, que daria ~46,2% em vez de 31,59%. E metrica legitima no atacado, mas responde outra pergunta (base = custo). O pedido e % de MARGEM (base = venda). Manter as duas com o mesmo nome e a origem classica de briga entre comercial e financeiro.
- Excluir do calculo as linhas sem custo - deixaria a margem 'mais limpa', mas quebraria a conciliacao de venda_itens com o faturamento e esconderia o problema de cadastro. Preferimos manter toda a venda no denominador e DENUNCIAR a falha via pct_venda_sem_custo.
- Recorte por PCMOV.DTMOV (era a regua ORIGINAL) - DESCARTADA na consolidacao: NULLABLE=Y, sem amarracao a PCNFSAID (item vivo de NF cancelada entrava na margem). Substituida pela regua da NOTA.

### Grao e fontes

Periodo (1 linha agregada). Base de calculo no grao do ITEM de PCMOV, restrito aos itens de venda das NFs de venda validas da janela (mesma regua de IND-01.faturamento_itens_da_nota e IND-02).

- PCNFSAID - define a janela e o conjunto de notas de venda validas (regua canonica compartilhada com IND-01/02)
- PCMOV (fato do calculo: QT, PUNIT, CODOPER, DTCANCEL, CUSTOREAL, CUSTOFIN, CODPROD, NUMTRANSVENDA)
- PCPRODUT (apenas na quebra auxiliar por produto: CODPROD, DESCRICAO)
- PCUSUARI (apenas na quebra auxiliar por RCA: CODUSUR, NOME)

### Armadilhas

- ITENS CANCELADOS: sem m.dtcancel IS NULL entrariam 24% das linhas 'S' - canceladas mantem QT/PUNIT/CUSTO preenchidos e distorcem venda e custo ao mesmo tempo. E a armadilha n.1 desta base.
- CUSTO CONTABIL: usar CUSTOCONT da 54,81% em vez de 31,59% - 23 pontos de otimismo falso. CUSTOCONT e visao fiscal/contabil, nao o custo comercial. O SQL usa CUSTOREAL explicitamente.
- PVENDA NAO EXISTE em PCMOV (so PVENDA1/PVENDABASE/PVENDAEMB, que sao preco de tabela/embalagem, nao o praticado) - confirmado no dicionario. O preco praticado e PUNIT. Um SQL com m.pvenda estoura ORA-00904; com m.pvendabase daria uma margem ficticia de tabela.
- CUSTO NULO SUMINDO EM SILENCIO: SUM(qt*NULL) ignora a linha no custo mas a linha continua na venda - a margem sobe sozinha, sem erro nenhum. O NVL(...,0) torna isso explicito e pct_venda_sem_custo denuncia o problema em vez de esconde-lo.
- QT/PUNIT NULOS (lacuna fechada na consolidacao): sao NULLABLE no dicionario; linha com QT ou PUNIT nulo some do numerador E do denominador sem aparecer em pct_venda_sem_custo. Acrescentado o auxiliar linhas_sem_valor - nao altera o VALOR.
- DIVISAO POR ZERO: NULLIF(SUM(vl_venda),0) protege o denominador (janela sem venda, ou venda 100% bonificada com punit=0).
- OPERACOES ERRADAS NO MESMO SALDO: sem codoper='S' entrariam bonificacoes (SB, preco ~0 -> derruba a margem), devolucoes (ED/SD) e compras (E, 1.738 linhas) - que somariam custo de entrada contra venda de saida, misturando dois negocios diferentes no mesmo quociente.
- DUPLA CONTAGEM POR JOIN: o SQL nao faz join 1:N com cabecalho - usa IN sobre a CTE de notas (semi-join). Qualquer JOIN com PCNFSAID multiplicaria itens e inflaria venda e custo juntos (a margem % ate sobreviveria, mas venda_itens e margem_valor em R$ ficariam errados).
- DTMOV NULLABLE / ITEM DE NF CANCELADA (corrigido na consolidacao): o SQL original recortava por m.dtmov, que e NULLABLE=Y - item de venda com DTMOV nula sumia da margem em silencio - e nao amarrava a PCNFSAID, entao item vivo de NF cancelada entrava na margem (era pendencia aberta do proprio indicador). A regua da nota fecha os dois de uma vez.
- PERCENTUAL EM ESCALA ERRADA: retorna 0-100 (multiplicado por 100), nao 0-1.
- MISTURAR BASE DE NOTA COM BASE DE ITEM: calcular (PCNFSAID.VLTOTAL - custo dos itens)/VLTOTAL colocaria imposto e frete dentro da receita, daria margem ~6,8 p.p. otimista e compararia duas populacoes diferentes (318 notas x 1.272 itens).
- JANELA VAZIA: sem nenhuma linha, o SQL retorna 1 linha com VALOR NULL (agregacao sem GROUP BY). E intencional e nao e bug: 'nao houve venda' (NULL) e diferente de 'vendi exatamente ao custo' (0%). Se o backend precisar de numero, o tratamento e na apresentacao ('sem dados'), nao com NVL(valor,0) no SQL - que mentiria dizendo margem zero.

### SQL

```sql
-- IND-09 | % margem de lucro (margem bruta de mercadoria)
-- Grao de calculo: item de PCMOV. Retorna 1 linha.
-- Custo oficial: CUSTOREAL (NVL para CUSTOFIN por seguranca). NUNCA CUSTOCONT.
WITH nf_venda AS (
  -- REGUA CANONICA (unificada na consolidacao): a janela vem da NOTA (DTSAIDA), nao de
  -- PCMOV.DTMOV, que e NULLABLE=Y. Amarrar a PCNFSAID nao cancelada tambem elimina o
  -- risco de item vivo pertencente a NF cancelada entrar na margem.
  SELECT n.numtransvenda
    FROM pcnfsaid n
   WHERE n.dtcancel IS NULL
     AND n.dtsaida >= TRUNC(:dt_ini)
     AND n.dtsaida <  TRUNC(:dt_fim) + 1
     AND EXISTS (SELECT 1 FROM pcmov m2
                  WHERE m2.numtransvenda = n.numtransvenda
                    AND m2.codoper = 'S'
                    AND m2.dtcancel IS NULL)
),
itens AS (
  SELECT m.codprod,
         m.qt * m.punit                                        AS vl_venda,
         m.qt * NVL(NVL(m.custoreal, m.custofin), 0)           AS vl_custo,
         CASE WHEN NVL(NVL(m.custoreal, m.custofin), 0) = 0
              THEN m.qt * m.punit ELSE 0 END                   AS vl_venda_sem_custo,
         CASE WHEN m.qt IS NULL OR m.punit IS NULL
              THEN 1 ELSE 0 END                                AS flag_sem_valor
  FROM   pcmov m
  WHERE  m.codoper = 'S'                  -- so venda (exclui E/ED/EB/ER/SB/SD/SR/SP/SM...)
  AND    m.dtcancel IS NULL               -- 24% das linhas 'S' sao canceladas
  AND    m.numtransvenda IN (SELECT v.numtransvenda FROM nf_venda v)
)
SELECT ROUND(100 * (SUM(vl_venda) - SUM(vl_custo))
             / NULLIF(SUM(vl_venda), 0), 2)              AS valor,
       ROUND(SUM(vl_venda), 2)                           AS venda_itens,
       ROUND(SUM(vl_custo), 2)                           AS custo_total,
       ROUND(SUM(vl_venda) - SUM(vl_custo), 2)           AS margem_valor,
       COUNT(*)                                          AS linhas_item,
       COUNT(DISTINCT codprod)                           AS skus,
       ROUND(100 * SUM(vl_venda_sem_custo)
             / NULLIF(SUM(vl_venda), 0), 2)              AS pct_venda_sem_custo,
       SUM(flag_sem_valor)                               AS linhas_sem_valor
FROM   itens
```

### Auxiliares

| Coluna | Descricao |
|---|---|
| `venda_itens` | Venda dos itens no periodo = SUM(qt*punit), em R$ (~439 mil em 30d). Base (denominador) da margem. NAO e o faturamento por nota (~470 mil): a diferenca ~6,8% e imposto/frete do cabecalho. Tem de ser IDENTICO a IND-01.faturamento_itens_da_nota (mesma regua apos a consolidacao). |
| `custo_total` | Custo da mercadoria vendida = SUM(qt*CUSTOREAL), em R$ (~300 mil em 30d). E o CMV do periodo pela visao comercial - a MESMA visao que EST-01/EST-04 devem usar; nao misturar com CUSTOCONT. |
| `margem_valor` | Lucro bruto em R$ = venda_itens - custo_total (~139 mil em 30d). E o numero que o dono usa para comparar meses; a % sozinha engana quando o volume muda. OBRIGATORIO no card ao lado do % - ver obs (risco de leitura). |
| `linhas_item` | Linhas de item de venda consideradas (~1.272 em 30d). Tem de bater com IND-02.linhas_item (mesma regua). |
| `skus` | SKUs distintos vendidos no periodo (~238 em 30d). Detecta janela vazia ou filtro errado. Tem de bater com IND-02.skus_distintos. |
| `pct_venda_sem_custo` | ALERTA DE QUALIDADE: % da venda cujo item veio com custo nulo ou zero (essa venda entra com custo 0 e aparece como 100% de margem, inflando o indicador). Hoje = 0,00 (medido em 90d: zero nulos e zero zerados). Se subir acima de ~1, o valor da margem esta contaminado e deve ser investigado antes de acreditar no numero. |
| `linhas_sem_valor` | Acrescentado na consolidacao: linhas com QT ou PUNIT nulo, que somem do numerador E do denominador (SUM ignora NULL) sem aparecer em pct_venda_sem_custo, que so vigia o CUSTO. Fecha a lacuna de observabilidade apontada na auditoria. Esperado 0. |

### Valor esperado e sanidade

~31,6% (medido 31,59% em 90d sobre PCMOV codoper='S' com a regua DTMOV - reconferir com a regua da nota; desvio esperado de decimos). Em 30d: valor ~ 31-32%; venda_itens ~ R$ 439 mil; custo_total ~ R$ 300 mil; margem_valor ~ R$ 139 mil; linhas_item ~ 1.272; skus ~ 238; pct_venda_sem_custo = 0,00; linhas_sem_valor = 0. FAIXA DE SANIDADE 25%-38%. Diagnostico se sair fora: ~55% -> esta usando CUSTOCONT; ~100% ou pct_venda_sem_custo alto -> custo nulo/zerado entrando como 0; venda_itens muito acima de R$ 470 mil -> faltou o filtro DTCANCEL; venda_itens ~ R$ 470 mil exatos -> esta lendo PCNFSAID.VLTOTAL em vez de qt*punit; margem negativa ou muito baixa -> entraram bonificacoes (SB) ou devolucoes junto.

### Observacoes

MARGEM BRUTA, NAO LUCRO - DECLARACAO OBRIGATORIA NO TOOLTIP: este indicador e (PUNIT - CUSTOREAL) sobre PUNIT. NAO desconta ICMS, PIS, COFINS, ST, IPI, frete, comissao de RCA nem despesa fixa. Numa distribuidora de higiene esses itens pesam muito: a propria base mostra ~6,8% de diferenca entre o valor da nota (470 mil) e a soma dos itens (439 mil), e isso e so imposto/frete de cabecalho. Logo, 31,6% NAO e o que sobra no bolso. Rotulo sugerido: '% margem bruta de mercadoria (antes de impostos, frete e comissao)'.

RISCO DE LEITURA NO PAINEL (correcao de coerencia obrigatoria): o painel mostrara 'Faturamento R$ 470.580' e 'Margem 31,6%', e o dono que multiplicar 470.580 x 31,6% obtera R$ 148,7 mil quando o lucro bruto real e R$ 139 mil (margem_valor) - erro de ~R$ 9,7 mil por multiplicar margem-de-item por faturamento-de-nota. O card DEVE exibir margem_valor em R$ ao lado do % e rotular a base: 'sobre mercadoria (base R$ 439 mil, nao o faturamento de R$ 470 mil)'. Sem isso, a conta errada e o caminho de menor esforco para quem olha o painel. Esta divergencia IND-01 x IND-09 NAO e defeito - e a unica modelagem correta (o cabecalho nao tem custo, e imposto/frete nao e receita de mercadoria) - mas exige rotulo.

CORRECAO DA CONSOLIDACAO (motivo do a_validar): a auditoria de coerencia apontou que IND-09.venda_itens e IND-01.FATURAMENTO_ITENS eram apresentados como o MESMO ~R$ 439 mil mas usavam reguas diferentes - IND-09 recortava por PCMOV.DTMOV (NULLABLE=Y, sem amarracao a nota, sem filtro de filial) e IND-01 pela DATA DA NOTA. Item com DTMOV nula sumia daqui e permanecia no IND-01; se DTMOV <> DTSAIDA (virada de mes), os dois numeros com o mesmo rotulo divergiam; e a propria pendencia do IND-09 admitia que item vivo de NF cancelada entrava na margem. Adotada a regua da NOTA, conforme recomendacao da auditoria: fecha os tres problemas de uma vez e faz venda_itens = IND-01.faturamento_itens_da_nota e linhas_item/skus = IND-02 POR CONSTRUCAO. Consequencia honesta: o 31,59% foi medido com DTMOV, entao precisa ser reprocessado - dai o a_validar. Desvio esperado de decimos de ponto.

PENDENCIA QUE FECHA O a_validar (a mesma do IND-02, mede tudo de uma vez): SELECT COUNT(*) itens_s, SUM(CASE WHEN m.dtmov IS NULL THEN 1 ELSE 0 END) sem_dtmov, SUM(CASE WHEN TRUNC(m.dtmov) <> TRUNC(n.dtsaida) THEN 1 ELSE 0 END) dtmov_difere, SUM(CASE WHEN n.dtcancel IS NOT NULL THEN 1 ELSE 0 END) item_vivo_de_nf_cancelada FROM pcmov m JOIN pcnfsaid n ON n.numtransvenda = m.numtransvenda WHERE m.codoper='S' AND m.dtcancel IS NULL; Se os tres contadores derem 0, as reguas eram equivalentes, o 31,59% vale e IND-02/IND-09 sobem para validado.

PREMISSA ATACADA E CONFIRMADA PELA AUDITORIA: CUSTOREAL e custo UNITARIO (o SQL assume isso ao fazer qt*custoreal). Se fosse total da linha, 53,4348 x 1.272 linhas = R$ 67,9 mil de custo contra R$ 439 mil de venda -> margem 84,52%, incompativel com os 31,59% medidos (REFUTADA). Pela hipotese unitaria, a media SIMPLES implica punit ~78,11 e a media PONDERADA por qt implica punit 60,60 (=439k/7.244) com custo 41,46 - as duas devolvem razao custo/preco de 0,6841, ou seja 31,59% pelos dois caminhos. Coerencia exata.

DEVOLUCOES - RECOMENDACAO EXPLICITA: sim, conceitualmente devolucoes DEVERIAM abater. Uma venda devolvida nao e lucro. Mas NAO abato agora: (a) 'ED' = devolucao de cliente ainda e HIPOTESE (P-01, decodificar via PCCFO); (b) abater quebraria a conciliacao com o faturamento bruto (IND-01); (c) o volume e pequeno (253 linhas 'ED' contra 9.309 'S'), impacto tende a decimos de ponto. RECOMENDACAO: manter IND-09 como margem BRUTA e, assim que P-01 confirmar 'ED', publicar o IRMAO 'IND-09b - margem liquida de devolucoes' lado a lado, NUNCA sobrescrevendo este. Se a diferenca passar de ~1 ponto, a devolucao virou problema comercial e merece alerta proprio.

EVOLUCAO FUTURA (alto valor de negocio): 'IND-09c - margem de contribuicao %' (liquida de impostos, frete e comissao de RCA) e o numero que o dono realmente precisa para decidir preco. Depende de PCCONSOLIDARECEITA (que nao tem coluna de cancelamento - risco de contar imposto de NF cancelada) e da regra de comissao. Publicar como irmao, nunca como sobrescrita.

MARKUP x MARGEM: sobre os mesmos numeros, markup (base = custo) daria ~46,2% em vez de 31,59% (base = venda). Manter as duas com o mesmo nome e a origem classica de briga entre comercial e financeiro - o rotulo tem de dizer 'margem'.

CURIOSIDADE QUE MERECE CONFIRMACAO: CUSTOREAL e CUSTOFIN serem IDENTICOS em 100% das linhas (3533/3533) sugere parametrizacao sem ajuste financeiro sobre o custo real. Confirmar com o financeiro / rotina 1118 - se um dia ligarem o custo financeiro, os dois divergem e o NVL(custoreal, custofin) ja esta na ordem certa. Confirmar tambem se PUNIT ja e liquido de desconto de item; se o desconto morar noutra coluna, a margem real e MENOR que 31,6%.

CONSISTENCIA COM O CATALOGO: IND-09 SUBSTITUI o VEN-07 (Margem bruta %, a_validar com NVL(custofin,custoreal), travado na P-03). Ao publicar, marcar VEN-07 como resolvido por IND-09 e propagar a visao CUSTOREAL para EST-01 (valor de estoque) e EST-04 (CMV/giro) - a regra de ouro e que margem, CMV e valor de estoque usem a MESMA visao de custo. Se EST-04 continuar em CUSTOFIN o resultado hoje e identico, mas basta a parametrizacao Winthor mudar para os relatorios divergirem sem aviso.

RESSALVA: PCMOV nao tem PK declarada (nao aparece em fase6_pks.csv), entao 'chave logica NUMTRANSITEM' e afirmacao nao verificada. Nao afeta o SQL (que nao faz join nem DISTINCT por essa coluna), mas nao apresentar como fato conferido.

ANALISES AUXILIARES RECOMENDADAS (mesma regua, so trocar o SELECT): quebra por PRODUTO (LEFT JOIN pcprodut, PK CODPROD, 1:1) ordenada por margem_valor DESC mostra quem sustenta a casa; ordenada por margem_pct ASC caca itens vendidos abaixo do custo. Quebra por RCA (LEFT JOIN pcusuari via PCMOV.CODUSUR) revela o vendedor que bate meta de faturamento dando desconto - comparar o margem_pct de cada RCA contra os 31,6% da casa.

### Pendencias

- **P-IND09-REGUA (BLOQUEANTE - a mesma do IND-02, mede tudo de uma vez)** - itens 'S' com DTMOV nula, com TRUNC(DTMOV) <> TRUNC(DTSAIDA) e itens vivos de NF cancelada. Se os tres derem 0, o 31,59% vale e IND-02/IND-09 sobem para validado. SQL no `obs`.
- P-01 (herdada, ALTA) - decodificar o dominio de PCMOV.CODOPER via PCCFO para confirmar que 'ED' e devolucao de cliente e liberar o IND-09b (margem liquida de devolucoes). `SELECT m.codoper, m.codfiscal, f.desccfo, COUNT(*) qt, ROUND(SUM(m.qt*m.punit),2) vl FROM pcmov m LEFT JOIN pccfo f ON f.codfiscal = m.codfiscal WHERE m.dtcancel IS NULL GROUP BY m.codoper, m.codfiscal, f.desccfo ORDER BY m.codoper, qt DESC;`
- (MEDIA) - a medicao de custo cobriu 90 dias (3533 linhas). Confirmar que nao ha custo nulo/zerado nos ~9 meses completos, especialmente nos primeiros meses de implantacao, quando carga inicial costuma vir sem custo: `SELECT TRUNC(dtmov,'MM') mes, COUNT(*) linhas, SUM(CASE WHEN NVL(NVL(custoreal,custofin),0)=0 THEN 1 ELSE 0 END) sem_custo, ROUND(100*(SUM(qt*punit)-SUM(qt*NVL(NVL(custoreal,custofin),0)))/NULLIF(SUM(qt*punit),0),2) margem_pct FROM pcmov WHERE codoper='S' AND dtcancel IS NULL GROUP BY TRUNC(dtmov,'MM') ORDER BY 1;`
- (BAIXA) - confirmar com o financeiro / rotina 1118 por que CUSTOREAL == CUSTOFIN em 100% das linhas, e **se PUNIT ja e liquido de desconto de item** (se o desconto morar noutra coluna, a margem real e MENOR que 31,6%).
- (FUTURA, ALTA, valor de negocio) - evoluir para MARGEM DE CONTRIBUICAO (IND-09c), liquida de impostos, frete e comissao de RCA. Depende de PCCONSOLIDARECEITA (que nao tem coluna de cancelamento - risco de contar imposto de NF cancelada) e da regra de comissao. Publicar como IRMAO, nunca como sobrescrita.
- (FUTURA) - IND-09b (margem liquida de devolucoes) assim que a P-01 confirmar 'ED'. SQL pronto na spec original do especialista.
