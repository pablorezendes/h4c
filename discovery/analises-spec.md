# Spec de Análises — BI h4c (distribuidora Hygiene For Care)

> ## ⚠ CORRECAO APLICADA — regra de ouro, projecao mensal, churn e estoque
>
> Este documento descreve as analises **como foram entregues pelos especialistas**. Depois dele, a
> reforma das regras canonicas do cliente alterou o SQL de **35 analises** (nos dois dialetos:
> `analises-spec.json` para Oracle e `analises-spec-pg.json` para o espelho Postgres, que e o que
> roda por padrao). Onde este texto divergir, **vale o JSON**. O que mudou:
>
> **1. Regra de ouro (§1) — faturamento SEMPRE liquido de devolucao.** Toda analise que soma venda,
> receita, ticket, ABC ou margem passou a usar a medida canonica de `backend/app/regras.py`:
> `PCMOV`, `CODOPER IN ('S','ED')`, `DTCANCEL IS NULL`, `CODFILIAL='1'`, com o `'ED'` (devolucao de
> cliente) entrando **negativo** na mesma soma; custo em `CUSTOFIN`, tambem liquido (a devolucao
> abate receita **e** custo). Atingidas: ANA-ABC-01..06, ANA-MRG-01..05, ANA-SER-01/02/03/04/06,
> ANA-CRZ-01/03/04/05, ANA-RFM-01..05, ANA-REP-04, ANA-PRE-01/03, ANA-INT-06.
> Impacto medido da deducao (filial 1, 2026): **jan 10,87% · fev 6,43% · mar 3,16% · abr 2,74% ·
> mai 1,29% · jun 1,02%** do bruto — nao e "decimos de ponto".
> ANA-CRZ-01/04/05 deixaram de medir **pedido** (`PCPEDI`) e passaram a medir **faturamento**: pedido
> nao tem devolucao para deduzir e nao e o numero que o dono cobra.
>
> **2. Projecao (§7) — nunca "proximos 30 dias".** ANA-PRE-01/02/03, ANA-SER-06 e ANA-INT-06 projetam
> o **fechamento do mes corrente** por regra de tres de **dias uteis** (`realizado / dias uteis
> transcorridos x dias uteis do mes`), calculada em `backend/app/analytics.py` com o calendario de
> feriados de `backend/app/calendario.py`. A curva diaria termina no ultimo dia do mes. No dia 1
> (0 dia util) a projecao vem `null` com o aviso "aguardando dados".
>
> **3. Fase 2 do financeiro (§8/§12).** **ANA-FCR-08** ("quanto entra no caixa em 30/60/90 dias") e
> projecao de fluxo de caixa e foi marcada com `status: backlog` — nao pode ser publicada antes da
> rodada com o Vinicius/BPO. ANA-FCR-07 (risco de calote) e ANA-FCR-10 (aging roll-rate) **ficam**:
> sao cobranca, nao projecao de entrada de caixa. Ambas passaram a usar o filtro canonico de titulo
> (`PCPREST` guarda cadeias de estorno/reemissao) e a FCR-07 deixou de usar `PCCLIENT.DTULTCOMP`.
>
> **4. Churn (§9).** ANA-RFM-01..05 classificam cliente sumido pela regua canonica: teto absoluto de
> **30 dias**, gatilhos **1,6x** (risco) e **2,0x** (perdido) do ciclo medio dos **ultimos 90 dias**,
> ciclo **ancorado na ultima compra** do cliente e medido em `PCMOV`. Colunas `status_churn`,
> `limite_risco`, `limite_perdido` e `ciclo_indefinido` alinhadas a `/api/clientes/churn`.
>
> **5. Estoque e compras (§10).** ANA-REP-01/03/04/05/06: disponivel =
> `qtest - qtreserv - qtbloqueada - qtpendente` (o que o Ion Vendas enxerga); o **trancado**
> (`qtbloqueada - qtindeniz`) nunca entra no disponivel e virou coluna propria, inclusive em **dias de
> demanda**; a demanda passou a ser a do **mes fechado** (nao mais janela movel de 28 dias), liquida
> de devolucao. Cobertura, meta de **45 dias da curva A** e sugestao de compra (com cenario **+50%**)
> saem do pos-processador, que e quem tem o calendario de dias uteis.

Gerado em **2026-07-16** — consolidação das entregas de 10 especialistas após auditoria adversarial.

**53 análises** (de 56 entregues: 3 fundidas por redundância, 0 reprovadas) — **41 validadas**, **12 a validar**.

Fusões (dedupe entre especialistas): ANA-INT-02 → ANA-SER-04; ANA-INT-03 → ANA-SER-05; ANA-PRE-05 → ANA-REP-03 (detalhes no campo obs de cada análise mantida).

## Resumo por nível

| Nível | Qtde | Validadas | A validar |
|---|---:|---:|---:|
| Descritiva | 2 | 2 | 0 |
| Diagnóstica | 29 | 22 | 7 |
| Preditiva | 13 | 12 | 1 |
| Prescritiva | 9 | 5 | 4 |
| **Total** | **53** | **41** | **12** |

### Descritiva (2)

| ID | Título | Viz | Status |
|---|---|---|---|
| ANA-INT-01 | Curva de pedidos por hora do dia | barra | validado |
| ANA-RFM-01 | Segmentação RFM por quintis (NTILE) com rótulo de segmento por cliente | matriz | validado |

### Diagnóstica (29)

| ID | Título | Viz | Status |
|---|---|---|---|
| ANA-ABC-01 | Curva ABC de produtos por faturamento (Pareto 80/15/5) | pareto | validado |
| ANA-ABC-02 | Curva ABC de clientes por faturamento, com RCA e recência | pareto | validado |
| ANA-ABC-03 | Curva ABC de fornecedores pelo faturamento gerado × valor comprado | pareto | validado |
| ANA-ABC-04 | Matriz cruzada ABC-produto × ABC-cliente (3×3) | heatmap | validado |
| ANA-ABC-05 | Concentração de receita mês a mês: HHI e participação top-N | linha | validado |
| ANA-ABC-06 | ABC duplo por produto: faturamento × contribuição de margem (quadrantes de pricing) | scatter | a_validar |
| ANA-CAN-02 | Raio-X do cancelamento de linhas de venda: concentração por RCA × faixa de hora | heatmap | validado |
| ANA-CRZ-01 | Matriz cliente × departamento (white space de cross-sell) | matriz | validado |
| ANA-CRZ-02 | Basket analysis: pares de departamentos no mesmo pedido (suporte, confiança, lift) | barra_h | validado |
| ANA-CRZ-03 | Quadrante RCA: positivação × margem × faturamento | scatter | a_validar |
| ANA-CRZ-04 | Índice de mix praça × departamento (share local vs share companhia) | heatmap | validado |
| ANA-CRZ-05 | Departamento × dia-da-semana (padrão semanal de demanda) | heatmap | validado |
| ANA-DEV-01 | Mapa CODOPER × CFOP das operações de devolução (resolve a hipótese ED/SD) | tabela | validado |
| ANA-DEV-04 | Pareto de devolução por produto (valor devolvido e taxa sobre a venda do produto) | pareto | a_validar |
| ANA-DEV-05 | Taxa de devolução por RCA × mês (heatmap da carteira) | heatmap | a_validar |
| ANA-FCR-06 | Perfil de pagamento por cliente — atraso médio ponderado por valor | scatter | validado |
| ANA-INT-05 | Funil de POSICAO por hora de entrada do pedido | barra | validado |
| ANA-MRG-01 | Cubo de margem multi-eixo: mês × RCA × departamento/seção × praça | heatmap | a_validar |
| ANA-MRG-02 | Matriz BCG-like de produtos: margem% × volume de venda | scatter | a_validar |
| ANA-MRG-03 | Clientes com margem negativa ou anômala (outlier robusto por MAD) | tabela | a_validar |
| ANA-MRG-04 | Desconto praticado por RCA × mês — quem desconta demais? | linha | validado |
| ANA-REP-02 | Lead time real de reposição por fornecedor: média, mediana, P90 e gap vs cadastro | barra_h | validado |
| ANA-REP-04 | Dias sem estoque no período e venda perdida estimada (PCHISTEST + demanda não-restrita) | pareto | validado |
| ANA-RFM-02 | Mapa segmento RFM × RCA: onde estão o dinheiro e o risco de cada carteira | heatmap | validado |
| ANA-SER-01 | Série diária de faturamento com médias móveis 7/28d (tendência × ruído) | linha | validado |
| ANA-SER-02 | Índice sazonal por dia da semana — faturamento e pedidos | barra | validado |
| ANA-SER-03 | Curva intra-mês: % acumulado do faturamento por dia do mês (pacing de meta e quinzenas) | area | validado |
| ANA-SER-04 | Sazonalidade intradia: pedidos por hora (PCPEDC.HORA) × faturamento lançado por hora (PCMOV.HORALANC) | linha | validado |
| ANA-SER-05 | Heatmap dia-da-semana × hora dos pedidos (janelas de demanda) | heatmap | validado |

### Preditiva (13)

| ID | Título | Viz | Status |
|---|---|---|---|
| ANA-CAN-03 | Valor perdido mensal com cancelamentos e devoluções + projeção de 3 meses | barra | a_validar |
| ANA-FCR-07 | Score de risco de inadimplência explicável (0-100) por cliente | barra_h | validado |
| ANA-FCR-08 | Previsão de entrada de caixa 30/60/90 dias — curva empírica de recebimento | barra | validado |
| ANA-FCR-10 | Matriz de rolagem do aging (roll rates mês a mês) e perda esperada | heatmap | validado |
| ANA-INT-06 | Projeção intradia de fechamento do dia (pace de pedidos) | area | validado |
| ANA-PRE-01 | Forecast de faturamento diário — próximos 30 dias (regressão linear + sazonalidade de dia-da-semana) | linha | validado |
| ANA-PRE-02 | Forecast de pedidos (quantidade e valor) — próximos 30 dias via Holt-Winters aditivo m=7 | linha | validado |
| ANA-PRE-03 | Previsão de demanda por produto — top N em valor, horizonte 30 dias (Holt amortecido semanal) | linha | validado |
| ANA-PRE-04 | Classificação do padrão de demanda (ADI × CV²) + Croston-SBA para itens intermitentes | scatter | validado |
| ANA-REP-05 | Tendência de saldo diário e data prevista de ruptura por produto (regressão linear sobre PCHISTEST) | linha | validado |
| ANA-RFM-03 | Clientes ativos que romperam o próprio ciclo de recompra (recência > 2× ciclo individual) | tabela | validado |
| ANA-RFM-04 | Ranking de risco de churn: score 0-100 simples e explicável | barra_h | validado |
| ANA-SER-06 | Decomposição clássica + suavização Holt-Winters aditiva (m=7) com previsão de 14 dias | linha | validado |

### Prescritiva (9)

| ID | Título | Viz | Status |
|---|---|---|---|
| ANA-CRZ-06 | Departamentos lapsados por cliente (comprava e parou) — pauta de recuperação | tabela | validado |
| ANA-DEV-06 | Score prescritivo por cliente: quem devolve + cancela + quanto custa (lista de ação) | scatter | a_validar |
| ANA-FCR-09 | Lista priorizada de cobrança — valor × atraso × risco, com ação sugerida | tabela | validado |
| ANA-INT-04 | Ciclo pedido→faturamento em horas + horário de corte recomendado | barra | a_validar |
| ANA-MRG-05 | Simulação de teto de desconto por RCA — margem recuperável | barra_h | a_validar |
| ANA-REP-01 | Cobertura em dias com classificação prescritiva (ruptura / ruptura-iminente / saudável / excesso / sem giro) | scatter | validado |
| ANA-REP-03 | Ponto de reposição e sugestão de compra em unidades por produto A/B (política ROP + estoque de segurança) | tabela | validado |
| ANA-REP-06 | Excesso de estoque: capital imobilizado, excedente vs cobertura-alvo e ação sugerida (inclui pedido aberto em item já em excesso) | barra_h | a_validar |
| ANA-RFM-05 | Pauta semanal prescritiva por RCA: top 5 clientes por receita em risco com próxima ação | tabela | validado |

---

## Análises

## Nível: Descritiva

### ANA-INT-01 — Curva de pedidos por hora do dia

- **Nível:** descritiva  |  **Status:** validado  |  **Grão:** hora do dia (0-23), consolidado no período
- **Especialista:** operacao-intradia
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE), `hora_ini` (NUMBER (0-23), opcional, default: NULL), `hora_fim` (NUMBER (0-23), opcional, default: NULL)
- **Viz:** barra — Barras de pedidos por hora com linha secundária de pct_acumulado (combo barra+linha); tooltip com valor_pedidos e ticket_medio. Esperado pico 14h-17h (fato validado na base).

**Pergunta de negócio:** Em que horários entram os pedidos e qual o valor por faixa? Decide dimensionamento de televendas/faturista por turno, horário de almoço escalonado e a que horas o dia comercial está 'praticamente fechado' (pct_acumulado).

**Técnica:** Agregação por hora com percentual acumulado (janela analítica sobre GROUP BY); normalização por dias ativos para comparar períodos de tamanhos diferentes.

```sql
SELECT c.hora,
       COUNT(*)                                                        AS num_pedidos,
       SUM(NVL(c.vltotal,0))                                           AS valor_pedidos,
       ROUND(AVG(NVL(c.vltotal,0)), 2)                                 AS ticket_medio,
       COUNT(DISTINCT TRUNC(c.data))                                   AS dias_ativos,
       ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT TRUNC(c.data)),0), 2)    AS pedidos_por_dia,
       ROUND(100 * SUM(COUNT(*)) OVER (ORDER BY c.hora)
             / NULLIF(SUM(COUNT(*)) OVER (), 0), 2)                    AS pct_acumulado
FROM   pcpedc c
WHERE  c.data BETWEEN :dt_ini AND :dt_fim
AND    c.codfilial = '1'
AND    c.posicao <> 'C'
AND    (:hora_ini IS NULL OR c.hora >= :hora_ini)
AND    (:hora_fim IS NULL OR c.hora <= :hora_fim)
GROUP  BY c.hora
ORDER  BY c.hora
```

**Obs:** Colunas conferidas no fase2_dicionario.csv: PCPEDC.HORA (NUMBER, 100% populada), MINUTO, DATA, POSICAO, CODFILIAL, VLTOTAL. Esta análise DEFINE o padrão de filtro intradia herdado pelas demais: binds :hora_ini/:hora_fim opcionais via (:hora_ini IS NULL OR c.hora >= :hora_ini). VLTOTAL do pedido inclui não-faturados (POSICAO='L'); para valor efetivo usar as análises de faturamento. Auditoria: aprovada sem correção (TRUNC(c.data) é redundante porém inofensivo).

### ANA-RFM-01 — Segmentação RFM por quintis (NTILE) com rótulo de segmento por cliente

- **Nível:** descritiva  |  **Status:** validado  |  **Grão:** cliente (1 linha por cliente com >=1 venda não cancelada na janela)
- **Especialista:** Cientista de dados sênior — RFM e churn de clientes (distribuição/atacado)
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** matriz — Grade RFM 5×5: cada célula com a contagem de clientes e cor pelo segmento dominante; tooltip com soma de valor_total da célula. Tabela detalhada (codcli, cliente, praça, RCA, R/F/M, segmento) como drill-down abaixo da grade.

**Pergunta de negócio:** Quem são meus Campeões, quem está Em risco e quem está Hibernando entre os 235 clientes — e a qual praça/RCA cada um pertence — para direcionar a política comercial (mix, prazo, visita)?

**Técnica:** RFM clássico: Recência (dias desde a última NF), Frequência (dias distintos de compra), Monetário (soma VLTOTAL); quintis via NTILE(5) com desempate determinístico por codcli; rótulo por grade R × média(F,M) em 9 segmentos.

```sql
WITH vendas AS (
    SELECT n.codcli,
           TRUNC(n.dtsaida) AS dia,
           n.vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.codfilial = '1'
       AND n.dtsaida BETWEEN :dt_ini AND :dt_fim
),
agg AS (
    SELECT v.codcli,
           MAX(v.dia)          AS dt_ult_compra,
           COUNT(DISTINCT v.dia) AS frequencia,
           SUM(v.vltotal)      AS valor_total
      FROM vendas v
     GROUP BY v.codcli
),
scores AS (
    SELECT a.codcli,
           a.dt_ult_compra,
           TRUNC(:dt_fim) - a.dt_ult_compra                          AS recencia_dias,
           a.frequencia,
           a.valor_total,
           NTILE(5) OVER (ORDER BY a.dt_ult_compra, a.codcli)        AS score_r,
           NTILE(5) OVER (ORDER BY a.frequencia,   a.codcli)         AS score_f,
           NTILE(5) OVER (ORDER BY a.valor_total,  a.codcli)         AS score_m
      FROM agg a
),
rotulo AS (
    SELECT s.codcli, s.dt_ult_compra, s.recencia_dias, s.frequencia, s.valor_total,
           s.score_r, s.score_f, s.score_m,
           (s.score_f + s.score_m) / 2 AS score_fm
      FROM scores s
)
SELECT r.codcli,
       c.cliente,
       c.fantasia,
       c.codpraca,
       pr.praca,
       c.codusur1                                        AS codusur_rca,
       u.nome                                            AS rca,
       TO_CHAR(r.dt_ult_compra, 'YYYY-MM-DD')            AS dt_ult_compra,
       r.recencia_dias,
       r.frequencia,
       ROUND(r.valor_total, 2)                           AS valor_total,
       r.score_r,
       r.score_f,
       r.score_m,
       r.score_r || '-' || r.score_f || '-' || r.score_m AS celula_rfm,
       CASE
         WHEN r.score_r >= 4 AND r.score_fm >= 4 THEN 'Campeões'
         WHEN r.score_r >= 3 AND r.score_fm >= 3 THEN 'Clientes fiéis'
         WHEN r.score_r >= 4 AND r.score_fm >= 2 THEN 'Potenciais fiéis'
         WHEN r.score_r >= 4                     THEN 'Novos / recentes'
         WHEN r.score_r  = 3                     THEN 'Esfriando'
         WHEN r.score_fm >= 4                    THEN 'Não pode perder'
         WHEN r.score_r  = 2                     THEN 'Em risco'
         WHEN r.score_fm >= 2                    THEN 'Hibernando'
         ELSE 'Perdidos'
       END                                               AS segmento
  FROM rotulo r
  JOIN pcclient c      ON c.codcli    = r.codcli
  LEFT JOIN pcpraca pr  ON pr.codpraca = c.codpraca
  LEFT JOIN pcusuari u  ON u.codusur   = c.codusur1
 ORDER BY r.valor_total DESC
```

**Obs:** Frequência = dias distintos com NF (várias NFs no mesmo dia = 1 ato de compra), coerente com o ciclo de recompra das demais análises. Recência ancorada em :dt_fim, não em SYSDATE, para reprodutibilidade. Com 235 clientes cada quintil tem ~47; empates de frequência são desempatados deterministicamente por codcli. Monetário é bruto de NF de saída (devoluções ED de PCMOV não abatidas) e inclui eventuais bonificações — ver pendência de CONDVENDA. Clientes sem nenhuma compra na janela não entram aqui (são cobertos pelo DIM-08 já existente e pela ANA-RFM-03).

## Nível: Diagnóstica

### ANA-ABC-01 — Curva ABC de produtos por faturamento (Pareto 80/15/5)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** produto (agregado no período)
- **Especialista:** Curva ABC / Pareto (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01 (início da base)), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** pareto — Gráfico de Pareto clássico: barras de faturamento por produto em ordem decrescente, linha de % acumulado com marcações em 80% e 95%; tabela drill com classe, depto/seção e fornecedor. KPIs de cabeçalho: nº de SKUs por classe e % da receita de cada classe.

**Pergunta de negócio:** Quais SKUs sustentam 80% da receita e merecem prioridade de estoque/negociação, e quais ~500 itens da cauda C podem ser racionalizados do mix sem perder venda relevante?

**Técnica:** Pareto/ABC com window functions (SUM() OVER com ROWS UNBOUNDED PRECEDING); classe atribuída pelo acumulado ANTES do item (<80%=A, <95%=B, resto=C), garantindo que o item que cruza o limiar fica na classe superior

```sql
WITH venda AS (
  SELECT m.codprod,
         SUM(m.qt * m.punit)             AS vl_venda,
         SUM(m.qt)                       AS qt_vendida,
         COUNT(DISTINCT m.numtransvenda) AS num_notas
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codfilial = '1'
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  GROUP  BY m.codprod
),
rk AS (
  SELECT v.codprod, v.vl_venda, v.qt_vendida, v.num_notas,
         SUM(v.vl_venda) OVER ()                                   AS vl_total,
         SUM(v.vl_venda) OVER (ORDER BY v.vl_venda DESC, v.codprod
                               ROWS UNBOUNDED PRECEDING)           AS vl_acum,
         ROW_NUMBER()    OVER (ORDER BY v.vl_venda DESC, v.codprod) AS posicao
  FROM   venda v
)
SELECT r.posicao,
       r.codprod,
       p.descricao,
       p.codepto,
       p.codsec,
       p.codfornec,
       f.fornecedor,
       r.qt_vendida,
       r.num_notas,
       ROUND(r.vl_venda, 2)                               AS vl_venda,
       ROUND(100 * r.vl_venda / NULLIF(r.vl_total,0), 2)  AS pct_individual,
       ROUND(100 * r.vl_acum  / NULLIF(r.vl_total,0), 2)  AS pct_acumulado,
       CASE WHEN r.vl_acum - r.vl_venda < 0.80 * r.vl_total THEN 'A'
            WHEN r.vl_acum - r.vl_venda < 0.95 * r.vl_total THEN 'B'
            ELSE 'C' END                                   AS classe_abc
FROM   rk r
JOIN   pcprodut p ON p.codprod = r.codprod
LEFT   JOIN pcfornec f ON f.codfornec = p.codfornec
ORDER  BY r.posicao
```

**Obs:** Todas as colunas conferidas no fase2_dicionario.csv (PCMOV.NUMTRANSVENDA, QT, PUNIT, CODOPER, DTCANCEL, CODFILIAL; PCPRODUT.DESCRICAO/CODEPTO/CODSEC/CODFORNEC; PCFORNEC.FORNECEDOR). Difere do VEN-06 (mix) por computar classes A/B/C e acumulado no SQL. Regra do limiar: item que cruza 80% fica em A (acumulado antes do item < 80%). Bonificações (CODOPER='SB', 8 linhas) e devoluções ED ficam fora — ver pendências. Desempate determinístico por codprod no ORDER BY das janelas.

