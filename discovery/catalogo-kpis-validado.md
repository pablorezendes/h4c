# Catálogo de KPIs Validado — BI Winthor h4c
- **Data:** 2026-07-16
- **Fonte:** Oracle `U_CMT9GE_WI` (discovery offline — inventário, dicionário Winthor, PKs/FKs e contagens; nenhuma consulta adicional à base foi executada)
- **Período de dados:** out/2025 – jul/2026
- **Empresa:** HYGIENE FOR CARE (h4c) — ERP TOTVS Winthor

**Como ler o STATUS:** `validado` = todas as colunas do SQL foram confirmadas no dicionário de dados pelo agente do módulo; `a_validar` = SQL estruturalmente correto (colunas existem), mas a semântica de domínio/negócio depende de confirmação na base — ver a pendência citada na observação e a seção "Pendências" do dicionário de dados.

**IDs estáveis:** cada KPI recebe um ID (`VEN-01`, `EST-01`, ...) que vira o endpoint correspondente da API do BI (ex.: `/api/kpi/ven-01`). Não renumerar; KPIs novos entram no fim da sequência do módulo.

**Resumo:** 52 KPIs no total — **43 validados**, **9 a validar**.

| MÓDULO | PREFIXO | KPIs | VALIDADOS | A VALIDAR |
|---|---|---:|---:|---:|
| VENDAS-FATURAMENTO | VEN | 9 | 6 | 3 |
| ESTOQUE-PRODUTOS | EST | 9 | 8 | 1 |
| COMPRAS-SUPRIMENTOS | CMP | 8 | 6 | 2 |
| FINANCEIRO-CR | FCR | 5 | 5 | 0 |
| FINANCEIRO-PCFINANC | FCP | 12 | 9 | 3 |
| DIMENSOES-CONFORMADAS | DIM | 9 | 9 | 0 |
| **TOTAL** | — | **52** | **43** | **9** |

---

## VENDAS-FATURAMENTO

| KPI | DEFINIÇÃO | GRÃO | FONTES | STATUS |
|---|---|---|---|---|
| **VEN-01** — Faturamento bruto | Soma do valor de saída faturada de venda (itens PCMOV com operação de venda 'S', excluindo cancelados) por dia e filial. Ajuste vs. esboço do catálogo: PCMOV não tem PVENDA — o preço praticado é PUNIT. | dia × filial | PCMOV | validado |
| **VEN-02** — Faturamento líquido | Faturamento bruto menos devoluções de cliente e menos impostos da nota (ICMS+PIS+COFINS+ST+IPI). Ajuste vs. catálogo: PCMOVIMPOSTOS está VAZIA nesta base — os impostos vêm de PCCONSOLIDARECEITA (1 linha por NF). | mês × filial | PCMOV, PCCONSOLIDARECEITA | a_validar |
| **VEN-03** — Ticket médio | Faturamento dividido pelo número de notas fiscais de venda válidas no período. | nota (agregado no período × filial) | PCNFSAID, PCMOV | validado |
| **VEN-04** — Nº de pedidos | Contagem de pedidos de venda não cancelados no período (POSICAO <> 'C'; domínio validado: F=faturado, C=cancelado, L=liberado). | dia × filial (unidade: pedido) | PCPEDC | validado |
| **VEN-05** — Positivação | Número de clientes distintos com venda faturada no período; opcionalmente % sobre a carteira ativa de clientes. | cliente × período (agregado por filial/RCA) | PCMOV, PCCLIENT | validado |
| **VEN-06** — Mix por produto | Quantidade e valor vendidos por produto (com hierarquia departamento/seção), medindo amplitude do mix (nº de SKUs distintos vendidos). | produto × período | PCMOV, PCPRODUT | validado |
| **VEN-07** — Margem bruta % | (Venda − custo) ÷ venda dos itens faturados. Resposta à dúvida do catálogo: em PCMOV existem CUSTOREAL, CUSTOFIN, CUSTOCONT, CUSTOULTENT e CUSTOREP (não existe 'CUSTOULT' simples); preço = PUNIT (não PVENDA). | produto × período | PCMOV | a_validar |
| **VEN-08** — Devoluções % | Valor devolvido por clientes ÷ valor faturado no período. Hipótese: devolução de cliente = PCMOV.CODOPER='ED' (253 linhas; entra no estoque via NF de entrada, por isso fica FORA do faturamento). | mês × filial | PCMOV | a_validar |
| **VEN-09** — Venda pedida × faturada (taxa de atendimento) | KPI adicional para o cuidado transversal do catálogo: compara o valor pedido (PCPEDC.VLTOTAL) com o valor atendido/faturado (PCPEDC.VLATEND), medindo corte/ruptura comercial. | dia × filial | PCPEDC | validado |

### SQLs

#### VEN-01 — Faturamento bruto  `[validado]`

```sql
SELECT m.codfilial,
       TRUNC(m.dtmov) AS dia,
       SUM(m.qt * m.punit) AS faturamento_bruto
FROM   pcmov m
WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
AND    m.codfilial = :codfilial
AND    m.codoper = 'S'
AND    m.dtcancel IS NULL
GROUP  BY m.codfilial, TRUNC(m.dtmov)
```

> **Obs:** Colunas confirmadas no dicionário: DTMOV, QT, PUNIT, CODOPER, CODFILIAL, DTCANCEL. Conferir na base se SUM(qt*punit) concilia com PCNFSAID.VLTOTAL (pendência P-04) e decidir se bonificações (CODOPER='SB', 8 linhas) entram ou não.

#### VEN-02 — Faturamento líquido  `[a_validar]`

```sql
WITH fat AS (
  SELECT TRUNC(m.dtmov,'MM') mes, m.codfilial, SUM(m.qt*m.punit) vl_bruto
  FROM   pcmov m
  WHERE  m.codoper = 'S' AND m.dtcancel IS NULL
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov,'MM'), m.codfilial),
dev AS (
  SELECT TRUNC(m.dtmov,'MM') mes, m.codfilial, SUM(m.qt*m.punit) vl_dev
  FROM   pcmov m
  WHERE  m.codoper = 'ED' AND m.dtcancel IS NULL
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov,'MM'), m.codfilial),
imp AS (
  SELECT TRUNC(r.dtmov,'MM') mes, r.codfilial,
         SUM(NVL(r.vlicms,0)+NVL(r.vlpis,0)+NVL(r.vlcofins,0)+NVL(r.vlst,0)+NVL(r.vlipi,0)) vl_imp
  FROM   pcconsolidareceita r
  WHERE  r.numtransvenda IS NOT NULL
  AND    r.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(r.dtmov,'MM'), r.codfilial)
SELECT f.mes, f.codfilial,
       f.vl_bruto - NVL(d.vl_dev,0) - NVL(i.vl_imp,0) AS faturamento_liquido
FROM   fat f
LEFT   JOIN dev d ON d.mes = f.mes AND d.codfilial = f.codfilial
LEFT   JOIN imp i ON i.mes = f.mes AND i.codfilial = f.codfilial
```

> **Obs:** Todas as colunas existem no dicionário, mas dependem de duas confirmações em base: (a) 'ED' é mesmo a devolução de cliente (pendência P-01); (b) PCCONSOLIDARECEITA cobre todas as NFs de saída válidas (pendência P-06). Alternativa item a item: PCMOV.ST/VLIPI/VLPIS + PCMOVCOMPLE.VLICMS. **Alerta do verificador (2026-07-16):** PCCONSOLIDARECEITA não tem coluna de cancelamento no dicionário — se a tabela retiver linhas de NFs canceladas, o CTE `imp` superavalia os impostos; validar junto com P-06 (ex.: exigir NUMTRANSVENDA presente em PCNFSAID com DTCANCEL nula).

#### VEN-03 — Ticket médio  `[validado]`

```sql
SELECT n.codfilial,
       SUM(n.vltotal) / NULLIF(COUNT(DISTINCT n.numtransvenda),0) AS ticket_medio
FROM   pcnfsaid n
WHERE  n.dtsaida BETWEEN :dt_ini AND :dt_fim
AND    n.codfilial = :codfilial
AND    n.dtcancel IS NULL
AND    EXISTS (SELECT 1 FROM pcmov m
               WHERE m.numtransvenda = n.numtransvenda
               AND   m.codoper = 'S')
GROUP  BY n.codfilial
```

