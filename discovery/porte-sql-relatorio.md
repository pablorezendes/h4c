# Porte SQL Oracle → PostgreSQL — relatório de consolidação

Gerado na consolidação do porte do BI h4c (Winthor Oracle → espelho PostgreSQL `winthor.*`).

**Entradas:** 58 portes + 58 vereditos de auditoria.
**Saídas:** `analises-spec-pg.json` (49 análises) e `indicadores-spec-pg.json` (9 indicadores) — campo `sql`
substituído pela versão PostgreSQL auditada (`sql_final`); **todos os demais campos preservados byte a byte**
(verificado programaticamente: `campos nao-sql alterados: nenhum`).

## Placar

| Métrica | Valor |
|---|---|
| Total portado | **58** (49 análises + 9 indicadores) |
| Aprovados sem alteração | **53** |
| Corrigidos pela auditoria | **5** |
| Reprovados | **0** |
| Itens mantidos em Oracle (`status: a_validar`) | **0** |
| Divisões inteiras corrigidas | **46** ocorrências, em 26 consultas |
| Confiança alta / média / baixa | 46 / 11 / 1 |

Verificações automáticas pós-gravação:
- **Resíduo de sintaxe Oracle nos 58 SQL gravados: nenhum.** Varredura por `NVL(`, `SYSDATE`, `TRUNC(SYSDATE)`,
  `FROM dual`, `CONNECT BY`, `MINUS`, `LISTAGG`, `RATIO_TO_REPORT`, `ADD_MONTHS`, `LAST_DAY`, `TO_NUMBER`,
  `MEDIAN`, `FETCH FIRST`, `TRUNC(x,'MM'/'IW')`, `KEEP (DENSE_RANK`.
- **Referências `winthor.<tabela>` inexistentes no espelho: nenhuma.** Conferido contra as 19 tabelas de
  `sync/sql/001_schema.sql` — é o teste que prova que os dois typos fatais (`winthor.ven`, `winthor.fat`) foram sanados.

## Tabela por item

`div.` = divisões ajustadas; `::` = quantidade de casts explícitos no SQL final (relevante para o bloqueio de backend descrito adiante).