### ANA-ABC-02 — Curva ABC de clientes por faturamento, com RCA e recência

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** cliente (agregado no período)
- **Especialista:** Curva ABC / Pareto (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** pareto — Pareto de clientes com linha de acumulado; painel lateral 'clientes A em risco' (classe A com dias_sem_comprar alto) ordenado por vl_venda — lista de ação direta para os RCAs. Filtro por RCA para reunião de carteira.

**Pergunta de negócio:** Quais dos 235 clientes são classe A (foco de retenção/visita dos 8 RCAs), quais A/B estão há muitos dias sem comprar (risco imediato de receita) e qual carteira C consome esforço comercial desproporcional?

**Técnica:** Pareto/ABC por cliente com window functions + recência (dias desde a última compra) para cruzar valor × atividade; RCA cadastral via PCCLIENT.CODUSUR1

```sql
WITH venda AS (
  SELECT m.codcli,
         SUM(m.qt * m.punit)             AS vl_venda,
         COUNT(DISTINCT m.numtransvenda) AS num_notas,
         MAX(TRUNC(m.dtmov))             AS ultima_compra
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codfilial = '1'
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  AND    m.codcli IS NOT NULL
  GROUP  BY m.codcli
),
rk AS (
  SELECT v.codcli, v.vl_venda, v.num_notas, v.ultima_compra,
         SUM(v.vl_venda) OVER ()                                   AS vl_total,
         SUM(v.vl_venda) OVER (ORDER BY v.vl_venda DESC, v.codcli
                               ROWS UNBOUNDED PRECEDING)           AS vl_acum,
         ROW_NUMBER()    OVER (ORDER BY v.vl_venda DESC, v.codcli) AS posicao
  FROM   venda v
)
SELECT r.posicao,
       r.codcli,
       c.cliente,
       c.municent,
       c.codusur1                                          AS cod_rca,
       u.nome                                              AS rca,
       r.num_notas,
       r.ultima_compra,
       TRUNC(:dt_fim) - r.ultima_compra                    AS dias_sem_comprar,
       ROUND(r.vl_venda, 2)                                AS vl_venda,
       ROUND(100 * r.vl_venda / NULLIF(r.vl_total,0), 2)   AS pct_individual,
       ROUND(100 * r.vl_acum  / NULLIF(r.vl_total,0), 2)   AS pct_acumulado,
       CASE WHEN r.vl_acum - r.vl_venda < 0.80 * r.vl_total THEN 'A'
            WHEN r.vl_acum - r.vl_venda < 0.95 * r.vl_total THEN 'B'
            ELSE 'C' END                                    AS classe_abc
FROM   rk r
JOIN   pcclient c ON c.codcli = r.codcli
LEFT   JOIN pcusuari u ON u.codusur = c.codusur1
ORDER  BY r.posicao
```

**Obs:** Colunas conferidas: PCCLIENT.CODCLI/CLIENTE/MUNICENT/CODUSUR1; PCUSUARI.CODUSUR/NOME; PCMOV idem ANA-ABC-01. CODUSUR1 é o RCA cadastral e pode divergir do RCA que efetivamente vendeu (PCMOV.CODUSUR) — ver pendência. Com 235 clientes, espere ~20-40 clientes na classe A. Nome do cliente é PII — na camada semântica expor código + razão social conforme política já adotada no CMP-04. AUDITORIA (SQL corrigido): adicionado AND m.codcli IS NOT NULL na CTE venda — CODCLI é NULLABLE em PCMOV; sem o filtro, linha com CODCLI nulo entraria no vl_total mas seria descartada no join, e o pct_acumulado nunca fecharia 100%.

### ANA-ABC-03 — Curva ABC de fornecedores pelo faturamento gerado × valor comprado

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** fornecedor (agregado no período)
- **Especialista:** Curva ABC / Pareto (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** pareto — Pareto de fornecedores pelo faturamento que seus produtos geram; drill em tabela com vl_comprado e razao_fat_compra — razão baixa em fornecedor B/C sinaliza compra desproporcional (estoque empatado); razão alta em classe A sinaliza dependência a proteger.

**Pergunta de negócio:** Quais fornecedores sustentam a receita da distribuidora (prioridade em negociação de prazo, verba e exclusividade) e onde há descolamento entre o quanto se compra e o quanto os produtos dele efetivamente faturam (estoque empatado em fornecedor classe C)?

**Técnica:** Pareto/ABC por fornecedor usando o faturamento de venda dos seus produtos (PCMOV 'S' × PCPRODUT.CODFORNEC) como métrica de classe, cruzado com o valor comprado no período (PCNFENT restrita a notas com item CODOPER='E', padrão CMP-01/04)

```sql
WITH venda AS (
  SELECT p.codfornec,
         SUM(m.qt * m.punit)       AS vl_faturado,
         COUNT(DISTINCT m.codprod) AS skus_vendidos
  FROM   pcmov m
  JOIN   pcprodut p ON p.codprod = m.codprod
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codfilial = '1'
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  GROUP  BY p.codfornec
),
compra AS (
  SELECT n.codfornec,
         SUM(n.vltotal) AS vl_comprado
  FROM   pcnfent n
  WHERE  n.dtent BETWEEN :dt_ini AND :dt_fim
  AND    n.codfilial = '1'
  AND    n.dtcancel IS NULL
  AND    EXISTS (SELECT 1 FROM pcmov m
                 WHERE  m.numtransent = n.numtransent
                 AND    m.codoper = 'E'
                 AND    m.dtcancel IS NULL)
  GROUP  BY n.codfornec
),
rk AS (
  SELECT v.codfornec, v.vl_faturado, v.skus_vendidos,
         SUM(v.vl_faturado) OVER ()                                      AS vl_total,
         SUM(v.vl_faturado) OVER (ORDER BY v.vl_faturado DESC, v.codfornec
                                  ROWS UNBOUNDED PRECEDING)              AS vl_acum,
         ROW_NUMBER()       OVER (ORDER BY v.vl_faturado DESC, v.codfornec) AS posicao
  FROM   venda v
)
SELECT r.posicao,
       r.codfornec,
       f.fornecedor,
       r.skus_vendidos,
       ROUND(r.vl_faturado, 2)                               AS vl_faturado,
       ROUND(NVL(c.vl_comprado, 0), 2)                       AS vl_comprado,
       ROUND(r.vl_faturado / NULLIF(c.vl_comprado, 0), 2)    AS razao_fat_compra,
       ROUND(100 * r.vl_faturado / NULLIF(r.vl_total,0), 2)  AS pct_individual,
       ROUND(100 * r.vl_acum    / NULLIF(r.vl_total,0), 2)   AS pct_acumulado,
       CASE WHEN r.vl_acum - r.vl_faturado < 0.80 * r.vl_total THEN 'A'
            WHEN r.vl_acum - r.vl_faturado < 0.95 * r.vl_total THEN 'B'
            ELSE 'C' END                                      AS classe_abc
FROM   rk r
JOIN   pcfornec f ON f.codfornec = r.codfornec
LEFT   JOIN compra c ON c.codfornec = r.codfornec
ORDER  BY r.posicao
```

**Obs:** Colunas conferidas: PCPRODUT.CODFORNEC; PCNFENT.DTENT/VLTOTAL/DTCANCEL/NUMTRANSENT/CODFORNEC/CODFILIAL; PCMOV.NUMTRANSENT. A classe vem do faturamento gerado, não do valor comprado — complementa o CMP-04. Fornecedor com compra no período mas sem venda não aparece (driver é a venda). vl_comprado herda a granularidade de PCNFENT.VLTOTAL (impostos/frete inclusos — pendência P-19); a razao_fat_compra é indicativa, não margem. AUDITORIA (caveat herdado): PK de PCNFENT é composta (NUMTRANSENT + CODCONT) — se uma nota tiver mais de uma linha por CODCONT, SUM(VLTOTAL) pode dobrar o vl_comprado; mesma pendência P-21 do CMP-02, reavaliar quando P-21 fechar.

### ANA-ABC-04 — Matriz cruzada ABC-produto × ABC-cliente (3×3)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** célula classe_produto × classe_cliente (9 células, agregado no período)
- **Especialista:** Curva ABC / Pareto (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** heatmap — Heatmap 3×3 com intensidade pela % da receita. Leituras de decisão: célula AA muito quente = dupla concentração (risco); linha C×(A,B) com clientes relevantes = produtos candidatos a corte que exigem comunicação prévia; coluna A×(B,C) fria = produtos campeões ainda não positivados na carteira menor (pauta de visita do RCA).

**Pergunta de negócio:** A receita está concentrada em clientes A comprando produtos A (dupla dependência)? Clientes A compram a linha C (oportunidade de racionalizar mix sem tocar em quem paga as contas)? Produtos A penetram na carteira B/C (oportunidade de positivação dirigida)?

**Técnica:** Dupla classificação ABC no mesmo conjunto de linhas de venda (duas cadeias de window functions sobre agregados por produto e por cliente), com re-join das linhas às duas classes e agregação na matriz 3×3; % de receita por célula via SUM(SUM()) OVER ()

```sql
WITH linhas AS (
  SELECT m.codprod, m.codcli, m.qt * m.punit AS vl
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codfilial = '1'
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  AND    m.codcli IS NOT NULL
),
abc_prod AS (
  SELECT codprod,
         CASE WHEN vl_acum - vl_item < 0.80 * vl_total THEN 'A'
              WHEN vl_acum - vl_item < 0.95 * vl_total THEN 'B'
              ELSE 'C' END AS classe_prod
  FROM (
    SELECT codprod,
           SUM(vl) AS vl_item,
           SUM(SUM(vl)) OVER () AS vl_total,
           SUM(SUM(vl)) OVER (ORDER BY SUM(vl) DESC, codprod
                              ROWS UNBOUNDED PRECEDING) AS vl_acum
    FROM   linhas
    GROUP  BY codprod
  )
),
abc_cli AS (
  SELECT codcli,
         CASE WHEN vl_acum - vl_item < 0.80 * vl_total THEN 'A'
              WHEN vl_acum - vl_item < 0.95 * vl_total THEN 'B'
              ELSE 'C' END AS classe_cli
  FROM (
    SELECT codcli,
           SUM(vl) AS vl_item,
           SUM(SUM(vl)) OVER () AS vl_total,
           SUM(SUM(vl)) OVER (ORDER BY SUM(vl) DESC, codcli
                              ROWS UNBOUNDED PRECEDING) AS vl_acum
    FROM   linhas
    GROUP  BY codcli
  )
)
SELECT p.classe_prod,
       c.classe_cli,
       COUNT(DISTINCT l.codprod) AS produtos_distintos,
       COUNT(DISTINCT l.codcli)  AS clientes_distintos,
       ROUND(SUM(l.vl), 2)       AS vl_venda,
       ROUND(100 * SUM(l.vl) / NULLIF(SUM(SUM(l.vl)) OVER (), 0), 2) AS pct_receita
FROM   linhas l
JOIN   abc_prod p ON p.codprod = l.codprod
JOIN   abc_cli  c ON c.codcli  = l.codcli
GROUP  BY p.classe_prod, c.classe_cli
ORDER  BY p.classe_prod, c.classe_cli
```

**Obs:** Mesmas colunas de PCMOV já conferidas. SUM(SUM(vl)) OVER () (janela sobre agregado) é sintaxe Oracle válida. As classes das margens da matriz reproduzem exatamente ANA-ABC-01/02 (mesma regra de limiar e desempate) — matriz conciliável com as curvas individuais. Volume baixo (12,5 mil linhas). AUDITORIA (SQL corrigido): adicionado AND m.codcli IS NOT NULL na CTE linhas — sem isso, linha 'S' com CODCLI nulo entraria nos totais de abc_prod mas nunca casaria com abc_cli no join final, sumindo silenciosamente da matriz.

### ANA-ABC-05 — Concentração de receita mês a mês: HHI e participação top-N

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** mês
- **Especialista:** Curva ABC / Pareto (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** linha — Série mensal dupla (HHI clientes × HHI produtos) com bandas de referência antitruste adaptadas a risco comercial; abaixo, área empilhada do pct_top1/top5/top10 de clientes. Tendência de alta no HHI-clientes = acionar plano de diversificação de carteira; HHI-produtos alto e estável = negociar contrato de fornecimento dos SKUs âncora.

**Pergunta de negócio:** A dependência de poucos clientes/produtos está crescendo ou caindo ao longo dos ~9 meses? Qual a exposição se o cliente nº 1 (ou top-5) sair — e o quanto disso é estrutural (HHI alto) versus pontual?

**Técnica:** Índice Herfindahl-Hirschman (HHI = 10000 × Σ share²) por mês nas dimensões cliente e produto, mais participação do top-1/top-5/top-10 clientes e top-10 produtos, tudo em SQL com janelas particionadas por mês (PARTITION BY mes)

```sql
WITH v AS (
  SELECT TRUNC(m.dtmov, 'MM') AS mes, m.codcli, m.codprod, m.qt * m.punit AS vl
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codfilial = '1'
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  AND    m.codcli IS NOT NULL
),
cli AS (
  SELECT mes, codcli, SUM(vl) AS vl FROM v GROUP BY mes, codcli
),
cli_rk AS (
  SELECT mes, vl,
         SUM(vl)      OVER (PARTITION BY mes)                          AS vl_mes,
         ROW_NUMBER() OVER (PARTITION BY mes ORDER BY vl DESC, codcli) AS pos
  FROM   cli
),
cli_agg AS (
  SELECT mes,
         COUNT(*)                                              AS clientes_ativos,
         MAX(vl_mes)                                           AS vl_mes,
         ROUND(10000 * SUM(POWER(vl / NULLIF(vl_mes,0), 2)), 0) AS hhi_clientes,
         ROUND(100 * SUM(CASE WHEN pos <= 1  THEN vl ELSE 0 END) / NULLIF(MAX(vl_mes),0), 2) AS pct_top1_cli,
         ROUND(100 * SUM(CASE WHEN pos <= 5  THEN vl ELSE 0 END) / NULLIF(MAX(vl_mes),0), 2) AS pct_top5_cli,
         ROUND(100 * SUM(CASE WHEN pos <= 10 THEN vl ELSE 0 END) / NULLIF(MAX(vl_mes),0), 2) AS pct_top10_cli
  FROM   cli_rk
  GROUP  BY mes
),
prd AS (
  SELECT mes, codprod, SUM(vl) AS vl FROM v GROUP BY mes, codprod
),
prd_rk AS (
  SELECT mes, vl,
         SUM(vl)      OVER (PARTITION BY mes)                           AS vl_mes,
         ROW_NUMBER() OVER (PARTITION BY mes ORDER BY vl DESC, codprod) AS pos
  FROM   prd
),
prd_agg AS (
  SELECT mes,
         COUNT(*)                                              AS produtos_ativos,
         ROUND(10000 * SUM(POWER(vl / NULLIF(vl_mes,0), 2)), 0) AS hhi_produtos,
         ROUND(100 * SUM(CASE WHEN pos <= 10 THEN vl ELSE 0 END) / NULLIF(MAX(vl_mes),0), 2) AS pct_top10_prod
  FROM   prd_rk
  GROUP  BY mes
)
SELECT c.mes,
       ROUND(c.vl_mes, 2)  AS vl_mes,
       c.clientes_ativos,
       c.hhi_clientes,
       c.pct_top1_cli,
       c.pct_top5_cli,
       c.pct_top10_cli,
       p.produtos_ativos,
       p.hhi_produtos,
       p.pct_top10_prod
FROM   cli_agg c
JOIN   prd_agg p ON p.mes = c.mes
ORDER  BY c.mes
```

**Obs:** Com 235 clientes e 1 filial o HHI é informativo (se 1 cliente = 30% da receita, HHI >= 900 só dele). Meses de borda parcialmente cobertos pelo intervalo distorcem o nível — preferir meses completos. Escala 0-10000. Série curta (~9 pontos): tratada como diagnóstica pura, sem pós-processamento. AUDITORIA (SQL corrigido): adicionado AND m.codcli IS NOT NULL na CTE v — sem isso um grupo NULL viraria 'cliente fantasma' contado em clientes_ativos, com share próprio no HHI e elegível ao top-1/5/10, distorcendo exatamente as métricas de concentração.

### ANA-ABC-06 — ABC duplo por produto: faturamento × contribuição de margem (quadrantes de pricing)

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** produto (agregado no período)
- **Especialista:** Curva ABC / Pareto (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** scatter — Dispersão venda × margem% com quadrantes; alternativa: matriz 3×4 (classe_fat × classe_mrg incl. NEG) contando SKUs e somando margem. Ação direta: lista 'A em venda, fraco em margem' = pauta de pricing/renegociação; 'NEG' = vender abaixo do custo, checar cadastro de preço; 'C em venda, A em margem' = incentivar no portfólio dos RCAs.

**Pergunta de negócio:** Quais produtos são A em faturamento mas B/C (ou negativos) em margem — candidatos a reajuste de preço ou renegociação de custo — e quais são C em faturamento porém A em margem, que merecem push comercial?

**Técnica:** Duas curvas ABC independentes no mesmo SQL (uma ordenada por venda, outra por contribuição de margem em R$), com margem negativa isolada em classe 'NEG' e excluída do acumulado via GREATEST(margem,0) para não corromper o Pareto

```sql
WITH venda AS (
  SELECT m.codprod,
         SUM(m.qt * m.punit)                                   AS vl_venda,
         SUM(m.qt * (m.punit - NVL(m.custofin, m.custoreal)))  AS vl_margem
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codfilial = '1'
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  GROUP  BY m.codprod
),
fat AS (
  SELECT v.codprod, v.vl_venda, v.vl_margem,
         SUM(v.vl_venda) OVER ()                                  AS tot_fat,
         SUM(v.vl_venda) OVER (ORDER BY v.vl_venda DESC, v.codprod
                               ROWS UNBOUNDED PRECEDING)          AS acum_fat
  FROM   venda v
),
mrg AS (
  SELECT f.codprod, f.vl_venda, f.vl_margem,
         CASE WHEN f.acum_fat - f.vl_venda < 0.80 * f.tot_fat THEN 'A'
              WHEN f.acum_fat - f.vl_venda < 0.95 * f.tot_fat THEN 'B'
              ELSE 'C' END                                        AS classe_fat,
         SUM(GREATEST(f.vl_margem, 0)) OVER ()                    AS tot_mrg,
         SUM(GREATEST(f.vl_margem, 0)) OVER (ORDER BY f.vl_margem DESC, f.codprod
                                             ROWS UNBOUNDED PRECEDING) AS acum_mrg
  FROM   fat f
)
SELECT g.codprod,
       p.descricao,
       p.codepto,
       ROUND(g.vl_venda, 2)                                  AS vl_venda,
       ROUND(g.vl_margem, 2)                                 AS vl_margem,
       ROUND(100 * g.vl_margem / NULLIF(g.vl_venda, 0), 2)   AS margem_pct,
       g.classe_fat,
       CASE WHEN g.vl_margem <= 0 THEN 'NEG'
            WHEN g.acum_mrg - GREATEST(g.vl_margem,0) < 0.80 * g.tot_mrg THEN 'A'
            WHEN g.acum_mrg - GREATEST(g.vl_margem,0) < 0.95 * g.tot_mrg THEN 'B'
            ELSE 'C' END                                      AS classe_mrg
FROM   mrg g
JOIN   pcprodut p ON p.codprod = g.codprod
ORDER  BY g.vl_venda DESC
```

**Obs:** Todas as colunas existem no dicionário (PCMOV.CUSTOFIN e CUSTOREAL conferidos), mas depende da pendência P-03: qual coluna de custo está populada e qual é a política oficial — o NVL(custofin, custoreal) segue a hipótese do VEN-07. Enquanto P-03 não fecha, usar apenas classe_fat (validada) e tratar classe_mrg como preliminar. AUDITORIA: comportamento silencioso a monitorar — linhas com CUSTOFIN e CUSTOREAL ambos NULL entram em vl_venda mas são ignoradas no SUM de vl_margem; produto com margem totalmente NULL cai em classe_mrg 'C'.

### ANA-CAN-02 — Raio-X do cancelamento de linhas de venda: concentração por RCA × faixa de hora

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** RCA × hora de lançamento (0-23)
- **Especialista:** devolucoes_cancelamentos
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE), `hora_ini` (NUMBER (0-23), opcional, default: NULL), `hora_fim` (NUMBER (0-23), opcional, default: NULL)
- **Viz:** heatmap — Heatmap 8 RCAs × 24 horas colorido pela taxa_cancel_pct (escala sequencial ancorada na taxa global ~24%); tooltip com linhas, linhas_canceladas e valor_cancelado. Células sinalizadas pelo z-score (computo_python) ganham borda de alerta.

**Pergunta de negócio:** 24% das linhas S de PCMOV estão canceladas — é problema sistêmico ou concentrado? Se 1 dos 8 RCAs ou uma janela de hora (ex.: fim do expediente, pico 14h-17h) concentra os cancelamentos, a ação é pontual (treinamento do RCA, revisão do corte de faturamento) e não um redesenho de processo. Decisão: onde atacar primeiro para recuperar faturamento cancelado.

**Técnica:** Tabela de contingência RCA × hora de lançamento com taxa de cancelamento e teste z de proporção (pós-processamento)

```sql
WITH base AS (
  SELECT m.codusur,
         TO_NUMBER(m.horalanc) AS hora,
         CASE WHEN m.dtcancel IS NOT NULL THEN 1 ELSE 0 END AS cancelada,
         m.qt * m.punit AS valor
  FROM   pcmov m
  WHERE  m.codoper = 'S'
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    (:hora_ini IS NULL OR TO_NUMBER(m.horalanc) >= :hora_ini)
  AND    (:hora_fim IS NULL OR TO_NUMBER(m.horalanc) <= :hora_fim)
)
SELECT b.codusur,
       NVL(u.nome, '(sem RCA)') AS rca,
       b.hora,
       COUNT(*)                 AS linhas,
       SUM(b.cancelada)         AS linhas_canceladas,
       ROUND(100 * SUM(b.cancelada) / COUNT(*), 2) AS taxa_cancel_pct,
       ROUND(SUM(CASE WHEN b.cancelada = 1 THEN b.valor ELSE 0 END), 2) AS valor_cancelado
FROM   base b
LEFT   JOIN pcusuari u ON u.codusur = b.codusur
GROUP  BY b.codusur, NVL(u.nome, '(sem RCA)'), b.hora
ORDER  BY b.codusur, b.hora
```

**Cômputo Python (pós-processamento):**

```text
Entrada: lista de dicts do SQL. Passos (só math): 1) p_global = sum(linhas_canceladas)/sum(linhas); 2) para cada célula com linhas >= 30: z = (linhas_canceladas/linhas - p_global) / math.sqrt(p_global*(1-p_global)/linhas); 3) marcar alerta=True se z >= 2.0 (concentração estatisticamente acima da média) e alivio=True se z <= -2.0; 4) marginais: agregar por RCA (somando linhas e canceladas) e por hora, recalculando taxa e z de cada marginal; 5) saída: top 5 células e top 3 RCAs/horas por z, com taxa, valor_cancelado e frase pronta ('RCA X concentra Y% de cancelamento entre 16h-17h, Z vezes a média'). Sem forecast — é diagnóstico puro.
```

**Obs:** Colunas 100% conferidas (PCMOV: CODUSUR, HORALANC VARCHAR2(2), DTCANCEL, QT, PUNIT, CODOPER, CODFILIAL, DTMOV; PCUSUARI: CODUSUR, NOME). O SQL inclui linhas canceladas de propósito — a taxa de cancelamento é o objeto da análise; o filtro obrigatório DTCANCEL IS NULL vale para KPIs de faturamento, não aqui. HORALANC validado como populado; se aparecer valor não numérico (ORA-01722), trocar por TO_NUMBER(REGEXP_SUBSTR(m.horalanc, '^\\d+')) — ver pendência P-CAN-H.

### ANA-CRZ-01 — Matriz cliente × departamento (white space de cross-sell)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** cliente × departamento (agregado no período)
- **Especialista:** cruzamentos-decisao (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** matriz — Heatmap cliente (linhas, ordenadas por faturamento total) × departamento (colunas); célula branca/zero = oportunidade de cross-sell. Tooltip com RCA e faturamento.

**Pergunta de negócio:** Que departamentos cada cliente ativo NÃO compra? Decisão: montar a pauta de oferta do RCA por visita (quais categorias ofertar a quem) e definir metas de amplitude de mix por cliente.

**Técnica:** Cross join clientes ativos × departamentos vendidos com LEFT JOIN da venda realizada — células zeradas explícitas (white space). Ranking de oportunidade em pós-processamento.

```sql
WITH itens AS (
  SELECT p.codcli, pr.codepto, p.qt * p.pvenda AS vlitem
    FROM pcpedi p
    JOIN pcpedc c   ON c.numped  = p.numped
    JOIN pcprodut pr ON pr.codprod = p.codprod
   WHERE c.data BETWEEN :dt_ini AND :dt_fim
     AND c.posicao <> 'C'
     AND c.dtcancel IS NULL
     AND c.codfilial = '1'
     AND p.posicao <> 'C'
),
clientes_ativos AS (SELECT codcli, SUM(vlitem) AS fat_cliente FROM itens GROUP BY codcli),
deptos AS (SELECT codepto FROM itens GROUP BY codepto),
venda AS (SELECT codcli, codepto, SUM(vlitem) AS faturamento FROM itens GROUP BY codcli, codepto),
grade AS (SELECT ca.codcli, ca.fat_cliente, d.codepto FROM clientes_ativos ca CROSS JOIN deptos d)
SELECT g.codcli,
       cli.cliente,
       NVL(u.nome, '(sem RCA)') AS rca,
       dep.descricao AS departamento,
       NVL(v.faturamento, 0) AS faturamento,
       g.fat_cliente AS faturamento_total_cliente,
       CASE WHEN v.faturamento IS NULL THEN 'N' ELSE 'S' END AS comprou
  FROM grade g
  JOIN pcclient cli ON cli.codcli = g.codcli
  LEFT JOIN pcusuari u ON u.codusur = cli.codusur1
  JOIN pcdepto dep ON dep.codepto = g.codepto
  LEFT JOIN venda v ON v.codcli = g.codcli AND v.codepto = g.codepto
 ORDER BY g.fat_cliente DESC, dep.descricao
```

**Cômputo Python (pós-processamento):**

```text
1) Pivotear as linhas em matriz {cliente: {departamento: faturamento}}. 2) Para cada departamento: penetracao = nº clientes com faturamento>0 / nº clientes ativos; ticket_dep = statistics.median(faturamentos>0). 3) mediana_cli = statistics.median(faturamento_total_cliente). 4) Para cada célula com comprou='N': score_oportunidade = penetracao * ticket_dep * min(2.0, fat_cliente/mediana_cli) — estimativa em R$ do potencial. 5) Ordenar desc e emitir top 30 (cliente, rca, departamento, score) agrupado por RCA = pauta de cross-sell da semana.
```

**Obs:** 235 clientes × nº de departamentos vendidos mantém a matriz pequena. Colunas conferidas em fase2_dicionario.csv (PCPEDI.CODCLI/CODPROD/QT/PVENDA/POSICAO; PCPEDC.DATA/POSICAO/DTCANCEL/CODFILIAL; PCPRODUT.CODEPTO; PCDEPTO.DESCRICAO; PCCLIENT.CLIENTE/CODUSUR1; PCUSUARI.NOME). Bonificações podem inflar 'comprou' — ver pendência CONDVENDA. Venda medida por pedido (PCPEDI), não por faturamento — coerente para pauta de oferta do RCA.

### ANA-CRZ-02 — Basket analysis: pares de departamentos no mesmo pedido (suporte, confiança, lift)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** par de departamentos (pedido = transação)
- **Especialista:** cruzamentos-decisao (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** barra_h — Barras horizontais dos top 20 pares por suporte; cor da barra = lift (>1 verde = associação real, ≈1 cinza = coincidência). Tooltip com as duas confianças.

**Pergunta de negócio:** Quais categorias saem juntas no mesmo pedido? Decisão: definir combos/venda casada e o script de oferta do RCA ('cliente levou A e não levou B com confiança A→B alta → ofertar B'), e organizar catálogo/tabloide por afinidade.

**Técnica:** Self-join de pedidos agregados por departamento (DISTINCT numped×codepto evita explosão combinatória de SKUs); suporte, confiança nas duas direções e lift calculados em SQL; top 20 pares.

```sql
WITH ped_dep AS (
  SELECT DISTINCT p.numped, pr.codepto
    FROM pcpedi p
    JOIN pcpedc c   ON c.numped  = p.numped
    JOIN pcprodut pr ON pr.codprod = p.codprod
   WHERE c.data BETWEEN :dt_ini AND :dt_fim
     AND c.posicao <> 'C'
     AND c.dtcancel IS NULL
     AND c.codfilial = '1'
     AND p.posicao <> 'C'
),
tot AS (SELECT COUNT(DISTINCT numped) AS n_ped FROM ped_dep),
freq_dep AS (SELECT codepto, COUNT(*) AS n_dep FROM ped_dep GROUP BY codepto),
pares AS (
  SELECT a.codepto AS dep_a, b.codepto AS dep_b, COUNT(*) AS n_par
    FROM ped_dep a
    JOIN ped_dep b ON b.numped = a.numped AND b.codepto > a.codepto
   GROUP BY a.codepto, b.codepto
)
SELECT da.descricao AS departamento_a,
       db.descricao AS departamento_b,
       p.n_par AS pedidos_juntos,
       ROUND(100 * p.n_par / t.n_ped, 2)  AS suporte_pct,
       ROUND(100 * p.n_par / fa.n_dep, 2) AS confianca_a_para_b_pct,
       ROUND(100 * p.n_par / fb.n_dep, 2) AS confianca_b_para_a_pct,
       ROUND((p.n_par * t.n_ped) / (fa.n_dep * fb.n_dep), 2) AS lift
  FROM pares p
  JOIN freq_dep fa ON fa.codepto = p.dep_a
  JOIN freq_dep fb ON fb.codepto = p.dep_b
  JOIN pcdepto da  ON da.codepto = p.dep_a
  JOIN pcdepto db  ON db.codepto = p.dep_b
  CROSS JOIN tot t
 ORDER BY p.n_par DESC
 FETCH FIRST 20 ROWS ONLY
```

**Cômputo Python (pós-processamento):**

```text
Gerar regras de oferta: para cada par com confianca_a_para_b_pct >= 40 e lift >= 1.2, emitir regra 'pedido contém A e não contém B → ofertar B' (e o simétrico se confianca_b_para_a_pct passar no corte). Ordenar regras por suporte_pct — vira checklist do RCA no momento da digitação do pedido.
```

**Obs:** Self-join sobre no máx ~1.666 pedidos × poucos departamentos — sem risco de explosão. Lift simplificado algebricamente: (n_par*n_ped)/(n_a*n_b). Todas as colunas conferidas no fase2_dicionario.csv. AUDITORIA: com 9 departamentos há no máximo 36 pares — o top 20 praticamente retorna todos; a leitura deve se apoiar no lift/confiança, não no corte de 20.

### ANA-CRZ-03 — Quadrante RCA: positivação × margem × faturamento

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** RCA (agregado no período)
- **Especialista:** cruzamentos-decisao (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** scatter — Scatter com bolha proporcional ao faturamento e rótulo = nome do RCA; linhas de referência nas medianas dos dois eixos formando 4 quadrantes (estrela / desbravador de margem baixa / carteira ociosa rentável / crítico).

**Pergunta de negócio:** Qual RCA troca margem por volume e qual tem carteira ociosa? Decisão: pauta de coaching individual dos 8 RCAs, revisão de alçada de desconto e redistribuição de carteira.

**Técnica:** Agregação por RCA cruzando 3 métricas independentes: % positivação sobre carteira ativa (PCCLIENT.CODUSUR1), margem % sobre custo do item no momento da venda (PCPEDI.VLCUSTOFIN) e faturamento; classificação em quadrantes pelo par de medianas em Python.

```sql
WITH vendas AS (
  SELECT p.codusur,
         SUM(p.qt * p.pvenda) AS faturamento,
         SUM(p.qt * (p.pvenda - p.vlcustofin)) AS margem_valor,
         COUNT(DISTINCT p.codcli)  AS clientes_positivados,
         COUNT(DISTINCT p.numped)  AS pedidos
    FROM pcpedi p
    JOIN pcpedc c ON c.numped = p.numped
   WHERE c.data BETWEEN :dt_ini AND :dt_fim
     AND c.posicao <> 'C'
     AND c.dtcancel IS NULL
     AND c.codfilial = '1'
     AND p.posicao <> 'C'
   GROUP BY p.codusur
),
carteira AS (
  SELECT codusur1 AS codusur, COUNT(*) AS clientes_carteira
    FROM pcclient
   WHERE codusur1 IS NOT NULL
     AND dtexclusao IS NULL
     AND NVL(bloqueio, 'N') <> 'S'
   GROUP BY codusur1
)
SELECT u.codusur,
       u.nome AS rca,
       v.faturamento,
       ROUND(100 * v.margem_valor / NULLIF(v.faturamento, 0), 2) AS margem_pct,
       v.clientes_positivados,
       NVL(ct.clientes_carteira, 0) AS clientes_carteira,
       ROUND(100 * v.clientes_positivados / NULLIF(ct.clientes_carteira, 0), 2) AS positivacao_pct,
       v.pedidos,
       ROUND(v.faturamento / NULLIF(v.clientes_positivados, 0), 2) AS ticket_medio_cliente
  FROM vendas v
  JOIN pcusuari u ON u.codusur = v.codusur
  LEFT JOIN carteira ct ON ct.codusur = v.codusur
 ORDER BY v.faturamento DESC
```

**Cômputo Python (pós-processamento):**

```text
1) med_x = statistics.median(positivacao_pct); med_y = statistics.median(margem_pct). 2) Classificar cada RCA: x>=med_x e y>=med_y = 'estrela'; x>=med_x e y<med_y = 'volume sem margem'; x<med_x e y>=med_y = 'carteira ociosa rentável'; ambos abaixo = 'crítico'. 3) Para y<med_y: dinheiro_na_mesa = (med_y - margem_pct)/100 * faturamento — quanto o RCA deixaria de perder se operasse na margem mediana. 4) Emitir tabela RCA, quadrante, dinheiro_na_mesa ordenada desc.
```

**Obs:** DEPENDE DA PENDÊNCIA P-03: assume PCPEDI.VLCUSTOFIN unitário e populado (coluna existe, NOT NULL no dicionário, mas pode estar zerada — margem_pct sairia 100% falsa; validar antes de publicar). Diferente de DIM-02/DIM-03 do catálogo: aqui o cruzamento com margem é o que gera a decisão. AUDITORIA (caveats): positivacao_pct cruza o RCA do pedido (PCPEDI.CODUSUR) com a carteira cadastral (CODUSUR1) — venda fora da carteira pode gerar positivação > 100%, documentar na UI; carteira usa o estado atual do cadastro, não foto point-in-time.

### ANA-CRZ-04 — Índice de mix praça × departamento (share local vs share companhia)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** praça × departamento (agregado no período; praça do pedido = PCPEDC.CODPRACA)
- **Especialista:** cruzamentos-decisao (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** heatmap — Heatmap divergente centrado em 100 (vermelho <100 = categoria sub-penetrada na praça, azul >100 = sobre-indexada); tooltip com faturamento e shares.

**Pergunta de negócio:** Em qual praça qual categoria está sub-penetrada? Decisão: direcionar ação comercial regional (tabloide, positivação dirigida, roteiro do RCA) para as células com índice < 100 em departamentos relevantes.

**Técnica:** Share do departamento dentro da praça dividido pelo share do departamento na companhia (índice 100 = mix igual à média); grade completa praça × departamento com zeros explícitos via cross join + left join.

```sql
WITH itens AS (
  SELECT c.codpraca, pr.codepto, p.qt * p.pvenda AS vlitem
    FROM pcpedi p
    JOIN pcpedc c   ON c.numped  = p.numped
    JOIN pcprodut pr ON pr.codprod = p.codprod
   WHERE c.data BETWEEN :dt_ini AND :dt_fim
     AND c.posicao <> 'C'
     AND c.dtcancel IS NULL
     AND c.codfilial = '1'
     AND p.posicao <> 'C'
),
por_praca AS (SELECT codpraca, SUM(vlitem) AS fat_praca FROM itens GROUP BY codpraca),
por_dep   AS (SELECT codepto,  SUM(vlitem) AS fat_dep   FROM itens GROUP BY codepto),
total     AS (SELECT SUM(vlitem) AS fat_total FROM itens),
celula    AS (SELECT codpraca, codepto, SUM(vlitem) AS fat FROM itens GROUP BY codpraca, codepto),
grade     AS (SELECT pp.codpraca, pp.fat_praca, pd.codepto, pd.fat_dep
                FROM por_praca pp CROSS JOIN por_dep pd)
SELECT pra.praca,
       dep.descricao AS departamento,
       NVL(cel.fat, 0) AS faturamento,
       ROUND(100 * NVL(cel.fat, 0) / NULLIF(g.fat_praca, 0), 2) AS share_na_praca_pct,
       ROUND(100 * g.fat_dep / NULLIF(t.fat_total, 0), 2)       AS share_cia_pct,
       ROUND(100 * (NVL(cel.fat, 0) / NULLIF(g.fat_praca, 0))
                 / NULLIF(g.fat_dep / NULLIF(t.fat_total, 0), 0), 1) AS indice_mix
  FROM grade g
  LEFT JOIN celula cel ON cel.codpraca = g.codpraca AND cel.codepto = g.codepto
  CROSS JOIN total t
  JOIN pcpraca pra ON pra.codpraca = g.codpraca
  JOIN pcdepto dep ON dep.codepto  = g.codepto
 ORDER BY pra.praca, dep.descricao
```

**Cômputo Python (pós-processamento):**

```text
Filtrar oportunidades acionáveis: células com indice_mix < 70 E share_cia_pct >= 5 (categoria relevante para a companhia mas fraca na praça). Para cada uma, potencial_R$ = fat_praca * share_cia_pct/100 - faturamento (quanto a praça faturaria no departamento se seguisse o mix médio). Ordenar por potencial desc = ranking de ação regional.
```

**Obs:** Usa a praça registrada no pedido (PCPEDC.CODPRACA, NOT NULL) e não a do cadastro do cliente — ver pendência de aderência. Vai além do DIM-07: o cruzamento com o mix é o que aponta a decisão. AUDITORIA (nota): a 'grade completa' cobre apenas praças e departamentos com alguma venda no período, não os 28×9 cadastrais — coerente com o índice, indefinido para praça sem venda.

### ANA-CRZ-05 — Departamento × dia-da-semana (padrão semanal de demanda)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** departamento × dia-da-semana ISO (1=segunda ... 7=domingo)
- **Especialista:** cruzamentos-decisao (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE), `hora_ini` (NUMBER 0-23, opcional, default: NULL), `hora_fim` (NUMBER 0-23, opcional, default: NULL)
- **Viz:** heatmap — Heatmap dia da semana (colunas Seg→Dom) × departamento (linhas), intensidade = faturamento; alternar série para 'pedidos' para enxergar carga operacional de separação.

**Pergunta de negócio:** Que categoria concentra pedidos em qual dia? Decisão: dimensionar separação/expedição por dia, programar compras/recebimento e agendar ofertas por categoria no dia de maior conversão (com recorte intradia opcional pelo pico 14h-17h).

**Técnica:** Dia ISO determinístico via TRUNC(data,'IW') (independe de NLS), agregado por departamento; filtro intradia opcional por PCPEDC.HORA; concentração semanal medida em Python (share do dia de pico e coeficiente de variação).

```sql
WITH itens AS (
  SELECT TRUNC(c.data) - TRUNC(c.data, 'IW') + 1 AS dia_iso,
         pr.codepto,
         p.numped,
         p.qt * p.pvenda AS vlitem
    FROM pcpedi p
    JOIN pcpedc c   ON c.numped  = p.numped
    JOIN pcprodut pr ON pr.codprod = p.codprod
   WHERE c.data BETWEEN :dt_ini AND :dt_fim
     AND c.posicao <> 'C'
     AND c.dtcancel IS NULL
     AND c.codfilial = '1'
     AND p.posicao <> 'C'
     AND (:hora_ini IS NULL OR c.hora >= :hora_ini)
     AND (:hora_fim IS NULL OR c.hora <= :hora_fim)
)
SELECT i.dia_iso,
       CASE i.dia_iso WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter' WHEN 3 THEN 'Qua'
                      WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sab'
                      ELSE 'Dom' END AS dia_semana,
       d.descricao AS departamento,
       COUNT(DISTINCT i.numped) AS pedidos,
       SUM(i.vlitem) AS faturamento
  FROM itens i
  JOIN pcdepto d ON d.codepto = i.codepto
 GROUP BY i.dia_iso, d.descricao
 ORDER BY d.descricao, i.dia_iso
```

**Cômputo Python (pós-processamento):**

```text
Para cada departamento: total = sum(faturamento dos 7 dias); share_pico = max(dia)/total; media = statistics.mean(valores); cv = statistics.pstdev(valores)/media se media>0. Flag 'padrão semanal forte' se share_pico > 0.35 ou cv > 0.5 — esses departamentos ganham dia fixo de oferta e a expedição dimensiona equipe pelo heatmap de pedidos.
```

**Obs:** TRUNC(data,'IW') = segunda da semana, expressão determinística (não depende de NLS_TERRITORY). PCPEDC.HORA validada (NUMBER, 100% populada). COUNT(DISTINCT numped) por célula é intencional (pedido multi-departamento conta em cada linha do heatmap de carga, sem duplicar faturamento). AUDITORIA (SQL corrigido): removida a subquery inline redundante com alias '_ignore' — identificador iniciando com underscore sem aspas é inválido em Oracle (ORA-00911) e a coluna qtd_zero era uma constante inútil; agregação feita direto sobre o CTE itens.

### ANA-DEV-01 — Mapa CODOPER × CFOP das operações de devolução (resolve a hipótese ED/SD)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** codoper × codfiscal (CFOP)
- **Especialista:** devolucoes_cancelamentos
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** tabela — Tabela agrupada por CODOPER com DESCCFO, volume, valor vigente e nº de clientes/fornecedores distintos. Regra de leitura: ED com clientes_distintos>0 e CFOP x.202 = devolução de venda (cliente); SD com fornecedores_distintos>0 = devolução a fornecedor. Destacar linhas onde DESCCFO contradiz a hipótese.

**Pergunta de negócio:** O que exatamente são ED (253), SD (42), ER (107), SR (898) e EB (72) nesta base? Sem isso não dá para publicar nenhum KPI de devolução com confiança. O CFOP (PCCFO.DESCCFO) rotula cada operação: ED com CFOP 1.202/2.202 confirma devolução de venda por cliente; SD com CFOP de devolução de compra confirma devolução a fornecedor. Decisão: congelar a definição oficial de 'devolução de cliente' do BI.

**Técnica:** Perfilamento de domínio com join de dicionário fiscal (PCCFO) e abertura vigente × cancelado

```sql
SELECT m.codoper,
       m.codfiscal,
       c.desccfo,
       c.codoper       AS codoper_cfo,
       c.cfopinverso,
       COUNT(*)        AS qtd_linhas,
       COUNT(CASE WHEN m.dtcancel IS NOT NULL THEN 1 END) AS qtd_linhas_canceladas,
       ROUND(SUM(CASE WHEN m.dtcancel IS NULL THEN m.qt * m.punit ELSE 0 END), 2) AS valor_vigente,
       COUNT(DISTINCT m.codcli)     AS clientes_distintos,
       COUNT(DISTINCT m.codfornec)  AS fornecedores_distintos,
       MIN(m.dtmov)    AS primeira_ocorrencia,
       MAX(m.dtmov)    AS ultima_ocorrencia
FROM   pcmov m
LEFT   JOIN pccfo c ON c.codfiscal = m.codfiscal
WHERE  m.codoper IN ('ED','SD','ER','SR','EB')
AND    m.codfilial = '1'
AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
GROUP  BY m.codoper, m.codfiscal, c.desccfo, c.codoper, c.cfopinverso
ORDER  BY m.codoper, qtd_linhas DESC
```

**Obs:** Todas as colunas conferidas no fase2_dicionario.csv (PCMOV: CODOPER, CODFISCAL, DTCANCEL, QT, PUNIT, DTMOV, CODFILIAL, CODCLI, CODFORNEC; PCCFO: CODFISCAL, DESCCFO, CODOPER, CFOPINVERSO). Este SQL NÃO filtra m.dtcancel de propósito: o cancelado é contado em coluna própria (valor_vigente já exclui cancelados). É a análise-chave que destrava o status das ANA-CAN-03/ANA-DEV-04/05/06. AUDITORIA: PCCFO tem 470 linhas e PK = CODFISCAL (LEFT JOIN não multiplica); exceção ao filtro DTCANCEL aceita por ser perfilamento com separação explícita.

### ANA-DEV-04 — Pareto de devolução por produto (valor devolvido e taxa sobre a venda do produto)

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** produto
- **Especialista:** devolucoes_cancelamentos
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** pareto — Pareto clássico: barras de vl_devolvido por produto, linha de share_acumulado_pct com marcação dos 80%. Tooltip com clientes_devolveram (devolução espalhada = problema do produto; concentrada em 1 cliente = problema comercial) e taxa_dev_produto_pct.

**Pergunta de negócio:** Quais dos 722 produtos concentram o valor devolvido e quais têm taxa de devolução anormal sobre a própria venda? Produto com devolução alta e recorrente em vários clientes indica problema de qualidade/validade/embalagem — decisão: acionar o fornecedor (PCFORNEC), revisar shelf-life no picking ou descontinuar o item.

**Técnica:** Pareto 80/20 com share acumulado em janela analítica + taxa de devolução relativa à venda do próprio produto

```sql
WITH dev AS (
  SELECT m.codprod,
         SUM(m.qt)                    AS qt_devolvida,
         SUM(m.qt * m.punit)          AS vl_devolvido,
         COUNT(DISTINCT m.numnota)    AS notas_devolucao,
         COUNT(DISTINCT m.codcli)     AS clientes_devolveram
  FROM   pcmov m
  WHERE  m.codoper = 'ED'
  AND    m.dtcancel IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY m.codprod
),
ven AS (
  SELECT m.codprod,
         SUM(m.qt * m.punit) AS vl_vendido
  FROM   pcmov m
  WHERE  m.codoper = 'S'
  AND    m.dtcancel IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY m.codprod
)
SELECT d.codprod,
       p.descricao,
       ROUND(d.vl_devolvido, 2)  AS vl_devolvido,
       d.qt_devolvida,
       d.notas_devolucao,
       d.clientes_devolveram,
       ROUND(NVL(v.vl_vendido, 0), 2) AS vl_vendido,
       ROUND(100 * d.vl_devolvido / NULLIF(v.vl_vendido, 0), 2) AS taxa_dev_produto_pct,
       ROUND(100 * d.vl_devolvido / NULLIF(SUM(d.vl_devolvido) OVER (), 0), 2) AS share_pct,
       ROUND(100 * SUM(d.vl_devolvido) OVER (ORDER BY d.vl_devolvido DESC, d.codprod ROWS UNBOUNDED PRECEDING)
                 / NULLIF(SUM(d.vl_devolvido) OVER (), 0), 2) AS share_acumulado_pct
FROM   dev d
LEFT   JOIN ven v ON v.codprod = d.codprod
LEFT   JOIN pcprodut p ON p.codprod = d.codprod
ORDER  BY d.vl_devolvido DESC, d.codprod
```

**Obs:** Colunas 100% conferidas. a_validar apenas pela semântica de ED (hipótese — destravada por ANA-DEV-01). Com só 253 linhas ED o Pareto tende a ser curto — sinalizar na UI quando notas_devolucao < 3 (evidência fraca). Não repete VEN-08 do catálogo. AUDITORIA (caveat): taxa_dev_produto_pct pode exceder 100% quando a devolução no período refere-se a venda anterior a :dt_ini — documentar na UI.

### ANA-DEV-05 — Taxa de devolução por RCA × mês (heatmap da carteira)

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** RCA × mês
- **Especialista:** devolucoes_cancelamentos
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** heatmap — Heatmap 8 RCAs × ~9 meses colorido por taxa_dev_pct (escala sequencial); célula com taxa_dev_pct nulo (venda zero e devolução > 0) marcada com hachura de anomalia. Tooltip com vl_vendido, vl_devolvido e notas_devolucao. Leitura: linha inteira escura = RCA cronicamente problemático; coluna escura = mês com evento pontual (ex.: lote ruim).

**Pergunta de negócio:** Qual dos 8 RCAs gera mais devolução em relação ao que vende, e isso é pontual ou recorrente mês a mês? RCA com taxa persistentemente alta sugere venda empurrada, erro de digitação de pedido ou combinado de entrega mal alinhado — decisão: coaching individual, revisão de meta ou acompanhamento de rota.

**Técnica:** Razão devolução/venda por RCA e mês com FULL OUTER JOIN para não perder RCA que só aparece em devolução

```sql
WITH ven AS (
  SELECT m.codusur,
         TRUNC(m.dtmov, 'MM') AS mes,
         SUM(m.qt * m.punit)  AS vl_vendido
  FROM   pcmov m
  WHERE  m.codoper = 'S'
  AND    m.dtcancel IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY m.codusur, TRUNC(m.dtmov, 'MM')
),
dev AS (
  SELECT m.codusur,
         TRUNC(m.dtmov, 'MM') AS mes,
         SUM(m.qt * m.punit)  AS vl_devolvido,
         COUNT(DISTINCT m.numnota) AS notas_devolucao
  FROM   pcmov m
  WHERE  m.codoper = 'ED'
  AND    m.dtcancel IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY m.codusur, TRUNC(m.dtmov, 'MM')
)
SELECT NVL(v.codusur, d.codusur) AS codusur,
       NVL(u.nome, '(sem RCA)')  AS rca,
       NVL(v.mes, d.mes)         AS mes,
       ROUND(NVL(v.vl_vendido, 0), 2)   AS vl_vendido,
       ROUND(NVL(d.vl_devolvido, 0), 2) AS vl_devolvido,
       NVL(d.notas_devolucao, 0)        AS notas_devolucao,
       ROUND(100 * NVL(d.vl_devolvido, 0) / NULLIF(v.vl_vendido, 0), 2) AS taxa_dev_pct
FROM   ven v
FULL   OUTER JOIN dev d ON d.codusur = v.codusur AND d.mes = v.mes
LEFT   JOIN pcusuari u ON u.codusur = NVL(v.codusur, d.codusur)
ORDER  BY 1, 3
```

**Obs:** Colunas 100% conferidas (incl. NUMTRANSDEV/NUMNOTADEV para o plano B de atribuição de RCA via nota de origem). a_validar por dupla dependência: (a) semântica ED (ANA-DEV-01); (b) população de CODUSUR nas linhas ED — se vier nula, a linha cai no bucket '(sem RCA)' e o heatmap perde utilidade sem o fallback via NUMTRANSDEV/NUMNOTADEV. AUDITORIA (caveat aceito): casamento venda × devolução por mês-calendário — devolução de venda do mês anterior infla a taxa do mês corrente; aceitável para padrão recorrente, não usar como taxa contábil exata.

### ANA-FCR-06 — Perfil de pagamento por cliente — atraso médio ponderado por valor

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** cliente (agregado de títulos pagos no período + foto da exposição aberta hoje)
- **Especialista:** credito-inadimplencia-contas-a-receber
- **Parâmetros:** `dt_ini` (DATE, default: primeiro dia da base (out/2025)), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** scatter — Quadrante de risco: canto superior direito = clientes com atraso crônico E alta exposição atual (ação imediata). Tooltip com cliente, RCA, atraso máximo e prorrogações. Alternativa: tabela ordenável.

**Pergunta de negócio:** Quais dos 235 clientes pagam adiantado/em dia e quais sistematicamente atrasam, e quanto da carteira aberta está nas mãos dos maus pagadores? Decide prazo concedido, exigência de boleto antecipado e onde o RCA precisa agir.

**Técnica:** Média ponderada por valor de (DTPAG-DTVENC) sobre títulos quitados, com dispersão (STDDEV), % do valor pago em dia, contagem de prorrogações (DTVENC>DTVENCORIG) e cruzamento com exposição aberta/vencida atual.

```sql
WITH pagos AS (
  SELECT p.codcli,
         (p.dtpag - p.dtvenc)                                   AS dias_atraso,
         NVL(p.vpago, p.valor)                                  AS vlr_pago,
         CASE WHEN p.dtvenc > p.dtvencorig THEN 1 ELSE 0 END    AS foi_prorrogado
  FROM   pcprest p
  WHERE  p.dtpag IS NOT NULL
  AND    p.dtcancel IS NULL
  AND    p.codfilial = '1'
  AND    p.dtpag BETWEEN :dt_ini AND :dt_fim
),
abertos AS (
  SELECT p.codcli,
         SUM(p.valor - NVL(p.vpago, 0))                                        AS exposicao_aberta,
         SUM(CASE WHEN p.dtvenc < TRUNC(SYSDATE)
                  THEN p.valor - NVL(p.vpago, 0) ELSE 0 END)                   AS exposicao_vencida
  FROM   pcprest p
  WHERE  p.dtpag IS NULL
  AND    p.dtcancel IS NULL
  AND    p.codfilial = '1'
  GROUP  BY p.codcli
)
SELECT c.codcli,
       c.cliente,
       u.nome                                                                  AS rca,
       COUNT(*)                                                                AS qtd_titulos_pagos,
       SUM(pg.vlr_pago)                                                        AS valor_pago_periodo,
       ROUND(SUM(pg.dias_atraso * pg.vlr_pago)
             / NULLIF(SUM(pg.vlr_pago), 0), 1)                                 AS atraso_medio_pond,
       ROUND(AVG(pg.dias_atraso), 1)                                           AS atraso_medio_simples,
       ROUND(STDDEV(pg.dias_atraso), 1)                                        AS desvio_atraso,
       MAX(pg.dias_atraso)                                                     AS atraso_maximo,
       ROUND(100 * SUM(CASE WHEN pg.dias_atraso <= 0 THEN pg.vlr_pago ELSE 0 END)
             / NULLIF(SUM(pg.vlr_pago), 0), 1)                                 AS perc_valor_pago_em_dia,
       SUM(pg.foi_prorrogado)                                                  AS qtd_titulos_prorrogados,
       NVL(ab.exposicao_aberta, 0)                                             AS exposicao_aberta,
       NVL(ab.exposicao_vencida, 0)                                            AS exposicao_vencida
FROM   pagos pg
       JOIN pcclient c        ON c.codcli  = pg.codcli
       LEFT JOIN pcusuari u   ON u.codusur = c.codusur1
       LEFT JOIN abertos ab   ON ab.codcli = pg.codcli
GROUP  BY c.codcli, c.cliente, u.nome, ab.exposicao_aberta, ab.exposicao_vencida
ORDER  BY atraso_medio_pond DESC
```

**Obs:** Clientes que só têm títulos em aberto (nenhum pago no período) não aparecem — são cobertos pelo ANA-FCR-07. Ponderação usa NVL(VPAGO,VALOR); se VPAGO incluir juros de permanência (TXPERM), o peso fica levemente inflado (ver pendência P-FCR-B). STDDEV alto com média baixa = pagador irregular, tratar diferente do atrasador crônico.

### ANA-INT-05 — Funil de POSICAO por hora de entrada do pedido

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** hora do dia × posição do pedido
- **Especialista:** operacao-intradia
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE), `hora_ini` (NUMBER (0-23), opcional, default: NULL), `hora_fim` (NUMBER (0-23), opcional, default: NULL)
- **Viz:** barra — Barras empilhadas 100% por hora (usar pct_da_hora) com F/L/C em cores distintas; visão absoluta como alternativa. A faixa vermelha ('C') crescendo nas últimas horas do dia é o sinal de decisão.

**Pergunta de negócio:** Pedidos entrados em quais horários cancelam mais ou ficam presos como 'L' (liberados sem faturar)? Aponta se o cancelamento (100 de 1.666 pedidos, 6%) concentra-se em pedidos tardios — argumento direto para antecipar o corte ou reforçar o faturamento no fim do dia.

**Técnica:** Distribuição de POSICAO dentro de cada hora com RATIO_TO_REPORT particionado por hora; propositalmente SEM o filtro posicao <> 'C' (o cancelamento é o objeto de estudo).

```sql
SELECT c.hora,
       c.posicao,
       COUNT(*)                                                          AS num_pedidos,
       SUM(NVL(c.vltotal,0))                                             AS valor,
       ROUND(100 * RATIO_TO_REPORT(COUNT(*)) OVER (PARTITION BY c.hora), 2) AS pct_da_hora
FROM   pcpedc c
WHERE  c.data BETWEEN :dt_ini AND :dt_fim
AND    c.codfilial = '1'
AND    (:hora_ini IS NULL OR c.hora >= :hora_ini)
AND    (:hora_fim IS NULL OR c.hora <= :hora_fim)
GROUP  BY c.hora, c.posicao
ORDER  BY c.hora, c.posicao
```

**Obs:** Colunas conferidas: HORA, POSICAO, DATA, CODFILIAL, VLTOTAL em PCPEDC. EXCEÇÃO CONSCIENTE à regra de cancelamento: aqui POSICAO='C' entra de propósito (é o fenômeno analisado) — não reutilizar este SQL como base de faturamento. Domínio observado: F=1564, C=100, L=2; Winthor admite outros códigos (B/M/P) — ver pendência P-INT-03. AUDITORIA (ressalva): não confirmado se VLTOTAL é zerado quando POSICAO='C' — ler num_pedidos/pct_da_hora como métrica primária e validar VLTOTAL das linhas 'C' antes de comunicar valores em R$; com 2 pedidos 'L' na base, o funil é essencialmente F vs C.

### ANA-MRG-01 — Cubo de margem multi-eixo: mês × RCA × departamento/seção × praça

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** mês × RCA × departamento × seção × praça (codfilial='1')
- **Especialista:** Margem e Rentabilidade (análise diagnóstica) — distribuição/atacado Winthor
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** heatmap — Heatmap RCA × seção colorido por margem%; filtros de mês, departamento e praça pivotam o cubo. Células vermelhas com venda relevante = onde agir primeiro.

**Pergunta de negócio:** Onde a margem nasce e onde ela morre? Qual combinação RCA × seção × praça sustenta a rentabilidade da distribuidora e qual a corrói — para redirecionar esforço comercial, mix e atendimento (com 8 RCAs e 235 clientes, dá para agir RCA a RCA).

**Técnica:** Agregação multidimensional com margem bruta (PUNIT − custo NVL(CUSTOFIN, CUSTOREAL)); o front pivota/filtra os eixos do cubo. Hierarquia produto→seção→departamento via PCPRODUT.CODEPTO/CODSEC → PCDEPTO/PCSECAO; praça via PCCLIENT.CODPRACA → PCPRACA.

```sql
SELECT TRUNC(m.dtmov, 'MM')                                                        AS mes,
       m.codusur                                                                   AS codusur,
       NVL(u.nome, 'SEM RCA')                                                      AS rca,
       p.codepto                                                                   AS codepto,
       NVL(d.descricao, 'SEM DEPTO')                                               AS departamento,
       p.codsec                                                                    AS codsec,
       NVL(s.descricao, 'SEM SECAO')                                               AS secao,
       c.codpraca                                                                  AS codpraca,
       NVL(pr.praca, 'SEM PRACA')                                                  AS praca,
       SUM(m.qt * m.punit)                                                         AS venda,
       SUM(m.qt * NVL(m.custofin, m.custoreal))                                    AS custo,
       SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custofin, m.custoreal))              AS margem_valor,
       ROUND(100 * (SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custofin, m.custoreal)))
             / NULLIF(SUM(m.qt * m.punit), 0), 2)                                  AS margem_pct
  FROM pcmov m
  JOIN pcprodut p  ON p.codprod   = m.codprod
  LEFT JOIN pcdepto  d  ON d.codepto   = p.codepto
  LEFT JOIN pcsecao  s  ON s.codsec    = p.codsec
  LEFT JOIN pcclient c  ON c.codcli    = m.codcli
  LEFT JOIN pcpraca  pr ON pr.codpraca = c.codpraca
  LEFT JOIN pcusuari u  ON u.codusur   = m.codusur
 WHERE m.codoper   = 'S'
   AND m.dtcancel  IS NULL
   AND m.codfilial = '1'
   AND m.dtmov BETWEEN :dt_ini AND :dt_fim
 GROUP BY TRUNC(m.dtmov, 'MM'), m.codusur, NVL(u.nome, 'SEM RCA'),
          p.codepto, NVL(d.descricao, 'SEM DEPTO'),
          p.codsec, NVL(s.descricao, 'SEM SECAO'),
          c.codpraca, NVL(pr.praca, 'SEM PRACA')
 ORDER BY mes, margem_valor
```

**Obs:** 100% das colunas conferidas no fase2_dicionario.csv; PKs single-column em fase6_pks.csv (LEFT JOINs sem fan-out, preservam linhas sem cliente/RCA). A_VALIDAR pela pendência P-03: qual coluna de custo está populada. Devoluções (CODOPER='ED') NÃO abatidas — ver pendência. AUDITORIA (SQL corrigido): ordem do NVL de custo alinhada à convenção do catálogo — NVL(custofin, custoreal), como VEN-07 e ANA-ABC-06 (o original usava a ordem inversa, o que faria margens divergirem entre análises do mesmo BI); padronizar UMA ordem após P-03 fechar.

### ANA-MRG-02 — Matriz BCG-like de produtos: margem% × volume de venda

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** produto (agregado no período; scatter com 1 ponto por SKU vendido)
- **Especialista:** Margem e Rentabilidade (análise diagnóstica) — distribuição/atacado Winthor
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** scatter — Matriz BCG-like: quadrante superior-direito = motores de lucro (proteger); inferior-direito = volume com margem fina (renegociar custo/preço); superior-esquerdo = nicho rentável (expandir distribuição — ver clientes_distintos); inferior-esquerdo = candidatos a corte de mix. Pontos com margem_pct < 0 destacados.

**Pergunta de negócio:** Quais dos 722 SKUs são motores de lucro, quais são geradores de volume com margem fina (renegociar custo com o fornecedor), quais são nichos a expandir e quais só ocupam estoque e capital de giro (racionalizar mix)?

**Técnica:** Scatter margem% (y) × participação na venda (x, escala log recomendada), tamanho do ponto = margem em R$; classificação em 4 quadrantes pelas MEDIANAS (robustas a cauda longa) computadas em Python.

```sql
SELECT m.codprod,
       p.descricao                                                                 AS produto,
       NVL(d.descricao, 'SEM DEPTO')                                               AS departamento,
       NVL(s.descricao, 'SEM SECAO')                                               AS secao,
       SUM(m.qt)                                                                   AS qt_vendida,
       SUM(m.qt * m.punit)                                                         AS venda,
       SUM(m.qt * NVL(m.custofin, m.custoreal))                                    AS custo,
       SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custofin, m.custoreal))              AS margem_valor,
       ROUND(100 * (SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custofin, m.custoreal)))
             / NULLIF(SUM(m.qt * m.punit), 0), 2)                                  AS margem_pct,
       ROUND(100 * RATIO_TO_REPORT(SUM(m.qt * m.punit)) OVER (), 4)                AS share_venda_pct,
       COUNT(DISTINCT m.codcli)                                                    AS clientes_distintos,
       COUNT(DISTINCT TRUNC(m.dtmov, 'MM'))                                        AS meses_com_venda
  FROM pcmov m
  JOIN pcprodut p ON p.codprod = m.codprod
  LEFT JOIN pcdepto d ON d.codepto = p.codepto
  LEFT JOIN pcsecao s ON s.codsec  = p.codsec
 WHERE m.codoper   = 'S'
   AND m.dtcancel  IS NULL
   AND m.codfilial = '1'
   AND m.dtmov BETWEEN :dt_ini AND :dt_fim
 GROUP BY m.codprod, p.descricao, NVL(d.descricao, 'SEM DEPTO'), NVL(s.descricao, 'SEM SECAO')
HAVING SUM(m.qt * m.punit) > 0
 ORDER BY venda DESC
```

**Cômputo Python (pós-processamento):**

```text
1) med_share = statistics.median(share_venda_pct de todos os produtos); med_mg = statistics.median(margem_pct). 2) Para cada produto atribuir quadrante: share>=med_share e mg>=med_mg -> 'motor_de_lucro'; share>=med_share e mg<med_mg -> 'volume_margem_fina'; share<med_share e mg>=med_mg -> 'nicho_rentavel'; senao 'questionavel'. 3) Flag adicional 'abaixo_do_custo' se margem_pct < 0. 4) Resumo por quadrante: n_produtos, soma(venda), soma(margem_valor), margem_pct agregada. 5) Listas de ação: top 15 'volume_margem_fina' por venda desc (alvo de renegociação de custo) e top 15 'questionavel' por margem_valor asc (alvo de corte de mix). Apenas statistics/math.
```

**Obs:** Todas as colunas conferidas no dicionário. A_VALIDAR pela pendência P-03 (visão de custo). RATIO_TO_REPORT é avaliado sobre o conjunto pós-HAVING (correto: window functions avaliam após GROUP BY/HAVING no Oracle). Medianas no Python para permitir reclassificação interativa sem re-query. AUDITORIA (SQL corrigido): NVL de custo alinhado à convenção do catálogo — NVL(custofin, custoreal) em 3 ocorrências (custo, margem_valor, margem_pct).

### ANA-MRG-03 — Clientes com margem negativa ou anômala (outlier robusto por MAD)

- **Nível:** diagnostica  |  **Status:** a_validar  |  **Grão:** cliente (agregado no período), com praça e RCA da carteira (PCCLIENT.CODUSUR1)
- **Especialista:** Margem e Rentabilidade (análise diagnóstica) — distribuição/atacado Winthor
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** tabela — Tabela-ranking ordenada da pior margem para a melhor, com badge de anomalia e prejuízo em R$; complementar com mini-scatter margem_pct × venda por cliente colorido pelo RCA da carteira.

**Pergunta de negócio:** Quais dos 235 clientes destroem margem — por preço abaixo do custo ou desconto excessivo — e quanto custa mantê-los assim? Base para repactuar tabela, travar desconto no pedido ou repassar o cliente a outro atendimento.

**Técnica:** Margem por cliente + desconto implícito (1 − PUNIT/PTABELA) + contagem de linhas vendidas abaixo do custo; detecção de anomalia por z-score robusto (mediana/MAD) em Python — robusto porque com 235 clientes um único outlier distorceria média/desvio.

```sql
SELECT m.codcli,
       c.cliente,
       c.fantasia,
       NVL(pr.praca, 'SEM PRACA')                                                  AS praca,
       c.codusur1                                                                  AS codusur_carteira,
       NVL(u.nome, 'SEM RCA')                                                      AS rca_carteira,
       COUNT(DISTINCT m.numnota)                                                   AS notas,
       SUM(m.qt * m.punit)                                                         AS venda,
       SUM(m.qt * NVL(m.custoreal, m.custofin))                                    AS custo,
       SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custoreal, m.custofin))              AS margem_valor,
       ROUND(100 * (SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custoreal, m.custofin)))
             / NULLIF(SUM(m.qt * m.punit), 0), 2)                                  AS margem_pct,
       ROUND(100 * (1 - SUM(m.qt * m.punit) / NULLIF(SUM(m.qt * m.ptabela), 0)), 2) AS desconto_implicito_pct,
       SUM(CASE WHEN NVL(m.custoreal, m.custofin) > m.punit THEN 1 ELSE 0 END)     AS linhas_abaixo_custo,
       COUNT(*)                                                                    AS linhas_venda
  FROM pcmov m
  JOIN pcclient c  ON c.codcli    = m.codcli
  LEFT JOIN pcpraca  pr ON pr.codpraca = c.codpraca
  LEFT JOIN pcusuari u  ON u.codusur   = c.codusur1
 WHERE m.codoper   = 'S'
   AND m.dtcancel  IS NULL
   AND m.codfilial = '1'
   AND m.dtmov BETWEEN :dt_ini AND :dt_fim
 GROUP BY m.codcli, c.cliente, c.fantasia, NVL(pr.praca, 'SEM PRACA'), c.codusur1, NVL(u.nome, 'SEM RCA')
 ORDER BY margem_pct ASC, margem_valor ASC
```

**Cômputo Python (pós-processamento):**

```text
1) xs = lista de margem_pct dos clientes com venda > 0. 2) med = statistics.median(xs); mad = statistics.median([abs(x - med) for x in xs]). 3) Se mad > 0: rz(x) = 0.6745 * (x - med) / mad; senao usar desvio simples x - med. 4) flag_anomalia: 'critico' se margem_pct < 0 (prejuízo nominal); 'anomalo_baixo' se rz <= -3.5; 'atencao' se -3.5 < rz <= -2.0; senao 'normal'. 5) prejuizo_estimado por cliente crítico = margem_valor (negativo). 6) Saídas: lista ordenada por margem_valor asc com flags; agregado por rca_carteira (quantos clientes críticos/anômalos cada RCA carrega e soma do prejuízo) — conecta com ANA-MRG-04. Apenas statistics/math.
```

**Obs:** Todas as colunas conferidas no dicionário. A_VALIDAR pela pendência P-03 (custo — NVL(CUSTOREAL, CUSTOFIN) pode trocar silenciosamente a base conforme qual coluna estiver populada; padronizar a ordem oficial quando P-03 fechar) e pela semântica de PTABELA (se vier zerada/igual a PUNIT o desconto implícito degrada — ver pendência P-NOVA-DESC). INNER JOIN em PCCLIENT descarta linhas PCMOV sem CODCLI (correto para análise de cliente). RCA exibido é o da carteira (CODUSUR1), que pode divergir do RCA da venda.

### ANA-MRG-04 — Desconto praticado por RCA × mês — quem desconta demais?

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** mês × RCA
- **Especialista:** Margem e Rentabilidade (análise diagnóstica) — distribuição/atacado Winthor
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** linha — Evolução mensal do desconto implícito por RCA — quem está consistentemente acima da média da empresa 'desconta demais'. Tooltip com percdesc_medio_pond, vldesconto_total e pct_venda_com_desconto para checar convergência das três medidas.

**Pergunta de negócio:** Qual dos 8 RCAs concede mais desconto sobre a tabela, em que meses, e que fatia da venda dele sai com desconto? Alavanca direta de política comercial: alinhar/travar alçada de desconto na rotina de pedido antes de mexer em preço ou custo.

**Técnica:** Três medidas independentes que devem convergir: desconto implícito (1 − Σqt·PUNIT / Σqt·PTABELA — não depende dos campos de desconto), PERCDESC médio ponderado pela venda e ΣVLDESCONTO. Divergência entre elas é diagnóstico de qualidade de dado (vira pendência). Não depende de custo (independente de P-03).

```sql
SELECT TRUNC(m.dtmov, 'MM')                                                        AS mes,
       m.codusur                                                                   AS codusur,
       NVL(u.nome, 'SEM RCA')                                                      AS rca,
       COUNT(DISTINCT m.codcli)                                                    AS clientes,
       COUNT(*)                                                                    AS linhas_venda,
       SUM(m.qt * m.ptabela)                                                       AS venda_tabela,
       SUM(m.qt * m.punit)                                                         AS venda_praticada,
       ROUND(100 * (1 - SUM(m.qt * m.punit) / NULLIF(SUM(m.qt * m.ptabela), 0)), 2) AS desconto_implicito_pct,
       ROUND(SUM(m.qt * m.punit * NVL(m.percdesc, 0)) / NULLIF(SUM(m.qt * m.punit), 0), 2) AS percdesc_medio_pond,
       SUM(NVL(m.vldesconto, 0))                                                   AS vldesconto_total,
       ROUND(100 * SUM(CASE WHEN NVL(m.percdesc, 0) > 0 THEN m.qt * m.punit ELSE 0 END)
             / NULLIF(SUM(m.qt * m.punit), 0), 2)                                  AS pct_venda_com_desconto
  FROM pcmov m
  LEFT JOIN pcusuari u ON u.codusur = m.codusur
 WHERE m.codoper   = 'S'
   AND m.dtcancel  IS NULL
   AND m.codfilial = '1'
   AND m.dtmov BETWEEN :dt_ini AND :dt_fim
 GROUP BY TRUNC(m.dtmov, 'MM'), m.codusur, NVL(u.nome, 'SEM RCA')
 ORDER BY mes, desconto_implicito_pct DESC
```

**Obs:** 100% das colunas conferidas no dicionário (PCMOV.PTABELA, PERCDESC, VLDESCONTO, PUNIT, QT; PCUSUARI). NÃO depende de P-03 (nenhuma coluna de custo). Cuidado transversal: se PTABELA vier zerada em parte das linhas o desconto_implicito_pct fica superestimado — a pendência de semântica de desconto quantifica isso; até lá, ler as três medidas em conjunto (desconto embutido só em PUNIT não aparece em percdesc_medio_pond/pct_venda_com_desconto, e a divergência vira diagnóstico).

### ANA-REP-02 — Lead time real de reposição por fornecedor: média, mediana, P90 e gap vs cadastro

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** fornecedor (pedidos de compra recebidos no período)
- **Especialista:** Cientista de dados sênior — estoque prescritivo (reposição, cobertura e sugestão de compra) para distribuição/atacado, base Winthor/Oracle h4c
- **Parâmetros:** `:dt_ini` (DATE, default: ADD_MONTHS(TRUNC(SYSDATE),-12)), `:dt_fim` (DATE, default: TRUNC(SYSDATE))
- **Viz:** barra_h — Barras horizontais do lead time médio por fornecedor, com marcador do prazo cadastrado e whisker até o P90; gap positivo grande = cadastro otimista = ruptura sistemática. Fornecedores com desvio alto exigem mais estoque de segurança (alimenta ANA-REP-03).

**Pergunta de negócio:** Quanto tempo cada fornecedor REALMENTE leva entre o pedido de compra e a entrada em estoque — e o prazo cadastrado (PCFORNEC.PRAZOENTREGA) está mentindo? Define o LT e o sigma_LT usados no ponto de reposição.

**Técnica:** Lead time realizado = PCPEDIDO.DTENTRADAESTOQUE − PCPEDIDO.DTEMISSAO por pedido recebido; agregação por fornecedor com média, mediana, desvio-padrão e PERCENTILE_CONT(0.9); comparação com PCFORNEC.PRAZOENTREGA.

```sql
SELECT f.codfornec,
       f.fornecedor,
       NVL(f.prazoentrega, 0)                                                                  AS lead_time_cadastro_dias,
       COUNT(*)                                                                                AS pedidos_recebidos,
       ROUND(AVG(p.dtentradaestoque - p.dtemissao), 1)                                         AS lead_time_medio_dias,
       ROUND(MEDIAN(p.dtentradaestoque - p.dtemissao), 1)                                      AS lead_time_mediano_dias,
       ROUND(NVL(STDDEV(p.dtentradaestoque - p.dtemissao), 0), 1)                              AS lead_time_desvio_dias,
       MIN(p.dtentradaestoque - p.dtemissao)                                                   AS lead_time_min_dias,
       MAX(p.dtentradaestoque - p.dtemissao)                                                   AS lead_time_max_dias,
       ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY p.dtentradaestoque - p.dtemissao), 1) AS lead_time_p90_dias,
       ROUND(AVG(p.dtentradaestoque - p.dtemissao) - NVL(f.prazoentrega, 0), 1)                AS gap_real_menos_cadastro_dias
  FROM pcpedido p
  JOIN pcfornec f
    ON f.codfornec = p.codfornec
 WHERE p.dtemissao >= :dt_ini
   AND p.dtemissao <  :dt_fim + 1
   AND NVL(p.codfilial, '1') = '1'
   AND p.dtentradaestoque IS NOT NULL
   AND p.dtentradaestoque >= p.dtemissao
 GROUP BY f.codfornec, f.fornecedor, f.prazoentrega
 ORDER BY pedidos_recebidos DESC, lead_time_medio_dias DESC
```

**Obs:** Difere do CMP-03 (só média por fornecedor/mês): entram variabilidade (STDDEV, P90) — insumo direto do estoque de segurança — e o confronto com PCFORNEC.PRAZOENTREGA. AUDITORIA: PK de PCPEDIDO = NUMPED confirmada no fase6_pks.csv (grão = cabeçalho, sem dupla contagem por item); PCPEDIDO não tem coluna de cancelamento/posição — o filtro DTENTRADAESTOQUE IS NOT NULL é a proteção disponível. Caveat: com 329 pedidos em ~200 fornecedores, grupos com 1 pedido têm STDDEV nulo (→0 via NVL) e P90=máximo — ler junto com pedidos_recebidos.

### ANA-REP-04 — Dias sem estoque no período e venda perdida estimada (PCHISTEST + demanda não-restrita)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** produto × período (:dt_ini → :dt_fim, filial 1)
- **Especialista:** Cientista de dados sênior — estoque prescritivo (reposição, cobertura e sugestão de compra) para distribuição/atacado, base Winthor/Oracle h4c
- **Parâmetros:** `:dt_ini` (DATE, default: ADD_MONTHS(TRUNC(SYSDATE),-3)), `:dt_fim` (DATE, default: TRUNC(SYSDATE))
- **Viz:** pareto — Pareto da venda perdida estimada em R$: tipicamente poucos SKUs concentram a perda — são os candidatos óbvios a mais estoque de segurança no ANA-REP-03. Tooltip mostra dias zerados, % do período e o contador do próprio ERP (qt_venda_perdida_erp) como sanity check.

**Pergunta de negócio:** Quanto deixamos de vender por ruptura, em quais produtos — e quanto isso justifica investir em estoque de segurança?

**Técnica:** PCHISTEST (fotografia diária, PK filial+produto+data) conta os dias com disponível <= 0. Demanda não-restrita = venda do período ÷ dias COM estoque; venda perdida = dias zerados × essa taxa (em qt e em R$ usando PUNIT). Cross-check com PCEST.QTVENDAPERDIDA mantido pelo ERP.

```sql
WITH cobertura_hist AS (
    SELECT h.codprod,
           COUNT(*) AS dias_observados,
           SUM(CASE WHEN NVL(h.qtestger,0) - NVL(h.qtreserv,0) - NVL(h.qtbloqueada,0) <= 0
                    THEN 1 ELSE 0 END) AS dias_sem_estoque,
           MAX(CASE WHEN NVL(h.qtestger,0) - NVL(h.qtreserv,0) - NVL(h.qtbloqueada,0) <= 0
                    THEN h.data END)   AS ultimo_dia_zerado
      FROM pchistest h
     WHERE h.codfilial = '1'
       AND h.data >= :dt_ini
       AND h.data <  :dt_fim + 1
     GROUP BY h.codprod
),
venda AS (
    SELECT m.codprod,
           SUM(m.qt)           AS qt_venda_periodo,
           SUM(m.qt * m.punit) AS vl_venda_periodo
      FROM pcmov m
     WHERE m.codoper   = 'S'
       AND m.dtcancel  IS NULL
       AND m.codfilial = '1'
       AND m.dtmov >= :dt_ini
       AND m.dtmov <  :dt_fim + 1
     GROUP BY m.codprod
)
SELECT p.codprod,
       p.descricao,
       f.fornecedor,
       ch.dias_observados,
       ch.dias_sem_estoque,
       ROUND(100 * ch.dias_sem_estoque / ch.dias_observados, 1)  AS pct_dias_sem_estoque,
       ch.ultimo_dia_zerado,
       NVL(v.qt_venda_periodo, 0)                                 AS qt_venda_periodo,
       ROUND(v.qt_venda_periodo
             / NULLIF(ch.dias_observados - ch.dias_sem_estoque, 0), 3)
                                                                  AS demanda_diaria_dias_com_estoque,
       ROUND(ch.dias_sem_estoque * v.qt_venda_periodo
             / NULLIF(ch.dias_observados - ch.dias_sem_estoque, 0), 1)
                                                                  AS qt_venda_perdida_estimada,
       ROUND(ch.dias_sem_estoque * v.vl_venda_periodo
             / NULLIF(ch.dias_observados - ch.dias_sem_estoque, 0), 2)
                                                                  AS vl_venda_perdida_estimada,
       NVL(e.qtvendaperdida, 0)                                   AS qt_venda_perdida_erp
  FROM cobertura_hist ch
  JOIN pcprodut p
    ON p.codprod = ch.codprod
  JOIN pcest e
    ON e.codprod   = ch.codprod
   AND e.codfilial = '1'
  LEFT JOIN venda v
    ON v.codprod = ch.codprod
  LEFT JOIN pcfornec f
    ON f.codfornec = p.codfornec
 WHERE ch.dias_sem_estoque > 0
   AND NVL(v.qt_venda_periodo, 0) > 0
   AND p.dtexclusao IS NULL
 ORDER BY vl_venda_perdida_estimada DESC NULLS LAST
```

**Obs:** Estimativa assume demanda uniforme nos dias com e sem estoque (padrão em lost-sales simples); subestimada se a ruptura ocorreu em pico. Requer confirmar completude de PCHISTEST (136.767 linhas ÷ 722 produtos ≈ 189 dias < ~285 dias do período — ver pendência). Colunas 100% conferidas; PK de PCHISTEST (codfilial+codprod+data) confirmada no fase6.

### ANA-RFM-02 — Mapa segmento RFM × RCA: onde estão o dinheiro e o risco de cada carteira

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** segmento × RCA
- **Especialista:** Cientista de dados sênior — RFM e churn de clientes (distribuição/atacado)
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** heatmap — Heatmap 8 RCAs × 9 segmentos, intensidade = nº de clientes, com toggle para valor_total; ordenar segmentos do melhor (Campeões) ao pior (Perdidos) para leitura vertical do 'formato' de cada carteira.

**Pergunta de negócio:** Qual dos 8 RCAs concentra mais clientes 'Em risco' / 'Não pode perder' e quanto de faturamento cada segmento representa por carteira — para redistribuir esforço de visita e definir metas de reativação por vendedor?

**Técnica:** Mesma engine RFM da ANA-RFM-01, agregada em segmento × RCA com participação percentual no faturamento total (janela) via SUM() OVER ().

```sql
WITH vendas AS (
    SELECT n.codcli,
           TRUNC(n.dtsaida) AS dia,
           n.vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.codfilial = '1'
       AND n.dtsaida BETWEEN :dt_ini AND :dt_fim
),
agg AS (
    SELECT v.codcli,
           MAX(v.dia)            AS dt_ult_compra,
           COUNT(DISTINCT v.dia) AS frequencia,
           SUM(v.vltotal)        AS valor_total
      FROM vendas v
     GROUP BY v.codcli
),
scores AS (
    SELECT a.codcli,
           TRUNC(:dt_fim) - a.dt_ult_compra                   AS recencia_dias,
           a.valor_total,
           NTILE(5) OVER (ORDER BY a.dt_ult_compra, a.codcli) AS score_r,
           NTILE(5) OVER (ORDER BY a.frequencia,   a.codcli)  AS score_f,
           NTILE(5) OVER (ORDER BY a.valor_total,  a.codcli)  AS score_m
      FROM agg a
),
seg AS (
    SELECT s.codcli,
           s.recencia_dias,
           s.valor_total,
           CASE
             WHEN s.score_r >= 4 AND (s.score_f + s.score_m) / 2 >= 4 THEN 'Campeões'
             WHEN s.score_r >= 3 AND (s.score_f + s.score_m) / 2 >= 3 THEN 'Clientes fiéis'
             WHEN s.score_r >= 4 AND (s.score_f + s.score_m) / 2 >= 2 THEN 'Potenciais fiéis'
             WHEN s.score_r >= 4                                      THEN 'Novos / recentes'
             WHEN s.score_r  = 3                                      THEN 'Esfriando'
             WHEN (s.score_f + s.score_m) / 2 >= 4                    THEN 'Não pode perder'
             WHEN s.score_r  = 2                                      THEN 'Em risco'
             WHEN (s.score_f + s.score_m) / 2 >= 2                    THEN 'Hibernando'
             ELSE 'Perdidos'
           END AS segmento
      FROM scores s
)
SELECT sg.segmento,
       NVL(u.nome, '(sem RCA)')                                          AS rca,
       COUNT(*)                                                          AS clientes,
       ROUND(SUM(sg.valor_total), 2)                                     AS valor_total,
       ROUND(100 * SUM(sg.valor_total) / NULLIF(SUM(SUM(sg.valor_total)) OVER (), 0), 2) AS pct_valor_total,
       ROUND(AVG(sg.recencia_dias), 1)                                   AS recencia_media_dias
  FROM seg sg
  JOIN pcclient c      ON c.codcli    = sg.codcli
  LEFT JOIN pcusuari u  ON u.codusur   = c.codusur1
 GROUP BY sg.segmento, NVL(u.nome, '(sem RCA)')
 ORDER BY valor_total DESC
```

**Obs:** O RCA vem de PCCLIENT.CODUSUR1 (titular da carteira), não do CODUSUR da NF — decisão deliberada: a ação comercial é do dono da carteira. Se a gestão preferir o emissor, trocar o join para PCNFSAID.CODUSUR agregando por cliente. AUDITORIA (SQL corrigido): NULLIF adicionado no denominador de pct_valor_total (proteção contra divisão por zero exigida pelo checklist).

### ANA-SER-01 — Série diária de faturamento com médias móveis 7/28d (tendência × ruído)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** dia (calendário completo, 1 linha por dia entre :dt_ini e :dt_fim)
- **Especialista:** Cientista de dados sênior — séries temporais (diagnóstico) para distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** linha — Linha diária translúcida com MM7 e MM28 sobrepostas; cruzamento MM7×MM28 marca inflexão de tendência. Anotar visualmente feriados/domingos (faturamento=0).

**Pergunta de negócio:** A venda está crescendo ou caindo de verdade, descontado o serrilhado semanal? Suporta a decisão de revisar meta mensal e ritmo de compras: MM7 acima/abaixo da MM28 sinaliza aceleração/desaceleração da tendência.

**Técnica:** Séries temporais — médias móveis simples (7d e 28d trailing) e MM-7 centrada sobre calendário completo com dias sem venda preenchidos com zero (spine via CONNECT BY), garantindo janelas de tamanho fixo em dias corridos.

```sql
WITH cal AS (
  SELECT TRUNC(:dt_ini) + LEVEL - 1 AS dia
  FROM   dual
  CONNECT BY TRUNC(:dt_ini) + LEVEL - 1 <= TRUNC(:dt_fim)
),
fat AS (
  SELECT TRUNC(m.dtmov) AS dia,
         SUM(m.qt * m.punit) AS vl
  FROM   pcmov m
  WHERE  m.codoper   = 'S'
  AND    m.dtcancel  IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov)
)
SELECT c.dia,
       TO_CHAR(c.dia, 'DY', 'NLS_DATE_LANGUAGE=PORTUGUESE') AS dia_semana,
       NVL(f.vl, 0) AS faturamento,
       ROUND(AVG(NVL(f.vl,0)) OVER (ORDER BY c.dia ROWS BETWEEN 6  PRECEDING AND CURRENT ROW), 2) AS mm7,
       ROUND(AVG(NVL(f.vl,0)) OVER (ORDER BY c.dia ROWS BETWEEN 27 PRECEDING AND CURRENT ROW), 2) AS mm28,
       ROUND(AVG(NVL(f.vl,0)) OVER (ORDER BY c.dia ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING), 2)  AS mm7_centrada
FROM   cal c
LEFT   JOIN fat f ON f.dia = c.dia
ORDER  BY c.dia
```

**Obs:** Faturamento = SUM(qt*punit) de PCMOV CODOPER='S' com DTCANCEL IS NULL (convenção VEN-01; 24% das linhas S são canceladas — filtro obrigatório aplicado). O spine preenche dias sem venda com 0. As ~6 primeiras linhas de MM7 e ~27 de MM28 usam janela incompleta — descartar na leitura ou no front. Colunas conferidas no fase2_dicionario.csv. AUDITORIA (nota): BETWEEN é consistente com o spine porque os binds são DATE à meia-noite e DTMOV não tem hora embutida; o padrão half-open das ANA-PRE seria preferível por uniformidade.

### ANA-SER-02 — Índice sazonal por dia da semana — faturamento e pedidos

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** dia da semana (7 linhas)
- **Especialista:** Cientista de dados sênior — séries temporais (diagnóstico) para distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** barra — Barras acima/abaixo da linha 100 mostram dias fortes/fracos. Divergência pedido×faturamento no mesmo DOW revela defasagem digitação→faturamento (lead de expedição).

**Pergunta de negócio:** Quais dias concentram a venda e quais são fracos? Decide alocação da agenda dos 8 RCAs (visitar clientes fortes nos dias de pico de compra), dimensionamento da expedição por dia e leitura correta de 'ontem caiu' (caiu vs a média daquele dia da semana, não vs a média geral).

**Técnica:** Índices sazonais de dia-da-semana (média por DOW ÷ média das médias, base 100) calculados sobre calendário completo com zeros — evita viés de excluir domingos sem venda. DOW via TRUNC(dia,'IW') (0=segunda), independente de NLS.

```sql
WITH cal AS (
  SELECT TRUNC(:dt_ini) + LEVEL - 1 AS dia
  FROM   dual
  CONNECT BY TRUNC(:dt_ini) + LEVEL - 1 <= TRUNC(:dt_fim)
),
fat AS (
  SELECT TRUNC(m.dtmov) AS dia, SUM(m.qt * m.punit) AS vl
  FROM   pcmov m
  WHERE  m.codoper = 'S' AND m.dtcancel IS NULL AND m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov)
),
ped AS (
  SELECT TRUNC(c.data) AS dia, COUNT(*) AS qt_ped, SUM(NVL(c.vltotal,0)) AS vl_ped
  FROM   pcpedc c
  WHERE  c.posicao <> 'C' AND c.codfilial = '1'
  AND    c.data BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(c.data)
),
base AS (
  SELECT c.dia,
         c.dia - TRUNC(c.dia, 'IW') AS dow_num,
         NVL(f.vl, 0)     AS vl_fat,
         NVL(p.qt_ped, 0) AS qt_ped,
         NVL(p.vl_ped, 0) AS vl_ped
  FROM   cal c
  LEFT   JOIN fat f ON f.dia = c.dia
  LEFT   JOIN ped p ON p.dia = c.dia
)
SELECT dow_num,
       CASE dow_num WHEN 0 THEN 'Seg' WHEN 1 THEN 'Ter' WHEN 2 THEN 'Qua'
                    WHEN 3 THEN 'Qui' WHEN 4 THEN 'Sex' WHEN 5 THEN 'Sab'
                    ELSE 'Dom' END AS dia_semana,
       COUNT(*)                                    AS n_dias_calendario,
       SUM(CASE WHEN vl_fat > 0 THEN 1 ELSE 0 END) AS n_dias_com_venda,
       ROUND(AVG(vl_fat), 2)                       AS fat_medio_dia,
       ROUND(AVG(qt_ped), 1)                       AS pedidos_medio_dia,
       ROUND(AVG(vl_ped), 2)                       AS vl_pedidos_medio_dia,
       ROUND(100 * AVG(vl_fat) / NULLIF(AVG(AVG(vl_fat)) OVER (), 0), 1) AS indice_sazonal_fat,
       ROUND(100 * AVG(qt_ped) / NULLIF(AVG(AVG(qt_ped)) OVER (), 0), 1) AS indice_sazonal_ped,
       ROUND(100 * SUM(vl_fat) / NULLIF(SUM(SUM(vl_fat)) OVER (), 0), 1) AS share_fat_pct
FROM   base
GROUP  BY dow_num
ORDER  BY dow_num
```

**Obs:** Índice sobre calendário completo (com zeros): mede o dia da semana como dia de calendário — n_dias_com_venda expõe quantos daquele DOW efetivamente venderam. Índices de pedido (PCPEDC, demanda digitada) vs faturamento (PCMOV) no mesmo gráfico diagnosticam o deslocamento pedido→nota. PCPEDC.VLTOTAL = valor pedido (VLATEND seria o atendido — ver pendência P-SER-04). AUDITORIA: AVG(AVG(vl_fat)) OVER () é sintaxe Oracle válida e implementa corretamente 'média das médias'; com ~40 dias por DOW, macro e micro-média praticamente coincidem.

### ANA-SER-03 — Curva intra-mês: % acumulado do faturamento por dia do mês (pacing de meta e quinzenas)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** dia do mês (1..31), agregado entre os ~8-9 meses completos
- **Especialista:** Cientista de dados sênior — séries temporais (diagnóstico) para distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** area — Curva acumulada média com banda min-max entre meses. Curva abaixo da diagonal até o dia 20 + salto final = venda concentrada no fechamento (risco operacional e de meta). Valor da curva no dia 15 = share médio da 1ª quinzena.

**Pergunta de negócio:** No dia D do mês, quanto % da venda mensal 'já deveria' ter entrado? Decide o pacing da meta (agir no dia 10, não no dia 28), antecipa a concentração de fim de mês (pressão na expedição/logística) e calibra o fluxo de caixa quinzenal junto ao contas a pagar.

**Técnica:** Perfil intra-mês normalizado: % diário e % acumulado do faturamento de cada mês, com média/min/max entre meses por dia-do-mês (banda de variabilidade). Somente meses completos dentro do range (bordas parciais excluídas no SQL). Leitura quinzenal: pct_acum_medio no dia 15 = share médio da 1ª quinzena.

```sql
WITH cal AS (
  SELECT TRUNC(:dt_ini) + LEVEL - 1 AS dia
  FROM   dual
  CONNECT BY TRUNC(:dt_ini) + LEVEL - 1 <= TRUNC(:dt_fim)
),
fat AS (
  SELECT TRUNC(m.dtmov) AS dia, SUM(m.qt * m.punit) AS vl
  FROM   pcmov m
  WHERE  m.codoper = 'S' AND m.dtcancel IS NULL AND m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov)
),
d AS (
  SELECT c.dia, NVL(f.vl, 0) AS vl
  FROM   cal c
  LEFT   JOIN fat f ON f.dia = c.dia
  WHERE  TRUNC(c.dia, 'MM') >= CASE WHEN TRUNC(:dt_ini) = TRUNC(:dt_ini, 'MM')
                                    THEN TRUNC(:dt_ini, 'MM')
                                    ELSE ADD_MONTHS(TRUNC(:dt_ini, 'MM'), 1) END
  AND    LAST_DAY(c.dia) <= TRUNC(:dt_fim)
),
m AS (
  SELECT TRUNC(dia, 'MM')      AS mes,
         EXTRACT(DAY FROM dia) AS dia_mes,
         vl,
         SUM(vl) OVER (PARTITION BY TRUNC(dia, 'MM'))               AS vl_mes,
         SUM(vl) OVER (PARTITION BY TRUNC(dia, 'MM') ORDER BY dia)  AS vl_acum
  FROM   d
)
SELECT dia_mes,
       CASE WHEN dia_mes <= 15 THEN '1a quinzena' ELSE '2a quinzena' END AS quinzena,
       COUNT(*)                                        AS n_meses,
       ROUND(AVG(100 * vl      / NULLIF(vl_mes, 0)), 2) AS pct_dia_medio,
       ROUND(AVG(100 * vl_acum / NULLIF(vl_mes, 0)), 1) AS pct_acum_medio,
       ROUND(MIN(100 * vl_acum / NULLIF(vl_mes, 0)), 1) AS pct_acum_min,
       ROUND(MAX(100 * vl_acum / NULLIF(vl_mes, 0)), 1) AS pct_acum_max
FROM   m
GROUP  BY dia_mes, CASE WHEN dia_mes <= 15 THEN '1a quinzena' ELSE '2a quinzena' END
ORDER  BY dia_mes
```

**Obs:** Meses parciais nas bordas do range são excluídos no próprio SQL — com out/2025→jul/2026 restam ~8-9 meses completos; a banda min-max é mais honesta que desvio-padrão. Dias 29-31 têm n_meses menor (meses curtos) — a coluna n_meses permite ao front sinalizar. Uso operacional: comparar o acumulado do mês corrente contra pct_acum_medio. AUDITORIA (nota): se o range não contiver nenhum mês completo o SQL retorna vazio — comportamento correto; o front deve tratar resultado vazio com mensagem adequada.

### ANA-SER-04 — Sazonalidade intradia: pedidos por hora (PCPEDC.HORA) × faturamento lançado por hora (PCMOV.HORALANC)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** hora do dia (24 linhas)
- **Especialista:** Cientista de dados sênior — séries temporais (diagnóstico) para distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** linha — Curvas em share % permitem comparar o formato: o gap entre o pico de digitação (14h-17h) e o pico de lançamento de NF mede o atraso demanda→faturamento e revela se pedidos da tarde só viram nota no dia seguinte (define o horário de corte).

**Pergunta de negócio:** A que horas a demanda entra e a que horas o faturamento é lançado? Decide o horário de corte de pedido para faturar no mesmo dia, o turno da equipe de faturamento/expedição e o melhor horário para os RCAs fecharem pedido (pico validado 14h-17h).

**Técnica:** Perfil horário (0-23h) de duas séries alinhadas por spine de 24 horas: demanda digitada (PCPEDC.HORA, NUMBER 100% populado) e lançamento de faturamento (PCMOV.HORALANC, VARCHAR2 convertido com TO_NUMBER ... ON CONVERSION ERROR). Shares percentuais para comparar formatos das curvas independentemente de volume.

```sql
WITH horas AS (
  SELECT LEVEL - 1 AS hora FROM dual CONNECT BY LEVEL <= 24
),
ped AS (
  SELECT c.hora,
         COUNT(*)               AS qt_pedidos,
         SUM(NVL(c.vltotal,0))  AS vl_pedidos
  FROM   pcpedc c
  WHERE  c.posicao <> 'C'
  AND    c.codfilial = '1'
  AND    c.data BETWEEN :dt_ini AND :dt_fim
  GROUP  BY c.hora
),
fatu AS (
  SELECT TO_NUMBER(m.horalanc DEFAULT NULL ON CONVERSION ERROR) AS hora,
         COUNT(DISTINCT m.numtransvenda) AS qt_transacoes,
         SUM(m.qt * m.punit)             AS vl_faturado
  FROM   pcmov m
  WHERE  m.codoper = 'S' AND m.dtcancel IS NULL AND m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TO_NUMBER(m.horalanc DEFAULT NULL ON CONVERSION ERROR)
)
SELECT h.hora,
       NVL(p.qt_pedidos, 0)                AS qt_pedidos,
       ROUND(NVL(p.vl_pedidos, 0), 2)      AS vl_pedidos,
       ROUND(100 * NVL(p.qt_pedidos, 0) / NULLIF(SUM(NVL(p.qt_pedidos, 0)) OVER (), 0), 1)  AS pct_pedidos,
       NVL(f.qt_transacoes, 0)             AS qt_transacoes_fat,
       ROUND(NVL(f.vl_faturado, 0), 2)     AS vl_faturado,
       ROUND(100 * NVL(f.vl_faturado, 0) / NULLIF(SUM(NVL(f.vl_faturado, 0)) OVER (), 0), 1) AS pct_faturado
FROM   horas h
LEFT   JOIN ped  p ON p.hora = h.hora
LEFT   JOIN fatu f ON f.hora = h.hora
ORDER  BY h.hora
```

**Obs:** PCPEDC.HORA/MINUTO validados (NUMBER, 100% populados). TO_NUMBER(... DEFAULT NULL ON CONVERSION ERROR) (Oracle 19c) protege contra lixo em HORALANC; valores não numéricos ou fora de 0-23 caem fora do spine e do denominador de pct_faturado (shares somam 100% sobre as horas visíveis) — medir volume na pendência P-SER-01. Semântica de HORALANC (digitação vs emissão real) é a pendência P-SER-02 — a leitura do 'horário de corte' depende dela. FUSÃO (dedupe): absorve ANA-INT-02 (especialista operacao-intradia) — mesma comparação pedidos×faturamento por hora; da INT-02 herda-se o recorte intradia opcional (padrão :hora_ini/:hora_fim aplicado a c.hora e à hora convertida de HORALANC) e a guarda extra BETWEEN 0 AND 23 recomendada pela auditoria da INT-02; a proteção ON CONVERSION ERROR já é a usada aqui.

### ANA-SER-05 — Heatmap dia-da-semana × hora dos pedidos (janelas de demanda)

- **Nível:** diagnostica  |  **Status:** validado  |  **Grão:** dia da semana × hora (até 7×24 células; células sem pedido não retornam — front preenche com 0)
- **Especialista:** Cientista de dados sênior — séries temporais (diagnóstico) para distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15), `hora_ini` (NUMBER 0-23, opcional, default: NULL (=0)), `hora_fim` (NUMBER 0-23, opcional, default: NULL (=23))
- **Viz:** heatmap — Heatmap 7×24 com escala sequencial; recorte padrão 7h-20h para não desperdiçar tela com madrugada vazia. O toggle 'por dia ativo' evita que a raridade de sábados ativos esconda uma janela sabatina relevante por pedido.

**Pergunta de negócio:** Quais células dia×hora concentram a entrada de pedidos? Decide a grade de visitas/ligações dos 8 RCAs (estar com o cliente na janela em que ele compra), os horários de reforço do faturamento e onde cabe uma ação comercial em janelas mortas.

**Técnica:** Matriz de sazonalidade cruzada DOW×hora com dupla normalização: volume absoluto (cor) e pedidos por dia ativo (corrige o fato de haver mais segundas que domingos com atividade). DOW NLS-independente via dia - TRUNC(dia,'IW').

```sql
WITH ped AS (
  SELECT TRUNC(c.data) - TRUNC(c.data, 'IW') AS dow_num,
         c.hora                              AS hora,
         TRUNC(c.data)                       AS dia,
         NVL(c.vltotal, 0)                   AS vltotal
  FROM   pcpedc c
  WHERE  c.posicao <> 'C'
  AND    c.codfilial = '1'
  AND    c.data BETWEEN :dt_ini AND :dt_fim
  AND    c.hora BETWEEN NVL(:hora_ini, 0) AND NVL(:hora_fim, 23)
)
SELECT dow_num,
       CASE dow_num WHEN 0 THEN 'Seg' WHEN 1 THEN 'Ter' WHEN 2 THEN 'Qua'
                    WHEN 3 THEN 'Qui' WHEN 4 THEN 'Sex' WHEN 5 THEN 'Sab'
                    ELSE 'Dom' END           AS dia_semana,
       hora,
       COUNT(*)                              AS qt_pedidos,
       ROUND(SUM(vltotal), 2)                AS vl_pedidos,
       COUNT(DISTINCT dia)                   AS n_dias_ativos,
       ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT dia), 0), 2)                    AS pedidos_por_dia_ativo,
       ROUND(100 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 2)            AS pct_total_pedidos
FROM   ped
GROUP  BY dow_num, hora
ORDER  BY dow_num, hora
```

**Obs:** Base = PCPEDC (demanda digitada), POSICAO <> 'C'. Variante de faturamento: trocar a CTE por PCMOV com TO_NUMBER(HORALANC DEFAULT NULL ON CONVERSION ERROR) e DTCANCEL IS NULL. Com ~1.666 pedidos em ~9 meses, células de fim de semana terão contagens baixas — ler junto com n_dias_ativos; a auditoria recomenda ocultar/esmaecer células com qt_pedidos < 3. FUSÃO (dedupe): absorve ANA-INT-03 (especialista operacao-intradia) — mesmo heatmap DOW×hora de pedidos; esta versão é mais completa (dupla normalização por dia ativo + recorte intradia); da INT-03 pode-se incorporar a métrica clientes_distintos por célula e o rótulo PT via TO_CHAR(data,'DY','NLS_DATE_LANGUAGE=PORTUGUESE').

## Nível: Preditiva

### ANA-CAN-03 — Valor perdido mensal com cancelamentos e devoluções + projeção de 3 meses

- **Nível:** preditiva  |  **Status:** a_validar  |  **Grão:** mês
- **Especialista:** devolucoes_cancelamentos
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** barra — Combo mensal: barras empilhadas do valor perdido (cancelado + devolvido) sobre linha de perda_pct; a projeção do computo_python entra como segmento tracejado. KPIs de topo: perda acumulada no período, perda_pct do último mês fechado e tendência (subindo/caindo).

**Pergunta de negócio:** Quanto de receita a H4C perde por mês entre linhas de venda canceladas (reconstruídas de PCMOV, já que PCNFSAID.VLTOTAL das 210 NFs canceladas está zerado) e devoluções de cliente — e a perda está subindo ou caindo? Com ~R$ 405 mil já parados em títulos abertos, saber se a sangria de faturamento cresce define se o tema entra na pauta da diretoria. Decisão: meta mensal de redução de perda e acompanhamento da tendência.

**Técnica:** Série mensal de perda (cancelado + devolvido) sobre faturamento potencial + regressão linear por mínimos quadrados com projeção de 3 meses

```sql
WITH venda AS (
  SELECT TRUNC(m.dtmov, 'MM') AS mes,
         SUM(CASE WHEN m.dtcancel IS NULL     THEN m.qt * m.punit ELSE 0 END) AS vl_faturado,
         SUM(CASE WHEN m.dtcancel IS NOT NULL THEN m.qt * m.punit ELSE 0 END) AS vl_cancelado,
         COUNT(CASE WHEN m.dtcancel IS NOT NULL THEN 1 END) AS linhas_canceladas,
         COUNT(*) AS linhas_total
  FROM   pcmov m
  WHERE  m.codoper = 'S'
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov, 'MM')
),
dev AS (
  SELECT TRUNC(m.dtmov, 'MM') AS mes,
         SUM(m.qt * m.punit) AS vl_devolvido
  FROM   pcmov m
  WHERE  m.codoper = 'ED'
  AND    m.dtcancel IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov, 'MM')
),
nfc AS (
  SELECT TRUNC(n.dtsaida, 'MM') AS mes,
         COUNT(DISTINCT n.numtransvenda) AS nf_canceladas
  FROM   pcnfsaid n
  WHERE  n.dtcancel IS NOT NULL
  AND    n.codfilial = '1'
  AND    n.dtsaida BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(n.dtsaida, 'MM')
),
ped AS (
  SELECT TRUNC(p.data, 'MM') AS mes,
         COUNT(*) AS pedidos_cancelados,
         SUM(NVL(p.vltotal, 0)) AS vl_pedidos_cancelados
  FROM   pcpedc p
  WHERE  p.posicao = 'C'
  AND    p.codfilial = '1'
  AND    p.data BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(p.data, 'MM')
)
SELECT v.mes,
       ROUND(v.vl_faturado, 2)                     AS vl_faturado,
       ROUND(v.vl_cancelado, 2)                    AS vl_cancelado,
       ROUND(NVL(d.vl_devolvido, 0), 2)            AS vl_devolvido,
       ROUND(v.vl_faturado - NVL(d.vl_devolvido, 0), 2) AS vl_liquido_pos_devolucao,
       ROUND(v.vl_cancelado + NVL(d.vl_devolvido, 0), 2) AS vl_perdido,
       ROUND(100 * (v.vl_cancelado + NVL(d.vl_devolvido, 0)) / NULLIF(v.vl_faturado + v.vl_cancelado, 0), 2) AS perda_pct,
       ROUND(100 * v.linhas_canceladas / NULLIF(v.linhas_total, 0), 2) AS taxa_linhas_cancel_pct,
       NVL(f.nf_canceladas, 0)                     AS nf_canceladas,
       NVL(p.pedidos_cancelados, 0)                AS pedidos_cancelados,
       ROUND(NVL(p.vl_pedidos_cancelados, 0), 2)   AS vl_pedidos_cancelados
FROM   venda v
LEFT   JOIN dev d ON d.mes = v.mes
LEFT   JOIN nfc f ON f.mes = v.mes
LEFT   JOIN ped p ON p.mes = v.mes
ORDER  BY v.mes
```

**Cômputo Python (pós-processamento):**

```text
Entrada: linhas ordenadas por mes. Passos (math/statistics puros): 1) descartar o último mês se estiver incompleto (mes do último registro == mês corrente); 2) montar x=[0..n-1] e duas séries y: perda_pct e vl_perdido; 3) mínimos quadrados manuais: sx=sum(x); sy=sum(y); sxy=sum(xi*yi); sxx=sum(xi*xi); slope=(n*sxy-sx*sy)/(n*sxx-sx*sx); intercept=(sy-slope*sx)/n (ou statistics.linear_regression); 4) qualidade do ajuste: r=statistics.correlation(x,y); reportar r*r; 5) projetar t=n, n+1, n+2: yhat=intercept+slope*t, com piso em 0; 6) saída: dicionário {tendencia: 'alta' se slope>0 senão 'queda', slope_mensal, r2, projecao: [(mes+1, yhat1), (mes+2, yhat2), (mes+3, yhat3)]} para as duas séries. Com ~9 meses de histórico, tratar r2<0.3 como 'sem tendência clara' e não exibir a projeção.
```

**Obs:** Colunas 100% conferidas. a_validar por dois motivos de semântica: (a) CTE dev depende da hipótese ED = devolução de cliente (ANA-DEV-01 resolve); (b) confirmar se PCPEDC.VLTOTAL é preservado nos 100 pedidos POSICAO='C'. Cancelado é atribuído ao mês da VENDA (DTMOV/DTSAIDA), não do cancelamento. nf_canceladas e pedidos_cancelados são colunas informativas separadas, não somadas em vl_perdido (sem dupla contagem entre PCMOV, PCNFSAID e PCPEDC). AUDITORIA (caveat): LEFT JOINs partem de venda — um mês hipotético com devolução mas sem nenhuma linha S seria omitido; irrelevante com ~9 meses contínuos.

### ANA-FCR-07 — Score de risco de inadimplência explicável (0-100) por cliente

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** cliente (foto de hoje + comportamento histórico)
- **Especialista:** credito-inadimplencia-contas-a-receber
- **Parâmetros:** `dt_ini` (DATE, opcional, default: NULL = toda a história de pagamentos), `dt_fim` (DATE, opcional, default: NULL = até hoje)
- **Viz:** barra_h — Barra empilhada horizontal: o comprimento total é o score, cada segmento colorido é a contribuição em pontos de um fator — o gestor vê de onde vem o risco. Complementar com KPI de exposição total nas classes D+E.

**Pergunta de negócio:** Qual a nota de risco de cada cliente e POR QUÊ — para decidir bloqueio de venda a prazo, revisão de limite de crédito e exigência de pagamento antecipado, com justificativa defensável perante o RCA e o cliente.

**Técnica:** Scorecard aditivo explicável (sem ML caixa-preta): 5 fatores normalizados 0-100 com pesos fixos + penalidade por prorrogações. Cada ponto do score é rastreável a um fator observável.

```sql
WITH hist AS (
  SELECT p.codcli,
         COUNT(*)                                                              AS qtd_pagos,
         SUM(NVL(p.vpago, p.valor))                                            AS vlr_pago_total,
         ROUND(SUM((p.dtpag - p.dtvenc) * NVL(p.vpago, p.valor))
               / NULLIF(SUM(NVL(p.vpago, p.valor)), 0), 1)                     AS atraso_medio_pond,
         ROUND(100 * SUM(CASE WHEN p.dtpag - p.dtvenc > 30 THEN 1 ELSE 0 END)
               / COUNT(*), 1)                                                  AS perc_tit_atraso30,
         SUM(CASE WHEN p.dtvenc > p.dtvencorig THEN 1 ELSE 0 END)              AS qtd_prorrogados
  FROM   pcprest p
  WHERE  p.dtpag IS NOT NULL
  AND    p.dtcancel IS NULL
  AND    p.codfilial = '1'
  AND    (:dt_ini IS NULL OR p.dtpag >= :dt_ini)
  AND    (:dt_fim IS NULL OR p.dtpag <= :dt_fim)
  GROUP  BY p.codcli
),
aberto AS (
  SELECT p.codcli,
         COUNT(*)                                                              AS qtd_abertos,
         SUM(p.valor - NVL(p.vpago, 0))                                        AS exposicao_aberta,
         SUM(CASE WHEN p.dtvenc < TRUNC(SYSDATE)
                  THEN p.valor - NVL(p.vpago, 0) ELSE 0 END)                   AS exposicao_vencida,
         SUM(CASE WHEN p.dtvenc < TRUNC(SYSDATE) THEN 1 ELSE 0 END)            AS qtd_vencidos,
         MAX(CASE WHEN p.dtvenc < TRUNC(SYSDATE)
                  THEN TRUNC(SYSDATE) - p.dtvenc ELSE 0 END)                   AS dias_vencido_max
  FROM   pcprest p
  WHERE  p.dtpag IS NULL
  AND    p.dtcancel IS NULL
  AND    p.codfilial = '1'
  GROUP  BY p.codcli
)
SELECT c.codcli,
       c.cliente,
       u.nome                                   AS rca,
       c.limcred,
       c.bloqueio,
       c.dtultcomp,
       TRUNC(SYSDATE) - c.dtultcomp             AS dias_sem_comprar,
       NVL(h.qtd_pagos, 0)                      AS qtd_pagos,
       NVL(h.vlr_pago_total, 0)                 AS vlr_pago_total,
       h.atraso_medio_pond,
       NVL(h.perc_tit_atraso30, 0)              AS perc_tit_atraso30,
       NVL(h.qtd_prorrogados, 0)                AS qtd_prorrogados,
       NVL(a.qtd_abertos, 0)                    AS qtd_abertos,
       NVL(a.exposicao_aberta, 0)               AS exposicao_aberta,
       NVL(a.exposicao_vencida, 0)              AS exposicao_vencida,
       NVL(a.qtd_vencidos, 0)                   AS qtd_vencidos,
       NVL(a.dias_vencido_max, 0)               AS dias_vencido_max
FROM   pcclient c
       LEFT JOIN hist h     ON h.codcli  = c.codcli
       LEFT JOIN aberto a   ON a.codcli  = c.codcli
       LEFT JOIN pcusuari u ON u.codusur = c.codusur1
WHERE  NVL(h.qtd_pagos, 0) > 0 OR NVL(a.qtd_abertos, 0) > 0
ORDER  BY NVL(a.exposicao_vencida, 0) DESC, NVL(a.exposicao_aberta, 0) DESC
```

**Cômputo Python (pós-processamento):**

```text
Para cada linha (cliente): 1) clamp(v)=max(0,min(100,v)). 2) Subscores 0-100: f_atraso=clamp(atraso_medio_pond/60*100) (60d+ de atraso médio = teto; se atraso_medio_pond None ou <0, usar 0); f_vencido=clamp(100*exposicao_vencida/exposicao_aberta) se exposicao_aberta>0 senão 0; f_idade=clamp(dias_vencido_max/90*100); f_recorrencia=perc_tit_atraso30 (já em %); f_limite=clamp(100*exposicao_aberta/limcred) se limcred e limcred>0, senão 50 (neutro: sem limite cadastrado). 3) score_base=0.30*f_atraso+0.25*f_vencido+0.20*f_idade+0.15*f_recorrencia+0.10*f_limite. 4) Penalidade prorrogação: score=min(100, score_base+min(10, 2*qtd_prorrogados)). 5) Regra sem histórico: se qtd_pagos==0 e qtd_abertos>0, score=max(score,40) e marcar flag 'sem_historico'. 6) Classe: A<20, B 20-39, C 40-59, D 60-79, E>=80. 7) Explicabilidade: emitir por cliente a lista [(fator, valor_bruto, subscore, peso, contribuicao_pontos)] ordenada por contribuição — alimenta a barra empilhada. 8) Agregado gerencial: soma de exposicao_aberta e exposicao_vencida por classe.
```

**Obs:** Pesos e cortes (60d, 90d, 30d) são hiperparâmetros de negócio explícitos — revisar com o financeiro após o primeiro mês de uso. Com ~9 meses de história e 235 clientes, um logit não teria eventos de default suficientes para superar um scorecard bem calibrado; a virtude é a explicabilidade. BLOQUEIO e DTULTCOMP retornam para contexto do gestor.

### ANA-FCR-08 — Previsão de entrada de caixa 30/60/90 dias — curva empírica de recebimento

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** misto: CURVA = cliente × dia de offset (histórico pago); ABERTO = título em aberto (336 linhas)
- **Especialista:** credito-inadimplencia-contas-a-receber
- **Parâmetros:** `dt_ini` (DATE, default: primeiro dia da base (out/2025) — usar toda a história disponível para a curva), `dt_fim` (DATE, default: SYSDATE)
- **Viz:** barra — Barras do valor esperado por janela com banda de confiança; linha secundária com o acumulado. Contrastar com a visão ingênua 'por vencimento' (FCP-04 espelhado) para mostrar o efeito do atraso comportamental.

**Pergunta de negócio:** Quanto dos R$ ~405 mil em aberto realmente entra no caixa nos próximos 30/60/90 dias, considerando que cliente atrasa? Decide necessidade de capital de giro, antecipação de recebíveis e compromissos com fornecedores (cruza com FCP-04, o fluxo a pagar).

**Técnica:** Curva empírica de recebimento (distribuição do offset DTPAG-DTVENC ponderada por valor), condicionada à idade atual do título (sobrevivência: só conta a cauda além da idade atual), com mistura cliente/global por shrinkage.

```sql
SELECT 'CURVA'                                              AS tipo_linha,
       p.codcli,
       GREATEST(-60, LEAST(120, TRUNC(p.dtpag - p.dtvenc))) AS dias_offset,
       CAST(NULL AS DATE)                                   AS dtvenc,
       COUNT(*)                                             AS qtd_titulos,
       SUM(NVL(p.vpago, p.valor))                           AS valor
FROM   pcprest p
WHERE  p.dtpag IS NOT NULL
AND    p.dtcancel IS NULL
AND    p.codfilial = '1'
AND    p.dtpag BETWEEN :dt_ini AND :dt_fim
GROUP  BY p.codcli, GREATEST(-60, LEAST(120, TRUNC(p.dtpag - p.dtvenc)))
UNION ALL
SELECT 'ABERTO'                                             AS tipo_linha,
       p.codcli,
       GREATEST(-60, LEAST(120, TRUNC(SYSDATE) - TRUNC(p.dtvenc))) AS dias_offset,
       p.dtvenc                                             AS dtvenc,
       1                                                    AS qtd_titulos,
       p.valor - NVL(p.vpago, 0)                            AS valor
FROM   pcprest p
WHERE  p.dtpag IS NULL
AND    p.dtcancel IS NULL
AND    p.codfilial = '1'
ORDER  BY tipo_linha, codcli, dias_offset
```

**Cômputo Python (pós-processamento):**

```text
Entrada: linhas CURVA (codcli, dias_offset, qtd, valor) e ABERTO (codcli, dias_offset=idade atual em dias, pode ser negativa = a vencer, valor=saldo). Passos: 1) Curva global: agregue CURVA por dias_offset somando valor; construa F_glob(d) = fração acumulada do valor pago com offset <= d, para d de -60 a 120 (suporte inteiro; offsets fora do range já vêm capados do SQL). 2) Curva por cliente: para cada codcli com n_cli = soma qtd >= 8, construa F_cli(d) igual; shrinkage: w = n_cli/(n_cli+8); F(d) = w*F_cli(d) + (1-w)*F_glob(d); clientes com n_cli < 8 usam F_glob. 3) Para cada título ABERTO com saldo S, idade a e curva F do seu cliente: massa remanescente M = 1 - F(a) (se M <= 0.02, tratar como cauda: 'perda provável', não prever entrada). Probabilidade de receber na janela (a, a+h]: p_h = (F(min(a+h,120)) - F(a)) / M, para h em {30, 60, 90}. 4) Esperado por janela: E30 = soma(S * p_30); E60 e E90 idem (acumulados); entradas incrementais: E30, E60-E30, E90-E60; residual = soma(S*(1-p_90)) + saldos em 'perda provável' (reportar separado). 5) Banda de incerteza (aprox. normal, math.sqrt): var_h = soma(S_i^2 * p_i_h * (1-p_i_h)); banda = E_h ± 1.28*sqrt(var_h) (80% de confiança). 6) Saída: tabela [janela, esperado, banda_inf, banda_sup, acumulado] + lista dos 10 títulos com maior S em 'perda provável'. Apenas math; sem libs externas.
```

**Obs:** Com ~9 meses de base a cauda da curva além de ~120d não é observável — títulos além disso viram 'perda provável' (conservador, correto para caixa). Recalibrar mensalmente. Assume comportamento estacionário — cruzar com classe de risco do ANA-FCR-07. AUDITORIA (SQL corrigido): cap GREATEST(-60, LEAST(120, ...)) aplicado também no ramo ABERTO (o original só capava a CURVA e o Python indexaria F fora do suporte [-60,120]) + TRUNC(p.dtvenc) para garantir offset inteiro; offset capado em 120 cai automaticamente na regra M<=0.02 (perda provável).

### ANA-FCR-10 — Matriz de rolagem do aging (roll rates mês a mês) e perda esperada

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** mês × faixa_de × faixa_para (transições título a título agregadas)
- **Especialista:** credito-inadimplencia-contas-a-receber
- **Parâmetros:** `dt_ini` (DATE, default: 01/10/2025 (início da base)), `dt_fim` (DATE, default: último fim de mês fechado)
- **Viz:** heatmap — Heatmap da matriz de transição média ponderada por valor. A diagonal 'para PAGO' é a cura; a banda acima da diagonal é a rolagem. Linha temporal do roll rate crítico mostra se a carteira está piorando.

**Pergunta de negócio:** Qual a probabilidade de um real que venceu ontem rolar para 31-60, 61-90 e virar perda (90+)? A carteira está deteriorando ou melhorando mês a mês? Define a provisão de devedores duvidosos e o ponto ótimo de endurecer a cobrança (onde a rolagem dispara).

**Técnica:** Reconstrução de snapshots de fim de mês a partir de DTEMISSAO/DTVENC/DTPAG (PCPREST não guarda histórico, mas o estado passado é derivável), transição de faixa via LAG por título, e cadeia de Markov (roll rates) ponderada por valor no pós-processamento.

```sql
WITH meses AS (
  SELECT LAST_DAY(ADD_MONTHS(TRUNC(:dt_ini, 'MM'), LEVEL - 1)) AS fim_mes
  FROM   dual
  CONNECT BY ADD_MONTHS(TRUNC(:dt_ini, 'MM'), LEVEL - 1) <= TRUNC(:dt_fim, 'MM')
),
snap AS (
  SELECT m.fim_mes,
         p.numtransvenda,
         p.prest,
         p.codcli,
         p.valor,
         CASE
           WHEN p.dtpag IS NOT NULL AND p.dtpag <= m.fim_mes THEN 'PAGO'
           WHEN p.dtvenc >= m.fim_mes                        THEN 'A VENCER'
           WHEN m.fim_mes - p.dtvenc <= 30                   THEN '01-30'
           WHEN m.fim_mes - p.dtvenc <= 60                   THEN '31-60'
           WHEN m.fim_mes - p.dtvenc <= 90                   THEN '61-90'
           ELSE '90+'
         END AS faixa
  FROM   pcprest p
         CROSS JOIN meses m
  WHERE  p.dtcancel IS NULL
  AND    p.codfilial = '1'
  AND    p.dtemissao <= m.fim_mes
),
trans AS (
  SELECT s.fim_mes,
         s.valor,
         s.faixa,
         LAG(s.faixa) OVER (PARTITION BY s.numtransvenda, s.prest
                            ORDER BY s.fim_mes) AS faixa_ant
  FROM   snap s
)
SELECT TO_CHAR(t.fim_mes, 'YYYY-MM') AS mes,
       t.faixa_ant                   AS faixa_de,
       t.faixa                       AS faixa_para,
       COUNT(*)                      AS qtd_titulos,
       SUM(t.valor)                  AS valor
FROM   trans t
WHERE  t.faixa_ant IS NOT NULL
AND    t.faixa_ant <> 'PAGO'
GROUP  BY TO_CHAR(t.fim_mes, 'YYYY-MM'), t.faixa_ant, t.faixa
ORDER  BY 1, 2, 3
```

**Cômputo Python (pós-processamento):**

```text
1) Ordene faixas F=['A VENCER','01-30','31-60','61-90','90+','PAGO']. 2) Matriz média: para cada (faixa_de, faixa_para) some valor entre todos os meses; P[de][para] = valor(de,para) / soma_valor(de,*) — matriz de transição mensal ponderada por valor. 3) Roll rates críticos: r1=P['A VENCER']['01-30'], r2=P['01-30']['31-60'], r3=P['31-60']['61-90'], r4=P['61-90']['90+']; taxa de cura por faixa = P[faixa]['PAGO']. 4) Probabilidade de perda por faixa (proxy: chegar a 90+ e não curar): p_perda('61-90')=r4/(r4+P['61-90']['PAGO']) e propague para trás: p_perda(f_i)=r_{i+1}*p_perda(f_{i+1})/(r_{i+1}+cura_i) — cadeia absorvente simplificada com dois estados finais (PAGO, 90+). Alternativa exata: resolver a cadeia absorvente 4x4 por eliminação de Gauss manual (listas puras, sem numpy). 5) Perda esperada da carteira atual: pegue o snapshot mais recente (estados não-PAGO) e compute soma(valor_faixa * p_perda(faixa)) — sugestão de provisão (PDD gerencial). 6) Tendência: série mensal de r2 (01-30→31-60); alerta se o último mês > média + 1 desvio-padrão (statistics.mean/stdev). 7) Saída: matriz média, p_perda por faixa, PDD sugerida em R$, série de r2 com flag de alerta.
```

**Obs:** Aproximação assumida: o valor exposto no snapshot é o VALOR nominal do título (baixas parciais históricas não reconstruíveis — efeito marginal com baixa incidência). Com ~9 meses há no máximo 8 transições mensais — matriz estimável mas volátil; reportar sempre a contagem por célula e recalibrar mensalmente. 'A VENCER' usa dtvenc >= fim_mes. AUDITORIA: PK de PCPREST = (NUMTRANSVENDA, PREST) confirmada — a partição do LAG não mistura títulos; se DTPAG carregar hora, trocar por TRUNC(p.dtpag) <= m.fim_mes.

### ANA-INT-06 — Projeção intradia de fechamento do dia (pace de pedidos)

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** dia × hora do dia (base histórica + dia corrente)
- **Especialista:** operacao-intradia
- **Parâmetros:** `dt_ini` (DATE (início da base histórica; sugerir dt_fim - 90 dias)), `dt_fim` (DATE (dia corrente/alvo, inclusive)), `meta_dia` (NUMBER (R$, só no Python), opcional, default: NULL)
- **Viz:** area — Curva acumulada do dia corrente sobreposta à banda histórica (Q1-Q3) de acumulado típico por hora; linha pontilhada = projeção de fechamento; linha horizontal = meta_dia quando informada.

**Pergunta de negócio:** Às 11h de hoje, o dia fecha em quanto? Compara o acumulado do dia corrente com a curva histórica de participação por hora e projeta o fechamento — permite reagir DURANTE o dia (acionar RCAs, ofertas relâmpago) em vez de constatar a falta no dia seguinte.

**Técnica:** SQL entrega a base dia × hora; Python constrói a curva mediana de participação acumulada por hora (método pace/cumulative-share) e projeta o fechamento com banda interquartílica. Sem libs além de statistics/math.

```sql
SELECT TRUNC(c.data)         AS dia,
       c.hora,
       COUNT(*)              AS num_pedidos,
       SUM(NVL(c.vltotal,0)) AS valor
FROM   pcpedc c
WHERE  c.data BETWEEN :dt_ini AND :dt_fim
AND    c.codfilial = '1'
AND    c.posicao <> 'C'
GROUP  BY TRUNC(c.data), c.hora
ORDER  BY dia, c.hora
```

**Cômputo Python (pós-processamento):**

```text
Entrada: linhas dia×hora. Passos: (1) separar dia_alvo = max(dia) (dia corrente, parcial) da base histórica (demais dias; se o dia corrente tiver <2 horas de dados, avisar 'projeção instável'); (2) para cada dia histórico montar acumulado por hora h de 0..23 preenchendo horas sem pedido com 0 (acum[h] = soma de valor até h) e total_dia = acum[23]; descartar dias com total_dia == 0; (3) share[d][h] = acum[h]/total_dia; para cada h: share_med[h] = statistics.median([share[d][h] for d]), e quartis q1[h], q3[h] via statistics.quantiles(lista, n=4) (posições [0] e [2]); usar apenas dias do MESMO dia-da-semana do dia_alvo se houver >= 8 amostras, senão todos os dias úteis; (4) acum_alvo[h_atual] = acumulado do dia corrente até a última hora completa h_atual; projecao = acum_alvo / share_med[h_atual] se share_med[h_atual] >= 0.10, senão marcar 'cedo demais para projetar'; banda: otimista = acum_alvo/q1[h_atual], pessimista = acum_alvo/q3[h_atual]; (5) se meta_dia informada: prob_qualitativa = 'acima' se pessimista >= meta_dia, 'abaixo' se otimista < meta_dia, senão 'na disputa'; (6) saída: {'dia': dia_alvo, 'hora_ref': h_atual, 'acumulado': acum_alvo, 'projecao_fechamento': p, 'banda': [pess, otim], 'status_meta': s, 'curva_share_mediana': share_med} — repetir o pipeline com num_pedidos para projetar contagem.
```

**Obs:** Colunas conferidas: DATA, HORA, POSICAO, CODFILIAL, VLTOTAL em PCPEDC. NÃO aplicar :hora_ini/:hora_fim nesta análise — o método precisa da curva integral do dia (filtro de hora quebraria o denominador). Com 235 clientes o dia tem poucas dezenas de pedidos: projeção de VALOR é mais estável que a de contagem; exibir sempre com banda. AUDITORIA (nota de leitura): o dia corrente inclui pedidos ainda 'L'/não faturados e pedidos que podem vir a ser cancelados — correto para pace de demanda, mas a projeção é de entrada de pedidos, não de faturamento garantido.

### ANA-PRE-01 — Forecast de faturamento diário — próximos 30 dias (regressão linear + sazonalidade de dia-da-semana)

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** dia (série diária contínua via calendário CONNECT BY, dias sem nota = 0)
- **Especialista:** cientista_dados_previsao_demanda
- **Parâmetros:** `dt_ini` (DATE, default: primeiro dia com dados (out/2025)), `dt_fim` (DATE, default: ontem)
- **Viz:** linha — Linha do realizado emendada à linha pontilhada do forecast 30d com banda sombreada do IC 95%; KPIs de topo: total previsto 30d, IC do total e WMAPE do backtest.

**Pergunta de negócio:** Quanto vamos faturar nos próximos 30 dias, dia a dia e no total, com que margem de erro? Apoia meta mensal, planejamento de caixa e cobrança de ritmo dos 8 RCAs.

**Técnica:** Decomposição aditiva (fatores de dia-da-semana) + OLS sobre a série dessazonalizada; intervalo de predição 95%; backtest holdout 28 dias (WMAPE). Adequado a ~9 meses diários: só tendência + ciclo semanal são estimáveis.

```sql
WITH cal AS (
  SELECT TRUNC(:dt_ini) + LEVEL - 1 AS dia
  FROM dual
  CONNECT BY TRUNC(:dt_ini) + LEVEL - 1 <= TRUNC(:dt_fim)
),
fat AS (
  SELECT TRUNC(n.dtsaida) AS dia,
         SUM(n.vltotal)   AS faturamento,
         COUNT(*)         AS qtd_notas
  FROM pcnfsaid n
  WHERE n.dtcancel IS NULL
    AND n.codfilial = '1'
    AND n.dtsaida >= TRUNC(:dt_ini)
    AND n.dtsaida <  TRUNC(:dt_fim) + 1
  GROUP BY TRUNC(n.dtsaida)
)
SELECT c.dia,
       c.dia - TRUNC(c.dia, 'IW') AS dow_iso,
       NVL(f.faturamento, 0)      AS faturamento,
       NVL(f.qtd_notas, 0)        AS qtd_notas
FROM cal c
LEFT JOIN fat f ON f.dia = c.dia
ORDER BY c.dia
```

**Cômputo Python (pós-processamento):**

```text
Entrada: linhas (dia, dow_iso 0=seg..6=dom, faturamento) ordenadas. Descartar o último dia se for a data corrente (dia parcial).
1) Dias não-operacionais: para cada dow d, opera[d] = (nº dias com faturamento>0)/(nº dias desse dow); se opera[d] < 0.2 → dow não-operacional (previsão fixa 0, excluído do ajuste).
2) Série útil y_t = faturamento nos dias operacionais, t = 0..n-1.
3) Fatores aditivos de dow: media = sum(y)/n; s[d] = mean(y_t | dow=d) - media; recentrar s[d] -= mean(s).
4) Dessazonalizar: z_t = y_t - s[dow_t].
5) OLS (math puro): t_bar=(n-1)/2; z_bar=mean(z); Sxx=Σ(t-t_bar)^2; Sxy=Σ(t-t_bar)·(z_t-z_bar); b=Sxy/Sxx; a=z_bar-b·t_bar.
6) Resíduos e_t = z_t-(a+b·t); sigma = sqrt(Σe²/(n-2)).
7) Backtest: repetir passos 3–6 só com t < n-28 e prever os 28 dias finais; WMAPE = Σ|y-ŷ|/Σy. Se WMAPE > 0.40, sinalizar baixa confiança e usar fallback: média por dow das últimas 8 semanas.
8) Previsão h=1..30 dias corridos após o último dia completo: dow não-operacional → 0; senão t_f = próximo índice operacional e ŷ = max(0, a + b·t_f + s[dow]).
9) Intervalo de predição 95% por dia: ŷ ± 1.96·sigma·sqrt(1 + 1/n + (t_f - t_bar)²/Sxx).
10) Total 30d: F = Σŷ; IC_total = F ± 1.96·sigma·sqrt(m), m = nº de dias operacionais previstos (erros ~independentes).
Saída: [{data, previsto, ic_inf, ic_sup}] + {total_30d, ic_total_inf, ic_total_sup, wmape_backtest, tendencia_diaria: b}.
```

**Obs:** Colunas conferidas no fase2_dicionario.csv: PCNFSAID.DTSAIDA/VLTOTAL/DTCANCEL/CODFILIAL. dow_iso = dia - TRUNC(dia,'IW') é independente de NLS (0=segunda). Faturamento inclui todas as CONDVENDA — ver pendência P-FCT-03 sobre bonificações. Notas canceladas já excluídas (dupla proteção: DTCANCEL IS NULL e VLTOTAL zerado nas canceladas). AUDITORIA (nota): base = PCNFSAID.VLTOTAL (cabeçalho, sem dupla contagem), enquanto as ANA-SER usam PCMOV qt*punit — os níveis podem divergir (impostos/frete/bonificações); documentar a divergência entre painéis diagnóstico × forecast no front.

### ANA-PRE-02 — Forecast de pedidos (quantidade e valor) — próximos 30 dias via Holt-Winters aditivo m=7

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** dia (série diária contínua via calendário, dias sem pedido = 0)
- **Especialista:** cientista_dados_previsao_demanda
- **Parâmetros:** `dt_ini` (DATE, default: primeiro dia com dados (out/2025)), `dt_fim` (DATE, default: ontem)
- **Viz:** linha — Dois painéis empilhados (nº de pedidos/dia e R$ de pedidos/dia), histórico + forecast com banda 95%; anotação do pico semanal previsto para planejar a expedição.

**Pergunta de negócio:** Quantos pedidos entrarão por dia nas próximas semanas e com que valor? Apoia dimensionamento de separação/expedição, logística de entrega e metas semanais dos RCAs.

**Técnica:** Holt-Winters aditivo (nível, tendência, sazonalidade semanal m=7) implementado em Python puro, com grid-search de α/β/γ minimizando SSE 1-passo nos últimos 28 dias; IC 95% ~ ±1.96·σ·√h. Roda 2x: contagem de pedidos e valor.

```sql
WITH cal AS (
  SELECT TRUNC(:dt_ini) + LEVEL - 1 AS dia
  FROM dual
  CONNECT BY TRUNC(:dt_ini) + LEVEL - 1 <= TRUNC(:dt_fim)
),
ped AS (
  SELECT TRUNC(p.data)  AS dia,
         COUNT(*)       AS qt_pedidos,
         SUM(p.vltotal) AS valor_pedidos
  FROM pcpedc p
  WHERE p.posicao <> 'C'
    AND p.codfilial = '1'
    AND p.data >= TRUNC(:dt_ini)
    AND p.data <  TRUNC(:dt_fim) + 1
  GROUP BY TRUNC(p.data)
)
SELECT c.dia,
       c.dia - TRUNC(c.dia, 'IW') AS dow_iso,
       NVL(pd.qt_pedidos, 0)      AS qt_pedidos,
       NVL(pd.valor_pedidos, 0)   AS valor_pedidos
FROM cal c
LEFT JOIN ped pd ON pd.dia = c.dia
ORDER BY c.dia
```

**Cômputo Python (pós-processamento):**

```text
Rodar o algoritmo 2x (y = qt_pedidos; y = valor_pedidos). Descartar o dia corrente (parcial). m=7.
1) Inicialização com as 4 primeiras semanas completas (28 obs): ℓ0 = média das 4 semanas; b0 = (média sem.4 − média sem.1)/21; s_d = mean(y|dow=d nas 4 sem) − média geral, recentrado (Σs=0).
2) Recursões, t = 0..n-1 (s_{t−7} = índice sazonal vigente do dow):
   ŷ1_t = ℓ_{t−1} + b_{t−1} + s_{t−7}   (previsão 1-passo)
   e_t  = y_t − ŷ1_t
   ℓ_t  = α·(y_t − s_{t−7}) + (1−α)·(ℓ_{t−1} + b_{t−1})
   b_t  = β·(ℓ_t − ℓ_{t−1}) + (1−β)·b_{t−1}
   s_t  = γ·(y_t − ℓ_t) + (1−γ)·s_{t−7}
3) Grid-search: α∈{0.05,0.10,...,0.50}, β∈{0.01,0.05,0.10}, γ∈{0.05,0.10,0.20,0.30}; escolher o trio que minimiza Σe² dos últimos 28 dias (evita overfit no início da série).
4) sigma = statistics.stdev(e dos últimos 56 dias).
5) Previsão h=1..30: ŷ_{n+h} = max(0, ℓ_n + h·b_n + s*), onde s* é o último índice sazonal atualizado do dow correspondente; IC 95%: ŷ ± 1.96·sigma·sqrt(h). Para qt_pedidos, arredondar ponto e IC para inteiro ≥ 0.
6) Agregar totais por semana ISO prevista e total 30d (IC do total: aproximar por sigma·sqrt(30)).
7) Sanidade: comparar previsão média diária com média dos últimos 14 dias; divergência > 50% → sinalizar revisão manual.
Saída: [{data, qt_prev, qt_ic_inf, qt_ic_sup, valor_prev, valor_ic_inf, valor_ic_sup}] + totais semanais e 30d.
```

**Obs:** Colunas conferidas: PCPEDC.DATA/POSICAO/CODFILIAL/VLTOTAL. POSICAO<>'C' mantém F (1564) e L (2). VLTOTAL = valor digitado do pedido; se o interesse for valor efetivamente atendido, trocar por VLATEND — a diferença mede corte (pendência P-FCT-06). PCPEDC.DATA não tem hora embutida; o corte do dia parcial é feito no Python.

### ANA-PRE-03 — Previsão de demanda por produto — top N em valor, horizonte 30 dias (Holt amortecido semanal)

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** produto × semana ISO (apenas top :top_n produtos por valor vendido na janela)
- **Especialista:** cientista_dados_previsao_demanda
- **Parâmetros:** `dt_ini` (DATE, default: primeiro dia com dados), `dt_fim` (DATE, default: ontem), `top_n` (NUMBER, opcional, default: 20)
- **Viz:** linha — Small multiples: um mini-gráfico por produto com histórico semanal + 5 semanas previstas e banda IC; título do painel com descrição do produto e D30 prevista. Rotular a banda como 'aproximada' (auditoria).

**Pergunta de negócio:** Quantas unidades de cada produto A (top N em valor) vamos vender nos próximos 30 dias? Base quantitativa para o pedido de compra do mês e negociação com os 200 fornecedores.

**Técnica:** Série semanal (ISO) por produto; Holt linear com tendência amortecida (φ=0.9) em Python puro, grid-search α/β por SSE 1-passo; fallback média 8 semanas para séries curtas/intermitentes; demanda 30d = soma de 30/7 ≈ 4,29 semanas previstas + IC.

```sql
WITH vendas AS (
  SELECT m.codprod,
         TRUNC(m.dtmov, 'IW')  AS semana,
         SUM(m.qt)             AS qt_vendida,
         SUM(m.qt * m.punit)   AS valor_vendido
  FROM pcmov m
  WHERE m.dtcancel IS NULL
    AND m.codoper = 'S'
    AND m.codfilial = '1'
    AND m.dtmov >= TRUNC(:dt_ini)
    AND m.dtmov <  TRUNC(:dt_fim) + 1
  GROUP BY m.codprod, TRUNC(m.dtmov, 'IW')
),
rank_prod AS (
  SELECT codprod,
         SUM(valor_vendido) AS valor_total,
         DENSE_RANK() OVER (ORDER BY SUM(valor_vendido) DESC) AS rk
  FROM vendas
  GROUP BY codprod
)
SELECT v.codprod,
       p.descricao,
       p.embalagem,
       r.rk        AS ranking_valor,
       v.semana,
       v.qt_vendida,
       v.valor_vendido
FROM vendas v
JOIN rank_prod r ON r.codprod = v.codprod
JOIN pcprodut p  ON p.codprod = v.codprod
WHERE r.rk <= :top_n
ORDER BY r.rk, v.semana
```

**Cômputo Python (pós-processamento):**

```text
Agrupar linhas por codprod. Para cada produto:
1) Reconstruir grade semanal contínua: da menor à maior semana da JANELA GLOBAL (não do produto), passo 7 dias; semanas sem linha → qt=0. Descartar a semana ISO corrente se incompleta.
2) Triagem: se nº de semanas < 8 OU proporção de semanas com qt=0 > 0.6 → método 'media_8sem': ŷ = média das últimas 8 semanas para todo h; sigma = stdev das últimas 8; marcar metodo='fallback' (produto candidato à ANA-PRE-04/Croston).
3) Holt amortecido (φ=0.9): ℓ0=y0; b0 = média das 3 primeiras diferenças.
   Para t=1..n-1:
     ŷ1_t = ℓ_{t−1} + φ·b_{t−1};  e_t = y_t − ŷ1_t
     ℓ_t = α·y_t + (1−α)·(ℓ_{t−1} + φ·b_{t−1})
     b_t = β·(ℓ_t − ℓ_{t−1}) + (1−β)·φ·b_{t−1}
   Grid: α∈{0.1,0.2,...,0.6}, β∈{0.05,0.10,0.20}; minimizar Σe².
4) Previsão semana h: ŷ_h = max(0, ℓ_n + (Σ_{i=1..h} φ^i)·b_n); sigma = sqrt(Σe²/(n−2)).
5) Demanda 30 dias: D30 = ŷ_1+ŷ_2+ŷ_3+ŷ_4 + (2/7)·ŷ_5; IC 95%: D30 ± 1.96·sigma·sqrt(4.29); truncar em ≥0.
6) Saída por produto: {codprod, descricao, embalagem, ranking_valor, D30, ic_inf, ic_sup, tendencia_semanal=b_n, metodo} + série histórica+prevista. Ordenar por ranking_valor.
```

**Obs:** Colunas conferidas: PCMOV.DTMOV/DTCANCEL/CODOPER/CODFILIAL/CODPROD/QT/PUNIT; PCPRODUT.CODPROD/DESCRICAO/EMBALAGEM. Demanda bruta CODOPER='S'; devoluções ED não abatidas — ver pendência P-FCT-01. PUNIT é o preço em PCMOV. AUDITORIA (menores): IC de D30 usa sigma constante por horizonte — subestima a incerteza das semanas 4-5, rotular banda como aproximada; PUNIT/QT são NULLABLE — impacto desprezível.

### ANA-PRE-04 — Classificação do padrão de demanda (ADI × CV²) + Croston-SBA para itens intermitentes

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** produto × dia (só dias com venda no SQL; zeros reconstruídos no Python a partir do calendário da janela)
- **Especialista:** cientista_dados_previsao_demanda
- **Parâmetros:** `dt_ini` (DATE, default: primeiro dia com dados), `dt_fim` (DATE, default: ontem)
- **Viz:** scatter — Scatter com linhas de corte em ADI=1.32 e CV²=0.49 formando 4 quadrantes rotulados (suave/intermitente/errática/lumpy); tooltip com produto e demanda 30d; tabela complementar dos intermitentes com maior D30.

**Pergunta de negócio:** Fora do top 20, quais dos 722 produtos têm demanda intermitente/errática e qual a taxa de consumo esperada em 30 dias de cada um? Evita comprar demais item de baixo giro e faltar item esporádico porém recorrente.

**Técnica:** Classificação Syntetos-Boylan (ADI≥1.32, CV²≥0.49 → suave/intermitente/errática/lumpy) sobre série diária reconstruída; SES para suaves/erráticas e Croston com correção SBA (×(1−α/2)) para intermitentes/lumpy — tudo em Python puro (math/statistics).

```sql
SELECT m.codprod,
       p.descricao,
       TRUNC(m.dtmov) AS dia,
       SUM(m.qt)      AS qt_vendida
FROM pcmov m
JOIN pcprodut p ON p.codprod = m.codprod
WHERE m.dtcancel IS NULL
  AND m.codoper = 'S'
  AND m.codfilial = '1'
  AND m.dtmov >= TRUNC(:dt_ini)
  AND m.dtmov <  TRUNC(:dt_fim) + 1
GROUP BY m.codprod, p.descricao, TRUNC(m.dtmov)
ORDER BY m.codprod, TRUNC(m.dtmov)
```

**Cômputo Python (pós-processamento):**

```text
N = nº de dias corridos da janela (descartar a data corrente parcial). Para cada codprod:
1) Reconstruir série diária de N posições: dia sem linha → 0. nz = nº de dias com qt>0; tamanhos = [qt dos dias qt>0].
2) Se nz < 4: classe='dados_insuficientes'; D30 = qt_total·30/N (rateio); IC largo = ±1.96·max(tamanhos, default 1)·sqrt(30)/N; pular para 7.
3) ADI = N/nz (intervalo médio entre ocorrências, em dias). CV² = (stdev(tamanhos)/mean(tamanhos))²  (0 se nz<2).
4) Classe: ADI<1.32 e CV²<0.49→'suave'; ADI≥1.32 e CV²<0.49→'intermitente'; ADI<1.32 e CV²≥0.49→'erratica'; ADI≥1.32 e CV²≥0.49→'lumpy'.
5) 'suave'/'erratica' → SES na série diária: ℓ0=y0; ℓ_t=α·y_t+(1−α)·ℓ_{t−1}; α por grid {0.05,0.1,0.2,0.3} min Σ(y_t−ℓ_{t−1})²; demanda/dia d̂=ℓ_n; D30=30·d̂.
6) 'intermitente'/'lumpy' → Croston-SBA, α=0.1: iterar dias mantendo z (tamanho suavizado, init = 1º tamanho), p (intervalo suavizado, init = 1º intervalo), q (contador de dias desde a última demanda): quando qt_t>0 → z=α·qt_t+(1−α)·z; p=α·q+(1−α)·p; q=1; senão q+=1. Taxa/dia = (1−α/2)·z/p; D30 = 30·taxa.
7) IC aproximado: sigma_d = stdev(série diária COM zeros); IC = D30 ± 1.96·sigma_d·sqrt(30), truncado em ≥0.
8) Saída: {codprod, descricao, classe, ADI, CV2, nz, D30, ic_inf, ic_sup} ordenada por D30 desc + contagem de produtos por classe.
```

**Obs:** Colunas conferidas: PCMOV.CODPROD/DTMOV/DTCANCEL/CODOPER/CODFILIAL/QT; PCPRODUT.CODPROD/DESCRICAO. Volume esperado <= ~9k linhas. Complementa a ANA-PRE-03: os produtos que lá caem no fallback são exatamente os tratados aqui por Croston. AUDITORIA (menor): IC do passo 7 usa sigma da série com zeros — para itens lumpy o IC normal é otimista na cauda; aceitável, a saída principal é a classe e a taxa D30.

### ANA-REP-05 — Tendência de saldo diário e data prevista de ruptura por produto (regressão linear sobre PCHISTEST)

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** produto × dia (série de :dt_ini a :dt_fim; recomendado :dt_ini = :dt_fim − 56)
- **Especialista:** Cientista de dados sênior — estoque prescritivo (reposição, cobertura e sugestão de compra) para distribuição/atacado, base Winthor/Oracle h4c
- **Parâmetros:** `:dt_ini` (DATE, default: :dt_fim - 56), `:dt_fim` (DATE, default: TRUNC(SYSDATE)), `lead_time_padrao (python)` (NUMBER, opcional, default: 7)
- **Viz:** linha — Small multiples do saldo disponível com a reta de tendência e a data projetada de zero marcada; painel lateral em tabela com as flags PEDIR_AGORA/MONITORAR. Complementa o ANA-REP-01: aqui a ruptura é ANTECIPADA pela trajetória, não pela foto.

**Pergunta de negócio:** Quais produtos, no ritmo atual de consumo líquido, zeram ANTES do lead time do fornecedor — ou seja, para quais já é tarde se o pedido não sair hoje?

**Técnica:** SQL entrega a série diária de estoque disponível (PCHISTEST) dos produtos ativos com venda nos últimos 28d; Python ajusta regressão linear (mínimos quadrados) por produto, projeta dias-até-zero e confronta com o lead time (ANA-REP-02 ou parâmetro), gerando flags PEDIR_AGORA / MONITORAR / OK / INDEFINIDO.

```sql
SELECT h.codprod,
       p.descricao,
       h.data,
       NVL(h.qtestger, 0) - NVL(h.qtreserv, 0) - NVL(h.qtbloqueada, 0) AS qt_disponivel
  FROM pchistest h
  JOIN pcprodut p
    ON p.codprod = h.codprod
  LEFT JOIN pcprodfilial pf
    ON pf.codprod   = h.codprod
   AND pf.codfilial = '1'
 WHERE h.codfilial = '1'
   AND h.data >= :dt_ini
   AND h.data <  :dt_fim + 1
   AND p.dtexclusao IS NULL
   AND NVL(pf.ativo, 'S') = 'S'
   AND NVL(pf.foralinha, 'N') <> 'S'
   AND EXISTS (
         SELECT 1
           FROM pcmov m
          WHERE m.codprod   = h.codprod
            AND m.codoper   = 'S'
            AND m.dtcancel  IS NULL
            AND m.codfilial = '1'
            AND m.dtmov     >  :dt_fim - 28
            AND m.dtmov     <= :dt_fim
       )
 ORDER BY h.codprod, h.data
```

**Cômputo Python (pós-processamento):**

```text
Somente math/statistics.
1) Agrupar linhas por codprod mantendo ordem por data; x = índice do dia (0..n-1), y = qt_disponivel. Exigir n >= 14 pontos, senão flag 'INDEFINIDO'.
2) OLS: xm = mean(x); ym = mean(y); slope = sum((xi-xm)*(yi-ym)) / sum((xi-xm)**2); intercept = ym - slope*xm. r2 = 1 - SQR/SQT (se SQT = 0, r2 = 0).
3) saldo_atual = y[-1]. Se slope < 0: dias_ate_zero_tend = saldo_atual / (-slope); senão None.
4) Estimador alternativo conservador: consumo_liq = (y[0] - y[-1]) / (n - 1); se consumo_liq > 0, dias_ate_zero_cons = saldo_atual / consumo_liq. Horizonte final = min dos dois disponíveis.
5) Qualidade: se r2 < 0.3 e o estimador alternativo também não existir, flag 'INDEFINIDO' (série serrilhada por reposições).
6) LT do produto = lead time real do fornecedor (dict vindo do ANA-REP-02) ou lead_time_padrao. Flags: 'PEDIR_AGORA' se horizonte <= LT; 'MONITORAR' se <= LT + 14; senão 'OK'.
7) Saída ordenada por horizonte crescente com codprod, descricao, saldo_atual, slope/dia, r2, dias_ate_zero, LT, flag; separar a lista PEDIR_AGORA para o topo do dashboard.
```

**Obs:** A tendência é do saldo LÍQUIDO (consumo − reposição): item reabastecido dentro da janela gera serrilhado e r2 baixo — o passo 5 trata como INDEFINIDO em vez de prever errado. Volume estimado <= 722 produtos × 56 dias ≈ 40k linhas. AUDITORIA (SQL corrigido): INNER JOIN em PCPRODFILIAL trocado por LEFT JOIN — a tabela tem 706 linhas para 722 produtos e o INNER excluiria da série exatamente produtos com venda recente sem cadastro filial, que um radar preditivo de ruptura não pode perder; os NVL do WHERE seguem filtrando inativos/fora de linha.

### ANA-RFM-03 — Clientes ativos que romperam o próprio ciclo de recompra (recência > 2× ciclo individual)

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** cliente (apenas os em alerta: ativos, >=3 compras, fator_atraso > 2)
- **Especialista:** Cientista de dados sênior — RFM e churn de clientes (distribuição/atacado)
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** tabela — Tabela de ação ordenada por valor_total_janela desc, com barra inline comparando dias_sem_comprar ao ciclo_medio_dias e badge colorido no fator_atraso; filtro por RCA para virar a pauta de visita de cada vendedor.

**Pergunta de negócio:** Quais clientes com cadastro ativo e histórico de recompra regular estão há mais de 2× o SEU ciclo médio sem comprar — a lista de reativação da semana, antes que virem churn de fato?

**Técnica:** Ciclo médio individual de recompra = (última compra − primeira compra) / (nº de dias de compra − 1), exigindo >=3 dias distintos de compra; alerta quando dias_sem_comprar > 2 × ciclo_medio. Detector de anomalia de recência personalizado por cliente (o corte fixo do DIM-08 não captura quem compra semanalmente e sumiu há 20 dias).

```sql
WITH compras AS (
    SELECT n.codcli,
           TRUNC(n.dtsaida) AS dia
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.codfilial = '1'
       AND n.dtsaida BETWEEN :dt_ini AND :dt_fim
     GROUP BY n.codcli, TRUNC(n.dtsaida)
),
valor AS (
    SELECT n.codcli,
           SUM(n.vltotal) AS valor_total
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.codfilial = '1'
       AND n.dtsaida BETWEEN :dt_ini AND :dt_fim
     GROUP BY n.codcli
),
ciclo AS (
    SELECT c.codcli,
           COUNT(*)                                                       AS n_compras,
           MAX(c.dia)                                                     AS dt_ult_compra,
           ROUND((MAX(c.dia) - MIN(c.dia)) / NULLIF(COUNT(*) - 1, 0), 1)  AS ciclo_medio_dias
      FROM compras c
     GROUP BY c.codcli
    HAVING COUNT(*) >= 3
)
SELECT ci.codcli,
       cl.cliente,
       cl.fantasia,
       pr.praca,
       u.nome                                                             AS rca,
       ci.n_compras,
       ci.ciclo_medio_dias,
       TO_CHAR(ci.dt_ult_compra, 'YYYY-MM-DD')                            AS dt_ult_compra,
       TRUNC(:dt_fim) - ci.dt_ult_compra                                  AS dias_sem_comprar,
       ROUND((TRUNC(:dt_fim) - ci.dt_ult_compra) / ci.ciclo_medio_dias, 2) AS fator_atraso,
       ROUND(v.valor_total, 2)                                            AS valor_total_janela,
       ROUND(v.valor_total / ci.n_compras, 2)                             AS ticket_medio_por_compra
  FROM ciclo ci
  JOIN pcclient cl     ON cl.codcli    = ci.codcli
  LEFT JOIN pcpraca pr  ON pr.codpraca  = cl.codpraca
  LEFT JOIN pcusuari u  ON u.codusur    = cl.codusur1
  LEFT JOIN valor v     ON v.codcli     = ci.codcli
 WHERE cl.dtexclusao IS NULL
   AND NVL(cl.bloqueio, 'N') <> 'S'
   AND (TRUNC(:dt_fim) - ci.dt_ult_compra) > 2 * ci.ciclo_medio_dias
 ORDER BY v.valor_total DESC
```

**Obs:** Ciclo por cliente exige >=3 dias distintos de compra (2 intervalos) — clientes com 1-2 compras ficam fora (cobertos pelo segmento 'Novos / recentes' da ANA-RFM-01). 'Ativo' = PCCLIENT.DTEXCLUSAO IS NULL e BLOQUEIO <> 'S' (ver pendência de domínio de BLOQUEIO). Com ~9 meses de janela, ciclos longos (>90 dias) dificilmente disparam o gatilho de 2× — comportamento correto: o alerta prioriza compradores frequentes que sumiram.

### ANA-RFM-04 — Ranking de risco de churn: score 0-100 simples e explicável

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** cliente (1 linha por cliente ativo com >=1 venda na janela); pós-processamento devolve score, faixa e motivo dominante
- **Especialista:** Cientista de dados sênior — RFM e churn de clientes (distribuição/atacado)
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** barra_h — Barras horizontais do top 20 por score, cor pela faixa e barra segmentada mostrando a contribuição de cada componente (recência/tendência/frequência/financeiro) — a explicação visual do score; tooltip com o motivo dominante em texto.

**Pergunta de negócio:** Em ordem de prioridade, quais clientes têm maior probabilidade de abandono e POR QUÊ (sumiu do ciclo? valor caindo? comprando menos vezes? inadimplente?) — para o gestor comercial montar a agenda de retenção com justificativa por cliente?

**Técnica:** Score aditivo ponderado com 4 componentes normalizados 0-1, todos explicáveis: recência relativa ao ciclo individual (peso 40), tendência de valor 90d vs 90d anteriores (25), queda de frequência 90d vs 90d anteriores (20) e atraso financeiro em aberto (15). Sem caixa-preta: cada cliente sai com o componente dominante nomeado.

```sql
WITH vendas AS (
    SELECT n.codcli,
           TRUNC(n.dtsaida) AS dia,
           n.vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.codfilial = '1'
       AND n.dtsaida BETWEEN :dt_ini AND :dt_fim
),
base AS (
    SELECT v.codcli,
           MAX(v.dia)                                                        AS dt_ult_compra,
           COUNT(DISTINCT v.dia)                                             AS n_compras,
           SUM(v.vltotal)                                                    AS valor_total_janela,
           ROUND((MAX(v.dia) - MIN(v.dia))
                 / NULLIF(COUNT(DISTINCT v.dia) - 1, 0), 1)                  AS ciclo_medio_dias,
           SUM(CASE WHEN v.dia >  TRUNC(:dt_fim) - 90 THEN v.vltotal ELSE 0 END)  AS valor_ult90,
           SUM(CASE WHEN v.dia <= TRUNC(:dt_fim) - 90
                     AND v.dia >  TRUNC(:dt_fim) - 180 THEN v.vltotal ELSE 0 END) AS valor_ant90,
           COUNT(DISTINCT CASE WHEN v.dia > TRUNC(:dt_fim) - 90 THEN v.dia END)   AS freq_ult90,
           COUNT(DISTINCT CASE WHEN v.dia <= TRUNC(:dt_fim) - 90
                                AND v.dia > TRUNC(:dt_fim) - 180 THEN v.dia END)  AS freq_ant90
      FROM vendas v
     GROUP BY v.codcli
),
financ AS (
    SELECT t.codcli,
           SUM(CASE WHEN t.dtpag IS NULL AND t.dtvenc < TRUNC(:dt_fim)
                    THEN t.valor - NVL(t.vpago, 0) ELSE 0 END)               AS vl_vencido_aberto,
           MAX(CASE WHEN t.dtpag IS NULL AND t.dtvenc < TRUNC(:dt_fim)
                    THEN TRUNC(:dt_fim) - t.dtvenc ELSE 0 END)               AS max_dias_atraso
      FROM pcprest t
     WHERE t.dtcancel IS NULL
       AND t.codfilial = '1'
     GROUP BY t.codcli
)
SELECT b.codcli,
       c.cliente,
       c.fantasia,
       pr.praca,
       u.nome                                        AS rca,
       TRUNC(:dt_fim) - b.dt_ult_compra              AS recencia_dias,
       b.n_compras,
       b.ciclo_medio_dias,
       ROUND(b.valor_total_janela, 2)                AS valor_total_janela,
       ROUND(b.valor_total_janela / b.n_compras, 2)  AS ticket_medio_compra,
       ROUND(b.valor_ult90, 2)                       AS valor_ult90,
       ROUND(b.valor_ant90, 2)                       AS valor_ant90,
       b.freq_ult90,
       b.freq_ant90,
       ROUND(NVL(f.vl_vencido_aberto, 0), 2)         AS vl_vencido_aberto,
       NVL(f.max_dias_atraso, 0)                     AS max_dias_atraso
  FROM base b
  JOIN pcclient c      ON c.codcli    = b.codcli
  LEFT JOIN pcpraca pr  ON pr.codpraca = c.codpraca
  LEFT JOIN pcusuari u  ON u.codusur   = c.codusur1
  LEFT JOIN financ f    ON f.codcli    = b.codcli
 WHERE c.dtexclusao IS NULL
 ORDER BY b.valor_total_janela DESC
```

**Cômputo Python (pós-processamento):**

```text
Entrada: rows = lista de dicts do SQL. Somente math/statistics.
1) ciclos = [r['ciclo_medio_dias'] for r in rows if r['ciclo_medio_dias'] is not None]; ciclo_fallback = statistics.median(ciclos) if ciclos else 30.0.
2) Para cada r: ciclo = r['ciclo_medio_dias'] or ciclo_fallback.
   f_rec  = min(r['recencia_dias'] / max(2 * ciclo, 14.0), 1.0)  (1.0 quando estourou 2x o ciclo; piso de 14d evita hipersensibilidade)
   f_tend = 0.0 if r['valor_ant90'] == 0 else max(0.0, 1.0 - r['valor_ult90'] / r['valor_ant90'])
   f_freq = 0.0 if r['freq_ant90']  == 0 else max(0.0, 1.0 - r['freq_ult90'] / r['freq_ant90'])
   f_fin  = min(r['max_dias_atraso'] / 30.0, 1.0) if r['vl_vencido_aberto'] > 0 else 0.0
3) score = round(100 * (0.40*f_rec + 0.25*f_tend + 0.20*f_freq + 0.15*f_fin))
4) faixa = 'crítico' if score >= 70 else ('alerta' if score >= 40 else 'saudável').
5) motivo dominante = maior contribuição ponderada entre {0.40*f_rec: 'sumiu do ciclo de recompra', 0.25*f_tend: 'valor comprado em queda', 0.20*f_freq: 'frequência de compra em queda', 0.15*f_fin: 'títulos vencidos em aberto'}; guardar as 4 contribuições para a barra segmentada.
6) Ordenar desc por score; desempate por (valor_ult90 + valor_ant90) desc. Saída: codcli, cliente, praca, rca, score, faixa, motivo_dominante, contribuições, e os campos brutos para auditoria.
```

**Obs:** Exige janela >= 180 dias para os componentes de tendência (90d vs 90d anteriores); com janela menor, f_tend e f_freq degradam para 0 sem quebrar o score. Pesos (40/25/20/15) são ponto de partida gerencial, não ajuste estatístico — recalibrar por backtest quando houver 12+ meses. Sinal financeiro depende da validação do domínio PCPREST.CODCOB (pendência): cobranças internas podem gerar falso positivo de inadimplência.

### ANA-SER-06 — Decomposição clássica + suavização Holt-Winters aditiva (m=7) com previsão de 14 dias

- **Nível:** preditiva  |  **Status:** validado  |  **Grão:** dia (série completa com zeros preenchidos, insumo do pós-processamento)
- **Especialista:** Cientista de dados sênior — séries temporais (diagnóstico) para distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** linha — Histórico com ajuste sobreposto, previsão pontilhada com banda de erro empírica e outliers destacados com tooltip (data, real, esperado, desvio). Painel secundário: barras dos 7 índices sazonais DOW extraídos.

**Pergunta de negócio:** Qual o nível 'limpo' da venda diária, quais dias fugiram do padrão (promoção/feriado/problema) e qual a expectativa realista das próximas 2 semanas? Suporta a projeção de fechamento do mês, a régua de anomalia diária ('hoje está fora da banda?') e o planejamento de compras/caixa de curto prazo.

**Técnica:** Para ~280 pontos diários com ciclo semanal forte: (a) decomposição clássica aditiva — tendência por MM-7 CENTRADA, índices aditivos por dia da semana, resíduo para detecção de outliers; (b) suavização exponencial tripla Holt-Winters ADITIVA período 7, backtest holdout de 28 dias, previsão h=14. Aditiva porque dias com venda zero tornam razões instáveis; ~40 ciclos semanais completos bastam para índices estáveis. STL/ARIMA sazonal descartados: exigem libs além de math/statistics.

```sql
WITH cal AS (
  SELECT TRUNC(:dt_ini) + LEVEL - 1 AS dia
  FROM   dual
  CONNECT BY TRUNC(:dt_ini) + LEVEL - 1 <= TRUNC(:dt_fim)
),
fat AS (
  SELECT TRUNC(m.dtmov) AS dia, SUM(m.qt * m.punit) AS vl
  FROM   pcmov m
  WHERE  m.codoper = 'S' AND m.dtcancel IS NULL AND m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov)
)
SELECT c.dia,
       c.dia - TRUNC(c.dia, 'IW') AS dow_num,
       NVL(f.vl, 0)               AS faturamento
FROM   cal c
LEFT   JOIN fat f ON f.dia = c.dia
ORDER  BY c.dia
```

**Cômputo Python (pós-processamento):**

```text
1) Carregar as linhas do SQL ordenadas: dias[], dow[], y[] (zeros já preenchidos; n≈280). VALIDAR n antes de rodar: HW exige >= 28 dias (inicialização) e o backtest >= 56; se n < 56, degradar para a decomposição pura (auditoria). 2) Diagnóstico de zero-inflação: se >90% dos domingos têm y=0, manter modelo aditivo e reportar o fato. 3) DECOMPOSIÇÃO CLÁSSICA: trend[t] = sum(y[t-3:t+4])/7 para t em [3, n-4]; detrend[t] = y[t] - trend[t]; idx[d] = statistics.mean(detrend[t] para dow[t]==d), centralizar: idx[d] -= mean(idx); resid[t] = y[t] - trend[t] - idx[dow[t]]; sigma = statistics.pstdev(resid); outliers = [(dias[t], y[t], resid[t]) se abs(resid[t]) > 2.5*sigma] — reportar como tabela. 4) HOLT-WINTERS ADITIVO m=7: inicialização — nivel = mean(y[0:7]); tend = (mean(y[7:14]) - mean(y[0:7]))/7; s[i] = mean(y[i+7k] - mean(y[7k:7k+7]) para k in 0..3), centralizar s para soma zero. Recursões para t=0..n-1: prev = nivel + tend + s[t%7]; novo_nivel = alpha*(y[t] - s_antigo[t%7]) + (1-alpha)*(nivel + tend); tend = beta*(novo_nivel - nivel) + (1-beta)*tend; s[t%7] = gamma*(y[t] - novo_nivel) + (1-gamma)*s[t%7]; nivel = novo_nivel. 5) BACKTEST: treinar em y[0:n-28], prever os 28 finais com yhat(h) = nivel + h*tend + s[(t_fim+h) % 7]; grid search alpha em {0.05..0.5 passo 0.05}, beta em {0.01, 0.05, 0.1}, gamma em {0.05..0.3 passo 0.05}; escolher trio de menor MAE; reportar MAE e MAPE calculado só nos dias com y>0. 6) Reestimar com os parâmetros vencedores na série completa e prever h=1..14: forecast[h] = max(0, nivel + h*tend + s[(n-1+h) % 7]). 7) Saída: série (dia, real, ajuste), previsão (dia_futuro, yhat, banda ±1.5*MAE), idx[0..6] (índices DOW em R$ — ao exibir, mapear via dow_num do SQL, pois os índices do HW ficam ancorados em t%7 relativo a :dt_ini), lista de outliers, e (alpha, beta, gamma, MAE, MAPE). Tudo em Python puro (math/statistics).
```

**Obs:** O SQL entrega apenas a série-base; todo o modelo roda no computo_python. Beta pequeno no grid porque 9 meses não sustentam tendência agressiva (considerar amortecimento phi=0.98, opcional). Se a pendência P-SER-03 mostrar fim de semana ~sempre zero, alternativa: fixar previsão 0 para domingos. Reavaliar mensalmente conforme a série cresce. Complementar (não redundante) à ANA-PRE-01: esta foca decomposição/anomalia com base PCMOV; a PRE-01 é o forecast operacional 30d com base PCNFSAID — documentar a divergência de níveis entre as duas bases.

## Nível: Prescritiva

### ANA-CRZ-06 — Departamentos lapsados por cliente (comprava e parou) — pauta de recuperação

- **Nível:** prescritiva  |  **Status:** validado  |  **Grão:** cliente × departamento lapsado
- **Especialista:** cruzamentos-decisao (análise diagnóstica) — distribuição/atacado
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** tabela — Tabela acionável agrupada por RCA: cliente, departamento lapsado, R$ histórico, meses com compra, dias sem comprar e perda mensal estimada (do pós-processamento); ordenada por prioridade.

**Pergunta de negócio:** Qual cliente comprava recorrentemente um departamento e não compra há 90+ dias? Decisão: gerar a lista de recuperação por RCA (quem visitar, o que reofertar e quanto de receita mensal está em risco), antes que o cliente migre a categoria para o concorrente.

**Técnica:** Comparação de janelas temporais dentro do período: faturou no departamento antes de (dt_fim - 90) em >= 2 meses distintos e faturou zero nos últimos 90 dias; priorização por perda mensal estimada em Python.

```sql
WITH itens AS (
  SELECT p.codcli, pr.codepto, c.data, p.qt * p.pvenda AS vlitem
    FROM pcpedi p
    JOIN pcpedc c   ON c.numped  = p.numped
    JOIN pcprodut pr ON pr.codprod = p.codprod
   WHERE c.data BETWEEN :dt_ini AND :dt_fim
     AND c.posicao <> 'C'
     AND c.dtcancel IS NULL
     AND c.codfilial = '1'
     AND p.posicao <> 'C'
),
resumo AS (
  SELECT codcli, codepto,
         SUM(CASE WHEN data <  :dt_fim - 90 THEN vlitem ELSE 0 END) AS fat_anterior,
         SUM(CASE WHEN data >= :dt_fim - 90 THEN vlitem ELSE 0 END) AS fat_ult90,
         MAX(data) AS ultima_compra_dep,
         COUNT(DISTINCT TRUNC(data, 'MM')) AS meses_com_compra
    FROM itens
   GROUP BY codcli, codepto
)
SELECT r.codcli,
       cli.cliente,
       NVL(u.nome, '(sem RCA)') AS rca,
       d.descricao AS departamento,
       r.fat_anterior,
       r.meses_com_compra,
       r.ultima_compra_dep,
       ROUND(:dt_fim - r.ultima_compra_dep) AS dias_sem_comprar
  FROM resumo r
  JOIN pcclient cli ON cli.codcli = r.codcli
  LEFT JOIN pcusuari u ON u.codusur = cli.codusur1
  JOIN pcdepto d ON d.codepto = r.codepto
 WHERE r.fat_ult90 = 0
   AND r.fat_anterior > 0
   AND r.meses_com_compra >= 2
 ORDER BY r.fat_anterior DESC
```

**Cômputo Python (pós-processamento):**

```text
1) meses_janela_anterior = máx(1, meses entre dt_ini e dt_fim-90). 2) perda_mensal = fat_anterior / max(1, min(meses_com_compra, meses_janela_anterior)). 3) prioridade = perda_mensal * (1 + dias_sem_comprar/90) — pondera valor e urgência. 4) Ordenar por prioridade desc, agrupar por RCA e emitir top 10 por RCA = pauta de recuperação da semana. 5) KPI de rodapé: soma de perda_mensal = receita mensal em risco.
```

**Obs:** Janela de recência fixada em 90 dias no SQL (hardcoded de propósito — a convenção de binds só cobre dt/hora); exige período total > ~6 meses (base tem ~9, ok). Como fat_ult90=0 filtra o resultado, meses_com_compra refere-se só à janela anterior. AUDITORIA (caveat): clientes que lapsaram o departamento antes de :dt_ini não aparecem — exigir período total >= 6 meses na UI; janelas sem sobreposição nem lacuna verificadas.

### ANA-DEV-06 — Score prescritivo por cliente: quem devolve + cancela + quanto custa (lista de ação)

- **Nível:** prescritiva  |  **Status:** a_validar  |  **Grão:** cliente (com RCA principal)
- **Especialista:** devolucoes_cancelamentos
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE)
- **Viz:** scatter — Scatter de quadrantes: X = taxa de devolução, Y = taxa de cancelamento de linhas, bolha = valor em risco, cor = RCA. Quadrante superior-direito = clientes de ação imediata. Acompanha tabela top 20 por score (computo_python) com a ação recomendada por linha.

**Pergunta de negócio:** Dos 235 clientes, quais 10-20 merecem ação imediata (visita do RCA, revisão de condição comercial, trava de bonificação) por combinarem devolução alta, cancelamento alto e valor em risco relevante? Transforma o diagnóstico em rota de trabalho semanal para a equipe comercial.

**Técnica:** Score composto min-max (0-1) com pesos de negócio sobre taxa de devolução, taxa de cancelamento de linhas e valor perdido; bucketização em faixas de ação

```sql
WITH s AS (
  SELECT m.codcli,
         SUM(CASE WHEN m.dtcancel IS NULL     THEN m.qt * m.punit ELSE 0 END) AS vl_vendido,
         SUM(CASE WHEN m.dtcancel IS NOT NULL THEN m.qt * m.punit ELSE 0 END) AS vl_cancelado,
         COUNT(CASE WHEN m.dtcancel IS NOT NULL THEN 1 END) AS linhas_canceladas,
         COUNT(*) AS linhas_total
  FROM   pcmov m
  WHERE  m.codoper = 'S'
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY m.codcli
),
d AS (
  SELECT m.codcli,
         SUM(m.qt * m.punit) AS vl_devolvido,
         COUNT(DISTINCT m.numnota) AS notas_devolucao
  FROM   pcmov m
  WHERE  m.codoper = 'ED'
  AND    m.dtcancel IS NULL
  AND    m.codfilial = '1'
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY m.codcli
),
rca AS (
  SELECT codcli, codusur
  FROM (
    SELECT m.codcli, m.codusur,
           ROW_NUMBER() OVER (PARTITION BY m.codcli
                              ORDER BY SUM(m.qt * m.punit) DESC, m.codusur) AS rk
    FROM   pcmov m
    WHERE  m.codoper = 'S'
    AND    m.codfilial = '1'
    AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
    GROUP  BY m.codcli, m.codusur
  )
  WHERE rk = 1
)
SELECT s.codcli,
       c.cliente,
       r.codusur,
       u.nome AS rca_principal,
       ROUND(s.vl_vendido, 2)            AS vl_vendido,
       ROUND(NVL(d.vl_devolvido, 0), 2)  AS vl_devolvido,
       NVL(d.notas_devolucao, 0)         AS notas_devolucao,
       ROUND(s.vl_cancelado, 2)          AS vl_cancelado,
       ROUND(100 * NVL(d.vl_devolvido, 0) / NULLIF(s.vl_vendido, 0), 2) AS taxa_dev_pct,
       ROUND(100 * s.linhas_canceladas / NULLIF(s.linhas_total, 0), 2)  AS taxa_cancel_linhas_pct,
       ROUND(NVL(d.vl_devolvido, 0) + s.vl_cancelado, 2) AS vl_em_risco
FROM   s
LEFT   JOIN d   ON d.codcli = s.codcli
LEFT   JOIN rca r ON r.codcli = s.codcli
LEFT   JOIN pcclient c ON c.codcli = s.codcli
LEFT   JOIN pcusuari u ON u.codusur = r.codusur
WHERE  (s.vl_vendido > 0 OR s.vl_cancelado > 0)
ORDER  BY vl_em_risco DESC
```

**Cômputo Python (pós-processamento):**

```text
Entrada: linhas do SQL. Passos (puro Python): 1) tratar None como 0 (com a correção da auditoria, taxa_dev_pct pode chegar NULL quando vl_vendido=0); 2) min-max normalizar 3 métricas na população: n_dev = norm(taxa_dev_pct), n_canc = norm(taxa_cancel_linhas_pct), n_valor = norm(vl_em_risco), onde norm(v)=(v-min)/(max-min) com guarda max==min -> 0; 3) score = 0.45*n_dev + 0.30*n_canc + 0.25*n_valor; 4) bucket de ação: score >= 0.60 -> 'ACAO IMEDIATA: visita do RCA + investigar causa (entrega, validade, digitação)'; 0.30 <= score < 0.60 -> 'MONITORAR: contato comercial no próximo ciclo'; < 0.30 -> 'OK'; regra extra: se taxa_dev_pct > 2*mediana(taxa_dev_pct) (statistics.median) forçar no mínimo MONITORAR; 5) ordenar desc por score e emitir top 20 com codcli, cliente, rca_principal, métricas, score e acao; 6) agregação prescritiva por RCA: soma de vl_em_risco e contagem de clientes em ACAO IMEDIATA por rca_principal.
```

**Obs:** Colunas 100% conferidas. a_validar pela semântica ED (ANA-DEV-01). Pesos 0.45/0.30/0.25 são proposta inicial — expor como configuráveis. CLIENTE é PII leve: restringir a usuários comerciais. AUDITORIA (SQL corrigido): (a) WHERE passou a incluir o cliente com 100% das linhas canceladas — (vl_vendido > 0 OR vl_cancelado > 0) — exatamente o perfil extremo que a lista precisa mostrar; (b) CTE rca deixou de exigir dtcancel IS NULL e ranqueia o RCA principal pelo valor total das linhas S (canceladas ou não), com desempate determinístico por codusur. Limitação aceita: cliente com devolução ED mas sem nenhuma linha S no período fica fora (edge raro, sem denominador).

### ANA-FCR-09 — Lista priorizada de cobrança — valor × atraso × risco, com ação sugerida

- **Nível:** prescritiva  |  **Status:** validado  |  **Grão:** título vencido em aberto (detalhe) consolidado por cliente no pós-processamento
- **Especialista:** credito-inadimplencia-contas-a-receber
- **Parâmetros:** `dt_ini` (DATE, opcional, default: NULL = toda a história (janela do perfil de risco)), `dt_fim` (DATE, opcional, default: NULL = até hoje)
- **Viz:** tabela — Tabela operacional ordenada por prioridade (calculada no Python), com colunas: prioridade, cliente, saldo consolidado, título mais antigo (dias), ação sugerida, RCA, telefone, e-mail de cobrança, flag prorrogado/bloqueado. Cores por faixa de ação. Exportável — é a pauta diária de cobrança.

**Pergunta de negócio:** Quem cobrar HOJE, em que ordem, por qual canal e com que dureza — para uma operação com 8 RCAs e sem equipe dedicada de cobrança, transformar os títulos vencidos em uma fila de trabalho diária com telefone/e-mail na mão.

**Técnica:** Ranking multiplicativo-aditivo (saldo normalizado × urgência logarítmica do atraso × risco histórico do cliente) + matriz de ação por faixa de atraso (lembrete → ligação RCA → bloqueio → negativação → protesto).

```sql
WITH hist AS (
  SELECT p.codcli,
         COUNT(*)                                                              AS qtd_pagos,
         ROUND(SUM((p.dtpag - p.dtvenc) * NVL(p.vpago, p.valor))
               / NULLIF(SUM(NVL(p.vpago, p.valor)), 0), 1)                     AS atraso_medio_pond,
         ROUND(100 * SUM(CASE WHEN p.dtpag - p.dtvenc > 30 THEN 1 ELSE 0 END)
               / COUNT(*), 1)                                                  AS perc_tit_atraso30
  FROM   pcprest p
  WHERE  p.dtpag IS NOT NULL
  AND    p.dtcancel IS NULL
  AND    p.codfilial = '1'
  AND    (:dt_ini IS NULL OR p.dtpag >= :dt_ini)
  AND    (:dt_fim IS NULL OR p.dtpag <= :dt_fim)
  GROUP  BY p.codcli
)
SELECT p.numtransvenda,
       p.prest,
       p.duplic,
       p.codcli,
       c.cliente,
       c.fantasia,
       u.nome                                   AS rca_titulo,
       cb.cobranca                              AS forma_cobranca,
       p.dtemissao,
       p.dtvenc,
       TRUNC(SYSDATE) - p.dtvenc                AS dias_vencido,
       p.valor,
       p.valor - NVL(p.vpago, 0)                AS saldo,
       CASE WHEN p.dtvenc > p.dtvencorig THEN 'S' ELSE 'N' END AS ja_prorrogado,
       c.telent,
       c.emailcob,
       c.bloqueio,
       c.limcred,
       h.atraso_medio_pond,
       NVL(h.perc_tit_atraso30, 0)              AS perc_tit_atraso30,
       NVL(h.qtd_pagos, 0)                      AS qtd_pagos_historico
FROM   pcprest p
       JOIN pcclient c        ON c.codcli  = p.codcli
       LEFT JOIN pcusuari u   ON u.codusur = p.codusur
       LEFT JOIN pccob cb     ON cb.codcob = p.codcob
       LEFT JOIN hist h       ON h.codcli  = p.codcli
WHERE  p.dtpag IS NULL
AND    p.dtcancel IS NULL
AND    p.codfilial = '1'
AND    p.dtvenc < TRUNC(SYSDATE)
ORDER  BY (p.valor - NVL(p.vpago, 0)) * (TRUNC(SYSDATE) - p.dtvenc) DESC
```

**Cômputo Python (pós-processamento):**

```text
1) Por título: risco = 0.5*min(1, max(0, atraso_medio_pond or 0)/60) + 0.5*(perc_tit_atraso30/100); se qtd_pagos_historico == 0, risco = 0.6 (sem histórico = risco acima do neutro). 2) urgencia = min(1, math.log(1+dias_vencido)/math.log(1+120)). 3) valor_norm = saldo / max(saldo de todos os títulos vencidos). 4) prioridade_titulo = 100 * (0.45*valor_norm + 0.35*urgencia + 0.20*risco); bônus +5 se ja_prorrogado=='S' (promessa já quebrada). 5) Consolidar por cliente: saldo_total = soma dos saldos; dias_max = max(dias_vencido); prioridade_cliente = max(prioridade_titulo) + 3*math.log(1+qtd_titulos_vencidos). 6) Ação sugerida pela faixa de dias_max: 1-7 lembrete automático (e-mail EMAILCOB); 8-15 ligação do RCA; 16-30 cobrança formal + bloquear novas vendas a prazo (conferir flag BLOQUEIO atual); 31-60 negativação/cartório; >60 protesto ou acordo formal de parcelamento. 7) Saída: lista de clientes ordenada por prioridade_cliente desc, cada um com seus títulos detalhados, contato e ação; segunda visão agrupada por RCA (fila de trabalho individual). Apenas math.
```

**Obs:** RCA do título (PCPREST.CODUSUR) pode divergir do RCA atual do cliente (PCCLIENT.CODUSUR1) — a fila usa o do título por ser quem vendeu. A matriz de ação (7/15/30/60d) é política de negócio sugerida — validar com o financeiro antes de automatizar qualquer bloqueio. AUDITORIA: PCCOB populada (54 formas de cobrança); joins 1:1 sem multiplicação.

### ANA-INT-04 — Ciclo pedido→faturamento em horas + horário de corte recomendado

- **Nível:** prescritiva  |  **Status:** a_validar  |  **Grão:** hora de entrada do pedido (0-23)
- **Especialista:** operacao-intradia
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE), `hora_ini` (NUMBER (0-23), opcional, default: NULL), `hora_fim` (NUMBER (0-23), opcional, default: NULL), `sla_pct_mesmo_dia` (NUMBER (%, só no Python), opcional, default: 80), `sla_p90_horas` (NUMBER (h, só no Python), opcional, default: 8)
- **Viz:** barra — Barras de pct_mesmo_dia por hora de entrada com linha de ciclo_p90_h no eixo secundário e marcador vertical na hora_corte_recomendada devolvida pelo Python; tooltip com ciclo_mediano_h e n.

**Pergunta de negócio:** Pedido que entra às X horas fatura no mesmo dia? Define o horário de corte a comunicar aos 8 RCAs ('pedido até as Xh fatura hoje') com base em evidência, e mede o SLA interno de faturamento por hora de entrada.

**Técnica:** Timestamps reconstruídos em PCPEDC (TRUNC(data)+hora/24+minuto/1440 vs TRUNC(dtfat)+horafat/24+minutofat/1440); mediana/P90 do ciclo e % mesmo-dia por hora de entrada; recomendação de corte em Python por regra de SLA.

```sql
WITH ciclo AS (
  SELECT c.numped,
         c.hora AS hora_pedido,
         CASE WHEN TRUNC(c.dtfat) = TRUNC(c.data) THEN 1 ELSE 0 END AS mesmo_dia,
         ( (TRUNC(c.dtfat) + NVL(c.horafat,0)/24 + NVL(c.minutofat,0)/1440)
         - (TRUNC(c.data)  + NVL(c.hora,0)/24    + NVL(c.minuto,0)/1440) ) * 24 AS ciclo_horas
  FROM   pcpedc c
  WHERE  c.data BETWEEN :dt_ini AND :dt_fim
  AND    c.codfilial = '1'
  AND    c.posicao = 'F'
  AND    c.dtfat IS NOT NULL
  AND    c.horafat IS NOT NULL
  AND    (:hora_ini IS NULL OR c.hora >= :hora_ini)
  AND    (:hora_fim IS NULL OR c.hora <= :hora_fim)
)
SELECT hora_pedido,
       COUNT(*)                                                   AS pedidos_faturados,
       SUM(mesmo_dia)                                             AS faturados_mesmo_dia,
       ROUND(100 * SUM(mesmo_dia) / NULLIF(COUNT(*),0), 1)        AS pct_mesmo_dia,
       ROUND(MEDIAN(CASE WHEN ciclo_horas >= 0 THEN ciclo_horas END), 2) AS ciclo_mediano_h,
       ROUND(AVG(CASE WHEN ciclo_horas >= 0 THEN ciclo_horas END), 2)    AS ciclo_medio_h,
       ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP
             (ORDER BY CASE WHEN ciclo_horas >= 0 THEN ciclo_horas END), 2) AS ciclo_p90_h,
       SUM(CASE WHEN ciclo_horas < 0 THEN 1 ELSE 0 END)           AS registros_inconsistentes
FROM   ciclo
GROUP  BY hora_pedido
ORDER  BY hora_pedido
```

**Cômputo Python (pós-processamento):**

```text
Entrada: linhas do SQL ordenadas por hora_pedido. Passos (stdlib apenas): (1) filtrar horas com pedidos_faturados >= 10 (amostra mínima) e pct de registros_inconsistentes/pedidos_faturados <= 20%, senão descartar a hora; (2) hora_corte = max(hora_pedido) tal que pct_mesmo_dia >= sla_pct_mesmo_dia (default 80) e ciclo_p90_h <= sla_p90_horas (default 8); (3) se nenhuma hora atende, relaxar para pct_mesmo_dia >= 60 e marcar flag 'sla_degradado'=True; se ainda vazio, devolver hora_corte=None e mensagem 'faturamento mesmo-dia não é prática corrente'; (4) volume_apos_corte = sum(pedidos_faturados para hora_pedido > hora_corte) e pct_apos_corte = volume_apos_corte/total — é a demanda que hoje 'vira para amanhã'; (5) saída: {'hora_corte_recomendada': h, 'criterio': f'pct_mesmo_dia>={p}% e P90<={q}h', 'sla_degradado': bool, 'pedidos_apos_corte': n, 'pct_apos_corte': x, 'serie': linhas originais}.
```

**Obs:** TODAS as colunas conferidas no fase2_dicionario.csv: PCPEDC.DTFAT (DATE), HORAFAT (NUMBER), MINUTOFAT (NUMBER), HORA, MINUTO, DATA, POSICAO, NUMPED, CODFILIAL — ciclo em HORAS viável direto em PCPEDC. AUDITORIA (rebaixada de validado para a_validar): a POPULAÇÃO real de DTFAT/HORAFAT/MINUTOFAT não foi confirmada em base (pendência P-INT-01) — a análise inteira, inclusive a hora de corte, depende dessas colunas; o SQL degrada graciosamente (IS NOT NULL) mas pode voltar vazio ou enviesado. Checagem: SELECT COUNT(*) tot, COUNT(dtfat) c_dtfat, COUNT(horafat) c_horafat, COUNT(minutofat) c_minfat FROM pcpedc WHERE posicao='F' AND codfilial='1'. Se HORAFAT for majoritariamente nula, cair para ciclo em DIAS via PCNFSAID (fallback da pendência). Ciclos negativos são contados em registros_inconsistentes e excluídos das estatísticas.

### ANA-MRG-05 — Simulação de teto de desconto por RCA — margem recuperável

- **Nível:** prescritiva  |  **Status:** a_validar  |  **Grão:** RCA × faixa de desconto (0 / 0-5 / 5-10 / 10-15 / 15-20 / 20+), período completo
- **Especialista:** Margem e Rentabilidade (análise diagnóstica) — distribuição/atacado Winthor
- **Parâmetros:** `dt_ini` (DATE), `dt_fim` (DATE), `teto_desconto_pct` (NUMBER (só no Python), opcional, default: 10)
- **Viz:** barra_h — Ranking horizontal de RCAs pela margem recuperável com o teto — quantifica o prêmio da política de alçada e mostra em qual faixa de desconto de cada RCA está o dinheiro. Complementar: barras empilhadas da venda por faixa_desconto por RCA (dados brutos do SQL).

**Pergunta de negócio:** Se a empresa impuser um teto de desconto (alçada) na rotina de pedidos, quanto de margem em R$ cada RCA devolveria ao resultado? Define O VALOR do prêmio em disputa antes de bater o martelo na política de alçada.

**Técnica:** Distribuição da venda, custo e margem por faixa de PERCDESC; em Python, simulação de teto: para faixas acima do cap, a venda volta ao preço equivalente ao cap (volume constante — cenário de recuperação máxima, sem elasticidade).

```sql
SELECT m.codusur                                                                   AS codusur,
       NVL(u.nome, 'SEM RCA')                                                      AS rca,
       CASE
         WHEN NVL(m.percdesc, 0) <= 0  THEN 'A_SEM_DESCONTO'
         WHEN m.percdesc <= 5          THEN 'B_ATE_5'
         WHEN m.percdesc <= 10         THEN 'C_5_A_10'
         WHEN m.percdesc <= 15         THEN 'D_10_A_15'
         WHEN m.percdesc <= 20         THEN 'E_15_A_20'
         ELSE 'F_ACIMA_20'
       END                                                                         AS faixa_desconto,
       COUNT(*)                                                                    AS linhas,
       ROUND(AVG(NVL(m.percdesc, 0)), 2)                                           AS percdesc_medio,
       SUM(m.qt * m.ptabela)                                                       AS venda_tabela,
       SUM(m.qt * m.punit)                                                         AS venda_praticada,
       SUM(m.qt * NVL(m.custoreal, m.custofin))                                    AS custo,
       SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custoreal, m.custofin))              AS margem_valor,
       ROUND(100 * (SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custoreal, m.custofin)))
             / NULLIF(SUM(m.qt * m.punit), 0), 2)                                  AS margem_pct
  FROM pcmov m
  LEFT JOIN pcusuari u ON u.codusur = m.codusur
 WHERE m.codoper   = 'S'
   AND m.dtcancel  IS NULL
   AND m.codfilial = '1'
   AND m.dtmov BETWEEN :dt_ini AND :dt_fim
 GROUP BY m.codusur, NVL(u.nome, 'SEM RCA'),
          CASE
            WHEN NVL(m.percdesc, 0) <= 0  THEN 'A_SEM_DESCONTO'
            WHEN m.percdesc <= 5          THEN 'B_ATE_5'
            WHEN m.percdesc <= 10         THEN 'C_5_A_10'
            WHEN m.percdesc <= 15         THEN 'D_10_A_15'
            WHEN m.percdesc <= 20         THEN 'E_15_A_20'
            ELSE 'F_ACIMA_20'
          END
 ORDER BY codusur, faixa_desconto
```

**Cômputo Python (pós-processamento):**

```text
1) cap = parametro teto_desconto_pct (default 10.0). Alternativa data-driven: cap = mediana ponderada por venda_praticada do percdesc_medio das faixas. 2) Para cada linha (rca, faixa) com percdesc_medio > cap: recuperacao = venda_tabela * (percdesc_medio - cap) / 100 (venda volta ao preço do teto; volume constante). 3) Agregar por RCA: margem_recuperada = soma(recuperacao); venda_atual = soma(venda_praticada); margem_atual = soma(margem_valor). 4) nova_margem_pct = 100 * (margem_atual + margem_recuperada) / (venda_atual + margem_recuperada); delta_pp = nova_margem_pct - 100 * margem_atual / venda_atual. 5) Ordenar RCAs por margem_recuperada desc; total da empresa = soma das recuperações. 6) Reportar caveat fixo: cenário sem elasticidade — é o TETO da recuperação. Apenas math/statistics.
```

**Obs:** Todas as colunas conferidas. A_VALIDAR por: (a) P-03 — visão de custo para margem_valor/nova margem; (b) grau de preenchimento de PERCDESC (se o desconto for dado só via PUNIT sem registrar PERCDESC, as faixas subestimam). Faixas com prefixo A_..F_ para ordenação lexicográfica estável. AUDITORIA (caveat metodológico): percdesc_medio por faixa é média simples das linhas (não ponderada por venda_tabela) — erro limitado à largura da faixa (<=5 p.p.), aceitável para dimensionar o prêmio; teto_desconto_pct é parâmetro do Python, não bind (correto pela convenção).

### ANA-REP-01 — Cobertura em dias com classificação prescritiva (ruptura / ruptura-iminente / saudável / excesso / sem giro)

- **Nível:** prescritiva  |  **Status:** validado  |  **Grão:** produto (filial 1 — snapshot PCEST + janela móvel de 28 dias até :dt_fim)
- **Especialista:** Cientista de dados sênior — estoque prescritivo (reposição, cobertura e sugestão de compra) para distribuição/atacado, base Winthor/Oracle h4c
- **Parâmetros:** `:dt_fim` (DATE, default: TRUNC(SYSDATE))
- **Viz:** scatter — Dispersão cobertura × giro colorida por classe: o quadrante 'giro alto + cobertura baixa' é a fila de compra urgente. Complementar com KPIs de contagem por classe e tabela detalhada ordenada por criticidade. Linhas verticais em 7 e 60 dias (cortes fixados).

**Pergunta de negócio:** Quais produtos preciso repor HOJE, quais estão saudáveis e quais estão sobrando — considerando o que já está reservado, bloqueado e o que já tem pedido de compra aberto?

**Técnica:** Cobertura = estoque disponível (QTESTGER − QTRESERV − QTBLOQUEADA) ÷ venda média diária 28d (PCMOV 'S' não cancelado). Dupla cobertura: sem e com QTPEDIDA (pedido aberto), para não comprar o que já foi pedido. Classificação por faixas fixadas em 7 dias (ruptura iminente) e 60 dias (excesso).

```sql
WITH venda28 AS (
    SELECT m.codprod,
           SUM(m.qt) AS qt_venda_28d
      FROM pcmov m
     WHERE m.codoper   = 'S'
       AND m.dtcancel  IS NULL
       AND m.codfilial = '1'
       AND m.dtmov     >  :dt_fim - 28
       AND m.dtmov     <= :dt_fim
     GROUP BY m.codprod
)
SELECT p.codprod,
       p.descricao,
       p.codfornec,
       f.fornecedor,
       NVL(e.qtestger, 0)                                              AS qt_estoque_gerencial,
       NVL(e.qtestger, 0) - NVL(e.qtreserv, 0) - NVL(e.qtbloqueada, 0) AS qt_disponivel,
       NVL(e.qtpedida, 0)                                              AS qt_pedido_compra_aberto,
       NVL(v.qt_venda_28d, 0)                                          AS qt_venda_28d,
       ROUND(NVL(v.qt_venda_28d, 0) / 28, 3)                           AS venda_media_diaria_28d,
       ROUND((NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0)) * 28
             / NULLIF(v.qt_venda_28d, 0), 1)                           AS cobertura_dias,
       ROUND((NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0) + NVL(e.qtpedida,0)) * 28
             / NULLIF(v.qt_venda_28d, 0), 1)                           AS cobertura_dias_com_pedido,
       CASE
         WHEN NVL(v.qt_venda_28d, 0) = 0
              THEN 'SEM_GIRO_28D'
         WHEN NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0) <= 0
              THEN 'RUPTURA'
         WHEN (NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0)) * 28
              / NULLIF(v.qt_venda_28d, 0) < 7  /* dias_ruptura: default 7 fixado (convencao de binds) */
              THEN 'RUPTURA_IMINENTE'
         WHEN (NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0)) * 28
              / NULLIF(v.qt_venda_28d, 0) > 60 /* dias_excesso: default 60 fixado (convencao de binds) */
              THEN 'EXCESSO'
         ELSE 'SAUDAVEL'
       END                                                             AS classe_cobertura
  FROM pcprodut p
  JOIN pcest e
    ON e.codprod   = p.codprod
   AND e.codfilial = '1'
  LEFT JOIN pcprodfilial pf
    ON pf.codprod   = p.codprod
   AND pf.codfilial = '1'
  LEFT JOIN venda28 v
    ON v.codprod = p.codprod
  LEFT JOIN pcfornec f
    ON f.codfornec = p.codfornec
 WHERE p.dtexclusao IS NULL
   AND NVL(pf.ativo, 'S') = 'S'
   AND NVL(pf.foralinha, 'N') <> 'S'
   AND (NVL(e.qtestger, 0) <> 0 OR NVL(v.qt_venda_28d, 0) > 0)
 ORDER BY CASE
            WHEN NVL(v.qt_venda_28d,0) > 0
                 AND NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0) <= 0 THEN 1
            WHEN NVL(v.qt_venda_28d,0) > 0
                 AND (NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0)) * 28
                     / NULLIF(v.qt_venda_28d, 0) < 7 THEN 2
            ELSE 3
          END,
          NVL(v.qt_venda_28d, 0) DESC
```

**Obs:** Vai além do EST-03: usa disponível (desconta reserva/bloqueio), cobre o pedido aberto (QTPEDIDA) e classifica para ação. Se a hipótese ED=devolução for confirmada, subtrair ED da demanda. AUDITORIA (SQL corrigido, 3 itens): (1) binds :dias_ruptura/:dias_excesso violavam a convenção (ORA-01008 em backend que só vincula os binds padrão) — internalizados como literais 7/60; (2) INNER JOIN em PCPRODFILIAL descartava silenciosamente ~16 SKUs sem cadastro filial (706 linhas vs 722 produtos) — trocado por LEFT JOIN, os NVL do WHERE preservam o filtro; (3) divisões reescritas como *28/NULLIF(qt_venda_28d,0) — a forma original no ORDER BY podia dar ORA-01476 com SUM(qt)=0.

### ANA-REP-03 — Ponto de reposição e sugestão de compra em unidades por produto A/B (política ROP + estoque de segurança)

- **Nível:** prescritiva  |  **Status:** validado  |  **Grão:** produto ativo com venda nos últimos 84 dias (filial 1)
- **Especialista:** Cientista de dados sênior — estoque prescritivo (reposição, cobertura e sugestão de compra) para distribuição/atacado, base Winthor/Oracle h4c
- **Parâmetros:** `:dt_fim` (DATE, default: TRUNC(SYSDATE)), `lead_time_padrao (python)` (NUMBER, opcional, default: 7), `ciclo_revisao_dias (python)` (NUMBER, opcional, default: 14), `nivel_servico A/B/C (python)` (NUMBER, opcional, default: 0.98 / 0.95 / 0.90)
- **Viz:** tabela — Lista de compra acionável agrupada por fornecedor (um pedido por fornecedor), com destaque nas linhas PE <= ROP; KPI de topo: nº de itens a pedir e unidades totais por fornecedor. É o entregável que o comprador leva para a rotina de pedido.

**Pergunta de negócio:** O que colocar no próximo pedido de compra, em quantas unidades, para os produtos que pagam as contas (classes A e B) — sem estourar nem faltar?

**Técnica:** SQL traz, por produto: demanda 84d/28d com soma de quadrados por dia (desvio-padrão diário EXATO incluindo dias de venda zero, sem trazer a série), posição de estoque (disponível + pedido aberto), lead time real por fornecedor (média e desvio de PCPEDIDO) com fallback em PCFORNEC.PRAZOENTREGA, e embalagem/múltiplo para arredondamento. Python aplica ABC 80/95 por faturamento, ROP = d·LT + z·√(LT·σd² + d²·σLT²) e sugestão arredondada à embalagem master.

```sql
WITH venda_dia AS (
    SELECT m.codprod,
           TRUNC(m.dtmov)      AS dia,
           SUM(m.qt)           AS qt_dia,
           SUM(m.qt * m.punit) AS vl_dia
      FROM pcmov m
     WHERE m.codoper   = 'S'
       AND m.dtcancel  IS NULL
       AND m.codfilial = '1'
       AND m.dtmov     >  :dt_fim - 84
       AND m.dtmov     <= :dt_fim
     GROUP BY m.codprod, TRUNC(m.dtmov)
),
demanda AS (
    SELECT vd.codprod,
           SUM(vd.qt_dia)                                                 AS qt_venda_84d,
           SUM(vd.qt_dia * vd.qt_dia)                                     AS soma_quad_venda_dia_84d,
           COUNT(*)                                                       AS dias_com_venda_84d,
           SUM(CASE WHEN vd.dia > :dt_fim - 28 THEN vd.qt_dia ELSE 0 END) AS qt_venda_28d,
           SUM(vd.vl_dia)                                                 AS vl_venda_84d
      FROM venda_dia vd
     GROUP BY vd.codprod
),
leadtime AS (
    SELECT p.codfornec,
           COUNT(*)                                        AS lt_n_pedidos,
           AVG(p.dtentradaestoque - p.dtemissao)           AS lt_real_medio_dias,
           NVL(STDDEV(p.dtentradaestoque - p.dtemissao),0) AS lt_real_desvio_dias
      FROM pcpedido p
     WHERE p.dtentradaestoque IS NOT NULL
       AND p.dtentradaestoque >= p.dtemissao
       AND p.dtemissao >= ADD_MONTHS(:dt_fim, -12)
       AND NVL(p.codfilial, '1') = '1'
     GROUP BY p.codfornec
)
SELECT pr.codprod,
       pr.descricao,
       pr.embalagem,
       pr.unidade,
       NVL(pr.qtunitcx, 1)                                              AS qt_embalagem_master,
       NVL(pr.multiplo, 1)                                              AS multiplo_compra,
       pr.codfornec,
       f.fornecedor,
       NVL(e.qtestger, 0) - NVL(e.qtreserv, 0) - NVL(e.qtbloqueada, 0)  AS qt_disponivel,
       NVL(e.qtpedida, 0)                                               AS qt_pedido_aberto,
       NVL(e.estmin, 0)                                                 AS estoque_min_cadastrado,
       NVL(d.qt_venda_28d, 0)                                           AS qt_venda_28d,
       NVL(d.qt_venda_84d, 0)                                           AS qt_venda_84d,
       NVL(d.soma_quad_venda_dia_84d, 0)                                AS soma_quad_venda_dia_84d,
       NVL(d.dias_com_venda_84d, 0)                                     AS dias_com_venda_84d,
       NVL(d.vl_venda_84d, 0)                                           AS vl_venda_84d,
       lt.lt_n_pedidos                                                  AS lt_n_pedidos,
       ROUND(lt.lt_real_medio_dias, 2)                                  AS lt_real_medio_dias,
       ROUND(lt.lt_real_desvio_dias, 2)                                 AS lt_real_desvio_dias,
       NVL(f.prazoentrega, 0)                                           AS lt_cadastro_dias
  FROM pcprodut pr
  JOIN pcest e
    ON e.codprod   = pr.codprod
   AND e.codfilial = '1'
  LEFT JOIN pcprodfilial pf
    ON pf.codprod   = pr.codprod
   AND pf.codfilial = '1'
  LEFT JOIN demanda d
    ON d.codprod = pr.codprod
  LEFT JOIN leadtime lt
    ON lt.codfornec = pr.codfornec
  LEFT JOIN pcfornec f
    ON f.codfornec = pr.codfornec
 WHERE pr.dtexclusao IS NULL
   AND NVL(pf.ativo, 'S') = 'S'
   AND NVL(pf.foralinha, 'N') <> 'S'
   AND NVL(d.qt_venda_84d, 0) > 0
 ORDER BY NVL(d.vl_venda_84d, 0) DESC
```

**Cômputo Python (pós-processamento):**

```text
Somente math/statistics. Para cada linha:
1) N = 84 (dias da janela). media_d = qt_venda_84d / N. Variância diária EXATA incluindo os dias sem venda: var_d = max((soma_quad_venda_dia_84d - N*media_d**2) / (N-1), 0); sigma_d = math.sqrt(var_d).
2) Demanda de planejamento conservadora: d = max(media_d, qt_venda_28d/28) — captura aceleração recente. OPÇÃO (fusão ANA-PRE-05): se o produto tiver D30 nos resultados dos modelos ANA-PRE-03/04, usar d = D30/30 com prioridade ao modelo.
3) Lead time: se lt_n_pedidos >= 3 usar LT = lt_real_medio_dias e sigma_LT = lt_real_desvio_dias; senão LT = lt_cadastro_dias se > 0, senão lead_time_padrao (7); nesses fallbacks, sigma_LT = 0.25*LT.
4) Classe ABC: ordenar por vl_venda_84d desc, acumular participação; A até 80%, B até 95%, C o resto.
5) z por classe (aprox. inversa da normal): A=2.054 (98%), B=1.645 (95%), C=1.282 (90%).
6) Estoque de segurança: SS = z * math.sqrt(LT*sigma_d**2 + (d**2)*(sigma_LT**2)). Ponto de reposição: ROP = d*LT + SS. Piso do ERP: ROP = max(ROP, estoque_min_cadastrado).
7) Posição de estoque: PE = qt_disponivel + qt_pedido_aberto. Repor se PE <= ROP.
8) Alvo = ROP + d*ciclo_revisao_dias (14). Sugestão bruta = alvo - PE.
9) Arredondamento: mult = max(multiplo_compra, qt_embalagem_master, 1); sugestao_unidades = math.ceil(bruta/mult)*mult se bruta > 0, senão 0.
10) Saída: para A e B, listar codprod, descricao, fornecedor, classe, d, LT, SS, ROP, PE, sugestao_unidades e flag 'PEDIR_AGORA' quando PE <= ROP; classe C com PE <= ROP sai como 'REVISAR_MANUAL'. Ordenar por classe (A, B) e vl_venda_84d desc.
```

**Obs:** O truque da soma de quadrados evita transferir 60k+ linhas: o desvio-padrão da série diária completa (com zeros) é reconstruído de 3 agregados. Se ED=devolução for confirmado, trocar a CTE venda_dia para demanda líquida. sigma_LT em fallback é heurístico (25% do LT) — documentar no front. AUDITORIA (SQL corrigido): INNER JOIN em PCPRODFILIAL (706 linhas vs 722 produtos) trocado por LEFT JOIN — o INNER descartava silenciosamente produtos sem cadastro filial; MULTIPLO/QTUNITCX confirmados como as colunas corretas (MULTIPLOCOMPRAS é específico de auto-peças). FUSÃO (dedupe): absorve ANA-PRE-05 (especialista cientista_dados_previsao_demanda) — mesma decisão (sugestão de compra por produto/fornecedor); esta versão é mais completa (lead time real com variabilidade, z por classe ABC, arredondamento a embalagem/múltiplo, ROP+ciclo). Da PRE-05 herda-se a opção de mu = D30/30 dos modelos ANA-PRE-03/04 (passo 2) e a cobertura de itens sem giro/excesso fica com ANA-REP-01/ANA-REP-06.

### ANA-REP-06 — Excesso de estoque: capital imobilizado, excedente vs cobertura-alvo e ação sugerida (inclui pedido aberto em item já em excesso)

- **Nível:** prescritiva  |  **Status:** a_validar  |  **Grão:** produto com estoque > 0 em situação de excesso ou sem giro (filial 1)
- **Especialista:** Cientista de dados sênior — estoque prescritivo (reposição, cobertura e sugestão de compra) para distribuição/atacado, base Winthor/Oracle h4c
- **Parâmetros:** `:dt_fim` (DATE, default: TRUNC(SYSDATE))
- **Viz:** barra_h — Barras horizontais do capital imobilizado, com a fatia excedente vs alvo destacada e cor pela ação sugerida; KPI de topo: R$ total excedente e nº de itens com pedido de compra aberto em excesso (o desperdício mais barato de evitar — basta não receber).

**Pergunta de negócio:** Quanto dinheiro está parado além do necessário, em quais produtos, e qual a ação: suspender pedido de compra aberto, pausar compra ou ação comercial de queima?

**Técnica:** Cobertura vs alvo (fixado em 45 dias): excedente = max(estoque − demanda_diária × alvo, 0) valorizado ao custo unitário de PCEST (COALESCE CUSTOFIN → CUSTOREAL). CASE prescritivo prioriza o pior desperdício: QTPEDIDA > 0 em item sem giro ou em excesso = compra a caminho de algo que já sobra. Cortes: excesso > 60 dias; excesso crítico > 120 dias.

```sql
WITH venda28 AS (
    SELECT m.codprod,
           SUM(m.qt) AS qt_venda_28d
      FROM pcmov m
     WHERE m.codoper   = 'S'
       AND m.dtcancel  IS NULL
       AND m.codfilial = '1'
       AND m.dtmov     >  :dt_fim - 28
       AND m.dtmov     <= :dt_fim
     GROUP BY m.codprod
)
SELECT p.codprod,
       p.descricao,
       f.fornecedor,
       NVL(e.qtestger, 0)                                                   AS qt_estoque_gerencial,
       NVL(v.qt_venda_28d, 0)                                               AS qt_venda_28d,
       CASE WHEN NVL(v.qt_venda_28d, 0) > 0
            THEN ROUND(28 * NVL(e.qtestger, 0) / NULLIF(v.qt_venda_28d, 0), 1)
       END                                                                  AS cobertura_dias,
       e.dtultsaida,
       CASE WHEN e.dtultsaida IS NOT NULL
            THEN TRUNC(:dt_fim) - TRUNC(e.dtultsaida) END                   AS dias_desde_ultima_saida,
       NVL(e.qtpedida, 0)                                                   AS qt_pedido_aberto,
       COALESCE(NULLIF(e.custofin, 0), NULLIF(e.custoreal, 0), 0)           AS custo_unit,
       ROUND(NVL(e.qtestger,0)
             * COALESCE(NULLIF(e.custofin,0), NULLIF(e.custoreal,0), 0), 2) AS vl_imobilizado,
       ROUND(GREATEST(NVL(e.qtestger,0) - (NVL(v.qt_venda_28d,0) / 28) * 45, 0)
             * COALESCE(NULLIF(e.custofin,0), NULLIF(e.custoreal,0), 0), 2) AS vl_excedente_vs_alvo,
       CASE
         WHEN NVL(v.qt_venda_28d, 0) = 0 AND NVL(e.qtpedida, 0) > 0
              THEN 'SEM_GIRO_CANCELAR_PEDIDO_ABERTO'
         WHEN NVL(v.qt_venda_28d, 0) = 0
              THEN 'SEM_GIRO_AVALIAR_QUEIMA'
         WHEN NVL(e.qtpedida, 0) > 0
              THEN 'EXCESSO_SUSPENDER_PEDIDO_ABERTO'
         WHEN 28 * NVL(e.qtestger, 0) / NULLIF(v.qt_venda_28d, 0) > 120
              THEN 'EXCESSO_CRITICO_ACAO_COMERCIAL'
         ELSE 'EXCESSO_PAUSAR_COMPRA'
       END                                                                  AS acao_sugerida
  FROM pcest e
  JOIN pcprodut p
    ON p.codprod = e.codprod
  LEFT JOIN venda28 v
    ON v.codprod = e.codprod
  LEFT JOIN pcfornec f
    ON f.codfornec = p.codfornec
 WHERE e.codfilial = '1'
   AND NVL(e.qtestger, 0) > 0
   AND p.dtexclusao IS NULL
   AND ( NVL(v.qt_venda_28d, 0) = 0
      OR 28 * NVL(e.qtestger, 0) / NULLIF(v.qt_venda_28d, 0) > 60 )
 ORDER BY vl_imobilizado DESC
```

**Obs:** Estrutura das colunas conferida (CUSTOFIN, CUSTOREAL, QTPEDIDA, DTULTSAIDA existem em PCEST), mas a VALORIZAÇÃO depende da pendência P-03: qual campo de custo está populado. O COALESCE(CUSTOFIN→CUSTOREAL) é defensivo; não publicar valores em R$ antes da validação. Quantidades e classificação de ação não dependem de P-03. AUDITORIA (SQL corrigido): (1) binds :dias_excesso/:dias_alvo violavam a convenção (risco ORA-01008) — internalizados como literais 60/45/120, documentar os cortes na descrição; (2) divisão sem NULLIF no WHERE reescrita como 28*qtestger/NULLIF(qt_venda_28d,0) — Oracle NÃO garante curto-circuito do OR e SUM(qt)=0 daria ORA-01476.

### ANA-RFM-05 — Pauta semanal prescritiva por RCA: top 5 clientes por receita em risco com próxima ação

- **Nível:** prescritiva  |  **Status:** validado  |  **Grão:** cliente → ação recomendada (após pós-processamento: até 5 linhas por RCA)
- **Especialista:** Cientista de dados sênior — RFM e churn de clientes (distribuição/atacado)
- **Parâmetros:** `dt_ini` (DATE, default: 2025-10-01), `dt_fim` (DATE, default: 2026-07-15)
- **Viz:** tabela — Tabela agrupada por RCA (8 blocos de até 5 clientes), ordenada por receita_em_risco desc dentro do bloco, com chip colorido da ação e coluna de justificativa em texto; pensada para impressão/WhatsApp como pauta semanal do vendedor.

**Pergunta de negócio:** Segunda-feira de manhã, quais 5 clientes cada um dos 8 RCAs deve atacar primeiro, com qual ação (cobrar, reativar, investigar queda, contato preventivo) e quanto de receita dos próximos 90 dias está em jogo em cada um?

**Técnica:** Combina o score de churn da ANA-RFM-04 com receita esperada 90d (ticket médio × 90/ciclo individual): receita_em_risco = score/100 × receita_esperada_90d. Motor de recomendação por regras explícitas (financeiro > reativação > investigação de queda > preventivo), top 5 por carteira de RCA.

```sql
WITH vendas AS (
    SELECT n.codcli,
           TRUNC(n.dtsaida) AS dia,
           n.vltotal
      FROM pcnfsaid n
     WHERE n.dtcancel IS NULL
       AND n.codfilial = '1'
       AND n.dtsaida BETWEEN :dt_ini AND :dt_fim
),
base AS (
    SELECT v.codcli,
           MAX(v.dia)                                                        AS dt_ult_compra,
           COUNT(DISTINCT v.dia)                                             AS n_compras,
           SUM(v.vltotal)                                                    AS valor_total_janela,
           ROUND((MAX(v.dia) - MIN(v.dia))
                 / NULLIF(COUNT(DISTINCT v.dia) - 1, 0), 1)                  AS ciclo_medio_dias,
           SUM(CASE WHEN v.dia >  TRUNC(:dt_fim) - 90 THEN v.vltotal ELSE 0 END)  AS valor_ult90,
           SUM(CASE WHEN v.dia <= TRUNC(:dt_fim) - 90
                     AND v.dia >  TRUNC(:dt_fim) - 180 THEN v.vltotal ELSE 0 END) AS valor_ant90,
           COUNT(DISTINCT CASE WHEN v.dia > TRUNC(:dt_fim) - 90 THEN v.dia END)   AS freq_ult90,
           COUNT(DISTINCT CASE WHEN v.dia <= TRUNC(:dt_fim) - 90
                                AND v.dia > TRUNC(:dt_fim) - 180 THEN v.dia END)  AS freq_ant90
      FROM vendas v
     GROUP BY v.codcli
),
financ AS (
    SELECT t.codcli,
           SUM(CASE WHEN t.dtpag IS NULL AND t.dtvenc < TRUNC(:dt_fim)
                    THEN t.valor - NVL(t.vpago, 0) ELSE 0 END)               AS vl_vencido_aberto,
           MAX(CASE WHEN t.dtpag IS NULL AND t.dtvenc < TRUNC(:dt_fim)
                    THEN TRUNC(:dt_fim) - t.dtvenc ELSE 0 END)               AS max_dias_atraso
      FROM pcprest t
     WHERE t.dtcancel IS NULL
       AND t.codfilial = '1'
     GROUP BY t.codcli
)
SELECT b.codcli,
       c.cliente,
       c.fantasia,
       pr.praca,
       NVL(u.nome, '(sem RCA)')                      AS rca,
       TRUNC(:dt_fim) - b.dt_ult_compra              AS recencia_dias,
       b.n_compras,
       b.ciclo_medio_dias,
       ROUND(b.valor_total_janela, 2)                AS valor_total_janela,
       ROUND(b.valor_total_janela / b.n_compras, 2)  AS ticket_medio_compra,
       ROUND(b.valor_ult90, 2)                       AS valor_ult90,
       ROUND(b.valor_ant90, 2)                       AS valor_ant90,
       b.freq_ult90,
       b.freq_ant90,
       ROUND(NVL(f.vl_vencido_aberto, 0), 2)         AS vl_vencido_aberto,
       NVL(f.max_dias_atraso, 0)                     AS max_dias_atraso
  FROM base b
  JOIN pcclient c      ON c.codcli    = b.codcli
  LEFT JOIN pcpraca pr  ON pr.codpraca = c.codpraca
  LEFT JOIN pcusuari u  ON u.codusur   = c.codusur1
  LEFT JOIN financ f    ON f.codcli    = b.codcli
 WHERE c.dtexclusao IS NULL
 ORDER BY NVL(u.nome, '(sem RCA)'), b.valor_total_janela DESC
```

**Cômputo Python (pós-processamento):**

```text
Entrada: rows do SQL. Somente math/statistics.
1) Calcular score e componentes (f_rec, f_tend, f_freq, f_fin) exatamente como nos passos 1-3 da ANA-RFM-04 (mesma fórmula e fallback de ciclo pela mediana).
2) Para cada r: ciclo = r['ciclo_medio_dias'] or ciclo_fallback; compras_esperadas_90d = 90.0 / max(ciclo, 1.0); receita_esperada_90d = r['ticket_medio_compra'] * compras_esperadas_90d; receita_em_risco = round(score / 100.0 * receita_esperada_90d, 2).
3) Ação por regra, primeira que casar:
   a) r['vl_vencido_aberto'] > 0 and r['max_dias_atraso'] > 7  -> 'Cobrar antes de vender (R$ {vl_vencido_aberto} vencido há {max_dias_atraso}d)'
   b) f_rec >= 1.0                                             -> 'Visita de reativação (sem comprar há {recencia_dias}d; ciclo é {ciclo}d)'
   c) f_tend >= 0.5                                            -> 'Investigar queda de valor (90d caiu {pct}% vs período anterior)'
   d) score >= 40                                              -> 'Contato preventivo (score {score})'
   e) senão                                                    -> 'Manter rotina' (excluir da pauta)
4) Remover 'Manter rotina'; agrupar por rca; ordenar cada grupo por receita_em_risco desc; manter os 5 primeiros por RCA.
5) Saída: rca, codcli, cliente, praca, score, faixa, receita_esperada_90d, receita_em_risco, acao, justificativa. Rodapé por RCA: soma de receita_em_risco da pauta (meta de defesa da semana).
```

**Obs:** A receita esperada 90d é uma extrapolação ingênua (ticket médio × cadência histórica) — suficiente para PRIORIZAR, não para prever faturamento; não usar como meta financeira. A regra (a) propositalmente bloqueia venda antes de cobrança: nas 336 parcelas abertas (R$ 405 mil) há clientes onde vender mais só aumenta a exposição. Reexecutar semanalmente com :dt_fim = data corrente.