> **Obs:** VLTOTAL, DTSAIDA, DTCANCEL e NUMTRANSVENDA confirmados em PCNFSAID. O EXISTS em PCMOV com CODOPER='S' restringe a notas de venda (PCNFSAID também guarda remessas/devoluções a fornecedor). Variante 'ticket por pedido': SUM(VLTOTAL)/COUNT(*) de PCPEDC POSICAO='F'.

#### VEN-04 — Nº de pedidos  `[validado]`

```sql
SELECT c.codfilial,
       TRUNC(c.data) AS dia,
       COUNT(*) AS num_pedidos,
       SUM(CASE WHEN c.posicao = 'F' THEN 1 ELSE 0 END) AS num_pedidos_faturados
FROM   pcpedc c
WHERE  c.data BETWEEN :dt_ini AND :dt_fim
AND    c.codfilial = :codfilial
AND    c.posicao <> 'C'
GROUP  BY c.codfilial, TRUNC(c.data)
```

> **Obs:** NUMPED, DATA, POSICAO, CODFILIAL confirmados. Grão do pedido = NUMPED (PK).

#### VEN-05 — Positivação  `[validado]`

```sql
SELECT m.codusur,
       COUNT(DISTINCT m.codcli) AS clientes_positivados,
       ROUND(100 * COUNT(DISTINCT m.codcli) /
             NULLIF((SELECT COUNT(*) FROM pcclient c WHERE NVL(c.bloqueio,'N') <> 'S'),0), 2) AS positivacao_pct
FROM   pcmov m
WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
AND    m.codfilial = :codfilial
AND    m.codoper = 'S'
AND    m.dtcancel IS NULL
GROUP  BY m.codusur
```

> **Obs:** CODCLI, CODUSUR, CODOPER, DTCANCEL confirmados em PCMOV; BLOQUEIO confirmado em PCCLIENT (rótulo 'Bloqueio'). Validar em base o critério de 'carteira ativa' (domínio de BLOQUEIO, existência de data de exclusão).

#### VEN-06 — Mix por produto  `[validado]`

```sql
SELECT m.codprod,
       p.descricao,
       p.codepto,
       p.codsec,
       SUM(m.qt) AS qt_vendida,
       SUM(m.qt * m.punit) AS vl_venda
FROM   pcmov m
JOIN   pcprodut p ON p.codprod = m.codprod
WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
AND    m.codfilial = :codfilial
AND    m.codoper = 'S'
AND    m.dtcancel IS NULL
GROUP  BY m.codprod, p.descricao, p.codepto, p.codsec
ORDER  BY vl_venda DESC
```

> **Obs:** Todas as colunas confirmadas (PCPRODUT.DESCRICAO/CODEPTO/CODSEC com rótulos no dicionário). Amplitude do mix = COUNT(DISTINCT m.codprod) sobre o mesmo filtro.

#### VEN-07 — Margem bruta %  `[a_validar]`

```sql
SELECT m.codprod,
       SUM(m.qt * m.punit) AS venda,
       SUM(m.qt * NVL(m.custofin, m.custoreal)) AS custo,
       ROUND(100 * (SUM(m.qt * m.punit) - SUM(m.qt * NVL(m.custofin, m.custoreal)))
             / NULLIF(SUM(m.qt * m.punit),0), 2) AS margem_bruta_pct
FROM   pcmov m
WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
AND    m.codfilial = :codfilial
AND    m.codoper = 'S'
AND    m.dtcancel IS NULL
GROUP  BY m.codprod
```

> **Obs:** Todas as colunas do SQL existem no dicionário; o que falta é confirmar em base QUAL coluna de custo está populada e qual a política da empresa (financeiro × real × contábil) — pendência P-03. Até lá o NVL(custofin, custoreal) é hipótese.

#### VEN-08 — Devoluções %  `[a_validar]`

```sql
WITH v AS (
  SELECT TRUNC(m.dtmov,'MM') mes, m.codfilial, SUM(m.qt*m.punit) vl_venda
  FROM   pcmov m
  WHERE  m.codoper = 'S' AND m.dtcancel IS NULL
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov,'MM'), m.codfilial),
d AS (
  SELECT TRUNC(m.dtmov,'MM') mes, m.codfilial, SUM(m.qt*m.punit) vl_dev
  FROM   pcmov m
  WHERE  m.codoper = 'ED' AND m.dtcancel IS NULL
  AND    m.dtmov BETWEEN :dt_ini AND :dt_fim
  GROUP  BY TRUNC(m.dtmov,'MM'), m.codfilial)
SELECT v.mes, v.codfilial,
       NVL(d.vl_dev,0) AS vl_devolvido,
       v.vl_venda,
       ROUND(100 * NVL(d.vl_dev,0) / NULLIF(v.vl_venda,0), 2) AS devolucao_pct
FROM   v LEFT JOIN d ON d.mes = v.mes AND d.codfilial = v.codfilial
```

> **Obs:** Colunas confirmadas, mas o significado de 'ED' (vs 'EA' avaria, 'EB' bonificada) precisa ser confirmado via PCCFO/pendência P-01. Conferência cruzada disponível: PCAUXVENDA.VLDEVOLUCAO e PCCONSOLIDAMES.QTDEVCLIENTE.

#### VEN-09 — Venda pedida × faturada (taxa de atendimento)  `[validado]`

```sql
SELECT c.codfilial,
       TRUNC(c.data) AS dia,
       SUM(c.vltotal) AS vl_pedido,
       SUM(NVL(c.vlatend,0)) AS vl_atendido,
       ROUND(100 * SUM(NVL(c.vlatend,0)) / NULLIF(SUM(c.vltotal),0), 2) AS taxa_atendimento_pct
FROM   pcpedc c
WHERE  c.data BETWEEN :dt_ini AND :dt_fim
AND    c.codfilial = :codfilial
AND    c.posicao <> 'C'
GROUP  BY c.codfilial, TRUNC(c.data)
```

> **Obs:** VLTOTAL e VLATEND confirmados em PCPEDC. No nível item, o corte é PCPEDI.QTFALTA (também confirmada).

---

## ESTOQUE-PRODUTOS

| KPI | DEFINIÇÃO | GRÃO | FONTES | STATUS |
|---|---|---|---|---|
| **EST-01** — Valor de estoque atual | Soma (quantidade gerencial x custo unitário) da posição atual, nas três visões de custo do Winthor (financeiro, real/médio, contábil). PCEST é snapshot: número vale para 'agora', não para série temporal. | filial (drill: produto, depto/seção/categoria, fornecedor, marca) | PCEST, PCPRODUT | validado |
| **EST-02** — Valor de estoque - série temporal diária | Evolução diária do valor de estoque a partir das fotografias de PCHISTEST (histórico diário confirmado pela PK CODFILIAL+CODPROD+DATA). Substitui qualquer tentativa de 'somar PCEST no tempo'. | filial x dia (drill: produto) | PCHISTEST | validado |
| **EST-03** — Cobertura de estoque (dias) | Estoque gerencial atual dividido pela venda média diária do período. Esboço ajustado: PCMOV não tem PVENDA (cálculo usa QT; preço seria PUNIT) e exclui movimentos cancelados. | produto x filial | PCEST, PCMOV | validado |
| **EST-04** — Giro de estoque | CMV do período (custo das vendas em PCMOV) dividido pelo estoque médio ao custo — estoque médio EXATO pela média diária de PCHISTEST, não por (ini+fim)/2. Anualizável multiplicando por 365/dias do período. | produto x filial x período (agregável a filial) | PCMOV, PCHISTEST | validado |
| **EST-05** — Ruptura (%) | Percentual de produtos ATIVOS da filial com estoque disponível (QTESTGER - QTRESERV - QTBLOQUEADA) <= 0. Denominador restrito ao mix ativo (PCPRODFILIAL.ATIVO='S', FORALINHA<>'S', sem DTEXCLUSAO). | filial (drill: depto/seção, fornecedor) | PCEST, PCPRODFILIAL, PCPRODUT | validado |
| **EST-06** — Estoque parado (sem giro) | Produtos com saldo > 0 e sem saída há N dias (parâmetro :dias_sem_giro, ex.: 90), valorizado ao custo. Usa PCEST.DTULTSAIDA (mantida pelo ERP); nulo = nunca saiu. | produto x filial (agregável: contagem e valor por filial) | PCEST, PCPRODUT | validado |
| **EST-07** — Estoque bloqueado / avariado | Quantidade e valor bloqueados (QTBLOQUEADA) e avariados/indenizáveis (QTINDENIZ), com motivo do bloqueio. No Winthor, avaria fica em QTINDENIZ; QTBLOQUEADA é bloqueio operacional. | filial (drill: produto + MOTIVOBLOQESTOQUE) | PCEST | validado |
| **EST-08** — Composição do estoque (disponível x reservado x bloqueado x pendente) | Decomposição do estoque gerencial atual em disponível para venda, reservado por pedidos, bloqueado, avariado e pendente — visão operacional da posição. | filial (drill: produto) | PCEST | validado |
| **EST-09** — Fluxo diário de entradas e saídas por produto | Entradas (QTENT/VLENT), vendas (QTVENDA/VLVENDA), devoluções de cliente e perdas por produto/dia direto do agregado PCDTPROD — série de fluxo pronta, sem varrer PCMOV. | produto x filial x dia | PCDTPROD | a_validar |