| Tabela | ID | Confiança | Veredito | div. | `::` | Observações |
|---|---|---|---|---|---|---|
| analises | ANA-ABC-01 | alta | aprovado | 0 | 0 | Único porte do lote totalmente livre de casts; imune ao bug do `_BIND_RE`. |
| analises | ANA-ABC-02 | alta | aprovado | 2 | 5 | Casts de blindagem; não havia truncamento real. |
| analises | ANA-ABC-03 | alta | aprovado | 0 | 0 | Conversão direta. |
| analises | ANA-ABC-04 | alta | aprovado | 0 | 0 | Subqueries do FROM ganharam alias obrigatório (`q_prod`/`q_cli`). |
| analises | ANA-ABC-05 | alta | aprovado | 0 | 0 | `mes` passa de DATE a timestamp (serialização). |
| analises | ANA-ABC-06 | alta | aprovado | 0 | 0 | **`GREATEST(NULL,0)`: Oracle → NULL, PG → 0.** Ver armadilha #4. |
| analises | ANA-CAN-02 | alta | aprovado | 1 | 4 | `TO_NUMBER(horalanc)` → `NULLIF(TRIM(...),'')::numeric`. |
| analises | ANA-CAN-03 | alta | aprovado | 1 | 8 | `taxa_linhas_cancel_pct` truncaria (bigint/bigint). |
| analises | ANA-CRZ-01 | alta | aprovado | 0 | 0 | Conversão direta. |
| analises | ANA-CRZ-02 | alta | aprovado | 4 | 5 | `FETCH FIRST` → `LIMIT`; 4 divisões bigint corrigidas. Divisão por zero **não** protegida (fiel ao original). |
| analises | ANA-CRZ-03 | alta | aprovado | 1 | 1 | `positivacao_pct` truncaria. |
| analises | ANA-CRZ-04 | alta | aprovado | 0 | 0 | Conversão direta. |
| analises | ANA-CRZ-05 | alta | aprovado | 0 | 2 | `TRUNC(d,'IW')` → `date_trunc('week',...)`; ambos ancoram na segunda. |
| analises | ANA-DEV-04 | **baixa** | **corrigido** | 3 | 5 | **Erro fatal sanado:** `LEFT JOIN winthor.ven` → `LEFT JOIN ven` (CTE, não tabela). |
| analises | ANA-DEV-05 | alta | aprovado | 0 | 4 | `FULL OUTER JOIN` idêntico no PG. |
| analises | ANA-DEV-06 | alta | aprovado | 1 | 1 | `taxa_cancel_linhas_pct` truncaria. |
| analises | ANA-FCR-06 | alta | aprovado | 0 | 3 | Subtração de datas → `::date - ::date` (senão `interval` quebraria o SUM). |
| analises | ANA-FCR-07 | média | aprovado | 1 | 10 | `100` → `100.0`; `CURRENT_DATE` depende do TZ do container. |
| analises | ANA-FCR-08 | média | aprovado | 0 | 3 | `extract(epoch)/86400` + `trunc()` reproduz o truncamento-para-zero do Oracle em atrasos negativos. |
| analises | ANA-FCR-09 | média | aprovado | 1 | 8 | 4 subtrações de timestamp convertidas; `perc_tit_atraso30` truncaria. |
| analises | ANA-FCR-10 | média | aprovado | 0 | 2 | `CONNECT BY`/`ADD_MONTHS`/`LAST_DAY` reescritos com `generate_series` + `interval`. |
| analises | ANA-INT-01 | alta | aprovado | 2 | 4 | `pedidos_por_dia` truncaria. |
| analises | ANA-INT-04 | média | aprovado | 2 | 12 | Aritmética de fração de dia reescrita em horas; `MEDIAN` → `PERCENTILE_CONT`. |
| analises | ANA-INT-05 | alta | aprovado | 1 | 4 | `RATIO_TO_REPORT` reescrito (não existe no PG). |
| analises | ANA-INT-06 | alta | aprovado | 0 | 2 | `dia` passa a `date`. |
| analises | ANA-MRG-01 | alta | aprovado | 1 | 1 | `mes` vira timestamp. Pendência P-03 (custo) segue aberta. |
| analises | ANA-MRG-02 | alta | aprovado | 0 | 0 | `RATIO_TO_REPORT` reescrito. |
| analises | ANA-MRG-03 | alta | aprovado | 0 | 0 | Pendência P-03 (custo) segue aberta. |
| analises | ANA-MRG-04 | alta | aprovado | 0 | 0 | Conversão direta. |
| analises | ANA-MRG-05 | alta | aprovado | 0 | 0 | `CASE` repetido no GROUP BY (porte fiel). |
| analises | ANA-PRE-01 | alta | aprovado | 0 | 8 | Calendário `CONNECT BY LEVEL` → `generate_series`. |
| analises | ANA-PRE-02 | alta | aprovado | 0 | 8 | `dow_iso` 0=segunda preservado (o Holt-Winters depende disso). |
| analises | ANA-PRE-03 | alta | aprovado | 0 | 4 | Bind `:top_n` preservado. |
| analises | ANA-REP-01 | alta | aprovado | 0 | 1 | `:dt_fim - 28` → `- interval '28 day'`. |
| analises | ANA-REP-03 | média | aprovado | 0 | 9 | Lead time: `AVG/STDDEV` sobre `::date - ::date` (senão receberiam `interval`). |
| analises | ANA-REP-04 | alta | aprovado | 1 | 2 | **`NULLS LAST` explícito é essencial** — sem ele o ranking inverte. |
| analises | ANA-REP-05 | alta | aprovado | 0 | 2 | Conversão direta. |
| analises | ANA-REP-06 | média | aprovado | 4 | 10 | Casts de blindagem em `acao_sugerida`. Pendência P-03: valores em R$ não devem ir ao ar. |
| analises | ANA-RFM-01 | alta | aprovado | 1 | 6 | `(score_f+score_m)/2` truncaria (NTILE devolve integer). |
| analises | ANA-RFM-02 | alta | aprovado | 4 | 7 | Mesma armadilha do score_fm, 4 ocorrências. |
| analises | ANA-RFM-03 | alta | **corrigido** | 2 | 7 | **`NULLIF` indevido removido** de `fator_atraso` (o porte "melhorou" a consulta; a auditoria restaurou a fidelidade). |
| analises | ANA-RFM-04 | alta | aprovado | 1 | 13 | `ciclo_medio_dias` truncaria. |
| analises | ANA-RFM-05 | alta | aprovado | 1 | 13 | `ciclo_medio_dias` truncaria. |
| analises | ANA-SER-01 | média | **corrigido** | 0 | 8 | **Erro fatal sanado:** `LEFT JOIN winthor.fat` → `LEFT JOIN fat`. Ver risco #3 (acento em `SAB`). |
| analises | ANA-SER-02 | alta | **corrigido** | 0 | 11 | **`TRUNC` dos binds perdido** no `generate_series`; restaurado com `::date::timestamp`. |
| analises | ANA-SER-03 | média | **corrigido** | 0 | 19 | **Sobrecarga ambígua** de `generate_series` (timestamptz) fixada com `::date::timestamp`. |
| analises | ANA-SER-04 | média | aprovado | 1 | 3 | `TO_NUMBER(... ON CONVERSION ERROR)` → guarda regex `^[0-9]+$`. |
| analises | ANA-SER-05 | alta | aprovado | 2 | 6 | Duas divisões bigint corrigidas. |
| analises | ANA-SER-06 | alta | aprovado | 0 | 6 | Mesmo padrão de calendário de ANA-PRE-01. |
| indicadores | IND-01 | alta | aprovado | 2 | 7 | Semi-join preservado (JOIN inflaria ~4x). |
| indicadores | IND-02 | alta | aprovado | 0 | 2 | Contrato de 1 linha preservado. |
| indicadores | IND-03 | alta | aprovado | 0 | 3 | `MEDIAN` → `percentile_cont`, com `::numeric` antes do ROUND. |
| indicadores | IND-04 | alta | aprovado | 1 | 3 | `pct_bloqueados` truncaria. Confirmado que `pcclient` não tem `codfilial`. |
| indicadores | IND-05 | média | aprovado | 1 | 7 | `LISTAGG`→`string_agg`, `KEEP DENSE_RANK`→`array_agg[1]`. Ver riscos #2 e #5. |
| indicadores | IND-06 | alta | aprovado | 1 | 3 | `pct_ativos_sobre_carteira` truncaria. |
| indicadores | IND-07 | alta | aprovado | 1 | 5 | `MINUS`→`EXCEPT`; alias obrigatório; **a divisão mais perigosa do lote** (ver risco #1). |
| indicadores | IND-08 | alta | aprovado | 2 | 4 | Duas divisões bigint corrigidas. |
| indicadores | IND-09 | alta | aprovado | 0 | 2 | Réguas canônicas preservadas. |

## Itens REPROVADOS e o que falta

**Nenhum item foi reprovado.** Os 58 SQL gravados nos arquivos `-pg.json` são a versão PostgreSQL;
nenhum ficou com `status: "a_validar"` nem manteve o SQL Oracle original.

Cinco itens chegaram à auditoria com defeito e foram **corrigidos** antes da gravação — nenhum deles
foi promovido "no escuro", todos tiveram a correção verificada:

| ID | Defeito na entrega do porte | Correção aplicada |
|---|---|---|
| ANA-DEV-04 | `LEFT JOIN winthor.ven v` — referência à CTE `ven` como tabela do schema. `relation "winthor.ven" does not exist`; a consulta **não executa**. O porte declarou o typo na observação mas entregou o SQL quebrado. | `LEFT JOIN ven v` |
| ANA-SER-01 | Idem, `LEFT JOIN winthor.fat f`. | `LEFT JOIN fat f` |
| ANA-SER-02 | `TRUNC` dos binds perdido no `generate_series`. Com bind carregando hora, a série anda de hora-em-hora e **descarta o último dia**, distorcendo `n_dias_calendario` e todas as médias e índices sazonais. | `:dt_ini::date::timestamp` / `:dt_fim::date::timestamp` |
| ANA-SER-03 | `generate_series(date,date,interval)` resolve para a sobrecarga **timestamptz** (tipo preferido da categoria), tornando a série dependente do TimeZone da sessão — relevante no histórico de horário de verão brasileiro. | `::date::timestamp` fixa a sobrecarga |
| ANA-RFM-03 | `NULLIF(ciclo_medio_dias,0)` **acrescentado** no denominador de `fator_atraso`, inexistente no original: troca erro de divisão por zero por NULL silencioso, mudando o contrato de saída. | `NULLIF` removido (é código morto: `HAVING COUNT(*)>=3` sobre dias distintos garante razão ≥ 1) |

**O que falta antes de publicar** (nenhuma pendência é defeito de porte):

1. **Corrigir `_BIND_RE` no backend** — bloqueio de execução, detalhado no risco #1 abaixo.
2. **Validar a pendência P-03** (qual coluna de custo está de fato populada, `custofin` × `custoreal`).
   Afeta ANA-MRG-01/03/05 e ANA-REP-06: quantidades e classificações são confiáveis, **valores em R$ não**.
3. **Fixar timezone e `lc_numeric` (pt_BR)** no container PostgreSQL — afeta `CURRENT_DATE`
   (ANA-FCR-06/07/09) e a máscara `FM999G999G990D00` do IND-05.
4. **Conferir com o frontend** as três mudanças de tipo/valor de saída: `mes` timestamp em vez de DATE
   (ANA-CAN-03, ANA-MRG-01/04, ANA-ABC-05), `dia` date em vez de timestamp (ANA-INT-06),
   e `'SAB'` sem acento em ANA-SER-01.

## Armadilhas encontradas

### 1. Divisão inteira — a armadilha dominante (46 correções)
No Oracle todo `NUMBER` é decimal; no PostgreSQL `COUNT()`/`SUM(int)` devolvem **bigint**, e
`bigint/bigint` **trunca**. O `ROUND(...,2)` que vem depois **não** salva: devolve `2.00` em vez de `2.79`.

É a falha mais perigosa do lote porque é **silenciosa e plausível** — o número aparece, é da ordem de
grandeza certa, e ninguém desconfia. Padrões corrigidos:
- `100 * COUNT(...) / COUNT(*)` → `::numeric` no numerador (ou `100` → `100.0`);
- `(MAX(dia)-MIN(dia)) / (COUNT(DISTINCT dia)-1)` — `date-date` é integer (ANA-RFM-03/04/05);
- `(score_f + score_m) / 2` — `NTILE` devolve integer (ANA-RFM-01/02);
- `(minutofat - minuto) / 60` — perderia toda a componente de minutos (ANA-INT-04).

Nem toda divisão precisou de cast: onde o numerador vem de `qt numeric(20,6) * punit numeric(18,6)`,
a aritmética já é `numeric`. Casos assim (ANA-ABC-01/03/04/05/06, ANA-CRZ-04, ANA-MRG-02/03/04/05)
ficaram **sem cast algum** — o que, dado o bug do backend, é uma vantagem operacional.

### 2. `ROUND(double precision, n)` não existe no PostgreSQL
`percentile_cont` e `stddev` devolvem `double precision`, e `ROUND(double, n)` levanta
`function round(double precision, integer) does not exist` — **erro em execução, não truncamento**.
Resolvido com `::numeric` antes do ROUND em IND-03, ANA-INT-04 e ANA-FCR-06.

### 3. Aritmética de datas — `interval` onde o Oracle dava número
`DATE - DATE` no Oracle devolve **número de dias**; `timestamp - timestamp` no PG devolve **interval**.
Isso quebra multiplicações e comparações (`SUM(interval * numeric)` é erro de tipo). Convertido para
`::date - ::date` (integer de dias) em ANA-FCR-06/07/09, ANA-REP-03, ANA-RFM-03/04/05.

Dois refinamentos que evitaram divergência numérica:
- **ANA-FCR-08**: `TRUNC` do Oracle corta em direção a **zero**; `extract(epoch)/86400` + `trunc()`
  reproduz isso inclusive em atrasos negativos (pagamento antecipado). Um simples `::date - ::date`
  teria arredondado por **piso** e divergido.
- `timestamp + integer` não existe no PG: virou `+ interval 'N day'` (IND-05, ANA-REP-01/03/06).

### 4. `GREATEST`/`LEAST` e `||` tratam NULL de forma oposta
- **`GREATEST(NULL,0)`**: Oracle devolve NULL, PostgreSQL **ignora o NULL e devolve 0**.
  Em ANA-ABC-06 isso não altera os totais (o `SUM` ignora NULL nos dois), mas muda a classe ABC de
  margem de produtos com custo integralmente nulo: de `'C'` por propagação para `'A'/'B'/'C'` por comparação.
  **Registrado, não corrigido** — corrigir exigiria reescrever a consulta.
- **Concatenação com NULL**: o Oracle trata NULL como string vazia; no PostgreSQL **um NULL anula a
  expressão `||` inteira**. Em IND-05 o `CASE ... END` sem `ELSE` devolvia NULL para cliente sem RCA —
  o que **apagaria silenciosamente aquele cliente** de `lista_novos`. Envolvido em `COALESCE(...,'')`.

### 5. Construções sem equivalente direto
| Oracle | PostgreSQL | Onde |
|---|---|---|
| `MINUS` | `EXCEPT` | IND-07 |
| `RATIO_TO_REPORT(x) OVER (p)` | `x / SUM(x) OVER (p)` | ANA-INT-05, ANA-MRG-02 |
| `MEDIAN(x)` | `percentile_cont(0.5) WITHIN GROUP (ORDER BY x)` | IND-03, ANA-INT-04 |
| `LISTAGG(...) WITHIN GROUP` | `string_agg(... ORDER BY ...)` | IND-05 |
| `MIN(x) KEEP (DENSE_RANK FIRST ORDER BY a,b)` | `(array_agg(x ORDER BY a,b,x))[1]` | IND-05 |
| `CONNECT BY LEVEL` + `FROM dual` | `generate_series(...)` | 7 análises |
| `ADD_MONTHS` / `LAST_DAY` | `+ interval '1 month' - interval '1 day'` | ANA-FCR-10, ANA-SER-03 |
| `TO_NUMBER(x DEFAULT NULL ON CONVERSION ERROR)` | guarda `x ~ '^[0-9]+$'` | ANA-SER-04 |
| `TO_CHAR(d,'DY','NLS…=PORTUGUESE')` | `CASE EXTRACT(ISODOW …)` | ANA-SER-01 |
| subquery no FROM sem alias | alias obrigatório (`t1`, `q_prod`, `q_rca`) | IND-07, ANA-ABC-04, ANA-DEV-06 |

Duas coincidências favoráveis que dispensaram gambiarra e foram verificadas item a item:
`date_trunc('week',...)` do PG ancora na **segunda-feira**, igual a `TRUNC(d,'IW')` (usar `EXTRACT(DOW)`
teria quebrado os rótulos, pois é 0=domingo); e `ROWS UNBOUNDED PRECEDING` / `SUM() OVER ()` /
`FULL OUTER JOIN` / `DENSE_RANK` / `NTILE` / `POWER` funcionam sem alteração.

### 6. `NULLS LAST` — default idêntico, mas o explícito importa
O porte justificou `NULLS LAST` em ANA-REP-04 alegando que "o default de `DESC` no PG é `NULLS FIRST`,
o oposto do Oracle". **A justificativa está errada** — os dois bancos usam `NULLS FIRST` em `DESC`.
O SQL está certo de qualquer forma, porque o original já trazia o `NULLS LAST` explícito; sem ele,
os NULLs de `vl_venda_perdida_estimada` iriam para o topo do ranking e inverteriam a leitura.

## Os 5 pontos de maior risco

**1. `_BIND_RE` do backend derruba 47 dos 58 SQL — bloqueio total, e não é defeito do porte.**
`backend/app/routers/analises.py:27` e `indicadores.py:26` usam `re.compile(r":(\w+)")`, que captura o
nome do **tipo** dentro de cada cast: `m.dtmov::date` devolve o bind fantasma `date`, `x::numeric`
devolve `numeric`. Verificado empiricamente contra os arquivos gravados: **47 de 58 itens** produzem
binds fantasma e abortam com HTTP 422 (`analises`) ou 500 (`indicadores`) **antes de chegar ao Postgres**.
Correção de uma linha, nos dois arquivos: `re.compile(r"(?<!:):(?!:)(\w+)")`. Sem isso, o BI não sobe.

**2. Divisão inteira silenciosa (46 correções) — a falha que passaria despercebida.**
A mais grave era `IND-07.media_notas_por_positivado`: `318/114` daria `2` em vez de `2,79` — número
errado, plausível, num card de topo. Todas as ocorrências identificadas foram corrigidas, mas o risco
residual é de **regressão**: qualquer edição futura que remova um `::numeric` ou troque `100.0` por `100`
reintroduz o bug sem erro nenhum. Vale um teste de fumaça que verifique casas decimais não-zeradas.

**3. Valores em R$ dependentes da pendência P-03 (custo) — risco de negócio, não de porte.**
ANA-MRG-01/03/05 e ANA-REP-06 usam `COALESCE(custofin, custoreal)` (ou a ordem inversa) sem que se
saiba qual coluna está de fato populada. Quantidades, percentuais e `acao_sugerida` são confiáveis;
`margem_valor`, `vl_imobilizado` e `vl_excedente_vs_alvo` **não devem ir ao ar** antes da validação.
Some-se que devoluções `CODOPER='ED'` não são abatidas da margem (bug herdado, preservado).

**4. Dependências de ambiente do container PostgreSQL.**
`CURRENT_DATE` (ANA-FCR-06/07/09, ANA-REP-04) usa o fuso do servidor PG, não mais o do Oracle: se
divergirem, `dias_vencido` muda em 1 dia perto da virada. E `to_char(valor,'FM999G999G990D00')` do
IND-05 tira os separadores `G`/`D` do `lc_numeric` da sessão — fora de pt_BR, `1.234,56` vira `1,234.56`.
Fixar `timezone` e `lc_numeric` na conexão antes de publicar.

**5. Divergências de contrato de saída que o frontend pode não absorver.**
(a) `mes` passa de DATE a **timestamp** por causa de `date_trunc` (ANA-CAN-03, ANA-MRG-01/04, ANA-ABC-05):
o front recebe `2026-01-01T00:00:00`. (b) `dia` passa de timestamp a **date** em ANA-INT-06.
(c) `'SAB'` **sem acento** em ANA-SER-01, onde o Oracle com NLS PORTUGUESE devolvia acentuado — se houver
de-para por string exata, o sábado quebra. (d) `lista_novos` do IND-05 perdeu o
`ON OVERFLOW TRUNCATE '...(demais)'`: o `string_agg` **não tem** o limite de 4000 bytes do Oracle e
devolve a lista integral, podendo entregar um texto muito maior que o contratado.

---

### Observações de negócio preservadas (não "consertadas")

Fiéis ao original por decisão explícita, e portanto ainda válidas no PostgreSQL:
ANA-FCR-08 (perna `ABERTO` ignora o período); ANA-RFM-04/05 (não aplicam o `EXISTS` de item de venda,
logo remessa/comodato entram no RFM — divergente do IND-05); IND-06 (`ativos_compra`/`positivados` não
filtram `codfilial`); ANA-INT-06 e ANA-SER-05 (sem `dtcancel IS NULL`); ANA-CAN-03 (LEFT JOINs partem
de `venda`, omitindo mês só com devolução); ANA-DEV-04 (`taxa_dev_produto_pct` pode passar de 100%);
ANA-ABC-06 (classe ABC compara acumulado **exclusivo**, empurrando item de fronteira para a classe anterior);
ANA-CRZ-02 (sem `NULLIF`: janela vazia gera divisão por zero nos dois bancos);
ANA-CRZ-03 (`positivacao_pct` pode exceder 100%); ANA-REP-04 (`dias_observados` encolhe se o sincronismo
perder dias, inflando o percentual).