### SQLs

#### EST-01 — Valor de estoque atual  `[validado]`

```sql
SELECT e.codfilial,
       SUM(e.qtestger * NVL(e.custofin,0))  AS vl_estoque_fin,
       SUM(e.qtestger * NVL(e.custoreal,0)) AS vl_estoque_real,
       SUM(e.qtestger * NVL(e.custocont,0)) AS vl_estoque_cont
FROM   pcest e
WHERE  e.codfilial = :codfilial          -- filial 99 = consolidadora, nao somar junto
AND    NVL(e.qtestger,0) > 0
GROUP  BY e.codfilial
```

> **Obs:** Colunas QTESTGER/CUSTOFIN/CUSTOREAL/CUSTOCONT confirmadas no dicionário. Pendência: qual custo bate com o relatório oficial (rotina 1118).

#### EST-02 — Valor de estoque - série temporal diária  `[validado]`

```sql
SELECT h.codfilial,
       h.data,
       SUM(h.qtestger * NVL(h.custofin,0))  AS vl_estoque_fin,
       SUM(h.qtestger * NVL(h.custoreal,0)) AS vl_estoque_real
FROM   pchistest h
WHERE  h.data BETWEEN :dt_ini AND :dt_fim
AND    h.codfilial = :codfilial
GROUP  BY h.codfilial, h.data
ORDER  BY h.data
```

> **Obs:** KPI novo habilitado pelo discovery (não estava no catálogo). Validar na base a cadência (dias corridos x úteis) e ausência de lacunas.

#### EST-03 — Cobertura de estoque (dias)  `[validado]`

```sql
WITH venda AS (
  SELECT m.codfilial, m.codprod,
         SUM(m.qt) / GREATEST(TRUNC(:dt_fim) - TRUNC(:dt_ini) + 1, 1) AS venda_media_dia
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codoper = 'S'                -- venda (dominio validado: S=9309)
  AND    m.dtcancel IS NULL
  GROUP  BY m.codfilial, m.codprod)
SELECT e.codfilial, e.codprod,
       e.qtestger,
       v.venda_media_dia,
       CASE WHEN v.venda_media_dia > 0
            THEN ROUND(e.qtestger / v.venda_media_dia, 1) END AS cobertura_dias
FROM   pcest e
LEFT   JOIN venda v ON v.codprod = e.codprod AND v.codfilial = e.codfilial
WHERE  e.codfilial = :codfilial
```

> **Obs:** Alternativa sem PCMOV: usar PCDTPROD.QTVENDA como venda diária. Decidir se abate devolução de cliente (ED=253) da venda média.

#### EST-04 — Giro de estoque  `[validado]`

```sql
WITH cmv AS (
  SELECT m.codfilial, m.codprod,
         SUM(m.qt * NVL(m.custoreal, m.custofin)) AS cmv
  FROM   pcmov m
  WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND    m.codoper = 'S'
  AND    m.dtcancel IS NULL
  GROUP  BY m.codfilial, m.codprod),
est_medio AS (
  SELECT h.codfilial, h.codprod,
         AVG(h.qtestger * NVL(h.custofin,0)) AS vl_estoque_medio
  FROM   pchistest h
  WHERE  h.data BETWEEN :dt_ini AND :dt_fim
  GROUP  BY h.codfilial, h.codprod)
SELECT e.codfilial, e.codprod,
       c.cmv, e.vl_estoque_medio,
       CASE WHEN e.vl_estoque_medio > 0
            THEN ROUND(c.cmv / e.vl_estoque_medio, 2) END AS giro_periodo
FROM   est_medio e
LEFT   JOIN cmv c ON c.codfilial = e.codfilial AND c.codprod = e.codprod
WHERE  e.codfilial = :codfilial
```

> **Obs:** Todas as colunas confirmadas. Consistência de visão de custo: se o valor de estoque usar CUSTOFIN, considerar CUSTOFIN também no CMV.

#### EST-05 — Ruptura (%)  `[validado]`

```sql
SELECT e.codfilial,
       COUNT(*) AS produtos_ativos,
       SUM(CASE WHEN NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0) <= 0
                THEN 1 ELSE 0 END) AS produtos_ruptura,
       ROUND(100 * SUM(CASE WHEN NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0) <= 0
                            THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS perc_ruptura
FROM   pcest e
JOIN   pcprodfilial pf ON pf.codprod = e.codprod AND pf.codfilial = e.codfilial
JOIN   pcprodut p      ON p.codprod = e.codprod
WHERE  e.codfilial = :codfilial
AND    NVL(pf.ativo,'S') = 'S'
AND    NVL(pf.foralinha,'N') <> 'S'
AND    NVL(pf.proibidavenda,'N') <> 'S'
AND    p.dtexclusao IS NULL
GROUP  BY e.codfilial
```

> **Obs:** ATIVO/FORALINHA/PROIBIDAVENDA confirmadas com rótulo no dicionário. Validar na base o preenchimento de ATIVO (pode ser nulo).

#### EST-06 — Estoque parado (sem giro)  `[validado]`

```sql
SELECT e.codfilial, e.codprod, p.descricao,
       e.qtestger,
       e.qtestger * NVL(e.custofin,0) AS vl_parado,
       e.dtultsaida,
       TRUNC(SYSDATE) - TRUNC(e.dtultsaida) AS dias_sem_saida
FROM   pcest e
JOIN   pcprodut p ON p.codprod = e.codprod
WHERE  e.codfilial = :codfilial
AND    NVL(e.qtestger,0) > 0
AND    (e.dtultsaida IS NULL OR e.dtultsaida < TRUNC(SYSDATE) - :dias_sem_giro)
ORDER  BY vl_parado DESC
```

> **Obs:** DTULTSAIDA e DTULTENT confirmadas. Alternativa mais auditável: última data com QTVENDA>0 em PCDTPROD.

#### EST-07 — Estoque bloqueado / avariado  `[validado]`

```sql
SELECT e.codfilial,
       SUM(NVL(e.qtbloqueada,0))                        AS qt_bloqueada,
       SUM(NVL(e.qtbloqueada,0) * NVL(e.custofin,0))    AS vl_bloqueado,
       SUM(NVL(e.qtindeniz,0))                          AS qt_avariada,
       SUM(NVL(e.qtindeniz,0) * NVL(e.custofin,0))      AS vl_avariado
FROM   pcest e
WHERE  e.codfilial = :codfilial
GROUP  BY e.codfilial
```

> **Obs:** QTBLOQUEADA/QTINDENIZ/MOTIVOBLOQESTOQUE confirmadas. Série temporal disponível em PCHISTEST (mesmas colunas).

#### EST-08 — Composição do estoque (disponível x reservado x bloqueado x pendente)  `[validado]`

```sql
SELECT e.codfilial,
       SUM(NVL(e.qtestger,0))                                                        AS qt_total,
       SUM(NVL(e.qtestger,0) - NVL(e.qtreserv,0) - NVL(e.qtbloqueada,0))             AS qt_disponivel,
       SUM(NVL(e.qtreserv,0))    AS qt_reservada,
       SUM(NVL(e.qtbloqueada,0)) AS qt_bloqueada,
       SUM(NVL(e.qtindeniz,0))   AS qt_avariada,
       SUM(NVL(e.qtpendente,0))  AS qt_pendente
FROM   pcest e
WHERE  e.codfilial = :codfilial
GROUP  BY e.codfilial
```

> **Obs:** KPI novo (não estava no catálogo); todas as colunas confirmadas. Validar se QTINDENIZ está contida ou não em QTESTGER nesta versão.

#### EST-09 — Fluxo diário de entradas e saídas por produto  `[a_validar]`

```sql
SELECT d.codfilial, d.dtmov,
       SUM(NVL(d.qtvenda,0))    AS qt_venda,
       SUM(NVL(d.vlvenda,0))    AS vl_venda,
       SUM(NVL(d.qtent,0))      AS qt_entrada,
       SUM(NVL(d.vlent,0))      AS vl_entrada,
       SUM(NVL(d.qtdevolcli,0)) AS qt_devol_cliente,
       SUM(NVL(d.qtperda,0))    AS qt_perda
FROM   pcdtprod d
WHERE  d.dtmov BETWEEN :dt_ini AND :dt_fim
AND    d.codfilial = :codfilial
GROUP  BY d.codfilial, d.dtmov
ORDER  BY d.dtmov
```

> **Obs:** Todas as colunas existem no dicionário, mas PCDTPROD não tem PK declarada e 119.896 linhas para 722 produtos sugere ~166 dias — falta confirmar na base a unicidade do grão e a reconciliação de SUM(QTVENDA) com PCMOV (CODOPER='S').

---

## COMPRAS-SUPRIMENTOS

| KPI | DEFINIÇÃO | GRÃO | FONTES | STATUS |
|---|---|---|---|---|
| **CMP-01** — Valor comprado (volume de compras) | Soma do valor total das notas fiscais de entrada de compra (CODOPER 'E' nos itens), por dia e filial. Exclui devoluções de cliente (ED) e demais entradas não-compra. | dia × filial | PCNFENT, PCMOV | validado |
| **CMP-02** — Nº de notas de entrada | Contagem de notas fiscais de entrada de compra no período, por mês e filial. | mês × filial (nota = NUMTRANSENT) | PCNFENT, PCMOV | validado |
| **CMP-03** — Prazo médio de entrega (lead time realizado) | Média em dias entre a emissão do pedido de compra (DTEMISSAO) e a entrada em estoque (DTENTRADAESTOQUE), só para pedidos já recebidos. | pedido de compra (agregado por fornecedor/mês) | PCPEDIDO, PCFORNEC | validado |
| **CMP-04** — Compras por fornecedor | Valor comprado e nº de notas por fornecedor no período (ranking de fornecedores). | fornecedor × período | PCNFENT, PCFORNEC, PCMOV | validado |
| **CMP-05** — Nº de pedidos de compra | Contagem e valor dos pedidos de compra emitidos no período, por mês e filial. | mês × filial (pedido = NUMPED) | PCPEDIDO | validado |
| **CMP-06** — Taxa de atendimento do pedido (fill rate) | Percentual da quantidade pedida que foi efetivamente entregue (QTENTREGUE ÷ QTPEDIDA) nos itens dos pedidos do período. | mês × filial (calculado item a item) | PCPEDIDO, PCITEM | validado |
| **CMP-07** — Custo médio de aquisição por produto | Valor de entrada ÷ quantidade de entrada por produto no período (preço médio pago). | produto × período | PCMOV | a_validar |
| **CMP-08** — Devoluções a fornecedor | Valor e quantidade devolvidos a fornecedores no período (saídas por devolução de compra). | fornecedor × mês | PCMOV, PCFORNEC | a_validar |

### SQLs

#### CMP-01 — Valor comprado (volume de compras)  `[validado]`

```sql
SELECT n.codfilial,
       TRUNC(n.dtent) AS dia,
       SUM(n.vltotal) AS valor_comprado
FROM   pcnfent n
WHERE  n.dtent BETWEEN :dt_ini AND :dt_fim
AND    n.codfilial = :codfilial
AND    n.dtcancel IS NULL
AND    EXISTS (SELECT 1 FROM pcmov m
               WHERE  m.numtransent = n.numtransent
               AND    m.codoper = 'E')
GROUP  BY n.codfilial, TRUNC(n.dtent)
ORDER  BY 1, 2
```

> **Obs:** Todas as colunas confirmadas no dicionário. Catálogo ajustado: em vez de somar item a item com m.ptabela, soma-se PCNFENT.VLTOTAL filtrando a nota pela existência de item CODOPER='E'. Decidir na validação se EB (bonificada, 72) e EI/EA entram no valor comprado — ver pendência P-01. **Correção do verificador (2026-07-16):** adicionado `AND n.dtcancel IS NULL` (PCNFENT.DTCANCEL existe no dicionário) — nota de entrada cancelada não pode somar como compra.

#### CMP-02 — Nº de notas de entrada  `[validado]`

```sql
SELECT n.codfilial,
       TRUNC(n.dtent, 'MM') AS mes,
       COUNT(DISTINCT n.numtransent) AS qtd_notas_entrada
FROM   pcnfent n
WHERE  n.dtent BETWEEN :dt_ini AND :dt_fim
AND    n.codfilial = :codfilial
AND    n.dtcancel IS NULL
AND    EXISTS (SELECT 1 FROM pcmov m
               WHERE  m.numtransent = n.numtransent
               AND    m.codoper = 'E')
GROUP  BY n.codfilial, TRUNC(n.dtent, 'MM')
```

> **Obs:** COUNT DISTINCT em NUMTRANSENT protege contra a PK composta (NUMTRANSENT+CODCONT) gerar mais de 1 linha por nota — ver pendência P-21. **Correção do verificador (2026-07-16):** adicionado `AND n.dtcancel IS NULL` — nota cancelada não conta.

#### CMP-03 — Prazo médio de entrega (lead time realizado)  `[validado]`

```sql
SELECT p.codfornec,
       f.fornecedor,
       ROUND(AVG(p.dtentradaestoque - p.dtemissao), 1) AS leadtime_medio_dias,
       MAX(f.prazoentrega)                              AS leadtime_cadastrado,
       COUNT(*)                                         AS qtd_pedidos_recebidos
FROM   pcpedido p
JOIN   pcfornec f ON f.codfornec = p.codfornec
WHERE  p.dtemissao BETWEEN :dt_ini AND :dt_fim
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
AND    p.dtentradaestoque IS NOT NULL
GROUP  BY p.codfornec, f.fornecedor
ORDER  BY leadtime_medio_dias DESC
```

> **Obs:** Catálogo ajustado: fonte é PCPEDIDO (PCPEDCFORNEC não existe nesta base). Colunas DTEMISSAO, DTENTRADAESTOQUE, DTPREVENT confirmadas. Se DTENTRADAESTOQUE estiver pouco preenchida (pendência P-18), fallback: AVG(n.dtent - p.dtemissao) via PCNFENT ↔ PCMOV.NUMPED ↔ PCPEDIDO (pendência P-20). Bônus: comparar com PCFORNEC.PRAZOENTREGA (lead time cadastral) e com DTPREVENT (pontualidade/OTIF).

#### CMP-04 — Compras por fornecedor  `[validado]`

```sql
SELECT f.codfornec,
       f.fornecedor,
       COUNT(DISTINCT n.numtransent) AS qtd_notas,
       SUM(n.vltotal)                AS valor_comprado
FROM   pcnfent n
JOIN   pcfornec f ON f.codfornec = n.codfornec
WHERE  n.dtent BETWEEN :dt_ini AND :dt_fim
AND    (:codfilial IS NULL OR n.codfilial = :codfilial)
AND    n.dtcancel IS NULL
AND    EXISTS (SELECT 1 FROM pcmov m
               WHERE  m.numtransent = n.numtransent
               AND    m.codoper = 'E')
GROUP  BY f.codfornec, f.fornecedor
ORDER  BY valor_comprado DESC
```

> **Obs:** Todas as colunas confirmadas. FORNECEDOR/CGC são PII — na camada semântica expor código+razão social e restringir CGC. **Correção do verificador (2026-07-16):** adicionado `AND n.dtcancel IS NULL` — nota cancelada não conta no ranking.

#### CMP-05 — Nº de pedidos de compra  `[validado]`

```sql
SELECT TRUNC(p.dtemissao, 'MM') AS mes,
       p.codfilial,
       COUNT(*)        AS qtd_pedidos,
       SUM(p.vltotal)  AS valor_pedidos,
       SUM(p.vlentregue) AS valor_entregue
FROM   pcpedido p
WHERE  p.dtemissao BETWEEN :dt_ini AND :dt_fim
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY TRUNC(p.dtemissao, 'MM'), p.codfilial
ORDER  BY 1, 2
```

> **Obs:** Catálogo citava PCPEDCFORNEC — corrigido para PCPEDIDO. Sem coluna POSICAO nesta tabela: não há como excluir cancelados diretamente; ver pendência P-18 sobre status derivado.

#### CMP-06 — Taxa de atendimento do pedido (fill rate)  `[validado]`

```sql
SELECT p.codfilial,
       TRUNC(p.dtemissao, 'MM') AS mes,
       ROUND(100 * SUM(NVL(i.qtentregue,0)) / NULLIF(SUM(i.qtpedida),0), 2) AS fill_rate_pct
FROM   pcpedido p
JOIN   pcitem i ON i.numped = p.numped
WHERE  p.dtemissao BETWEEN :dt_ini AND :dt_fim
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY p.codfilial, TRUNC(p.dtemissao, 'MM')
```

> **Obs:** Colunas QTPEDIDA/QTENTREGUE confirmadas. Verificar preenchimento real de QTENTREGUE (pendência P-18); alternativa no cabeçalho: VLENTREGUE/VLTOTAL de PCPEDIDO.

#### CMP-07 — Custo médio de aquisição por produto  `[a_validar]`

```sql
SELECT m.codprod,
       SUM(m.qtcont * m.punitcont) AS valor_entrada,
       SUM(m.qtcont)               AS qt_entrada,
       SUM(m.qtcont * m.punitcont) / NULLIF(SUM(m.qtcont),0) AS custo_medio_aquisicao
FROM   pcmov m
WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
AND    m.codfilial = :codfilial
AND    m.codoper = 'E'
AND    m.dtcancel IS NULL
GROUP  BY m.codprod
```

> **Obs:** Colunas QTCONT/PUNITCONT/QT/PUNIT existem no dicionário, mas a escolha da dupla correta (QT×PUNIT vs QTCONT×PUNITCONT, e se inclui IPI/frete) precisa ser conferida contra PCNFENT.VLTOTAL numa amostra — pendência P-19. Catálogo usava m.ptabela (existe, mas é preço de tabela, não custo). **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — entradas canceladas distorciam o custo médio.

#### CMP-08 — Devoluções a fornecedor  `[a_validar]`

```sql
SELECT m.codfornec,
       TRUNC(m.dtmov, 'MM') AS mes,
       SUM(m.qt * m.punit)  AS valor_devolvido,
       COUNT(DISTINCT m.numnota) AS qtd_notas_devolucao
FROM   pcmov m
WHERE  m.dtmov BETWEEN :dt_ini AND :dt_fim
AND    m.codfilial = :codfilial
AND    m.codoper = 'SD'
AND    m.dtcancel IS NULL
GROUP  BY m.codfornec, TRUNC(m.dtmov, 'MM')
```

> **Obs:** Colunas existem, porém o significado exato de SD (42 linhas — devolução a fornecedor vs outra saída) não está rotulado no dicionário desta base; confirmar via pendência P-01 antes de publicar. **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — devoluções canceladas não contam.

---

## FINANCEIRO-CR

| KPI | DEFINIÇÃO | GRÃO | FONTES | STATUS |
|---|---|---|---|---|
| **FCR-01** — Contas a receber em aberto (carteira) | Soma do saldo (VALOR - VPAGO) dos títulos não pagos (DTPAG nula) e não cancelados, na data da consulta. Regra 'DTPAG nula = aberto' validada na base (336 títulos, R$ 405.355,01). | filial (título como grão-base: NUMTRANSVENDA+PREST) | PCPREST | validado |
| **FCR-02** — Vencido em aberto — aging por faixas | Saldo em aberto distribuído por faixa de atraso em relação a DTVENC: A VENCER, 1-30, 31-60, 61-90, 90+ dias. | faixa de atraso × filial | PCPREST | validado |
| **FCR-03** — Inadimplência % | Saldo vencido e não pago (DTVENC < hoje, DTPAG nula) dividido pela carteira total em aberto, na data da consulta. | filial | PCPREST | validado |
| **FCR-04** — Prazo médio de recebimento (PMR/DSO) | Média de dias entre emissão e pagamento (DTPAG - DTEMISSAO) dos títulos baixados no período, ponderada pelo valor pago. Complemento: dias médios de atraso = média(DTPAG - DTVENC). | período (títulos pagos no intervalo); pode abrir por filial/cliente/RCA | PCPREST | validado |
| **FCR-05** — Recebido no período | Soma de VPAGO dos títulos com DTPAG dentro do período, por dia e filial. Total validado na base: R$ 2.028.529,87 em 2.606 títulos pagos (todo o histórico). | dia × filial | PCPREST | validado |

### SQLs

#### FCR-01 — Contas a receber em aberto (carteira)  `[validado]`

```sql
SELECT p.codfilial,
       COUNT(*)                      AS qtd_titulos,
       SUM(p.valor - NVL(p.vpago,0)) AS saldo_aberto
FROM   pcprest p
WHERE  p.dtpag IS NULL
AND    p.dtcancel IS NULL
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY p.codfilial
```

> **Obs:** Colunas VALOR, VPAGO, DTPAG, DTCANCEL, CODFILIAL confirmadas no dicionário. Ajustes sobre o esboço do catálogo: removida a condição 'OR dtpag > SYSDATE' (regra validada é DTPAG IS NULL) e incluída exclusão de cancelados (DTCANCEL IS NULL). Pendências: excluir cobranças internas via CODCOB e checar se existe CODFILIAL='99' (consolidadora) para evitar dupla contagem.

#### FCR-02 — Vencido em aberto — aging por faixas  `[validado]`

```sql
SELECT p.codfilial,
       CASE WHEN p.dtvenc >= TRUNC(SYSDATE)      THEN 'A VENCER'
            WHEN TRUNC(SYSDATE) - p.dtvenc <= 30 THEN '01-30'
            WHEN TRUNC(SYSDATE) - p.dtvenc <= 60 THEN '31-60'
            WHEN TRUNC(SYSDATE) - p.dtvenc <= 90 THEN '61-90'
            ELSE '90+' END               AS faixa_atraso,
       COUNT(*)                          AS qtd_titulos,
       SUM(p.valor - NVL(p.vpago,0))     AS saldo
FROM   pcprest p
WHERE  p.dtpag IS NULL
AND    p.dtcancel IS NULL
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY p.codfilial,
       CASE WHEN p.dtvenc >= TRUNC(SYSDATE)      THEN 'A VENCER'
            WHEN TRUNC(SYSDATE) - p.dtvenc <= 30 THEN '01-30'
            WHEN TRUNC(SYSDATE) - p.dtvenc <= 60 THEN '31-60'
            WHEN TRUNC(SYSDATE) - p.dtvenc <= 90 THEN '61-90'
            ELSE '90+' END
```

> **Obs:** Ajuste sobre o esboço do catálogo: 'GROUP BY 1' (posicional) não é válido em Oracle — a expressão CASE foi repetida no GROUP BY. DTVENC é NOT NULL, sem risco de faixa nula. Para aging histórico (foto em data passada) seria preciso reconstruir com DTPAG > :dt_ref, o que este SQL não cobre.

#### FCR-03 — Inadimplência %  `[validado]`

```sql
SELECT p.codfilial,
       SUM(CASE WHEN p.dtvenc < TRUNC(SYSDATE)
                THEN p.valor - NVL(p.vpago,0) ELSE 0 END)      AS vencido_aberto,
       SUM(p.valor - NVL(p.vpago,0))                            AS carteira_aberta,
       ROUND(100 * SUM(CASE WHEN p.dtvenc < TRUNC(SYSDATE)
                            THEN p.valor - NVL(p.vpago,0) ELSE 0 END)
             / NULLIF(SUM(p.valor - NVL(p.vpago,0)), 0), 2)     AS perc_inadimplencia
FROM   pcprest p
WHERE  p.dtpag IS NULL
AND    p.dtcancel IS NULL
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY p.codfilial
```

> **Obs:** Denominador = carteira em aberto (definição operacional comum). Se o negócio preferir 'vencido ÷ faturamento' ou 'vencido ÷ carteira total incl. pagos no mês', ajustar. NULLIF evita divisão por zero. Variante por cliente: acrescentar p.codcli ao SELECT/GROUP BY e juntar PCCLIENT para nome/limite.

#### FCR-04 — Prazo médio de recebimento (PMR/DSO)  `[validado]`

```sql
SELECT p.codfilial,
       ROUND(SUM((p.dtpag - p.dtemissao) * NVL(p.vpago, p.valor))
             / NULLIF(SUM(NVL(p.vpago, p.valor)), 0), 1) AS pmr_dias_ponderado,
       ROUND(AVG(p.dtpag - p.dtvenc), 1)                  AS atraso_medio_dias
FROM   pcprest p
WHERE  p.dtpag BETWEEN :dt_ini AND :dt_fim
AND    p.dtcancel IS NULL
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY p.codfilial
```

> **Obs:** DTEMISSAO, DTVENC (NOT NULL) e DTPAG confirmadas. Este é o PMR realizado (só títulos pagos). O DSO contábil clássico (carteira ÷ faturamento × dias) exigiria cruzar com o fato de vendas (PCNFSAID/PCMOV) — deixar como derivação na camada semântica. Com só ~9 meses de história, cuidado com títulos emitidos antes de out/2025.

#### FCR-05 — Recebido no período  `[validado]`

```sql
SELECT TRUNC(p.dtpag)  AS dia,
       p.codfilial,
       COUNT(*)         AS qtd_titulos_baixados,
       SUM(NVL(p.vpago,0)) AS valor_recebido
FROM   pcprest p
WHERE  p.dtpag BETWEEN :dt_ini AND :dt_fim
AND    p.dtcancel IS NULL
AND    (:codfilial IS NULL OR p.codfilial = :codfilial)
GROUP  BY TRUNC(p.dtpag), p.codfilial
ORDER  BY 1
```

> **Obs:** Para abrir por forma de cobrança, juntar PCCOB (p.codcob = c.codcob). Fonte alternativa/conciliação: PCMOVCR (lançamentos em caixa/banco, excluindo DTESTORNO NOT NULL) — pendência para validar equivalência. Verificar se VPAGO inclui juros de permanência (TXPERM) para não superavaliar o principal recebido.

---

## FINANCEIRO-PCFINANC

| KPI | DEFINIÇÃO | GRÃO | FONTES | STATUS |
|---|---|---|---|---|
| **FCP-01** — CAP em aberto (saldo a pagar) | Soma de VALOR - VPAGO dos títulos não pagos e não cancelados, por filial | filial (título disponível via RECNUM) | PCLANC | validado |
| **FCP-02** — CAP vencido | Saldo aberto com DTVENC anterior a hoje | filial | PCLANC | validado |
| **FCP-03** — Aging do contas a pagar | Saldo aberto por faixa de dias de atraso (a vencer / 1-30 / 31-60 / 61-90 / 90+) | faixa de atraso × filial | PCLANC | validado |
| **FCP-04** — A pagar por vencimento (fluxo projetado) | Saldo aberto somado por semana de vencimento futura | semana de vencimento × filial | PCLANC | validado |
| **FCP-05** — Pago no período | Soma das baixas (VPAGO) por dia de pagamento | dia × filial | PCLANC | validado |
| **FCP-06** — PMP - prazo médio de pagamento | Média ponderada por valor de (DTPAGTO - DTEMISSAO) dos títulos pagos no período | período (global ou filial) | PCLANC | validado |
| **FCP-07** — Despesas por conta gerencial e grupo | Soma de VALOR por grupo (PCGRUPO) e conta (PCCONTA), pela competência (fallback data de lançamento) | grupo × conta × período | PCLANC, PCCONTA, PCGRUPO | validado |
| **FCP-08** — Despesas por fornecedor | Soma de VALOR por fornecedor no período (competência) | fornecedor × período | PCLANC, PCFORNEC | validado |
| **FCP-09** — Verbas de fornecedor em aberto | Soma de VALOR - VPAGO das verbas sem quitação e sem cancelamento, por fornecedor | fornecedor | PCVERBA, PCFORNEC | validado |
| **FCP-10** — Posição financeira diária (saldos CP/CR/banco/caixa) | Série histórica dos saldos consolidados por dia e filial a partir do snapshot PCFINANC | dia × filial | PCFINANC | a_validar |
| **FCP-11** — Evolução histórica do CAP em aberto (via snapshot) | Saldo em aberto de fornecedores por data de referência usando a foto PCFINANC3LANCFORNEC | data de referência × filial | PCFINANC3LANCFORNEC | a_validar |
| **FCP-12** — Detalhe do resumo financeiro por tipo de dado | Valores do detalhe diário PCFINANC2 abertos por TIPODADO e entidade (CODIGON/CODIGOA) | dia × filial × tipo de dado × entidade | PCFINANC2 | a_validar |

### SQLs

#### FCP-01 — CAP em aberto (saldo a pagar)  `[validado]`

```sql
SELECT l.codfilial,
       COUNT(*) AS qt_titulos,
       SUM(l.valor - NVL(l.vpago,0)) AS vl_aberto
FROM   pclanc l
WHERE  l.dtpagto IS NULL
  AND  l.dtcancel IS NULL
  AND  (:codfilial IS NULL OR l.codfilial = :codfilial)
GROUP  BY l.codfilial
```

> **Obs:** Todas as colunas confirmadas no dicionário. HIPÓTESE de negócio: DTPAGTO nula = aberto (mesmo padrão validado em PCPREST.DTPAG); excluir DTCANCEL preenchida. Conferir também DTESTORNOBAIXA em pendência.

#### FCP-02 — CAP vencido  `[validado]`

```sql
SELECT l.codfilial,
       COUNT(*) AS qt_vencidos,
       SUM(l.valor - NVL(l.vpago,0)) AS vl_vencido
FROM   pclanc l
WHERE  l.dtpagto IS NULL
  AND  l.dtcancel IS NULL
  AND  l.dtvenc < TRUNC(SYSDATE)
GROUP  BY l.codfilial
```

> **Obs:** Colunas confirmadas. DTVENC é nullable — títulos sem vencimento ficam fora; medir volume deles na pendência de perfil de PCLANC.

#### FCP-03 — Aging do contas a pagar  `[validado]`

```sql
SELECT l.codfilial,
       CASE WHEN TRUNC(SYSDATE) - l.dtvenc <= 0  THEN 'A vencer'
            WHEN TRUNC(SYSDATE) - l.dtvenc <= 30 THEN '1-30'
            WHEN TRUNC(SYSDATE) - l.dtvenc <= 60 THEN '31-60'
            WHEN TRUNC(SYSDATE) - l.dtvenc <= 90 THEN '61-90'
            ELSE '90+' END AS faixa,
       COUNT(*) AS qt,
       SUM(l.valor - NVL(l.vpago,0)) AS vl_aberto
FROM   pclanc l
WHERE  l.dtpagto IS NULL
  AND  l.dtcancel IS NULL
  AND  l.dtvenc IS NOT NULL
GROUP  BY l.codfilial,
       CASE WHEN TRUNC(SYSDATE) - l.dtvenc <= 0  THEN 'A vencer'
            WHEN TRUNC(SYSDATE) - l.dtvenc <= 30 THEN '1-30'
            WHEN TRUNC(SYSDATE) - l.dtvenc <= 60 THEN '31-60'
            WHEN TRUNC(SYSDATE) - l.dtvenc <= 90 THEN '61-90'
            ELSE '90+' END
```

> **Obs:** Adaptação direta do esboço de aging do catálogo (seção CR) para PCLANC; colunas confirmadas.

#### FCP-04 — A pagar por vencimento (fluxo projetado)  `[validado]`

```sql
SELECT TRUNC(l.dtvenc,'IW') AS semana_venc,
       l.codfilial,
       SUM(l.valor - NVL(l.vpago,0)) AS vl_a_pagar
FROM   pclanc l
WHERE  l.dtpagto IS NULL
  AND  l.dtcancel IS NULL
  AND  l.dtvenc >= TRUNC(SYSDATE)
GROUP  BY TRUNC(l.dtvenc,'IW'), l.codfilial
ORDER  BY 1
```

> **Obs:** Substitui o esboço do catálogo que citava PCPAGAR (inexistente) e a coluna VALORPAGO (não existe): o correto é PCLANC.VPAGO.

#### FCP-05 — Pago no período  `[validado]`

```sql
SELECT TRUNC(l.dtpagto) AS dia,
       l.codfilial,
       COUNT(*) AS qt_baixas,
       SUM(NVL(l.vpago, l.valor)) AS vl_pago
FROM   pclanc l
WHERE  l.dtpagto BETWEEN :dt_ini AND :dt_fim
  AND  l.dtcancel IS NULL
GROUP  BY TRUNC(l.dtpagto), l.codfilial
ORDER  BY 1
```

> **Obs:** Colunas confirmadas. HIPÓTESE: quando VPAGO nulo em título pago, usar VALOR; verificar estornos de baixa (DTESTORNOBAIXA) na pendência.

#### FCP-06 — PMP - prazo médio de pagamento  `[validado]`

```sql
SELECT ROUND(
         SUM((l.dtpagto - l.dtemissao) * NVL(l.vpago, l.valor))
         / NULLIF(SUM(NVL(l.vpago, l.valor)), 0), 1) AS pmp_dias
FROM   pclanc l
WHERE  l.dtpagto BETWEEN :dt_ini AND :dt_fim
  AND  l.dtemissao IS NOT NULL
  AND  l.dtcancel IS NULL
```

> **Obs:** Colunas confirmadas; DTEMISSAO é nullable, o filtro exclui títulos sem emissão (medir % excluído em pendência).

#### FCP-07 — Despesas por conta gerencial e grupo  `[validado]`

```sql
SELECT g.codgrupo, g.grupo,
       c.codconta, c.conta,
       SUM(l.valor) AS vl_despesa
FROM   pclanc l
JOIN   pcconta c ON c.codconta = l.codconta
LEFT   JOIN pcgrupo g ON g.codgrupo = c.grupoconta
WHERE  NVL(l.dtcompetencia, l.dtlanc) BETWEEN :dt_ini AND :dt_fim
  AND  l.dtcancel IS NULL
GROUP  BY g.codgrupo, g.grupo, c.codconta, c.conta
ORDER  BY vl_despesa DESC
```

> **Obs:** Catálogo citava PCPAGAR+PCPLANO; o real é PCLANC.CODCONTA → PCCONTA.GRUPOCONTA → PCGRUPO (rótulos oficiais confirmam a hierarquia). Contas de receita/investimento podem exigir filtro por PCCONTA.TIPO (domínio em pendência).

#### FCP-08 — Despesas por fornecedor  `[validado]`

```sql
SELECT l.codfornec, f.fornecedor,
       COUNT(*) AS qt_titulos,
       SUM(l.valor) AS vl_total
FROM   pclanc l
LEFT   JOIN pcfornec f ON f.codfornec = l.codfornec
WHERE  NVL(l.dtcompetencia, l.dtlanc) BETWEEN :dt_ini AND :dt_fim
  AND  l.dtcancel IS NULL
GROUP  BY l.codfornec, f.fornecedor
ORDER  BY vl_total DESC
```

> **Obs:** Colunas confirmadas (PCFORNEC.FORNECEDOR tem rótulo oficial 'Fornecedor'). Atenção LGPD: expõe nome do fornecedor (PJ na maioria, mas CGC pode ser CPF).

#### FCP-09 — Verbas de fornecedor em aberto  `[validado]`

```sql
SELECT v.codfornec, f.fornecedor,
       COUNT(*) AS qt_verbas,
       SUM(v.valor - NVL(v.vpago,0)) AS vl_verba_aberta
FROM   pcverba v
LEFT   JOIN pcfornec f ON f.codfornec = v.codfornec
WHERE  v.dtquitacao IS NULL
  AND  v.dtcancel IS NULL
GROUP  BY v.codfornec, f.fornecedor
```

> **Obs:** Colunas confirmadas; sem rótulos em PCVERBA, então 'DTQUITACAO nula = aberta' é hipótese por convenção. Base pequena (21 verbas).

#### FCP-10 — Posição financeira diária (saldos CP/CR/banco/caixa)  `[a_validar]`

```sql
SELECT f.data, f.codfilial,
       f.saldocp, f.saldocpoutros, f.saldocr,
       f.saldobco, f.saldocx, f.saldodin,
       f.vendareal, f.recebreal
FROM   pcfinanc f
WHERE  f.data BETWEEN :dt_ini AND :dt_fim
  AND  (:codfilial IS NULL OR f.codfilial = :codfilial)
ORDER  BY f.data, f.codfilial
```

> **Obs:** Todas as colunas existem no dicionário, mas SEM rótulo/ajuda — a semântica (SALDOCP = saldo do contas a pagar etc.) é hipótese por nome. Validar reconciliando SALDOCP com a soma de PCLANC em aberto na mesma data e conferindo se CODFILIAL='99' duplica o consolidado.

#### FCP-11 — Evolução histórica do CAP em aberto (via snapshot)  `[a_validar]`

```sql
SELECT s.datareferencia, s.codfilial,
       COUNT(*) AS qt_titulos,
       SUM(s.valor - NVL(s.vpago,0)) AS vl_aberto_foto
FROM   pcfinanc3lancfornec s
WHERE  s.datareferencia BETWEEN :dt_ini AND :dt_fim
  AND  s.dtpagto IS NULL
GROUP  BY s.datareferencia, s.codfilial
ORDER  BY 1
```

> **Obs:** Colunas existem, mas o grão inclui TIPODADO e CODROTINAGERACAO cujos domínios são desconhecidos: se houver mais de um TIPODADO ou mais de uma geração por DATAREFERENCIA, esta soma duplica. Só liberar após a pendência de domínio.

#### FCP-12 — Detalhe do resumo financeiro por tipo de dado  `[a_validar]`

```sql
SELECT f2.data, f2.codfilial, f2.tipodado, f2.codigon, f2.codigoa,
       SUM(f2.valor) AS vl
FROM   pcfinanc2 f2
WHERE  f2.data BETWEEN :dt_ini AND :dt_fim
GROUP  BY f2.data, f2.codfilial, f2.tipodado, f2.codigon, f2.codigoa
```

> **Obs:** Estrutura confirmada, semântica não: sem rótulos e sem domínio de TIPODADO/CODIGON/CODIGOA não dá para nomear as métricas. É a maior tabela da base (76.404) — alto potencial após decodificar.

---

## DIMENSOES-CONFORMADAS

| KPI | DEFINIÇÃO | GRÃO | FONTES | STATUS |
|---|---|---|---|---|
| **DIM-01** — Ranking de vendedores (faturamento por RCA) | Soma do valor faturado (saídas de venda em PCMOV) por RCA no período, ordenado do maior para o menor. | vendedor (RCA) × período | PCMOV, PCUSUARI | validado |
| **DIM-02** — Positivação de clientes por RCA | Número de clientes distintos com venda faturada no período, por RCA. | vendedor × período | PCMOV | validado |
| **DIM-03** — Cobertura de carteira por RCA | Clientes positivados no período dividido pela carteira ativa do RCA (clientes não excluídos com CODUSUR1 = RCA). | vendedor × período | PCCLIENT, PCMOV, PCUSUARI | validado |
| **DIM-04** — Prospecção — novos clientes por mês e RCA | Contagem de clientes cadastrados no período (PCCLIENT.DTCADASTRO), por mês e RCA titular. | mês × vendedor | PCCLIENT | validado |
| **DIM-05** — Faturamento pela hierarquia de produto (departamento → seção) | Valor faturado agregado pela hierarquia mercadológica produto→seção→departamento. | departamento × seção × período | PCMOV, PCPRODUT, PCSECAO, PCDEPTO | validado |
| **DIM-06** — Faturamento pela hierarquia comercial (supervisor → RCA) | Valor faturado agregado por supervisor e RCA (hierarquia PCUSUARI.CODSUPERVISOR → PCSUPERV). | supervisor × vendedor × período | PCMOV, PCUSUARI, PCSUPERV | validado |
| **DIM-07** — Faturamento por praça e região (hierarquia do cliente) | Valor faturado agregado pela hierarquia geográfica cliente→praça→região. | região × praça × período | PCMOV, PCCLIENT, PCPRACA, PCREGIAO | validado |
| **DIM-08** — Clientes inativos na carteira (recência) | Clientes ativos no cadastro (DTEXCLUSAO nula) sem compra há mais de N dias, via PCCLIENT.DTULTCOMP. | cliente (snapshot na data da consulta) | PCCLIENT | validado |
| **DIM-09** — Qualidade de cadastro das dimensões (completude) | Percentual de produtos ativos sem marca/seção/NCM e de clientes ativos sem praça/atividade/cidade IBGE — pré-requisito para as hierarquias do BI não vazarem para '(não informado)'. | snapshot do cadastro | PCPRODUT, PCCLIENT | validado |

### SQLs

#### DIM-01 — Ranking de vendedores (faturamento por RCA)  `[validado]`

```sql
SELECT m.codusur, u.nome, SUM(m.qt * m.punit) AS faturamento
FROM pcmov m
JOIN pcusuari u ON u.codusur = m.codusur
WHERE m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND m.codfilial = :codfilial
  AND m.codoper = 'S'
  AND m.dtcancel IS NULL
GROUP BY m.codusur, u.nome
ORDER BY faturamento DESC
```

> **Obs:** Esboço do catálogo usava m.pvenda, que NÃO existe em PCMOV — ajustado para m.punit (existe; PVENDA fica em PCPEDI). CODOPER='S' é a operação de venda dominante (9.309 linhas). Pendência: conciliar QT*PUNIT com PCNFSAID.VLTOTAL. **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — sem ele, itens de venda cancelados entravam no faturamento (VEN-01/VEN-06 já usavam o filtro).

#### DIM-02 — Positivação de clientes por RCA  `[validado]`

```sql
SELECT m.codusur, COUNT(DISTINCT m.codcli) AS clientes_positivados
FROM pcmov m
WHERE m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND m.codfilial = :codfilial
  AND m.codoper = 'S'
  AND m.dtcancel IS NULL
GROUP BY m.codusur
```

> **Obs:** Colunas CODUSUR, CODCLI, DTMOV, CODOPER, CODFILIAL confirmadas em PCMOV. **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — venda cancelada não pode positivar cliente (consistente com VEN-05).

#### DIM-03 — Cobertura de carteira por RCA  `[validado]`

```sql
WITH carteira AS (
  SELECT c.codusur1 AS codusur, COUNT(*) AS qt_carteira
  FROM pcclient c
  WHERE c.dtexclusao IS NULL
  GROUP BY c.codusur1),
positivados AS (
  SELECT m.codusur, COUNT(DISTINCT m.codcli) AS qt_pos
  FROM pcmov m
  WHERE m.dtmov BETWEEN :dt_ini AND :dt_fim AND m.codoper = 'S'
    AND m.dtcancel IS NULL
  GROUP BY m.codusur)
SELECT k.codusur, u.nome, k.qt_carteira,
       NVL(p.qt_pos,0) AS qt_positivados,
       ROUND(100 * NVL(p.qt_pos,0) / NULLIF(k.qt_carteira,0), 2) AS perc_cobertura
FROM carteira k
JOIN pcusuari u ON u.codusur = k.codusur
LEFT JOIN positivados p ON p.codusur = k.codusur
```

> **Obs:** Carteira definida pelo RCA titular (CODUSUR1); há CODUSUR2/3 no cadastro se a empresa usar múltiplos RCAs por cliente. **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` no CTE de positivados — venda cancelada não pode positivar (consistente com VEN-05).

#### DIM-04 — Prospecção — novos clientes por mês e RCA  `[validado]`

```sql
SELECT TRUNC(c.dtcadastro,'MM') AS mes, c.codusur1, COUNT(*) AS novos_clientes
FROM pcclient c
WHERE c.dtcadastro BETWEEN :dt_ini AND :dt_fim
GROUP BY TRUNC(c.dtcadastro,'MM'), c.codusur1
ORDER BY 1, 2
```

> **Obs:** DTCADASTRO confirmada (rótulo 'Data e Hora de Cadastro' — truncar para data).

#### DIM-05 — Faturamento pela hierarquia de produto (departamento → seção)  `[validado]`

```sql
SELECT d.descricao AS departamento, s.descricao AS secao,
       SUM(m.qt * m.punit) AS faturamento
FROM pcmov m
JOIN pcprodut p ON p.codprod = m.codprod
JOIN pcsecao  s ON s.codsec  = p.codsec
JOIN pcdepto  d ON d.codepto = s.codepto
WHERE m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND m.codfilial = :codfilial
  AND m.codoper = 'S'
  AND m.dtcancel IS NULL
GROUP BY d.descricao, s.descricao
ORDER BY faturamento DESC
```

> **Obs:** Hierarquia confirmada no dicionário: PCPRODUT.CODSEC → PCSECAO.CODEPTO → PCDEPTO. Usar CODEPTO da seção (não o do produto) evita divergência entre os dois caminhos. **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — itens cancelados não entram no faturamento.

#### DIM-06 — Faturamento pela hierarquia comercial (supervisor → RCA)  `[validado]`

```sql
SELECT sv.nome AS supervisor, u.nome AS rca,
       SUM(m.qt * m.punit) AS faturamento
FROM pcmov m
JOIN pcusuari u  ON u.codusur = m.codusur
LEFT JOIN pcsuperv sv ON sv.codsupervisor = u.codsupervisor
WHERE m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND m.codfilial = :codfilial
  AND m.codoper = 'S'
  AND m.dtcancel IS NULL
GROUP BY sv.nome, u.nome
ORDER BY faturamento DESC
```

> **Obs:** LEFT JOIN porque RCA pode estar sem supervisor. PCSUPERV tem só 2 linhas — verificar preenchimento (pendência). **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — itens cancelados não entram no faturamento.

#### DIM-07 — Faturamento por praça e região (hierarquia do cliente)  `[validado]`

```sql
SELECT NVL(r.regiao,'(sem região)') AS regiao,
       NVL(pr.praca,'(sem praça)')  AS praca,
       SUM(m.qt * m.punit)          AS faturamento
FROM pcmov m
JOIN pcclient c  ON c.codcli = m.codcli
LEFT JOIN pcpraca  pr ON pr.codpraca = c.codpraca
LEFT JOIN pcregiao r  ON r.numregiao = pr.numregiao
WHERE m.dtmov BETWEEN :dt_ini AND :dt_fim
  AND m.codfilial = :codfilial
  AND m.codoper = 'S'
  AND m.dtcancel IS NULL
GROUP BY r.regiao, pr.praca
ORDER BY faturamento DESC
```

> **Obs:** PCPRACA.NUMREGIAO e PCREGIAO.REGIAO confirmadas; rota disponível via PCPRACA.ROTA → PCROTAEXP. **Correção do verificador (2026-07-16):** adicionado `AND m.dtcancel IS NULL` — itens cancelados não entram no faturamento.

#### DIM-08 — Clientes inativos na carteira (recência)  `[validado]`

```sql
SELECT c.codusur1,
       COUNT(*) AS clientes_ativos_cadastro,
       SUM(CASE WHEN c.dtultcomp IS NULL
                  OR c.dtultcomp < TRUNC(SYSDATE) - :dias_inatividade
                THEN 1 ELSE 0 END) AS clientes_inativos
FROM pcclient c
WHERE c.dtexclusao IS NULL
GROUP BY c.codusur1
```

> **Obs:** DTULTCOMP é mantida pelo faturamento do Winthor; conferir se está atualizada comparando com MAX(PCMOV.DTMOV) por cliente (pendência).

#### DIM-09 — Qualidade de cadastro das dimensões (completude)  `[validado]`

```sql
SELECT 'PRODUTO' AS dim, COUNT(*) AS total,
       SUM(CASE WHEN p.codmarca IS NULL THEN 1 ELSE 0 END) AS sem_marca,
       SUM(CASE WHEN p.codsec   IS NULL THEN 1 ELSE 0 END) AS sem_secao,
       SUM(CASE WHEN p.nbm      IS NULL THEN 1 ELSE 0 END) AS sem_ncm
FROM pcprodut p WHERE p.dtexclusao IS NULL
UNION ALL
SELECT 'CLIENTE', COUNT(*),
       SUM(CASE WHEN c.codpraca  IS NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN c.codatv1   IS NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN c.codcidade IS NULL THEN 1 ELSE 0 END)
FROM pcclient c WHERE c.dtexclusao IS NULL
```

> **Obs:** Todas as colunas confirmadas no dicionário. Publicar como painel de governança de dados, não como KPI de negócio.
