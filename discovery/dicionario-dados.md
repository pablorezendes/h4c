# Dicionário de Dados — BI Winthor h4c
- **Data:** 2026-07-16
- **Fonte:** Oracle `U_CMT9GE_WI` (discovery offline — inventário, dicionário Winthor, PKs/FKs e contagens; nenhuma consulta adicional à base foi executada)
- **Período de dados:** out/2025 – jul/2026
- **Empresa:** HYGIENE FOR CARE (h4c) — ERP TOTVS Winthor

Organizado por módulo de negócio. Para cada módulo: resumo do discovery, inventário de tabelas e, para as tabelas-fato/dimensões principais, as colunas-chave documentadas (tipo, rótulo oficial do dicionário Winthor quando existe, papel na modelagem e marcação de PII/LGPD). Ao final: dimensões conformadas, tabelas de negócio não cobertas e as pendências de validação consolidadas.

**Convenções:** `PII = sim` exige mascaramento/restrição na camada semântica (LGPD). Rótulo `—` ou `(sem rótulo)` = o dicionário nativo do Winthor não documenta a coluna nesta base. A filial `99` é consolidadora ('TODAS FILIAIS') e deve ser excluída de todas as análises.

## Módulos
- [VENDAS-FATURAMENTO](#vendas-faturamento) — 29 tabelas, 9 KPIs
- [ESTOQUE-PRODUTOS](#estoque-produtos) — 17 tabelas, 9 KPIs
- [COMPRAS-SUPRIMENTOS](#compras-suprimentos) — 16 tabelas, 8 KPIs
- [FINANCEIRO-CR](#financeiro-cr) — 10 tabelas, 5 KPIs
- [FINANCEIRO-PCFINANC](#financeiro-pcfinanc) — 15 tabelas, 12 KPIs
- [DIMENSOES-CONFORMADAS](#dimensoes-conformadas) — 26 tabelas, 9 KPIs

---

## VENDAS-FATURAMENTO

O módulo está bem populado e permite separar claramente venda pedida (PCPEDC 1.648 pedidos / PCPEDI 7.615 itens, POSICAO F/C/L) de venda faturada (PCNFSAID 1.920 NFs / PCMOV 12.243 itens de movimentação). Descoberta central: PCMOV NÃO possui coluna PVENDA — o preço praticado é PUNIT (existem apenas PVENDAEMB, PVENDABASE e PVENDA1); e as colunas de custo existentes são CUSTOREAL, CUSTOFIN, CUSTOCONT, CUSTOULTENT e CUSTOREP (não existe CUSTOULT simples). PCNFSAID confirma VLTOTAL e DTSAIDA, além de DTCANCEL para excluir canceladas, e PCPEDI não tem CODFILIAL (a filial vem do cabeçalho PCPEDC). Para faturamento líquido de impostos, PCMOVIMPOSTOS está vazia, mas PCCONSOLIDARECEITA (2.022 linhas, 1 por NF) traz VLICMS/VLPIS/VLCOFINS/VLST/VLIPI. Agregados nativos PCCONSOLIDAMES e PCAUXVENDA servem de conferência (incluindo devoluções), e PCNFCAN/PCNFCANITEM registram os cancelamentos. Resta validar em base o significado exato dos sufixos de CODOPER (S/SB/SD/SR/ED/ER/EB...) — decodificável via PCCFO, que tem a própria coluna CODOPER — e qual coluna de custo está efetivamente populada.

### Tabelas do módulo

| TABELA | TIPO | LINHAS | GRÃO | DESCRIÇÃO |
|---|---|---:|---|---|
| **PCPEDC** | fato | 1.648 | 1 linha por pedido de venda (PK NUMPED) | Cabeçalho do pedido de venda (venda PEDIDA). POSICAO validada: F=1564 faturado, C=100 cancelado, L=2 liberado. Liga à NF via NUMNOTA/DTFAT. |
| **PCPEDI** | fato | 7.615 | 1 linha por item de pedido (PK NUMPED+CODPROD+NUMSEQ) | Itens do pedido de venda. ATENÇÃO: não tem CODFILIAL, NUMNOTA nem DTFAT — obter via join com PCPEDC. Tem PVENDA (ao contrário de PCMOV). |
| **PCNFSAID** | fato | 1.920 | 1 linha por nota fiscal de saída (PK NUMTRANSVENDA) | Cabeçalho das NFs de saída (venda FATURADA no nível nota). Confirmados VLTOTAL e DTSAIDA. DTCANCEL IS NULL exclui canceladas. Inclui também saídas não-venda (remessas, devoluções a fornecedor) — filtrar pela operação via PCMOV/CODFISCAL. |
| **PCMOV** | fato | 12.243 | 1 linha por item de movimentação de estoque/faturamento (chave lógica NUMTRANSITEM; PK não declarada no banco — confirmada pelo 1:1 com PCMOVCOMPLE) | Fato central de faturamento no nível item. Domínio CODOPER validado por contagem: S=9309, E=1738, SR=898, ED=253, ER=107, EB=72, SD=42, SP=41, EP=41, SB=8, EA=7, EI=7, SM=5 (S*=saída, E*=entrada; sufixos a decodificar via PCCFO). NÃO existe PVENDA — usar PUNIT. Custos existentes: CUSTOREAL, CUSTOFIN, CUSTOCONT, CUSTOULTENT, CUSTOREP (não há CUSTOULT). |
| **PCMOVCOMPLE** | apoio | 11.874 | 1 linha por item de movimentação (PK NUMTRANSITEM, 1:1 com PCMOV) | Complemento fiscal/tributário do item de PCMOV. Traz VLICMS do item (que não existe em PCMOV), retenções (PIS/COFINS/IR/CSLL), DTREGISTRO e flag BONIFIC. |
| **PCMOVHISTORICO** | log | 12.852 | 1 linha por evento de histórico (PK NUMTRANSHISTORICO) | Histórico/auditoria de movimentações. Não usar como fonte de KPI; útil apenas para rastreabilidade. |
| **PCCONSOLIDAMES** | agregado | 2.828 | 1 linha por TIPO × CODIGO × CODFILIAL × MES × ANO (PK composta) | Consolidação mensal nativa do Winthor de movimentação por entidade (TIPO define se CODIGO é produto/cliente/fornecedor — domínio a validar). Útil para conferência de vendas, compras e devoluções. |
| **PCAUXVENDA** | agregado | 2.980 | 1 linha por MES × ANO × CODFORNEC × CODEPTO × CODSEC × CODSUPERVISOR × CODUSUR (sem PK declarada) | Agregado mensal de venda faturada, bonificação e devolução por fornecedor/departamento/seção/supervisor/RCA. NÃO tem CODFILIAL — provavelmente consolida a empresa toda. Boa fonte de conferência dos KPIs de faturamento e devolução. |
| **PCCONSOLIDARECEITA** | agregado | 2.022 | 1 linha por documento fiscal (PK NUMREGISTRO; NUMTRANSVENDA para saídas, NUMTRANSENT para entradas) | Consolidação fiscal de receita por NF: VLTOTALNOTA e impostos (VLICMS, VLPIS, VLCOFINS, VLST, VLIPI). Substitui a PCMOVIMPOSTOS (vazia nesta base) como fonte de faturamento líquido de impostos. |
| **PCNFCAN** | log | 548 | 1 linha por NF cancelada/denegada (sem PK declarada; chave lógica NUMTRANSVENDA/NUMTRANSENT) | Registro dos cancelamentos de NF com motivo, data e valor. Fonte para KPI operacional de % de cancelamento e para auditar a exclusão de canceladas. |
| **PCNFCANITEM** | log | 1.334 | 1 linha por item de NF cancelada | Itens das NFs canceladas (espelho item a item de PCNFCAN, com QT, PVENDA, PTABELA). |
| **PCNFENT** | fato | 681 | 1 linha por NF de entrada × conta (PK NUMTRANSENT+CODCONT) | Cabeçalho das NFs de entrada. Relevante aqui porque devolução de CLIENTE entra como NF de entrada (PCMOV.CODOPER='ED' aponta NUMTRANSENT). Excluir do faturamento; usar no KPI de devoluções. |
| **PCPEDCFV** | apoio | 916 | 1 linha por pedido do Força de Vendas (PK NUMPEDRCA+CODUSUR+CGCCLI+DTABERTURAPEDPALM) | Espelho dos pedidos captados no Força de Vendas (mobile) antes de virarem PCPEDC (coluna NUMPED liga ao pedido efetivado). Não usar como fonte de KPI de venda — risco de dupla contagem. |
| **PCPEDIFV** | apoio | 3.919 | 1 linha por item de pedido FV (PK NUMPEDRCA+CODUSUR+CGCCLI+DTABERTURAPEDPALM+CODPROD+NUMSEQ) | Itens dos pedidos do Força de Vendas (a tabela-ponte PCPEDIPCPEDIFV, 3.664 linhas, liga item FV ao item PCPEDI). Contém CGCCLI (PII). |
| **PCTABPR** | apoio | 3.487 | 1 linha por região × produto (PK NUMREGIAO+CODPROD) | Tabela de preços vigente por região de venda. Base para análise de aderência preço praticado × tabela (PUNIT/PTABELA). |
| **PCVENDACONSUM** | apoio | 14 | 1 linha por pedido de venda consumidor/balcão (PK NUMPED) | Complemento de vendas a consumidor final (balcão). Volume irrelevante nesta base (14 linhas). |
| **PCCLIENT** | dimensao | 235 | 1 linha por cliente (PK CODCLI) | Dimensão cliente (rótulo Winthor: 'Clientes'). Contém PII de pessoa física e jurídica. |
| **PCPRODUT** | dimensao | 722 | 1 linha por produto (PK CODPROD) | Dimensão produto (rótulo Winthor: 'Produto'). Hierarquia mercadológica via CODEPTO/CODSEC; marca e fornecedor para o mix. |
| **PCUSUARI** | dimensao | 8 | 1 linha por RCA/vendedor (PK CODUSUR) | Dimensão vendedor (rótulo Winthor: 'RCA'). 8 RCAs cadastrados. |
| **PCFILIAL** | dimensao | 2 | 1 linha por filial (PK CODIGO) | Dimensão filial. Atenção: PK chama-se CODIGO (não CODFILIAL). Filial 99 = 'TODAS FILIAIS' (consolidadora) — excluir das análises. |
| **PCSUPERV** | dimensao | 2 | 1 linha por supervisor (PK CODSUPERVISOR) | Dimensão supervisor de vendas. |
| **PCPRACA** | dimensao | 28 | 1 linha por praça (PK CODPRACA) | Dimensão praça de venda (região comercial do cliente). |
| **PCDEPTO** | dimensao | 9 | 1 linha por departamento (PK CODEPTO) | Dimensão departamento de produtos (nível 1 da hierarquia mercadológica). |
| **PCSECAO** | dimensao | 43 | 1 linha por seção (PK CODSEC) | Dimensão seção de produtos (nível 2 da hierarquia mercadológica). |
| **PCMARCA** | dimensao | 31 | 1 linha por marca (PK CODMARCA) | Dimensão marca de produto. |
| **PCFORNEC** | dimensao | 200 | 1 linha por fornecedor (PK CODFORNEC) | Dimensão fornecedor (corte de mix por fornecedor via PCPRODUT.CODFORNEC). Contém CGC/razão social (PII de PJ). |
| **PCPLPAG** | dimensao | 34 | 1 linha por plano de pagamento (PK CODPLPAG) | Dimensão plano de pagamento (prazo da venda). |
| **PCCOB** | dimensao | 54 | 1 linha por tipo de cobrança (PK CODCOB) | Dimensão tipo de cobrança. |
| **PCCFO** | dimensao | 470 | 1 linha por CFOP (PK CODFISCAL) | Cadastro de CFOP (rótulo: 'Código fiscal (CFOP)'). ESSENCIAL: tem a coluna CODOPER (rótulo 'Operação') e CFOPINVERSO ('serve para devolução referente a venda') — é a chave para decodificar os sufixos de PCMOV.CODOPER e isolar CFOPs de venda × devolução × remessa. |

### Colunas-chave documentadas

#### PCPEDC  <sub>(fato; PK: NUMPED)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | PK / nº do pedido | não |
| DATA | DATE | — | data do pedido (eixo temporal da venda pedida) | não |
| CODCLI | NUMBER | — | FK cliente (PCCLIENT) | não |
| CODUSUR | NUMBER | — | FK RCA/vendedor (PCUSUARI) | não |
| CODFILIAL | VARCHAR2(2) | — | FK filial (filtrar 99 = consolidadora) | não |
| POSICAO | VARCHAR2(2) | — | status do pedido: F/C/L (excluir C) | não |
| VLTOTAL | NUMBER | — | medida: valor total pedido | não |
| VLATEND | NUMBER | — | medida: valor atendido/faturado do pedido | não |
| VLTABELA | NUMBER | — | medida: valor a preço de tabela (desconto = VLTABELA-VLTOTAL) | não |
| DTCANCEL | DATE | — | data de cancelamento (NULL = não cancelado) | não |
| DTFAT | DATE | — | data de faturamento do pedido | não |
| NUMNOTA | NUMBER | — | nº da NF gerada | não |
| CONDVENDA | NUMBER | — | condição/tipo de venda (domínio a validar: bonificação etc.) | não |
| CODPLPAG | NUMBER | — | FK plano de pagamento (PCPLPAG) | não |
| CODCOB | VARCHAR2(4) | — | FK cobrança (PCCOB) | não |
| CODSUPERVISOR | NUMBER | — | FK supervisor (PCSUPERV) | não |
| CODPRACA | NUMBER | — | FK praça (PCPRACA) | não |
| ORIGEMPED | VARCHAR2(1) | — | origem do pedido (telemarketing/força de vendas/web) | não |

#### PCPEDI  <sub>(fato; PK: NUMPED, CODPROD, NUMSEQ)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | PK1 / FK PCPEDC | não |
| CODPROD | NUMBER | — | PK2 / FK produto (PCPRODUT) | não |
| NUMSEQ | NUMBER | — | PK3 / sequência do item | não |
| DATA | DATE | — | data do pedido (redundante com PCPEDC.DATA) | não |
| QT | NUMBER | — | medida: quantidade pedida | não |
| QTFALTA | NUMBER | — | medida: quantidade em falta/corte | não |
| PVENDA | NUMBER | — | medida: preço de venda praticado | não |
| PTABELA | NUMBER | — | medida: preço de tabela | não |
| POSICAO | VARCHAR2(2) | — | status do item (espelha PCPEDC) | não |
| VLCUSTOFIN | NUMBER | — | medida: custo financeiro do item | não |
| VLCUSTOREAL | NUMBER | — | medida: custo real do item | não |
| BONIFIC | VARCHAR2(1) | — | flag item bonificado (S/N — validar domínio) | não |
| VLSUBTOTITEM | NUMBER | — | medida: subtotal do item | não |
| CODCLI | NUMBER | — | FK cliente | não |
| CODUSUR | NUMBER | — | FK RCA | não |
| CODFISCAL | NUMBER | — | CFOP do item (FK PCCFO) | não |

#### PCNFSAID  <sub>(fato; PK: NUMTRANSVENDA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSVENDA | NUMBER | — | PK / nº transação de venda (liga a PCMOV, PCPREST, PCCONSOLIDARECEITA) | não |
| NUMNOTA | NUMBER | — | nº da NF | não |
| DTSAIDA | DATE | — | data de saída/faturamento (eixo temporal) | não |
| VLTOTAL | NUMBER | — | medida: valor total da NF | não |
| VLTABELA | NUMBER | — | medida: valor a preço de tabela | não |
| VLDESCONTO | NUMBER | — | medida: desconto total | não |
| VLDEVOLUCAO | NUMBER | — | medida: valor já devolvido da NF | não |
| VLCUSTOREAL | NUMBER | — | medida: custo real total da NF | não |
| VLCUSTOFIN | NUMBER | — | medida: custo financeiro total da NF | não |
| CODCLI | NUMBER | — | FK cliente | não |
| CODUSUR | NUMBER | — | FK RCA | não |
| CODFILIAL | VARCHAR2(2) | — | FK filial | não |
| DTCANCEL | DATE | — | data cancelamento (NULL = válida) | não |
| TIPOVENDA | VARCHAR2(2) | — | tipo de venda (domínio a validar) | não |
| CONDVENDA | NUMBER | — | condição de venda (1=normal, 5=bonificada... validar) | não |
| NUMPED | NUMBER | — | FK pedido (PCPEDC) | não |
| CODFISCAL | NUMBER | — | CFOP predominante (FK PCCFO) | não |
| CHAVENFE | VARCHAR2(45) | — | chave da NF-e | não |
| SITUACAONFE | NUMBER | — | situação da NF-e na SEFAZ | não |
| CLIENTE | VARCHAR2(60) | — | nome/razão social gravado na NF | sim |
| CGC | VARCHAR2(18) | — | CNPJ/CPF do destinatário | sim |
| ENDERECO | VARCHAR2(40) | — | endereço do destinatário | sim |
| CEP | VARCHAR2(10) | — | CEP do destinatário | sim |

#### PCMOV  <sub>(fato; PK: NUMTRANSITEM (lógica))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSITEM | NUMBER | — | identificador único do item de movimentação | não |
| DTMOV | DATE | — | data da movimentação (eixo temporal) | não |
| CODOPER | VARCHAR2(2) | — | código da operação (S=venda; ED=entrada devolução — validar sufixos) | não |
| CODPROD | NUMBER | — | FK produto | não |
| QT | NUMBER | — | medida: quantidade movimentada | não |
| PUNIT | NUMBER | — | medida: preço unitário praticado (substitui o PVENDA do esboço) | não |
| PTABELA | NUMBER | — | medida: preço de tabela | não |
| CODFILIAL | VARCHAR2(2) | — | FK filial | não |
| CODCLI | NUMBER | — | FK cliente | não |
| CODUSUR | NUMBER | — | FK RCA | não |
| CODFORNEC | NUMBER | — | FK fornecedor (movimentos de entrada) | não |
| NUMNOTA | NUMBER | — | nº da NF | não |
| NUMPED | NUMBER | — | FK pedido (PCPEDC) | não |
| NUMTRANSVENDA | NUMBER | — | FK NF de saída (PCNFSAID) | não |
| NUMTRANSENT | NUMBER | — | FK NF de entrada (PCNFENT) — devoluções de cliente | não |
| CUSTOREAL | NUMBER | — | medida: custo real unitário | não |
| CUSTOFIN | NUMBER | — | medida: custo financeiro unitário | não |
| CUSTOCONT | NUMBER | — | medida: custo contábil unitário | não |
| CUSTOULTENT | NUMBER | — | medida: custo última entrada | não |
| VLDESCONTO | NUMBER | — | medida: desconto do item | não |
| VLBONIFIC | NUMBER | — | medida: valor bonificado | não |
| ST | NUMBER | — | medida: valor de ICMS-ST do item | não |
| VLIPI | NUMBER | — | medida: valor de IPI | não |
| VLPIS | NUMBER | — | medida: valor de PIS | não |
| DTCANCEL | DATE | — | data cancelamento (NULL = válido) | não |
| STATUS | VARCHAR2(2) | — | status do registro (domínio a validar) | não |

#### PCMOVCOMPLE  <sub>(apoio; PK: NUMTRANSITEM)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSITEM | NUMBER | — | PK / FK PCMOV | não |
| VLICMS | NUMBER | — | medida: ICMS do item | não |
| BONIFIC | VARCHAR2(1) | — | flag bonificação | não |
| DTREGISTRO | DATE | — | data de registro | não |

#### PCMOVHISTORICO  <sub>(log; PK: NUMTRANSHISTORICO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSHISTORICO | NUMBER | — | PK | não |

#### PCCONSOLIDAMES  <sub>(agregado; PK: TIPO, CODIGO, CODFILIAL, MES, ANO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| TIPO | VARCHAR2(1) | — | PK1: tipo da entidade consolidada (domínio a validar) | não |
| CODIGO | NUMBER | — | PK2: código da entidade | não |
| CODFILIAL | VARCHAR2(2) | — | PK3: filial | não |
| MES | NUMBER | — | PK4 | não |
| ANO | NUMBER | — | PK5 | não |
| QTVENDA | NUMBER | — | medida: quantidade vendida no mês | não |
| VLVENDA | NUMBER | — | medida: valor vendido no mês | não |
| QTDEVCLIENTE | NUMBER | — | medida: qtde devolvida por clientes | não |
| QTDEVFORNECEDOR | NUMBER | — | medida: qtde devolvida a fornecedores | não |

#### PCAUXVENDA  <sub>(agregado; PK: (nenhuma declarada))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| MES | NUMBER | — | chave temporal | não |
| ANO | NUMBER | — | chave temporal | não |
| CODUSUR | NUMBER | — | FK RCA | não |
| CODEPTO | NUMBER | — | FK departamento | não |
| CODSEC | NUMBER | — | FK seção | não |
| CODFORNEC | NUMBER | — | FK fornecedor | não |
| VLVENDAFATURADA | NUMBER | — | medida: venda faturada no mês | não |
| VLBONIFICACAO | NUMBER | — | medida: bonificações no mês | não |
| VLDEVOLUCAO | NUMBER | — | medida: devoluções no mês | não |

#### PCCONSOLIDARECEITA  <sub>(agregado; PK: NUMREGISTRO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMREGISTRO | NUMBER | — | PK | não |
| NUMTRANSVENDA | NUMBER | — | FK PCNFSAID (preenchida em saídas) | não |
| NUMTRANSENT | NUMBER | — | FK PCNFENT (preenchida em entradas) | não |
| DTMOV | DATE | — | data do movimento | não |
| CODFILIAL | VARCHAR2(2) | — | FK filial | não |
| VLTOTALNOTA | NUMBER | — | medida: valor total da nota | não |
| VLICMS | NUMBER | — | medida: ICMS | não |
| VLPIS | NUMBER | — | medida: PIS | não |
| VLCOFINS | NUMBER | — | medida: COFINS | não |
| VLST | NUMBER | — | medida: ICMS-ST | não |
| VLIPI | NUMBER | — | medida: IPI | não |
| CODFISCAL | NUMBER | — | CFOP (FK PCCFO) | não |

#### PCNFCAN  <sub>(log; PK: (nenhuma declarada))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSVENDA | NUMBER | — | FK NF de saída cancelada | não |
| DATACANC | DATE | — | data do cancelamento | não |
| MOTIVO | VARCHAR2(60) | — | motivo do cancelamento | não |
| VLTOTAL | NUMBER | — | medida: valor da NF cancelada | não |
| POSICAOANTCANCEL | VARCHAR2(2) | — | posição do pedido antes do cancelamento | não |

#### PCNFCANITEM  <sub>(log; PK: (nenhuma declarada))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSVENDA | NUMBER | — | FK NF cancelada | não |
| CODPROD | NUMBER | — | FK produto | não |
| QT | NUMBER | — | medida: quantidade | não |
| PVENDA | NUMBER | — | medida: preço de venda | não |

#### PCNFENT  <sub>(fato; PK: NUMTRANSENT, CODCONT)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | PK1 / transação de entrada | não |
| DTENT | DATE | — | data de entrada | não |
| VLTOTAL | NUMBER | — | medida: valor total da NF de entrada | não |
| TIPODESCARGA | VARCHAR2(1) | — | tipo de descarga (identifica devolução — domínio a validar) | não |
| CODDEVOL | NUMBER | — | código do motivo de devolução | não |
| CODFISCAL | NUMBER | — | CFOP (FK PCCFO) | não |
| DTCANCEL | DATE | — | cancelamento (NULL = válida) | não |

#### PCPEDCFV  <sub>(apoio; PK: NUMPEDRCA, CODUSUR, CGCCLI, DTABERTURAPEDPALM)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPEDRCA | NUMBER | — | PK1: nº pedido no dispositivo do RCA | não |
| CGCCLI | VARCHAR2(18) | — | PK3: CNPJ/CPF do cliente | sim |
| NUMPED | NUMBER | — | FK pedido efetivado (PCPEDC) | não |
| CODFILIAL | VARCHAR2(2) | — | FK filial | não |

#### PCPEDIFV  <sub>(apoio; PK: NUMPEDRCA, CODUSUR, CGCCLI, DTABERTURAPEDPALM, CODPROD, NUMSEQ)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CGCCLI | VARCHAR2(18) | — | PK: CNPJ/CPF do cliente | sim |
| CODPROD | NUMBER | — | FK produto | não |

#### PCTABPR  <sub>(apoio; PK: NUMREGIAO, CODPROD)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMREGIAO | NUMBER | — | PK1 / FK PCREGIAO | não |
| CODPROD | NUMBER | — | PK2 / FK PCPRODUT | não |

#### PCVENDACONSUM  <sub>(apoio; PK: NUMPED)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | PK / FK PCPEDC | não |

#### PCCLIENT  <sub>(dimensao; PK: CODCLI)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCLI | NUMBER | Código | PK | não |
| CLIENTE | VARCHAR2(60) | Cliente | nome/razão social | sim |
| FANTASIA | VARCHAR2(40) | Fantasia | nome fantasia | sim |
| CGCENT | VARCHAR2(18) | CNPJ/CPF | CNPJ/CPF | sim |
| ENDERENT | VARCHAR2(40) | Endereço Comercial | endereço comercial | sim |
| TELENT | VARCHAR2(13) | Telefone Comercial | telefone | sim |
| EMAIL | VARCHAR2(100) | E-mail | e-mail | sim |
| MUNICENT | VARCHAR2(15) | Município | município | não |
| ESTENT | VARCHAR2(2) | Estado | UF | não |
| CODUSUR1 | NUMBER | RCA 1 | FK RCA titular da carteira | não |
| CODPRACA | NUMBER | Praça | FK praça | não |
| CODATV1 | NUMBER | Atividade | FK ramo de atividade | não |
| BLOQUEIO | VARCHAR2(1) | Bloqueio | flag de bloqueio (carteira ativa) | não |
| DTCADASTRO | DATE | Data e Hora de Cadastro | data de cadastro (clientes novos/prospecção) | não |

#### PCPRODUT  <sub>(dimensao; PK: CODPROD)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPROD | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2(40) | Descrição | descrição do produto | não |
| CODEPTO | NUMBER | Departamento | FK departamento (PCDEPTO) | não |
| CODSEC | NUMBER | Seção | FK seção (PCSECAO) | não |
| CODFORNEC | NUMBER | Fornecedor | FK fornecedor (PCFORNEC) | não |
| CODMARCA | NUMBER | Marca | FK marca (PCMARCA) | não |
| EMBALAGEM | VARCHAR2(12) | Embalagem | embalagem de venda | não |
| UNIDADE | VARCHAR2(2) | Unidade de venda | unidade de venda | não |
| NBM | VARCHAR2(15) | NCM | NCM fiscal | não |
| OBS2 | VARCHAR2(2) | Fora de linha | flag fora de linha | não |

#### PCUSUARI  <sub>(dimensao; PK: CODUSUR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODUSUR | NUMBER | Código | PK | não |
| NOME | VARCHAR2(40) | Nome | nome do RCA | sim |
| CGC | VARCHAR2(20) | CNPJ | CNPJ do RCA | sim |
| EMAIL | VARCHAR2(100) | E-Mail | e-mail | sim |
| CODSUPERVISOR | NUMBER | Supervisor | FK supervisor (PCSUPERV) | não |
| BLOQUEIO | VARCHAR2(1) | Bloqueio | flag bloqueio | não |

#### PCFILIAL  <sub>(dimensao; PK: CODIGO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODIGO | VARCHAR2 | — | PK (= CODFILIAL nas fatos) | não |

#### PCSUPERV  <sub>(dimensao; PK: CODSUPERVISOR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSUPERVISOR | NUMBER | — | PK | não |

#### PCPRACA  <sub>(dimensao; PK: CODPRACA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPRACA | NUMBER | — | PK | não |

#### PCDEPTO  <sub>(dimensao; PK: CODEPTO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODEPTO | NUMBER | — | PK | não |

#### PCSECAO  <sub>(dimensao; PK: CODSEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSEC | NUMBER | — | PK | não |

#### PCMARCA  <sub>(dimensao; PK: CODMARCA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODMARCA | NUMBER | — | PK | não |

#### PCFORNEC  <sub>(dimensao; PK: CODFORNEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | — | PK | não |

#### PCPLPAG  <sub>(dimensao; PK: CODPLPAG)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPLPAG | NUMBER | — | PK | não |

#### PCCOB  <sub>(dimensao; PK: CODCOB)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCOB | VARCHAR2(4) | — | PK | não |

#### PCCFO  <sub>(dimensao; PK: CODFISCAL)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFISCAL | NUMBER | Código | PK / CFOP | não |
| DESCCFO | VARCHAR2(60) | Descrição | descrição do CFOP | não |
| CODOPER | VARCHAR2(2) | Operação | código de operação associado (decodifica PCMOV.CODOPER) | não |
| CFOPINVERSO | NUMBER | CFOP Inverso | CFOP inverso para devolução de venda | não |

---

## ESTOQUE-PRODUTOS

O módulo está bem populado e é modelável já: PCEST (722 linhas = 1 por produto, snapshot atual por filial+produto) traz posição e custos; PCHISTEST (136.767 linhas, PK CODFILIAL+CODPROD+DATA) é confirmadamente o histórico DIÁRIO de estoque com quantidades e todos os custos — é o ouro para série temporal de valor de estoque e estoque médio (giro) sem depender de reconstrução via PCMOV. PCDTPROD (119.896 linhas) foi decodificada: agregado diário de movimentação por produto/filial (QTVENDA/VLVENDA/QTENT/VLENT/QTDEVOLCLI/QTPERDA + snapshot de QTESTGER e custos no dia), grão CODFILIAL+CODPROD+DTMOV. PCLOGESTOQUE (229.067) e PCLOGPKG_ESTOQUE (146.030) são logs de auditoria (valores antes/depois, programa/usuário) — úteis para rastreio, não para KPI. PCLOTE está VAZIA (sem controle de lote/validade na base). Atenção a dois falsos amigos: PCESTCOM é estorno de comissão (não é estoque) e PCMOV não tem coluna PVENDA (o preço é PUNIT). Todos os 6 KPIs do catálogo foram validados com colunas confirmadas no dicionário, mais 3 KPIs novos habilitados por PCHISTEST/PCDTPROD.

### Tabelas do módulo

| TABELA | TIPO | LINHAS | GRÃO | DESCRIÇÃO |
|---|---|---:|---|---|
| **PCEST** | snapshot | 722 | 1 linha por filial + produto (posição atual — NÃO somar no tempo) | Snapshot da posição atual de estoque por produto/filial: quantidades (geral, contábil, reservada, bloqueada, avariada/indenizada, pendente), custos (FIN/REAL/CONT/REP), datas de última entrada/saída e parâmetros min/max. 722 linhas = 722 produtos, sugerindo apenas filial 1 (validar presença da filial 99). |
| **PCHISTEST** | snapshot | 136.767 | 1 linha por filial + produto + DIA (histórico diário de posição — confirmado pela PK) | OURO do módulo: fotografia diária do estoque por produto/filial com QTEST/QTESTGER, todos os custos (CONT/REAL/FIN/REP/ULTENT), quantidades reservada/bloqueada/avariada e atributos fiscais do dia. 136.767 linhas / 722 produtos ~ 189 dias de histórico. Permite série temporal de valor de estoque e estoque médio exato para giro. DTGERACAO indica quando o job gerou a foto. |
| **PCDTPROD** | agregado | 119.896 | 1 linha por filial + produto + dia de movimento (colunas NOT NULL; PK não declarada — validar unicidade) | Decodificada: agregado DIÁRIO de movimentação por produto/filial — quantidades e valores de venda (QTVENDA/VLVENDA), entradas (QTENT/VLENT), devoluções de cliente (QTDEVOLCLI/VLDEVOLCLI), perdas (QTPERDA), bonificações, transferências, mais snapshot de QTESTGER e custos no dia e chaves de corte (CODEPTO/CODSEC/CODFORNEC). Serve de fonte pronta para venda média diária e fluxo E/S sem varrer PCMOV. |
| **PCLOGESTOQUE** | log | 229.067 | 1 linha por alteração de estoque (sem PK declarada) | Log de auditoria de alterações no PCEST: valores antes/depois (QTESTGERANT/QTESTGER, QTRESERVANT/QTRESERV, custos *_ANT), com PROGRAMA, USUARIO e MAQUINA. Uso: rastrear ajustes manuais e divergências; não usar para KPI de posição. |
| **PCLOGPKG_ESTOQUE** | log | 146.030 | 1 linha por chamada da package de estoque (sem PK declarada) | Log técnico da package de movimentação de estoque (TIPO_MOVIMENTACAO, TIPO_OPERACAO, quantidades antes/depois, MSG_RETORNO, PROGRAMA). Somente auditoria/debug; fora da camada de KPIs. |
| **PCPRODUT** | dimensao | 722 | 1 linha por produto | Dimensão produto (rotina 203): descrição, hierarquia mercadológica (depto/seção/categoria/subcategoria), fornecedor, marca, embalagem/unidade, pesos, NCM e datas de cadastro/exclusão. Sem PII. |
| **PCPRODFILIAL** | dimensao | 706 | 1 linha por produto + filial (atributos comerciais por filial) | Atributos do produto por filial: ativo, fora de linha, proibido para venda, classes ABC (venda/estoque), comprador, controle de validade. Essencial para definir o denominador de ruptura (mix ativo). |
| **PCEMBALAGEM** | apoio | 742 | 1 linha por filial + código de barras (embalagem do produto) | Embalagens/códigos de barras por produto e filial, com fator QTUNIT e preço de venda da embalagem. Apoio para conversão de unidades. |
| **PCCONSOLIDAMES** | agregado | 2.828 | 1 linha por TIPO + CODIGO + filial + mês + ano (consolidação mensal de movimentação) | Consolidação mensal de movimentação (descrição Oracle: 'consolidação de movimentação de produtos por período'): QTVENDA/VLVENDA, QTCOMPRA/VLCOMPRA, devoluções de cliente e fornecedor. TIPO define a entidade de CODIGO (provável P=produto) — validar domínio. Atalho para giro mensal. |
| **PCDEPTO** | dimensao | 9 | 1 linha por departamento | Dimensão departamento (rotina 513) — nível 1 da hierarquia mercadológica. |
| **PCSECAO** | dimensao | 43 | 1 linha por seção | Dimensão seção (rotina 571) — nível 2, filha de PCDEPTO via CODEPTO. |
| **PCCATEGORIA** | dimensao | 71 | 1 linha por seção + categoria | Dimensão categoria (rotina 549) — nível 3, filha de PCSECAO. PCSUBCATEGORIA está vazia (nível 4 não usado). |
| **PCMARCA** | dimensao | 31 | 1 linha por marca | Dimensão marca (rotina 564). |
| **PCFORNEC** | dimensao | 200 | 1 linha por fornecedor | Dimensão fornecedor (rotina 202) — corte para estoque por fornecedor/comprador. Contém PII/LGPD: CGC (CNPJ/CPF), endereço, e-mail; expor no BI só razão social/fantasia. |
| **PCTABPR** | apoio | 3.487 | 1 linha por região de preço + produto | Tabela de preços por região (rotina 201/271): PTABELA/PVENDA/MARGEM. Apoio para valorizar estoque a preço de venda potencial e margem teórica. |
| **PCMOV** | fato | 12.243 | 1 linha por item de movimentação (compartilhada com Vendas/Compras; aqui usada para giro, cobertura e CMV) | Fato de movimentação de produtos. Para estoque: CODOPER com prefixo S=saída (S=9309 vendas) e E=entrada (E=1738 compras). ATENÇÃO: não existe coluna PVENDA em PCMOV — o preço unitário é PUNIT; custos por item em CUSTOREAL/CUSTOFIN/CUSTOCONT. |
| **PCLOTE** | apoio | 0 | (vazia) | VAZIA (0 linhas, analyzed 2025-10-07): a base não usa controle de lote/validade em tabela dedicada. Não modelar KPIs de validade/vencimento por lote. Idem PCENDERECO/PCINVENT/PCWMS (WMS e inventário vazios). |

### Colunas-chave documentadas

#### PCEST  <sub>(snapshot; PK: CODFILIAL, CODPROD)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2(2) | — | PK / FK PCFILIAL | não |
| CODPROD | NUMBER | — | PK / FK PCPRODUT | não |
| QTESTGER | NUMBER | — | medida - estoque gerencial total (inclui bloqueado/avariado) | não |
| QTEST | NUMBER | — | medida - estoque contábil | não |
| QTRESERV | NUMBER | — | medida - quantidade reservada (pedidos liberados) | não |
| QTBLOQUEADA | NUMBER | — | medida - quantidade bloqueada | não |
| QTINDENIZ | NUMBER | — | medida - quantidade avariada/indenizada | não |
| QTPENDENTE | NUMBER | — | medida - quantidade pendente | não |
| CUSTOFIN | NUMBER | — | medida - custo financeiro unitário | não |
| CUSTOREAL | NUMBER | — | medida - custo real unitário | não |
| CUSTOCONT | NUMBER | — | medida - custo contábil unitário | não |
| CUSTOREP | NUMBER | — | medida - custo de reposição unitário | não |
| DTULTENT | DATE | — | data da última entrada | não |
| DTULTSAIDA | DATE | — | data da última saída (base do KPI estoque parado) | não |
| ESTMIN | NUMBER | — | parâmetro - estoque mínimo | não |
| ESTMAX | NUMBER | — | parâmetro - estoque máximo | não |
| MOTIVOBLOQESTOQUE | VARCHAR2(80) | — | atributo - motivo do bloqueio | não |

#### PCHISTEST  <sub>(snapshot; PK: CODFILIAL, CODPROD, DATA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2(2) | — | PK | não |
| CODPROD | NUMBER | — | PK / FK PCPRODUT | não |
| DATA | DATE | — | PK - dia da fotografia | não |
| QTESTGER | NUMBER | — | medida - estoque gerencial no dia | não |
| QTEST | NUMBER | — | medida - estoque contábil no dia | não |
| QTRESERV | NUMBER | — | medida - reservado no dia | não |
| QTBLOQUEADA | NUMBER | — | medida - bloqueado no dia | não |
| QTINDENIZ | NUMBER | — | medida - avariado no dia | não |
| CUSTOFIN | NUMBER | — | medida - custo financeiro unitário no dia | não |
| CUSTOREAL | NUMBER | — | medida - custo real unitário no dia | não |
| CUSTOCONT | NUMBER | — | medida - custo contábil unitário no dia | não |
| VLVENDA | NUMBER | — | medida - preço de venda vigente no dia | não |
| DTGERACAO | DATE | — | data/hora de geração da foto | não |

#### PCDTPROD  <sub>(agregado; PK: (não declarada) CODFILIAL, CODPROD, DTMOV)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2(2) | — | chave (NOT NULL) | não |
| CODPROD | NUMBER | — | chave / FK PCPRODUT (NOT NULL) | não |
| DTMOV | DATE | — | chave - dia do movimento (NOT NULL) | não |
| QTVENDA | NUMBER | — | medida - quantidade vendida no dia | não |
| VLVENDA | NUMBER | — | medida - valor vendido no dia | não |
| QTENT | NUMBER | — | medida - quantidade entrada no dia | não |
| VLENT | NUMBER | — | medida - valor de entrada no dia | não |
| QTDEVOLCLI | NUMBER | — | medida - devolução de cliente | não |
| QTPERDA | NUMBER | — | medida - perdas | não |
| QTESTGER | NUMBER | — | medida - estoque gerencial no dia (snapshot) | não |
| VLCUSTOFIN | NUMBER | — | medida - custo financeiro da venda do dia | não |
| CODEPTO | NUMBER | — | FK PCDEPTO (corte) | não |
| CODFORNEC | NUMBER | — | FK PCFORNEC (corte) | não |

#### PCLOGESTOQUE  <sub>(log; PK: (sem PK))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2(2) | — | chave de contexto | não |
| CODPROD | NUMBER | — | FK PCPRODUT | não |
| DATA | DATE | — | data/hora da alteração | não |
| QTESTGERANT | NUMBER | — | medida - estoque gerencial antes | não |
| QTESTGER | NUMBER | — | medida - estoque gerencial depois | não |
| PROGRAMA | VARCHAR2(80) | — | atributo - rotina que alterou | não |
| USUARIO | VARCHAR2(80) | — | atributo - usuário que alterou | sim |
| MAQUINA | VARCHAR2(80) | — | atributo - estação | não |

#### PCLOGPKG_ESTOQUE  <sub>(log; PK: (sem PK))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2(2) | — | chave de contexto | não |
| CODPROD | NUMBER | — | FK PCPRODUT | não |
| DTGERACAO | DATE | — | data/hora | não |
| TIPO_MOVIMENTACAO | VARCHAR2(15) | — | atributo - tipo do movimento | não |
| PROGRAMA | VARCHAR2(80) | — | atributo - rotina chamadora | não |

#### PCPRODUT  <sub>(dimensao; PK: CODPROD)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPROD | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2(40) | Descrição | atributo - nome do produto | não |
| CODEPTO | NUMBER | Departamento | FK PCDEPTO | não |
| CODSEC | NUMBER | Seção | FK PCSECAO | não |
| CODCATEGORIA | NUMBER | Categoria | FK PCCATEGORIA | não |
| CODFORNEC | NUMBER | Fornecedor | FK PCFORNEC | não |
| CODMARCA | NUMBER | Marca | FK PCMARCA | não |
| EMBALAGEM | VARCHAR2(12) | Embalagem | atributo | não |
| UNIDADE | VARCHAR2(2) | Unidade de venda | atributo | não |
| NBM | VARCHAR2(15) | NCM | atributo fiscal | não |
| DTCADASTRO | DATE | Dt.Cadastro | data de cadastro | não |
| DTEXCLUSAO | DATE | Data Exclusão | filtro - produto excluído quando não nula | não |

#### PCPRODFILIAL  <sub>(dimensao; PK: CODPROD, CODFILIAL)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPROD | NUMBER | Cód.Produto | PK / FK PCPRODUT | não |
| CODFILIAL | VARCHAR2(2) | Cód.Filial | PK | não |
| ATIVO | VARCHAR2(1) | Ativo | filtro - produto ativo na filial (S/N) | não |
| FORALINHA | VARCHAR2(1) | Fora de linha | filtro - fora de linha (S/N) | não |
| PROIBIDAVENDA | VARCHAR2(1) | Proibido para venda | filtro - proibido para venda (S/N) | não |
| CLASSE | VARCHAR2(1) | Classe produto | atributo - curva ABC do produto | não |
| CLASSEVENDA | VARCHAR2(1) | Classe venda | atributo - curva ABC de venda | não |
| CODCOMPRADOR | NUMBER | Cód.Comprador | FK comprador | não |
| CONTROLEDEVALIDADE | VARCHAR2(1) | Controledevalidade | flag - controla validade | não |

#### PCEMBALAGEM  <sub>(apoio; PK: CODFILIAL, CODAUXILIAR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2(2) | — | PK | não |
| CODAUXILIAR | NUMBER | — | PK - EAN/DUN | não |
| CODPROD | NUMBER | — | FK PCPRODUT | não |
| QTUNIT | NUMBER | — | fator de conversão | não |
| PVENDA | NUMBER | — | medida - preço da embalagem | não |

#### PCCONSOLIDAMES  <sub>(agregado; PK: TIPO, CODIGO, CODFILIAL, MES, ANO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| TIPO | VARCHAR2(1) | — | PK - tipo de entidade consolidada (validar domínio) | não |
| CODIGO | NUMBER | — | PK - código da entidade (produto?) | não |
| CODFILIAL | VARCHAR2(2) | — | PK | não |
| MES | NUMBER | — | PK | não |
| ANO | NUMBER | — | PK | não |
| QTVENDA | NUMBER | — | medida | não |
| VLVENDA | NUMBER | — | medida | não |
| QTCOMPRA | NUMBER | — | medida | não |
| VLCOMPRA | NUMBER | — | medida | não |
| QTDEVCLIENTE | NUMBER | — | medida | não |
| QTDEVFORNECEDOR | NUMBER | — | medida | não |

#### PCDEPTO  <sub>(dimensao; PK: CODEPTO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODEPTO | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2(25) | Descrição | atributo | não |

#### PCSECAO  <sub>(dimensao; PK: CODSEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSEC | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2(40) | Descrição | atributo | não |
| CODEPTO | NUMBER | Cód. Departamento | FK PCDEPTO | não |

#### PCCATEGORIA  <sub>(dimensao; PK: CODSEC, CODCATEGORIA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSEC | NUMBER | Cod. Seção | PK / FK PCSECAO | não |
| CODCATEGORIA | NUMBER | Código | PK | não |
| CATEGORIA | VARCHAR2(40) | Categoria | atributo | não |

#### PCMARCA  <sub>(dimensao; PK: CODMARCA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODMARCA | NUMBER | Código | PK | não |
| MARCA | VARCHAR2(40) | Descrição | atributo | não |

#### PCFORNEC  <sub>(dimensao; PK: CODFORNEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | Código | PK | não |
| FORNECEDOR | VARCHAR2(60) | Fornecedor | atributo - razão social | sim |
| FANTASIA | VARCHAR2(60) | Fantasia | atributo | não |
| CGC | VARCHAR2(18) | CNPJ/CPF | documento CNPJ/CPF | sim |
| ENDER | VARCHAR2(40) | Endereço | endereço | sim |
| EMAIL | VARCHAR2(100) | E-Mail | e-mail | sim |

#### PCTABPR  <sub>(apoio; PK: NUMREGIAO, CODPROD)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMREGIAO | NUMBER | — | PK | não |
| CODPROD | NUMBER | — | PK / FK PCPRODUT | não |
| PVENDA | NUMBER | — | medida - preço de venda vigente | não |
| PTABELA | NUMBER | — | medida - preço de tabela | não |
| MARGEM | NUMBER | — | medida - margem cadastrada | não |

#### PCMOV  <sub>(fato; PK: NUMTRANS (documentado no módulo Vendas))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPROD | NUMBER | — | FK PCPRODUT (NOT NULL) | não |
| CODFILIAL | VARCHAR2(2) | — | chave (NOT NULL) | não |
| DTMOV | DATE | — | data do movimento | não |
| CODOPER | VARCHAR2(2) | — | tipo de operação (S*/E*) | não |
| QT | NUMBER | — | medida - quantidade | não |
| PUNIT | NUMBER | — | medida - preço unitário (substitui o PVENDA do esboço) | não |
| CUSTOREAL | NUMBER | — | medida - custo real unitário | não |
| CUSTOFIN | NUMBER | — | medida - custo financeiro unitário | não |
| DTCANCEL | DATE | — | filtro - movimento cancelado quando não nula | não |

---

## COMPRAS-SUPRIMENTOS

Nesta base a família de pedido de compra NÃO é PCPEDCFORNEC (inexistente no inventário): é PCPEDIDO (329 cabeçalhos) + PCITEM (1.572 itens), com logs em PCITEMLOG (3.097) e PCPEDIDOLOG (83). As entradas efetivas estão em PCNFENT (681 notas, PK NUMTRANSENT+CODCONT) e nos itens de PCMOV com CODOPER de entrada (E=1738, ED=253, ER=107, EB=72, EP=41, EA=7, EI=7 — ED é devolução de cliente e deve ficar fora do "valor comprado"). PCFORNEC (200) é a dimensão fornecedor (traz PRAZOENTREGA/lead-time cadastral) e o comprador vem de PCEMPR (28) via PCPEDIDO.CODCOMPRADOR. Satélites fiscais/staging populados: PCNFBASEENT (706), PCNFENTXML (391), PCNFENTPREENT (254), PCMOVPREENT (1.169), PCNFENTPISCOFINS (210), PCNFENTFRETE (51). Cotação/sugestão de compra (PCCOTACAO*, PCFORNECCOTACAO, PCSUGESTAOCOMPRA*, PCLISTAFALTA*, PCPRODFORNEC) estão vazias — funcionalidades não usadas. Os 4 KPIs-alvo são viáveis com colunas 100% confirmadas no dicionário; PCPEDIDO não tem coluna POSICAO — status do pedido deriva de DTENTRADAESTOQUE/VLENTREGUE/DTFATUR.

### Tabelas do módulo

| TABELA | TIPO | LINHAS | GRÃO | DESCRIÇÃO |
|---|---|---:|---|---|
| **PCNFENT** | fato | 681 | 1 linha por transação de entrada (NUMTRANSENT) × conta contábil (CODCONT); na prática ~1 nota fiscal de entrada | Cabeçalho das notas fiscais de entrada: compras de fornecedor, bonificações, devoluções de cliente e fretes (CTe). Fato principal do valor comprado — filtrar o tipo de entrada via PCMOV.CODOPER. |
| **PCMOV** | fato | 12.243 | 1 linha por item de movimentação de estoque (NUMTRANSITEM); entradas identificadas por CODOPER iniciado em E e NUMTRANSENT | Movimentação de estoque item a item (compartilhada com vendas). Lado COMPRAS: CODOPER E (compra, 1738), EB (72), ED (devolução de cliente, 253 — excluir de compras), ER (107), EP (41), EA (7), EI (7); devolução a fornecedor provável em SD (42). Fonte do custo de aquisição por produto. |
| **PCPEDIDO** | fato | 329 | 1 linha por pedido de compra | Cabeçalho do pedido de compra (a família de PO real desta base — PCPEDCFORNEC não existe). Não possui coluna POSICAO: status deriva de DTENTRADAESTOQUE (entregue), VLENTREGUE vs VLTOTAL (atendimento) e DTFATUR. |
| **PCITEM** | fato | 1.572 | 1 linha por item (produto × sequência) do pedido de compra | Itens do pedido de compra: quantidades pedidas × entregues e preços de compra. Base do fill-rate e do preço negociado por produto. |
| **PCFORNEC** | dimensao | 200 | 1 linha por fornecedor | Cadastro de fornecedores (dicionário Winthor: 'Fornecedor'). Dimensão conformada do módulo; inclui lead time cadastral (PRAZOENTREGA) e comprador responsável. Inclui também transportadoras (PCTRANSPORTE tem FK para cá). |
| **PCFORNECFILIAL** | apoio | 203 | 1 linha por fornecedor × filial | Tributação do fornecedor por filial (descrição Oracle nativa). Apoio fiscal — não é fonte de KPI. |
| **PCEMPR** | dimensao | 28 | 1 linha por funcionário | Cadastro de funcionários (dicionário Winthor: 'Funcionário'); no módulo Compras é a dimensão comprador via PCPEDIDO.CODCOMPRADOR e PCFORNEC.CODCOMPRADOR. |
| **PCMOVCOMPLE** | apoio | 11.874 | 1 linha por item de movimentação (extensão 1:1 de PCMOV) | Complemento da movimentação de registros (descrição Oracle nativa). FK declarada NUMTRANSITEM → PCMOV. Usar só se algum atributo complementar for necessário. |
| **PCNFENTPREENT** | apoio | 254 | 1 linha por pré-entrada (espelho de PCNFENT antes da confirmação) | Staging da nota de entrada (pré-entrada/recebimento). Junto com PCMOVPREENT (1.169 itens) e PCMOVCOMPLEPREENT (1.149) indica uso do fluxo de recebimento em duas etapas. Não somar com PCNFENT (dupla contagem). |
| **PCMOVPREENT** | apoio | 1.169 | 1 linha por item de pré-entrada | Itens da pré-entrada (espelho de PCMOV no recebimento). Útil para KPI operacional de recebimento pendente, não para valor comprado. |
| **PCNFBASEENT** | apoio | 706 | linhas de base de cálculo de impostos por nota de entrada (NUMTRANSENT) | Bases fiscais da NF de entrada (ICMS/ST etc.). Apoio fiscal para conferência tributária, não para os KPIs-alvo. |
| **PCNFENTXML** | log | 391 | 1 linha por XML de NF-e de entrada | Armazenamento do XML das NF-e de entrada. Útil para auditoria/reconciliação de chave, não para KPI. |
| **PCNFENTPISCOFINS** | apoio | 210 | 1 linha por combinação de tributação PIS/COFINS na entrada | Tributação PIS/COFINS das notas de entrada (descrição Oracle nativa). Apoio fiscal. |
| **PCNFENTFRETE** | apoio | 51 | 1 linha por vínculo nota de frete (CTe) × nota de mercadoria | Fretes vinculados às entradas (conhecimentos de transporte). Permite medir custo de frete sobre compras. |
| **PCITEMLOG** | log | 3.097 | 1 linha por alteração de item de pedido de compra | Log dos itens do pedido de compra (descrição Oracle nativa). Auditoria de alterações; não usar em KPI. |
| **PCPEDIDOLOG** | log | 83 | 1 linha por pedido de compra logado | Log do cabeçalho do pedido de compra. Auditoria. |

### Colunas-chave documentadas

#### PCNFENT  <sub>(fato; PK: NUMTRANSENT, CODCONT)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | id da transação de entrada; liga a PCMOV, PCNFBASEENT, PCNFENTXML, PCNFENTPISCOFINS | não |
| CODCONT | NUMBER | — | conta contábil (parte da PK) | não |
| NUMNOTA | NUMBER | — | número da NF | não |
| SERIE | VARCHAR2(3) | — | série da NF | não |
| DTENT | DATE | — | data de entrada (data-base dos KPIs) | não |
| DTEMISSAO | DATE | — | data de emissão da NF | não |
| CODFORNEC | NUMBER | — | FK fornecedor (PCFORNEC) | não |
| CODFILIAL | VARCHAR2(2) | — | filial | não |
| VLTOTAL | NUMBER | — | valor total da nota (medida) | não |
| VLFRETE | NUMBER | — | frete da nota | não |
| VLDESCONTO | NUMBER | — | desconto | não |
| CHAVENFE | VARCHAR2(45) | — | chave da NF-e | não |
| CGC | VARCHAR2(18) | CNPJ/CPF do emitente | documento do emitente | sim |

#### PCMOV  <sub>(fato; PK: sem PK declarada; NUMTRANSITEM é a chave única de fato (alvo da FK PCMOVCOMPLE.NUMTRANSITEM → PCMOV))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSITEM | NUMBER | — | id único do item de movimentação | não |
| NUMTRANSENT | NUMBER | — | FK para PCNFENT (nota de entrada) | não |
| CODOPER | VARCHAR2(2) | — | tipo de operação (E*=entrada, S*=saída); filtro central do módulo | não |
| DTMOV | DATE | — | data do movimento | não |
| CODPROD | NUMBER | — | FK produto (PCPRODUT) | não |
| CODFORNEC | NUMBER | — | FK fornecedor | não |
| CODFILIAL | VARCHAR2(2) | — | filial | não |
| QT | NUMBER | — | quantidade (medida) | não |
| QTCONT | NUMBER | — | quantidade contábil (medida) | não |
| PUNIT | NUMBER | — | preço unitário | não |
| PUNITCONT | NUMBER | — | preço unitário contábil (candidato a valor de entrada) | não |
| NUMPED | NUMBER | — | nº do pedido (nas entradas, candidato a FK PCPEDIDO.NUMPED — validar) | não |
| CUSTOFIN | NUMBER | — | custo financeiro | não |
| CUSTOREAL | NUMBER | — | custo real | não |

#### PCPEDIDO  <sub>(fato; PK: NUMPED)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | PK; liga a PCITEM.NUMPED e (a validar) PCMOV.NUMPED | não |
| DTEMISSAO | DATE | — | data de emissão do pedido | não |
| CODFORNEC | NUMBER | — | FK fornecedor (NOT NULL) | não |
| CODFILIAL | VARCHAR2(2) | — | filial | não |
| CODCOMPRADOR | NUMBER | — | FK comprador (PCEMPR.MATRICULA) | não |
| VLTOTAL | NUMBER | — | valor total do pedido (medida) | não |
| VLENTREGUE | NUMBER | — | valor já entregue (medida de atendimento) | não |
| DTPREVENT | DATE | — | data prevista de entrega | não |
| DTENTRADAESTOQUE | DATE | — | data de entrada em estoque (fim do lead time) | não |
| DTFATUR | DATE | — | data de faturamento pelo fornecedor | não |
| CODPLPAG | NUMBER | — | plano de pagamento | não |

#### PCITEM  <sub>(fato; PK: NUMPED, CODPROD, NUMSEQ)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | FK PCPEDIDO | não |
| CODPROD | NUMBER | — | FK produto | não |
| NUMSEQ | NUMBER | — | sequência do item | não |
| QTPEDIDA | NUMBER | — | quantidade pedida (medida) | não |
| QTENTREGUE | NUMBER | — | quantidade entregue (medida) | não |
| PCOMPRA | NUMBER | — | preço de compra negociado | não |
| PTABELA | NUMBER | — | preço de tabela do fornecedor | não |
| DATAENTREGA | DATE | — | data de entrega do item (atenção: é DATAENTREGA, não DTENTREGA) | não |

#### PCFORNEC  <sub>(dimensao; PK: CODFORNEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | Código | PK | não |
| FORNECEDOR | VARCHAR2(60) | Fornecedor | razão social | sim |
| FANTASIA | VARCHAR2(60) | Fantasia | nome fantasia | não |
| CGC | VARCHAR2(18) | CNPJ/CPF | documento | sim |
| IE | VARCHAR2(15) | Inscrição Estadual | inscrição estadual | sim |
| ENDER | VARCHAR2(40) | Endereço | endereço | sim |
| CIDADE | VARCHAR2(15) | Cidade | cidade | não |
| ESTADO | VARCHAR2(2) | UF | UF | não |
| CEP | VARCHAR2(11) | CEP | CEP | sim |
| TELCOB | VARCHAR2(13) | Telefone | telefone | sim |
| EMAIL | VARCHAR2(100) | E-Mail | e-mail | sim |
| CONTATO | VARCHAR2(40) | Contato | nome do contato | sim |
| PRAZOENTREGA | NUMBER | Prazo entrega - Lead Time (dias) | lead time cadastral para comparar com o realizado | não |
| CODCOMPRADOR | NUMBER | Comprador | FK PCEMPR | não |
| TIPOFORNEC | VARCHAR2(1) | Tipo fornecedor | classificação | não |
| DTCADASTRO | DATE | Data Cadastro | data de cadastro | não |

#### PCFORNECFILIAL  <sub>(apoio; PK: CODFORNEC, CODFILIAL)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | — | FK PCFORNEC (FK declarada) | não |
| CODFILIAL | VARCHAR2 | — | filial | não |

#### PCEMPR  <sub>(dimensao; PK: MATRICULA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| MATRICULA | NUMBER | Matrícula | PK | não |
| NOME | VARCHAR2(40) | Nome | nome do funcionário | sim |
| CPF | VARCHAR2(20) | CPF | documento | sim |
| CODFILIAL | VARCHAR2(2) | Cód. da filial | filial | não |

#### PCMOVCOMPLE  <sub>(apoio; PK: NUMTRANSITEM)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSITEM | NUMBER | — | PK e FK para PCMOV | não |

#### PCNFENTPREENT  <sub>(apoio; PK: NUMTRANSENT, CODCONT)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | id da pré-entrada | não |
| CODCONT | NUMBER | — | conta contábil | não |

#### PCMOVPREENT  <sub>(apoio; PK: sem PK declarada; NUMTRANSITEM (alvo da FK de PCMOVCOMPLEPREENT))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | FK pré-entrada (NOT NULL) | não |
| NUMTRANSITEM | NUMBER | — | id do item | não |
| CODPROD | NUMBER | — | produto | não |
| QT | NUMBER | — | quantidade | não |

#### PCNFBASEENT  <sub>(apoio; PK: sem PK declarada em fase6)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | FK PCNFENT | não |
| VLBASE | NUMBER | — | valor da base de cálculo | não |

#### PCNFENTXML  <sub>(log; PK: sem PK declarada em fase6)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | FK PCNFENT | não |
| CHAVENFE | VARCHAR2(44) | — | chave da NF-e | não |

#### PCNFENTPISCOFINS  <sub>(apoio; PK: NUMTRANSPISCOFINS, CODTRIBPISCOFINS, PERPIS, PERCOFINS)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | FK PCNFENT | não |

#### PCNFENTFRETE  <sub>(apoio; PK: sem PK declarada em fase6)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSENT | NUMBER | — | transação do frete | não |
| NUMTRANSENTNF | NUMBER | — | transação da nota de mercadoria vinculada | não |
| VLTOTALFRETE | NUMBER | — | valor do frete (medida) | não |
| CODFORNEC | NUMBER | — | transportadora (FK PCFORNEC) | não |

#### PCITEMLOG  <sub>(log; PK: sem PK declarada em fase6)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | FK PCPEDIDO | não |

#### PCPEDIDOLOG  <sub>(log; PK: NUMPED)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMPED | NUMBER | — | FK PCPEDIDO | não |

---

## FINANCEIRO-CR

O Contas a Receber desta base gira em torno de PCPREST (2.889 títulos/parcelas, PK NUMTRANSVENDA+PREST), com regra validada de que DTPAG nula = título em aberto (336 abertos, R$ 405,4 mil; 2.606 pagos, R$ 2,03 mi). As dimensões de apoio estão populadas: PCCLIENT (235), PCCOB (54 tipos de cobrança), PCPLPAG (34 planos) e PCBANCO (9 caixas/bancos). O inventário revelou ainda PCMOVCR (2.398 lançamentos de caixa/banco do CR — útil para recebido por banco/conciliação), PCCRECLI (81 créditos de cliente) e PCOCORBC (203 ocorrências de cobrança magnética). Todos os 5 KPIs do foco foram validados contra o dicionário: as colunas VALOR/VPAGO/DTVENC/DTPAG/DTEMISSAO/CODCOB/STATUS/CODFILIAL existem em PCPREST; os esboços do catálogo foram ajustados (GROUP BY posicional não vale em Oracle; regra de aberto simplificada para DTPAG IS NULL; exclusão de cancelados via DTCANCEL). Restam pendências de domínio que só a base resolve: valores de STATUS, cobranças internas a excluir (tipo DEVP/CRED/BNF), presença de filial 99 em PCPREST e se VPAGO embute juros/descontos.

### Tabelas do módulo

| TABELA | TIPO | LINHAS | GRÃO | DESCRIÇÃO |
|---|---|---:|---|---|
| **PCPREST** | fato | 2.889 | 1 linha por prestação de título: PK composta NUMTRANSVENDA + PREST | Títulos/prestações do contas a receber (fato central do módulo). Cada linha é uma parcela de uma transação de venda ou lançamento avulso. Sem descrição no dicionário nativo (rótulos vazios), mas estrutura 100% aderente ao padrão Winthor. Validado na base: DTPAG nula = em aberto (336 títulos, R$ 405.355,01); DTPAG preenchida = pago (2.606, R$ 2.028.529,87). |
| **PCMOVCR** | fato | 2.398 | 1 linha por lançamento financeiro; NUMTRANS é o identificador provável, mas não há PK declarada em fase6_pks.csv (unicidade a validar) | Movimentação financeira do contas a receber em caixa/banco (lançamentos de crédito/débito, baixas, estornos, conciliação). Achado do inventário — não estava na lista de partida. Boa fonte secundária para 'recebido por banco' e conciliação; rótulos vazios no dicionário. |
| **PCCOB** | dimensao | 54 | 1 linha por código de cobrança | Cadastro de tipos de cobrança (dinheiro, boleto, cartão, PIX etc.). Descrição Winthor: 'Tipo de cobrança'. Dimensão para cortar carteira e recebimentos por forma de cobrança e para identificar cobranças internas a excluir dos KPIs. |
| **PCPLPAG** | dimensao | 34 | 1 linha por plano de pagamento | Planos de pagamento (condições/prazos de parcelamento). Descrição Winthor: 'Plano de pagamento'. Dimensão para análise de prazo concedido vs prazo efetivo de recebimento. |
| **PCCLIENT** | dimensao | 235 | 1 linha por cliente | Cadastro de clientes (visão financeira: limite de crédito, bloqueio, cobrança e plano padrão). Descrição Winthor: 'Clientes'. Contém dados pessoais — atenção LGPD ao expor no BI. |
| **PCCRECLI** | fato | 81 | 1 linha por lançamento de crédito de cliente | Créditos de cliente (vales/créditos gerados por devolução, pagamento a maior etc.) e sua utilização/baixa. Achado do inventário; relevante porque créditos em aberto abatem a posição líquida do CR. Rótulos vazios no dicionário. |
| **PCBANCO** | dimensao | 9 | 1 linha por caixa/banco | Cadastro de caixas/bancos da empresa. Descrição Winthor: 'Caixa/banco'. Dimensão para recebido por conta (via PCMOVCR.CODBANCO e PCPREST.CODBANCO). Contém dados bancários da própria empresa, não de pessoas. |
| **PCOCORBC** | apoio | 203 | 1 linha por ocorrência × banco (sem PK declarada em fase6_pks.csv) | Cadastro de ocorrências de cobrança magnética/retorno bancário (CNAB) por banco — usado nas rotinas de remessa/retorno de boletos. Descrição Winthor: 'Ocorrência cobrança magnética'. Sem PK declarada. |
| **PCCOBPLPAG** | apoio | 6 | 1 linha por par cobrança × plano | Relacionamento entre cobrança e plano de pagamento (quais planos valem para cada cobrança). Populada com 6 linhas; útil só como regra de negócio, não entra nos KPIs. |
| **PCVARIAVELBOLETO** | apoio | 33 | 1 linha por variável de boleto | Variáveis/configuração de layout de boleto (33 linhas). Operacional da emissão de boletos; sem uso direto em KPI. |

### Colunas-chave documentadas

#### PCPREST  <sub>(fato; PK: NUMTRANSVENDA, PREST)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSVENDA | NUMBER | (sem rótulo no dicionário) | PK (1) e elo com a venda (PCNFSAID.NUMTRANSVENDA) | não |
| PREST | VARCHAR2(2) | (sem rótulo) | PK (2) — número da prestação/parcela | não |
| CODCLI | NUMBER | (sem rótulo) | FK para PCCLIENT (devedor) | não |
| CODFILIAL | VARCHAR2(2) | (sem rótulo) | filial do título (atenção à filial 99 consolidadora) | não |
| DUPLIC | NUMBER | (sem rótulo) | número da duplicata/nota | não |
| VALOR | NUMBER | (sem rótulo) | valor original do título (NOT NULL) | não |
| VPAGO | NUMBER | (sem rótulo) | valor pago na baixa (nullable) | não |
| DTEMISSAO | DATE | (sem rótulo) | data de emissão (base do PMR/DSO) | não |
| DTVENC | DATE | (sem rótulo) | vencimento vigente (base do aging) | não |
| DTVENCORIG | DATE | (sem rótulo) | vencimento original (antes de prorrogações) | não |
| DTPAG | DATE | (sem rótulo) | data de pagamento; NULL = título em aberto (regra validada na base) | não |
| CODCOB | VARCHAR2(4) | (sem rótulo) | FK para PCCOB (tipo de cobrança); usar para excluir cobranças internas | não |
| STATUS | VARCHAR2(1) | (sem rótulo) | situação do título — domínio não documentado, validar na base | não |
| CODUSUR | NUMBER | (sem rótulo) | RCA responsável (FK PCUSUARI) — corte por vendedor | não |
| DTCANCEL | DATE | (sem rótulo) | data de cancelamento — excluir cancelados da carteira | não |
| TXPERM | NUMBER | (sem rótulo) | taxa de permanência/juros do título | não |
| CGCCPFCH | VARCHAR2(18) | (sem rótulo) | CPF/CNPJ do emitente do cheque | sim |

#### PCMOVCR  <sub>(fato; PK: (não declarada; candidata: NUMTRANS))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANS | NUMBER | (sem rótulo) | identificador do lançamento (PK candidata, NOT NULL) | não |
| DATA | DATE | (sem rótulo) | data do lançamento | não |
| CODBANCO | NUMBER | (sem rótulo) | FK para PCBANCO (caixa/banco) | não |
| CODCOB | VARCHAR2(4) | (sem rótulo) | FK para PCCOB | não |
| VALOR | NUMBER | (sem rótulo) | valor do lançamento | não |
| TIPO | VARCHAR2(1) | (sem rótulo) | tipo do lançamento (C/D? domínio a validar) | não |
| HISTORICO | VARCHAR2(200) | (sem rótulo) | descrição do lançamento | não |
| CODCLI | NUMBER | (sem rótulo) | cliente relacionado (nullable) | não |
| DUPLICBAIXA | NUMBER | (sem rótulo) | duplicata baixada — elo com PCPREST | não |
| PRESTBAIXA | VARCHAR2(2) | (sem rótulo) | prestação baixada — elo com PCPREST.PREST | não |
| DTESTORNO | DATE | (sem rótulo) | estorno do lançamento (excluir estornados) | não |
| CODFILIAL | VARCHAR2(2) | (sem rótulo) | filial | não |

#### PCCOB  <sub>(dimensao; PK: CODCOB)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCOB | VARCHAR2(4) | Código | PK | não |
| COBRANCA | VARCHAR2(30) | Nome | nome da cobrança | não |
| BOLETO | VARCHAR2(1) | Boleto bancário | flag boleto bancário | não |
| CARTAO | VARCHAR2(1) | Cartão de crédito | flag cartão de crédito | não |
| TXJUROS | NUMBER | Taxa de juros | taxa de juros da cobrança | não |
| CODFILIAL | VARCHAR2(2) | Filial | restrição de filial da cobrança | não |

#### PCPLPAG  <sub>(dimensao; PK: CODPLPAG)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPLPAG | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2(40) | Descrição | nome do plano | não |
| NUMDIAS | NUMBER | Prazo médio | prazo médio do plano em dias (comparar com PMR real) | não |
| NUMPARCELAS | NUMBER | Quantidade de parcelas | quantidade de parcelas | não |
| PRAZO1 | NUMBER | Número de dias 1 | dias da 1ª parcela (PRAZO1..PRAZO12) | não |
| FORMAPARCELAMENTO | VARCHAR2(1) | Tipo parcelamento | tipo de parcelamento | não |

#### PCCLIENT  <sub>(dimensao; PK: CODCLI)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCLI | NUMBER | Código | PK | não |
| CLIENTE | VARCHAR2(60) | Cliente | razão social / nome | sim |
| FANTASIA | VARCHAR2(40) | Fantasia | nome fantasia | sim |
| CGCENT | VARCHAR2(18) | CNPJ/CPF | CNPJ/CPF | sim |
| LIMCRED | NUMBER | Limite de crédito | limite de crédito (base p/ % utilização) | não |
| BLOQUEIO | VARCHAR2(1) | Bloqueio | flag de bloqueio do cliente | não |
| DTBLOQ | DATE | Data de Bloqueio | data do bloqueio | não |
| CODUSUR1 | NUMBER | RCA 1 | RCA titular (FK PCUSUARI) | não |
| CODPLPAG | NUMBER | Plano de Pagamento | plano de pagamento padrão (FK PCPLPAG) | não |
| CODCOB | VARCHAR2(4) | Código cobrança | cobrança padrão (FK PCCOB) | não |
| TELCOB | VARCHAR2(13) | Telefone Cobrança | telefone de cobrança | sim |
| TELENT | VARCHAR2(13) | Telefone Comercial | telefone comercial | sim |
| EMAIL | VARCHAR2(100) | E-mail | e-mail | sim |
| EMAILNFE | VARCHAR2(3500) | E-mail NF-e | e-mail NF-e | sim |
| ENDERENT | VARCHAR2(40) | Endereço Comercial | endereço comercial (idem BAIRROENT/MUNICENT/ESTENT/CEPENT) | sim |

#### PCCRECLI  <sub>(fato; PK: CODIGO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODIGO | NUMBER | (sem rótulo) | PK | não |
| CODCLI | NUMBER | (sem rótulo) | FK para PCCLIENT | não |
| DTLANC | DATE | (sem rótulo) | data do lançamento do crédito | não |
| VALOR | NUMBER | (sem rótulo) | valor do crédito | não |
| SITUACAO | VARCHAR2(1) | (sem rótulo) | situação do crédito (domínio a validar) | não |
| NUMTRANSVENDA | NUMBER | (sem rótulo) | venda de origem | não |
| ORIGEM | VARCHAR2(1) | (sem rótulo) | origem do crédito | não |

#### PCBANCO  <sub>(dimensao; PK: CODBANCO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODBANCO | NUMBER | Código Banco | PK | não |
| NOME | VARCHAR2(30) | Nome Banco | nome do banco/caixa | não |
| TIPOCXBCO | VARCHAR2(1) | Tipo Banco | tipo (caixa ou banco) | não |
| CODFILIAL | VARCHAR2(2) | Código Filial | filial (99 = todas) | não |

#### PCOCORBC  <sub>(apoio; PK: (não declarada))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMBANCO | NUMBER | Nº do banco | número do banco | não |
| CODOCORRENCIA | VARCHAR2(3) | Código | código da ocorrência | não |
| OCORRENCIA | VARCHAR2(100) | Ocorrência | descrição da ocorrência | não |
| BAIXA | VARCHAR2(1) | Baixa | flag: ocorrência gera baixa | não |

---

## FINANCEIRO-PCFINANC

Achado central: a família PCFINANC NÃO é o contas a pagar transacional — é uma família de SNAPSHOTS de posição financeira (fechamento/resumo diário), como prova a estrutura de PKs (DATA/DATAREFERENCIA + CODROTINAGERACAO + TIPODADO no início de todas). O contas a pagar clássico desta base é a PCLANC (4.786 linhas, PK RECNUM = 1 parcela/lançamento), populada e não citada na missão: tem VALOR, VPAGO, DTVENC, DTPAGTO, DTEMISSAO, DTCANCEL, CODCONTA (conta gerencial) e CODFORNEC — é ela a fonte dos KPIs transacionais de CAP. As PCFINANC3* são fotografias datadas dos itens em aberto: PREST espelha PCPREST (receber, chave NUMTRANSVENDA+PREST), LANCFORNEC/LANCOUTROS espelham PCLANC (chave RECNUM), VERBAS espelha PCVERBA/PCMOVCRFOR (NUMVERBA+NUMTRANSCRFOR); PCFINANC é o cabeçalho com saldos consolidados por dia×filial (SALDOCP, SALDOCR, SALDOBCO...) e PCFINANC2 o detalhe genérico chave-valor (TIPODADO+CODIGON+CODIGOA). Importante para o rigor: o dicionário Winthor NÃO traz rótulo/ajuda para PCLANC nem para nenhuma tabela da família PCFINANC — toda a semântica delas é hipótese por convenção de nomes e espelhamento de colunas — enquanto PCCONTA ("Conta gerencial"), PCGRUPO ("Grupo de conta gerencial"), PCBANCO ("Caixa/banco") e PCFORNEC têm rótulos oficiais confirmados. KPIs de CAP (aberto, vencido, aging, pago, PMP, despesa por conta/grupo/fornecedor) foram validados sobre PCLANC+PCCONTA+PCGRUPO+PCFORNEC; os KPIs sobre a família PCFINANC ficam a_validar até confirmar o domínio de TIPODADO/CODROTINAGERACAO e a semântica dos SALDOs em base.

### Tabelas do módulo

| TABELA | TIPO | LINHAS | GRÃO | DESCRIÇÃO |
|---|---|---:|---|---|
| **PCLANC** | fato | 4.786 | 1 linha por lançamento/parcela do contas a pagar (RECNUM) | Contas a pagar transacional clássico do Winthor (substitui o inexistente PCPAGAR do catálogo). Sem rótulos no dicionário — papéis inferidos por convenção Winthor e espelhamento com PCFINANC3LANCFORNEC. Tem retenções (VLIRRF/VLINSS/VLISS/VLPIS/VLCOFINS), bordero (NUMBORDERO), bloqueio e estorno de baixa. |
| **PCFINANC** | snapshot | 646 | 1 linha por dia × filial (PK inclui 2 colunas técnicas de parametrização multifilial) | Cabeçalho do fechamento/resumo financeiro diário. HIPÓTESE (sem rótulo no dicionário): SALDOCP=saldo contas a pagar, SALDOCR=contas a receber, SALDOBCO/SALDOCX/SALDODIN=banco/caixa/dinheiro, SALDOESTFIN/REAL=estoque, VENDAREAL/RECEBREAL/CMVREAL=realizados do dia. 646 linhas ≈ 9 meses × filiais, compatível com 1 foto por dia. |
| **PCFINANC2** | snapshot | 76.404 | 1 linha por dia × filial × tipo de dado × código numérico × código alfa | Detalhe genérico (chave-valor) do resumo financeiro diário: para cada TIPODADO, o par CODIGON/CODIGOA identifica a entidade (hipótese: banco, cobrança, conta etc.) e VALOR/VALOR2 os montantes. Maior tabela da base (76.404 linhas). Sem rótulos no dicionário; domínio de TIPODADO é pendência obrigatória antes de usar em KPI. |
| **PCFINANC3PREST** | snapshot | 40.411 | 1 linha por data de referência × rotina geradora × tipo de dado × filial × título do contas a RECEBER (NUMTRANSVENDA+PREST) | Foto datada dos títulos do contas a receber — espelha PCPREST (NUMTRANSVENDA, PREST, DUPLIC, CODCOB, DTVENC, DTPAG, VPAGO). Confirmado pela estrutura de colunas; é RECEBER, não pagar. Serve para série histórica da carteira, mas duplica lógica de PCPREST (que é a fonte transacional). |
| **PCFINANC3LANCFORNEC** | snapshot | 27.392 | 1 linha por data de referência × rotina × tipo de dado × filial × lançamento do CAP (RECNUM) de fornecedor | Foto datada dos lançamentos do contas a pagar de FORNECEDORES — espelha PCLANC (RECNUM, CODCONTA, CODGRUPO, NUMNOTA, DUPLIC, VALOR, DTVENC, VPAGO, DTPAGTO). 27.392 fotos de ~4.786 lançamentos vivos: cada título aparece em várias datas de referência — nunca somar sem fixar DATAREFERENCIA (+ TIPODADO/CODROTINAGERACAO). |
| **PCFINANC3LANCOUTROS** | snapshot | 16.028 | 1 linha por data de referência × rotina × tipo de dado × filial × lançamento do CAP (RECNUM) não-fornecedor | Gêmea da LANCFORNEC para os DEMAIS lançamentos do contas a pagar (despesas/outros, sem fornecedor na PK; tem flag INVESTIMENTO). Mesmas colunas-espelho de PCLANC e mesma regra: fixar DATAREFERENCIA antes de agregar. |
| **PCFINANC3VERBAS** | snapshot | 6.097 | 1 linha por data de referência × rotina × filial × fornecedor × tipo × verba × movimento de conta-corrente fornecedor | Foto datada das verbas de fornecedor: NUMVERBA aponta para PCVERBA e NUMTRANSCRFOR para PCMOVCRFOR (conta-corrente de fornecedor). Crédito a compensar com fornecedores (bonificações/acordos). |
| **PCCONTA** | dimensao | 221 | 1 linha por conta gerencial | Cadastro de conta gerencial (rótulos oficiais no dicionário: 'Código da conta', 'Nome da conta', 'Código do grupo'). Dimensão para classificar despesas do CAP; liga PCLANC.CODCONTA e agrupa por PCGRUPO via GRUPOCONTA. |
| **PCGRUPO** | dimensao | 24 | 1 linha por grupo de conta gerencial | Grupo de conta gerencial (rótulos oficiais: 'Código', 'Nome do grupo'). Nível superior da hierarquia de despesas. |
| **PCFORNEC** | dimensao | 200 | 1 linha por fornecedor | Cadastro de fornecedor ('Fornecedor' no inventário; rótulos oficiais no dicionário). Contém PII/LGPD: CNPJ/CPF, nome, endereço, e-mail. |
| **PCVERBA** | fato | 21 | 1 linha por verba de fornecedor | Verbas/acordos com fornecedor (bonificação, enxoval etc.). Sem rótulos no dicionário. PII: dados do representante do fornecedor (REPFORNEC, RGREPFORNEC, CPFREPFORNEC). DTQUITACAO nula = hipótese de verba em aberto. |
| **PCMOVCRFOR** | fato | 49 | 1 linha por movimento da conta-corrente de fornecedor por filial | Movimentação da conta-corrente de fornecedor (créditos/débitos de verbas): NUMVERBA liga a PCVERBA, VLSALDO controla saldo, DTESTORNO/NUMTRANSEST controlam estorno. É a origem do NUMTRANSCRFOR usado na PK de PCFINANC3VERBAS. |
| **PCBANCO** | dimensao | 9 | 1 linha por caixa/banco | Cadastro de caixa/banco ('Caixa/banco' no inventário; rótulos oficiais). Dimensão para saldos bancários e para o detalhe de PCFINANC2 (hipótese: TIPODADO de bancos usa CODIGON=CODBANCO). FLUXOCX ('Exibir no fluxo de caixa') confirma o vínculo da família PCFINANC com fluxo de caixa. |
| **PCFINANC_LOG** | log | 8.064 | 1 linha por evento de geração/alteração da família PCFINANC (hipótese — sem PK em fase6_pks.csv) | Log da rotina de fechamento financeiro; 8.064 linhas indicam gerações frequentes (diárias/múltiplas). Sem valor analítico direto; útil só para auditar quando as fotos foram geradas. |
| **PCLANC3** | apoio | 4 | 1 linha por pedido × prestação (pré-lançamento) | Pré-lançamentos de contas a pagar vinculados a pedido de compra (NUMPED, RECNUM, CODCONTA); apenas 4 linhas — marginal. |

### Colunas-chave documentadas

#### PCLANC  <sub>(fato; PK: RECNUM)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| RECNUM | NUMBER | — | PK, id do lançamento | não |
| CODFILIAL | VARCHAR2 | — | filial (verificar uso de '99') | não |
| CODCONTA | NUMBER | — | FK conta gerencial → PCCONTA | não |
| CODFORNEC | NUMBER | — | FK fornecedor → PCFORNEC | não |
| NUMNOTA | NUMBER | — | nº da nota | não |
| DUPLIC | VARCHAR2 | — | nº duplicata/parcela | não |
| VALOR | NUMBER | — | valor do título | não |
| VPAGO | NUMBER | — | valor pago (hipótese: nulo/0 se aberto) | não |
| DTEMISSAO | DATE | — | data de emissão | não |
| DTVENC | DATE | — | data de vencimento | não |
| DTPAGTO | DATE | — | data de pagamento (hipótese: nula = em aberto, análogo a PCPREST.DTPAG) | não |
| DTCANCEL | DATE | — | data de cancelamento (excluir dos KPIs) | não |
| DTCOMPETENCIA | DATE | — | competência contábil-gerencial | não |
| TIPOLANC | VARCHAR2 | — | tipo de lançamento (domínio desconhecido — pendência) | não |
| HISTORICO | VARCHAR2 | — | histórico/descrição | não |
| NUMTRANSENT | NUMBER | — | vínculo com entrada de NF (PCNFENT) | não |

#### PCFINANC  <sub>(snapshot; PK: DATA, CODFILIAL, LISTAFILIAISBANCOCAIXA, PARMULTIFILIALCAIXABANCO3882)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| DATA | DATE | — | PK, dia da posição | não |
| CODFILIAL | VARCHAR2 | — | PK, filial (99 pode ser consolidado) | não |
| SALDOCP | NUMBER | — | hipótese: saldo do contas a pagar | não |
| SALDOCPOUTROS | NUMBER | — | hipótese: CAP outros lançamentos | não |
| SALDOCR | NUMBER | — | hipótese: saldo do contas a receber | não |
| SALDOBCO | NUMBER | — | hipótese: saldo em bancos | não |
| SALDOCX | NUMBER | — | hipótese: saldo em caixa | não |
| VENDAREAL | NUMBER | — | hipótese: venda realizada no dia | não |
| RECEBREAL | NUMBER | — | hipótese: recebimento realizado no dia | não |
| DTGERACAO | DATE | — | quando a foto foi gerada | não |

#### PCFINANC2  <sub>(snapshot; PK: DATA, CODFILIAL, TIPODADO, CODIGON, CODIGOA, PARMULTIFILIALCAIXABANCO3882)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| DATA | DATE | — | PK, dia da posição | não |
| CODFILIAL | VARCHAR2 | — | PK, filial | não |
| TIPODADO | VARCHAR2 | — | PK, tipo do dado detalhado (domínio desconhecido) | não |
| CODIGON | NUMBER | — | PK, código numérico da entidade | não |
| CODIGOA | VARCHAR2 | — | PK, código alfanumérico da entidade | não |
| VALOR | NUMBER | — | valor do item | não |
| VALOR2 | NUMBER | — | segundo valor (semântica desconhecida) | não |

#### PCFINANC3PREST  <sub>(snapshot; PK: DATAREFERENCIA, CODROTINAGERACAO, TIPODADO, CODFILIAL, NUMTRANSVENDA, PREST)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| DATAREFERENCIA | DATE | — | PK, data da foto | não |
| CODROTINAGERACAO | NUMBER | — | PK, rotina Winthor que gerou | não |
| TIPODADO | VARCHAR2 | — | PK, tipo (domínio desconhecido) | não |
| NUMTRANSVENDA | NUMBER | — | PK, transação de venda → PCPREST/PCNFSAID | não |
| PREST | VARCHAR2 | — | PK, nº da prestação | não |
| VALOR | NUMBER | — | valor do título | não |
| DTVENC | DATE | — | vencimento | não |
| DTPAG | DATE | — | pagamento (nula = aberto, padrão PCPREST validado) | não |
| CODCOB | VARCHAR2 | — | código de cobrança | não |

#### PCFINANC3LANCFORNEC  <sub>(snapshot; PK: DATAREFERENCIA, CODROTINAGERACAO, TIPODADO, CODFILIAL, RECNUM, CODFORNEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| DATAREFERENCIA | DATE | — | PK, data da foto | não |
| CODROTINAGERACAO | NUMBER | — | PK, rotina geradora | não |
| TIPODADO | VARCHAR2 | — | PK, tipo (domínio desconhecido) | não |
| RECNUM | NUMBER | — | PK, lançamento → PCLANC.RECNUM | não |
| CODFORNEC | NUMBER | — | PK, fornecedor → PCFORNEC | não |
| CODCONTA | NUMBER | — | conta gerencial → PCCONTA | não |
| CODGRUPO | NUMBER | — | grupo → PCGRUPO | não |
| VALOR | NUMBER | — | valor do título | não |
| DTVENC | DATE | — | vencimento | não |
| DTPAGTO | DATE | — | pagamento (hipótese: nula = aberto) | não |

#### PCFINANC3LANCOUTROS  <sub>(snapshot; PK: DATAREFERENCIA, CODROTINAGERACAO, TIPODADO, CODFILIAL, RECNUM)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| DATAREFERENCIA | DATE | — | PK, data da foto | não |
| RECNUM | NUMBER | — | PK, lançamento → PCLANC.RECNUM | não |
| TIPODADO | VARCHAR2 | — | PK, tipo (domínio desconhecido) | não |
| CODCONTA | NUMBER | — | conta gerencial → PCCONTA | não |
| CODFORNEC | NUMBER | — | fornecedor (fora da PK aqui) | não |
| VALOR | NUMBER | — | valor | não |
| DTVENC | DATE | — | vencimento | não |
| DTPAGTO | DATE | — | pagamento | não |
| INVESTIMENTO | VARCHAR2 | — | flag investimento (S/N, hipótese) | não |

#### PCFINANC3VERBAS  <sub>(snapshot; PK: DATAREFERENCIA, CODROTINAGERACAO, CODFILIAL, CODFORNEC, TIPODADO, NUMVERBA, NUMTRANSCRFOR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| DATAREFERENCIA | DATE | — | PK, data da foto | não |
| CODFORNEC | NUMBER | — | PK, fornecedor → PCFORNEC | não |
| NUMVERBA | NUMBER | — | PK, verba → PCVERBA.NUMVERBA | não |
| NUMTRANSCRFOR | NUMBER | — | PK, movimento → PCMOVCRFOR.NUMTRANSCRFOR | não |
| TIPO | VARCHAR2 | — | tipo da verba (domínio desconhecido) | não |
| VALOR | NUMBER | — | valor | não |
| DTVENC | DATE | — | vencimento | não |

#### PCCONTA  <sub>(dimensao; PK: CODCONTA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCONTA | NUMBER | Código da conta | PK | não |
| CONTA | VARCHAR2 | Nome da conta | nome | não |
| GRUPOCONTA | NUMBER | Código do grupo | FK → PCGRUPO.CODGRUPO | não |
| TIPO | VARCHAR2 | Tipo de conta | tipo de conta | não |
| FIXAVARIAVEL | VARCHAR2 | Tipo fixa/variável | despesa fixa/variável | não |
| INVESTIMENTO | VARCHAR2 | Conta de investimento? | conta de investimento? | não |

#### PCGRUPO  <sub>(dimensao; PK: CODGRUPO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODGRUPO | NUMBER | Código | PK | não |
| GRUPO | VARCHAR2 | Nome do grupo | nome do grupo | não |

#### PCFORNEC  <sub>(dimensao; PK: CODFORNEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | Código | PK | não |
| FORNECEDOR | VARCHAR2 | Fornecedor | razão social | sim |
| FANTASIA | VARCHAR2 | Fantasia | nome fantasia | sim |
| CGC | VARCHAR2 | CNPJ/CPF | documento fiscal | sim |
| ENDER | VARCHAR2 | Endereço | endereço | sim |
| CIDADE | VARCHAR2 | Cidade | cidade | sim |
| EMAIL | VARCHAR2 | E-Mail | e-mail | sim |
| TIPOFORNEC | VARCHAR2 | Tipo fornecedor | classificação | não |

#### PCVERBA  <sub>(fato; PK: NUMVERBA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMVERBA | NUMBER | — | PK | não |
| CODFORNEC | NUMBER | — | FK → PCFORNEC | não |
| VALOR | NUMBER | — | valor da verba | não |
| VPAGO | NUMBER | — | valor recebido/compensado | não |
| DTVENC | DATE | — | vencimento | não |
| DTQUITACAO | DATE | — | quitação (nula = aberta, hipótese) | não |
| DTCANCEL | DATE | — | cancelamento | não |
| REPFORNEC | VARCHAR2 | — | nome do representante | sim |
| CPFREPFORNEC | VARCHAR2 | — | CPF do representante | sim |
| RGREPFORNEC | VARCHAR2 | — | RG do representante | sim |

#### PCMOVCRFOR  <sub>(fato; PK: CODFILIAL, NUMTRANSCRFOR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMTRANSCRFOR | NUMBER | — | PK, id do movimento | não |
| CODFILIAL | VARCHAR2 | — | PK, filial | não |
| CODFORNEC | NUMBER | — | FK → PCFORNEC | não |
| NUMVERBA | NUMBER | — | FK → PCVERBA | não |
| VALOR | NUMBER | — | valor do movimento | não |
| VLSALDO | NUMBER | — | saldo remanescente | não |
| TIPO | VARCHAR2 | — | tipo do movimento (domínio desconhecido) | não |

#### PCBANCO  <sub>(dimensao; PK: CODBANCO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODBANCO | NUMBER | Código Banco | PK | não |
| NOME | VARCHAR2 | Nome Banco | nome | não |
| TIPOCXBCO | VARCHAR2 | Tipo Banco | tipo caixa/banco | não |
| FLUXOCX | VARCHAR2 | Exibir no fluxo de caixa | exibe no fluxo de caixa | não |
| CODFILIAL | VARCHAR2 | Código Filial | filial (99 = todas) | não |

---

## DIMENSOES-CONFORMADAS

Todas as 15 tabelas de partida estão populadas e foram confirmadas no inventário; somaram-se as dimensões complementares PCCIDADE/PCESTADO/PCREGIAO (geografia IBGE), PCATIVI (ramo de atividade), PCCATEGORIA e PCROTAEXP, além das tabelas de apoio por filial (PCPRODFILIAL, PCFORNECFILIAL, PCEMBALAGEM, PCCLIENTENDENT). As hierarquias conformadas confirmadas no dicionário são: produto→seção→departamento (PCPRODUT.CODSEC→PCSECAO.CODEPTO→PCDEPTO), mercadológica opcional produto→categoria (PCCATEGORIA, PK composta CODSEC+CODCATEGORIA; PCSUBCATEGORIA e PCLINHAPROD estão vazias), comercial RCA→supervisor (PCUSUARI.CODSUPERVISOR→PCSUPERV, que ainda tem CODGERENTE) e geográfica cliente→praça→região/rota (PCCLIENT.CODPRACA→PCPRACA.NUMREGIAO/ROTA→PCREGIAO/PCROTAEXP). A dimensão Tempo não existe no Winthor e deve ser gerada no BI (calendário out/2025 em diante, grão dia). Atenção de modelagem: PCFILIAL tem 2 linhas mas a filial 99 é consolidadora ("TODAS FILIAIS") e deve ficar fora da dimensão de análise; PCCONTA liga a PCGRUPO pela coluna GRUPOCONTA (não CODGRUPO). PII marcada em PCCLIENT, PCFORNEC, PCUSUARI, PCEMPR, PCSUPERV, PCFILIAL e PCCLIENTENDENT (CPF/CNPJ, nomes, endereços, telefones, e-mails, lat/long) para mascaramento LGPD. Os KPIs dimensionais do catálogo foram validados após ajuste da expressão de valor de PCMOV.PVENDA (inexistente) para PCMOV.QT*PUNIT.

### Tabelas do módulo

| TABELA | TIPO | LINHAS | GRÃO | DESCRIÇÃO |
|---|---|---:|---|---|
| **PCFILIAL** | dimensao | 2 | 1 linha por filial (PK CODIGO; nos fatos a FK chama-se CODFILIAL) | Cadastro de filiais. ATENÇÃO: filial 99 = 'TODAS FILIAIS' (consolidadora, não é filial real) — excluir da dimensão de análise; só a filial 1 opera. |
| **PCPRODUT** | dimensao | 722 | 1 linha por produto (PK CODPROD) | Dimensão Produto. Raiz da hierarquia mercadológica: CODSEC→PCSECAO→CODEPTO→PCDEPTO; marca via CODMARCA; fornecedor padrão via CODFORNEC. Sem PII. |
| **PCCLIENT** | dimensao | 235 | 1 linha por cliente (PK CODCLI) | Dimensão Cliente. Liga-se a praça (CODPRACA→PCPRACA→região/rota), ramo de atividade (CODATV1→PCATIVI), RCA titular (CODUSUR1→PCUSUARI), plano de pagamento e cobrança padrão. Fortemente PII (CGCENT pode ser CPF quando TIPOFJ='F'). |
| **PCFORNEC** | dimensao | 200 | 1 linha por fornecedor (PK CODFORNEC) | Dimensão Fornecedor (compras e vínculo do produto). Endereço fica em ENDER (não ENDERECO); telefone em TELEFONECOM/TELCOB. CGC pode ser CPF de PF. |
| **PCUSUARI** | dimensao | 8 | 1 linha por RCA/vendedor (PK CODUSUR) | Dimensão Vendedor (RCA). Hierarquia comercial: CODSUPERVISOR → PCSUPERV. 8 RCAs na base. Contém dados pessoais (CPF, nascimento, endereço). |
| **PCSUPERV** | dimensao | 2 | 1 linha por supervisor (PK CODSUPERVISOR) | Dimensão Supervisor (nível acima do RCA na hierarquia comercial). Possui CODGERENTE para um nível gerencial adicional. Apenas 2 linhas na base. |
| **PCPRACA** | dimensao | 28 | 1 linha por praça (PK CODPRACA) | Dimensão Praça (território de venda do cliente). Sobe para região (NUMREGIAO→PCREGIAO) e rota (ROTA→PCROTAEXP). Sem PII. |
| **PCEMPR** | dimensao | 28 | 1 linha por funcionário (PK MATRICULA) | Dimensão Funcionário (operadores internos, compradores, motoristas; a FK usual nos fatos administrativos é MATRICULA ou CODFUNC* dependendo da tabela). Contém CPF/endereço — PII. Não confundir com PCUSUARI (RCA). |
| **PCPLPAG** | dimensao | 34 | 1 linha por plano de pagamento (PK CODPLPAG) | Dimensão Plano de Pagamento (condição/prazo). NUMDIAS traz o prazo médio; PRAZO1..PRAZO12 os vencimentos das parcelas. Sem PII. |
| **PCCOB** | dimensao | 54 | 1 linha por tipo de cobrança (PK CODCOB, alfanumérica) | Dimensão Cobrança (forma de recebimento: dinheiro, boleto, cartão, PIX...). Usada por PCCLIENT, PCPEDC e PCPREST. Sem PII. |
| **PCDEPTO** | dimensao | 9 | 1 linha por departamento (PK CODEPTO) | Topo da hierarquia mercadológica de produto (departamento ← seção ← produto). Sem PII. |
| **PCSECAO** | dimensao | 43 | 1 linha por seção (PK CODSEC) | Nível intermediário da hierarquia de produto: PCPRODUT.CODSEC → PCSECAO.CODEPTO → PCDEPTO. Sem PII. |
| **PCMARCA** | dimensao | 31 | 1 linha por marca (PK CODMARCA) | Dimensão Marca do produto. Sem PII. |
| **PCCONTA** | dimensao | 221 | 1 linha por conta gerencial (PK CODCONTA) | Dimensão Conta Gerencial (plano gerencial usado pelo financeiro PCFINANC*/PCPREST). Sobe para grupo via GRUPOCONTA → PCGRUPO.CODGRUPO (a coluna NÃO se chama CODGRUPO). Sem PII. |
| **PCGRUPO** | dimensao | 24 | 1 linha por grupo de conta gerencial (PK CODGRUPO) | Topo da hierarquia gerencial financeira (grupo ← conta). Tabela enxuta (4 colunas). Sem PII. |
| **PCCIDADE** | dimensao | 5.564 | 1 linha por município (PK CODCIDADE) | Dimensão geográfica de referência (municípios com código IBGE). Complementar: PCCLIENT.CODCIDADE e PCFORNEC.CODCIDADE apontam para cá. Sem PII. |
| **PCESTADO** | dimensao | 27 | 1 linha por UF (PK UF) | Dimensão UF (27 estados). Sem PII. |
| **PCREGIAO** | dimensao | 5 | 1 linha por região comercial (PK NUMREGIAO) | Dimensão Região comercial (topo da hierarquia cliente→praça→região; região também precifica via PCTABPR). Sem PII. |
| **PCROTAEXP** | dimensao | 6 | 1 linha por rota (PK CODROTA) | Dimensão Rota de entrega/venda (PCPRACA.ROTA → PCROTAEXP.CODROTA). Sem PII. |
| **PCATIVI** | dimensao | 71 | 1 linha por ramo de atividade (PK CODATIV) | Dimensão Ramo de Atividade do cliente (PCCLIENT.CODATV1 → PCATIVI). Sem PII. |
| **PCCATEGORIA** | dimensao | 71 | 1 linha por categoria dentro da seção (PK composta CODSEC+CODCATEGORIA) | Nível opcional da hierarquia mercadológica (produto→categoria→seção). Join com PCPRODUT exige as duas colunas (CODSEC e CODCATEGORIA). PCSUBCATEGORIA e PCLINHAPROD existem mas estão vazias. Sem PII. |
| **PCPRODFILIAL** | apoio | 706 | 1 linha por produto × filial (PK composta) | Parametrização do produto por filial (status de venda, tributação local). Útil como atributo 'produto ativo na filial'; não é dimensão própria — enriquece a dimensão Produto. Sem PII. |
| **PCEMBALAGEM** | apoio | 742 | 1 linha por código de barras × filial (PK CODFILIAL+CODAUXILIAR) | Embalagens/códigos de barras adicionais por produto e filial (varejo). Apoio à dimensão Produto para resolver EAN/DUN alternativos. Sem PII. |
| **PCFORNECFILIAL** | apoio | 203 | 1 linha por fornecedor × filial (PK composta) | Parametrização do fornecedor por filial. Enriquece a dimensão Fornecedor; não é dimensão própria. Sem PII relevante além do vínculo. |
| **PCCLIENTENDENT** | apoio | 2 | 1 linha por endereço de entrega do cliente (PK CODCLI+CODENDENTCLI) | Endereços de entrega adicionais do cliente. Todas as colunas de endereço/contato desta tabela são PII e devem ser mascaradas em bloco. |
| **DIM_TEMPO (gerada no BI)** | dimensao | — | 1 linha por dia do calendário | Dimensão Tempo — NÃO existe no Winthor; gerar na modelagem do BI cobrindo pelo menos 01/10/2025 até o horizonte de planejamento. Atributos: data, ano, semestre, trimestre, mês (número e nome), semana ISO, dia, dia da semana, flag fim de semana, flag dia útil e feriados (calendário nacional + municipal da sede). Conecta-se a PCMOV.DTMOV, PCPEDC.DATA, PCNFSAID.DTSAIDA, PCPREST.DTVENC/DTPAG, PCCLIENT.DTCADASTRO etc. (todas confirmadas no dicionário). |

### Colunas-chave documentadas

#### PCFILIAL  <sub>(dimensao; PK: CODIGO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODIGO | VARCHAR2 | Código | PK (FK nos fatos = CODFILIAL) | não |
| RAZAOSOCIAL | VARCHAR2 | Razão social | atributo descritivo | não |
| FANTASIA | VARCHAR2 | Nome de fantasia | atributo descritivo | não |
| CGC | VARCHAR2 | CNPJ | documento fiscal | sim |
| IE | VARCHAR2 | Inscrição estadual | documento fiscal | sim |
| ENDERECO | VARCHAR2 | Endereço | endereço | sim |
| CIDADE | VARCHAR2 | Cidade | atributo geográfico | não |
| UF | VARCHAR2 | UF | atributo geográfico | não |
| TELEFONE | VARCHAR2 | Telefone | contato | sim |
| EMAIL | VARCHAR2 | Email | contato | sim |
| DTEXCLUSAO | DATE | (sem rótulo) | soft delete (ativa quando NULL) | não |

#### PCPRODUT  <sub>(dimensao; PK: CODPROD)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPROD | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2 | Descrição | atributo descritivo | não |
| CODEPTO | NUMBER | Departamento | FK → PCDEPTO (redundante à via CODSEC) | não |
| CODSEC | NUMBER | Seção | FK → PCSECAO (hierarquia produto→seção→depto) | não |
| CODCATEGORIA | NUMBER | Categoria | FK → PCCATEGORIA (junto com CODSEC) | não |
| CODMARCA | NUMBER | Marca | FK → PCMARCA | não |
| CODFORNEC | NUMBER | Fornecedor | FK → PCFORNEC | não |
| EMBALAGEM | VARCHAR2 | Embalagem | atributo descritivo | não |
| UNIDADE | VARCHAR2 | Unidade de venda | atributo descritivo | não |
| CODAUXILIAR | NUMBER | Unidade Venda [EAN8, UPC12, EAN13, e DUN14] | código de barras | não |
| NBM | VARCHAR2 | NCM | classificação fiscal | não |
| PESOLIQ | NUMBER | Peso líquido (Kg) | métrica física p/ logística | não |
| DTCADASTRO | DATE | Dt.Cadastro | data de cadastro | não |
| DTEXCLUSAO | DATE | Data Exclusão | soft delete (ativo quando NULL) | não |

#### PCCLIENT  <sub>(dimensao; PK: CODCLI)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCLI | NUMBER | Código | PK | não |
| CLIENTE | VARCHAR2 | Cliente | nome/razão social | sim |
| FANTASIA | VARCHAR2 | Fantasia | nome fantasia | sim |
| CGCENT | VARCHAR2 | CNPJ/CPF | documento (CPF se TIPOFJ='F') | sim |
| IEENT | VARCHAR2 | Insc. Est. / Produtor | documento fiscal | sim |
| TIPOFJ | VARCHAR2 | Tipo de Pessoa | PF/PJ — define regra de mascaramento | não |
| ENDERENT | VARCHAR2 | Endereço Comercial | endereço | sim |
| BAIRROENT | VARCHAR2 | Bairro | endereço | sim |
| MUNICENT | VARCHAR2 | Município | atributo geográfico (agregável) | não |
| ESTENT | VARCHAR2 | Estado | atributo geográfico (agregável) | não |
| CEPENT | VARCHAR2 | CEP | endereço | sim |
| TELENT | VARCHAR2 | Telefone Comercial | contato | sim |
| EMAIL | VARCHAR2 | E-mail | contato | sim |
| EMAILNFE | VARCHAR2 | E-mail NF-e | contato | sim |
| LATITUDE | VARCHAR2 | Latitude | geolocalização precisa | sim |
| LONGITUDE | VARCHAR2 | Longitude | geolocalização precisa | sim |
| CODPRACA | NUMBER | Praça | FK → PCPRACA (hierarquia cliente→praça→região) | não |
| CODATV1 | NUMBER | Atividade | FK → PCATIVI (ramo) | não |
| CODUSUR1 | NUMBER | RCA 1 | FK → PCUSUARI (RCA titular da carteira) | não |
| CODPLPAG | NUMBER | Plano de Pagamento | FK → PCPLPAG | não |
| CODCOB | VARCHAR2 | Código cobrança | FK → PCCOB | não |
| CODCIDADE | NUMBER | Cidade IBGE | FK → PCCIDADE (código IBGE) | não |
| LIMCRED | NUMBER | Limite de crédito | atributo de crédito | não |
| BLOQUEIO | VARCHAR2 | Bloqueio | flag de bloqueio comercial | não |
| DTCADASTRO | DATE | Data e Hora de Cadastro | data de cadastro (prospecção) | não |
| DTULTCOMP | DATE | Data da Última Compra | recência (inatividade) | não |
| DTEXCLUSAO | DATE | Data de Exclusão | soft delete (ativo quando NULL) | não |
| CODREDE | NUMBER | Rede de Cliente | agrupador de rede | não |

#### PCFORNEC  <sub>(dimensao; PK: CODFORNEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | Código | PK | não |
| FORNECEDOR | VARCHAR2 | Fornecedor | nome/razão social | sim |
| FANTASIA | VARCHAR2 | Fantasia | nome fantasia | sim |
| CGC | VARCHAR2 | CNPJ/CPF | documento | sim |
| ENDER | VARCHAR2 | Endereço | endereço | sim |
| CIDADE | VARCHAR2 | Cidade | atributo geográfico | não |
| CEP | VARCHAR2 | CEP | endereço | sim |
| TELEFONECOM | VARCHAR2 | Telefone | contato | sim |
| EMAIL | VARCHAR2 | E-Mail | contato | sim |
| CONTATO | VARCHAR2 | Contato | nome de pessoa de contato | sim |
| TIPOFORNEC | VARCHAR2 | Tipo fornecedor | classificação | não |
| CODFORNECPRINC | NUMBER | Cod.Fornec.Princ | auto-FK (grupo de fornecedores) | não |
| CODCOMPRADOR | NUMBER | Comprador | FK → PCEMPR (comprador responsável) | não |
| PRAZOENTREGA | NUMBER | Prazo entrega - Lead Time (dias) | métrica de suprimentos | não |
| CODCIDADE | NUMBER | Cidade IBGE | FK → PCCIDADE | não |
| DTEXCLUSAO | DATE | Data Exclusão | soft delete | não |

#### PCUSUARI  <sub>(dimensao; PK: CODUSUR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODUSUR | NUMBER | Código | PK (FK nos fatos: PCMOV/PCPEDC.CODUSUR, PCCLIENT.CODUSUR1) | não |
| NOME | VARCHAR2 | Nome | nome do RCA | sim |
| CODSUPERVISOR | NUMBER | Supervisor | FK → PCSUPERV (hierarquia RCA→supervisor) | não |
| CODFILIAL | VARCHAR2 | Filial | FK → PCFILIAL | não |
| CPF | VARCHAR2 | CPF | documento | sim |
| CGC | VARCHAR2 | CNPJ | documento (RCA PJ) | sim |
| EMAIL | VARCHAR2 | E-Mail | contato | sim |
| TELEFONE1 | VARCHAR2 | Telefone 1 | contato | sim |
| ENDERECO | VARCHAR2 | Endereço | endereço | sim |
| DTNASC | DATE | Data de nascimento | dado pessoal | sim |
| DTTERMINO | DATE | Data de fim | desligamento (ativo quando NULL) | não |
| BLOQUEIO | VARCHAR2 | Bloqueio | flag de bloqueio | não |

#### PCSUPERV  <sub>(dimensao; PK: CODSUPERVISOR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSUPERVISOR | NUMBER | Código | PK | não |
| NOME | VARCHAR2 | Nome | nome do supervisor | sim |
| EMAIL | VARCHAR2 | (sem rótulo) | contato | sim |
| CODGERENTE | NUMBER | Código do gerente | FK nível gerente (hierarquia opcional) | não |

#### PCPRACA  <sub>(dimensao; PK: CODPRACA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPRACA | NUMBER | Código | PK | não |
| PRACA | VARCHAR2 | Praça | atributo descritivo | não |
| NUMREGIAO | NUMBER | Região | FK → PCREGIAO (hierarquia praça→região) | não |
| ROTA | NUMBER | Rota | FK → PCROTAEXP | não |
| CODMUNIC | NUMBER | (sem rótulo) | provável FK → PCCIDADE (validar) | não |
| SITUACAO | VARCHAR2 | Situação | ativa/inativa | não |

#### PCEMPR  <sub>(dimensao; PK: MATRICULA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| MATRICULA | NUMBER | Matrícula | PK | não |
| NOME | VARCHAR2 | Nome | nome do funcionário | sim |
| CPF | VARCHAR2 | CPF | documento | sim |
| ENDERECO | VARCHAR2 | Endereço | endereço | sim |
| EMAIL | VARCHAR2 | Email | contato | sim |
| CODFILIAL | VARCHAR2 | Cód. da filial | FK → PCFILIAL | não |
| CODSETOR | NUMBER | Cód. do setor | setor | não |
| FUNCAO | VARCHAR2 | Funcao | cargo/função | não |
| SITUACAO | VARCHAR2 | Situação | ativo/inativo (validar domínio) | não |
| USUARIOBD | VARCHAR2 | Usuário (login) | login Oracle (auditoria) | sim |
| CODUSUR | NUMBER | Cód. do usuário | ponte funcionário→RCA (PCUSUARI) | não |
| DTDEMISSAO | DATE | (sem rótulo) | desligamento | não |

#### PCPLPAG  <sub>(dimensao; PK: CODPLPAG)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPLPAG | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2 | Descrição | atributo descritivo | não |
| NUMDIAS | NUMBER | Prazo médio | prazo médio em dias | não |
| PRAZO1 | NUMBER | Número de dias 1 | parcela 1 (há PRAZO2, PRAZO3...) | não |
| TIPOPRAZO | VARCHAR2 | Tipo de prazo | classificação do prazo | não |

#### PCCOB  <sub>(dimensao; PK: CODCOB)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCOB | VARCHAR2 | Código | PK | não |
| COBRANCA | VARCHAR2 | Nome | atributo descritivo | não |
| BOLETO | VARCHAR2 | Boleto bancário | flag boleto | não |
| CARTAO | VARCHAR2 | Cartão de crédito | flag cartão | não |
| CODMOEDA | VARCHAR2 | Moeda | FK → PCMOEDA | não |
| CODFILIAL | VARCHAR2 | Filial | FK → PCFILIAL (quando restrita) | não |

#### PCDEPTO  <sub>(dimensao; PK: CODEPTO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODEPTO | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2 | Descrição | atributo descritivo | não |
| TIPOMERC | VARCHAR2 | Tipo mercadoria | classificação | não |

#### PCSECAO  <sub>(dimensao; PK: CODSEC)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSEC | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2 | Descrição | atributo descritivo | não |
| CODEPTO | NUMBER | Código do identificador do departamento | FK → PCDEPTO | não |
| DTEXCLUSAO | DATE | (sem rótulo) | soft delete | não |

#### PCMARCA  <sub>(dimensao; PK: CODMARCA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODMARCA | NUMBER | Código | PK | não |
| MARCA | VARCHAR2 | Descrição | atributo descritivo | não |

#### PCCONTA  <sub>(dimensao; PK: CODCONTA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCONTA | NUMBER | Código da conta | PK | não |
| CONTA | VARCHAR2 | Nome da conta | atributo descritivo | não |
| GRUPOCONTA | NUMBER | Código do grupo | FK → PCGRUPO.CODGRUPO (hierarquia conta→grupo) | não |
| TIPO | VARCHAR2 | Tipo de conta | classificação (validar domínio) | não |
| CONTACONTABIL | VARCHAR2 | Conta contábil | de-para contábil | não |

#### PCGRUPO  <sub>(dimensao; PK: CODGRUPO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODGRUPO | NUMBER | Código | PK | não |
| GRUPO | VARCHAR2 | Nome do grupo | atributo descritivo | não |

#### PCCIDADE  <sub>(dimensao; PK: CODCIDADE)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCIDADE | NUMBER | codcidade | PK | não |
| NOMECIDADE | VARCHAR2 | Nome | atributo descritivo | não |
| UF | VARCHAR2 | UF | FK → PCESTADO | não |
| CODIBGE | NUMBER | Código do IBGE | chave de integração externa | não |

#### PCESTADO  <sub>(dimensao; PK: UF)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| UF | VARCHAR2 | UF | PK | não |
| ESTADO | VARCHAR2 | Estado | nome do estado | não |
| CODIBGE | NUMBER | Código IBGE | chave de integração externa | não |
| CODPAIS | NUMBER | País | FK → PCPAIS | não |

#### PCREGIAO  <sub>(dimensao; PK: NUMREGIAO)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| NUMREGIAO | NUMBER | Nº da região | PK | não |
| REGIAO | VARCHAR2 | Descrição | atributo descritivo | não |
| STATUS | VARCHAR2 | Situação | ativa/inativa | não |

#### PCROTAEXP  <sub>(dimensao; PK: CODROTA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODROTA | NUMBER | Código | PK | não |
| DESCRICAO | VARCHAR2 | Descrição | atributo descritivo | não |

#### PCATIVI  <sub>(dimensao; PK: CODATIV)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODATIV | NUMBER | Código | PK | não |
| RAMO | VARCHAR2 | Ramo | atributo descritivo | não |

#### PCCATEGORIA  <sub>(dimensao; PK: CODSEC, CODCATEGORIA)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODSEC | NUMBER | Cod. Seção | PK parte 1 / FK → PCSECAO | não |
| CODCATEGORIA | NUMBER | Código | PK parte 2 | não |
| CATEGORIA | VARCHAR2 | Categoria | atributo descritivo | não |

#### PCPRODFILIAL  <sub>(apoio; PK: CODPROD, CODFILIAL)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODPROD | NUMBER | Código do produto | PK parte 1 / FK → PCPRODUT | não |
| CODFILIAL | VARCHAR2 | Filial | PK parte 2 / FK → PCFILIAL | não |

#### PCEMBALAGEM  <sub>(apoio; PK: CODFILIAL, CODAUXILIAR)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFILIAL | VARCHAR2 | Filial | PK parte 1 | não |
| CODAUXILIAR | NUMBER | Código de barras | PK parte 2 (EAN/DUN) | não |

#### PCFORNECFILIAL  <sub>(apoio; PK: CODFORNEC, CODFILIAL)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODFORNEC | NUMBER | Fornecedor | PK parte 1 / FK → PCFORNEC | não |
| CODFILIAL | VARCHAR2 | Filial | PK parte 2 / FK → PCFILIAL | não |

#### PCCLIENTENDENT  <sub>(apoio; PK: CODCLI, CODENDENTCLI)</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| CODCLI | NUMBER | Código do cliente | PK parte 1 / FK → PCCLIENT | não |
| CODENDENTCLI | NUMBER | Código do endereço | PK parte 2 | não |

#### DIM_TEMPO (gerada no BI)  <sub>(dimensao; PK: DATA (surrogate: AAAAMMDD))</sub>

| COLUNA | TIPO_DADO | RÓTULO | PAPEL | PII |
|---|---|---|---|---|
| SK_DATA | NUMBER | Chave AAAAMMDD | PK surrogate | não |
| DATA | DATE | Data | chave natural de junção com colunas DT* dos fatos | não |
| ANO/MES/TRIMESTRE/SEMANA | NUMBER | Períodos | hierarquia ano→trimestre→mês→dia | não |
| FLG_DIA_UTIL | VARCHAR2 | Dia útil | flag para métricas por dia útil | não |

---

## Dimensões conformadas

Hierarquias confirmadas no dicionário Winthor, compartilhadas entre os módulos (base do modelo estrela):

| HIERARQUIA | CAMINHO (folha → topo) | OBSERVAÇÕES |
|---|---|---|
| Mercadológica (produto) | PCPRODUT.CODSEC → PCSECAO.CODEPTO → PCDEPTO | Usar o CODEPTO **da seção** (não o do produto) para evitar divergência entre os dois caminhos. Nível opcional: PCPRODUT (CODSEC+CODCATEGORIA) → PCCATEGORIA (PK composta — o join exige as duas colunas). PCSUBCATEGORIA e PCLINHAPROD estão vazias (níveis não usados). |
| Marca | PCPRODUT.CODMARCA → PCMARCA | 31 marcas. |
| Fornecedor do produto | PCPRODUT.CODFORNEC → PCFORNEC (→ CODCOMPRADOR → PCEMPR) | Corte de mix por fornecedor e comprador responsável. |
| Comercial | fatos.CODUSUR → PCUSUARI.CODSUPERVISOR → PCSUPERV (→ CODGERENTE) | 8 RCAs, 2 supervisores — validar preenchimento (P-47). Carteira do cliente: PCCLIENT.CODUSUR1 (há CODUSUR2/3). |
| Geográfica comercial | PCCLIENT.CODPRACA → PCPRACA.NUMREGIAO → PCREGIAO; PCPRACA.ROTA → PCROTAEXP | Região também precifica (PCTABPR.NUMREGIAO). |
| Geográfica IBGE | PCCLIENT/PCFORNEC.CODCIDADE → PCCIDADE.UF → PCESTADO | PCCIDADE traz código IBGE e lat/long (habilita mapas). Enriquecimento setorial: PCATIVI (ramo) e PCCNAE. |
| Gerencial financeira | PCLANC.CODCONTA → PCCONTA.GRUPOCONTA → PCGRUPO.CODGRUPO | ATENÇÃO: a FK em PCCONTA chama-se **GRUPOCONTA** (não CODGRUPO). |
| Filial | fatos.CODFILIAL → PCFILIAL.CODIGO | PK da dimensão chama-se **CODIGO**. Filial 99 = 'TODAS FILIAIS' (consolidadora) — excluir; só a filial 1 opera. |
| Cobrança / plano de pagamento | CODCOB → PCCOB; CODPLPAG → PCPLPAG | Compartilhadas entre Vendas e Financeiro-CR; PCCOB também identifica cobranças internas a excluir (P-26). |
| Tempo | **DIM_TEMPO gerada no BI** (grão dia, desde 01/10/2025) | Não existe no Winthor. Atributos: ano/semestre/trimestre/mês/semana ISO/dia, flags fim de semana, dia útil e feriados. Junta com PCMOV.DTMOV, PCPEDC.DATA, PCNFSAID.DTSAIDA, PCNFENT.DTENT, PCPREST.DTVENC/DTPAG, PCLANC.DTVENC/DTPAGTO etc. |

**LGPD / PII:** colunas marcadas `PII = sim` concentram-se em PCCLIENT, PCFORNEC, PCUSUARI, PCEMPR, PCSUPERV, PCFILIAL, PCCLIENTENDENT, PCNFSAID (dados do destinatário), PCPREST (CGCCPFCH), PCVERBA (dados do representante), PCPEDCFV/PCPEDIFV (CGCCLI) e PCLOGESTOQUE (USUARIO). Regra prática para o BI: expor código + razão social/fantasia; mascarar CPF/CNPJ, endereços, telefones, e-mails e lat/long. Os logs PCLOGALTCLI, PCLOGDADOSPESSOAS e PCLOGALTERACAODADOS contêm PII em histórico de alterações e **não devem ser expostos** em hipótese alguma.

---

## Tabelas de negócio não cobertas (achados da cobertura)

Classificação das 70 maiores tabelas do inventário: 13 cobertas pelos módulos, 50 logs/técnicas (excluir do BI) e 7 de **negócio não coberto** pelo plano original (categoria `negocio_nao_coberto`). Cinco delas foram absorvidas pelos módulos durante o discovery; duas permanecem fora da primeira onda.

| TABELA | LINHAS | O QUE É | RECOMENDAÇÃO | SITUAÇÃO ATUAL |
|---|---:|---|---|---|
| PCHISTEST | 136.767 | Snapshot **diário** de estoque por filial+produto+dia (PK confirmada) — única fonte de posição histórica de estoque | Incluir com alta prioridade: série de valor de estoque, estoque médio p/ giro, cobertura (DIO) | **Absorvida** — módulo ESTOQUE-PRODUTOS (EST-02, EST-04) |
| PCDTPROD | 119.896 | Agregado diário nativo por produto/filial (venda, entrada, devolução, perda, custos) | Usar como conferência/tie-out dos fatos de PCMOV e tendência diária barata; não como fonte primária | **Absorvida** — módulo ESTOQUE-PRODUTOS (EST-09, a validar) |
| PCPRECO | 7.685 | Histórico de alterações de preço (PVENDAANT→PVENDA, desconto máx., oferta, quem/quando/rotina); sem PK | Segunda onda: KPIs de frequência/magnitude de reajuste e governança de pricing (P-52) | Fora da 1ª onda |
| PCLANC | 4.786 | Contas a pagar clássico do Winthor (PK RECNUM; vencimento/pagamento/fornecedor/conta gerencial; retenções). A base **não usa PCPAGAR** | Incluir como fato de despesas/CAP; validar sobreposição com PCFINANC3LANCFORNEC (P-38) | **Absorvida** — módulo FINANCEIRO-PCFINANC (FCP-01..FCP-08) |
| PCPEDIFV | 3.919 | Staging dos itens de pedido do Força de Vendas (QT vs QT_FATURADA); ponte PCPEDIPCPEDIFV; PII: CGCCLI | Prioridade baixa: só se quiserem KPI de conversão FV→ERP e corte; risco de dupla contagem com PCPEDI | Documentada como apoio em VENDAS-FATURAMENTO; sem KPI |
| PCTABPR | 3.487 | Tabela de preços vigente por região×produto (PTABELA, PVENDA, PERDESCMAX, MARGEM) | Dimensão auxiliar de pricing (preço praticado vs tabela, aderência de margem); confirmar regiões ativas (P-53) | Documentada como apoio em VENDAS/ESTOQUE; sem KPI dedicado |
| PCNFBASE | 2.987 | Bases de cálculo de ICMS por NF × CFOP × alíquota (saídas e entradas); sem PK | Não incluir na 1ª onda; reavaliar se surgir demanda de BI fiscal (carga tributária por CFOP/UF) | Fora da 1ª onda |

**Descartes confirmados pela cobertura** (candidatos que se revelaram técnicos): PCPARAMFAT (206k — snapshot de parâmetros a cada faturamento), PCCONTROI/PCCONTRO/PCLIB (permissões de acesso), PCTABELAMDIC (redundante com PCNCM). PCNCM (10k) e PCCNAE (3,7k) entram como enriquecimento das dimensões produto e cliente.

---

## Pendências de validação na base (consolidado, dedupe)

Pendências dos seis agentes de módulo, deduplicadas e priorizadas. Todas são consultas **somente leitura** no Oracle. Prioridade: **A** = bloqueia/condiciona KPI publicado; **B** = refina a definição; **C** = governança/segunda onda. Entre colchetes, a origem (módulo/pendência original).

### Transversais

- **P-01 (A)** Decodificar o domínio completo de `PCMOV.CODOPER` (S, SB, SD, SR, SM, SP, E, ED, EB, ER, EA, EI, EP) via PCCFO — define venda ('S'), devolução de cliente (hipótese 'ED'), devolução a fornecedor (hipótese 'SD') e bonificações ('SB'/'EB'); condiciona VEN-02/VEN-08, EST (venda líquida p/ cobertura e giro) e CMP-01/CMP-08. SQL: `SELECT m.codoper, m.codfiscal, f.desccfo, COUNT(*) qt, SUM(m.qt*m.punit) vl FROM pcmov m LEFT JOIN pccfo f ON f.codfiscal = m.codfiscal GROUP BY m.codoper, m.codfiscal, f.desccfo ORDER BY m.codoper, qt DESC;` Complementos: cruzar `E%` com PCNFENT.TIPODESCARGA/ESPECIE e conferir contra PCAUXVENDA.VLDEVOLUCAO. [VEN-1/9, EST-6, CMP-1]
- **P-02 (A)** Filial 99 (consolidadora) nas fatos — risco de dupla contagem em TODOS os módulos. SQL padrão: `SELECT codfilial, COUNT(*), SUM(<medida>) FROM <fato> GROUP BY codfilial;` aplicar a PCMOV, PCNFSAID, PCPEDC, PCEST, PCHISTEST, PCDTPROD, PCNFENT, PCPREST, PCLANC, PCFINANC e PCFINANC2. [VEN-8, EST-1, CMP-7, FCR-4, FCP-5, DIM-2]
- **P-03 (A)** Definir a visão oficial de custo (CUSTOFIN × CUSTOREAL × CUSTOCONT) e qual coluna está efetivamente populada em PCMOV/PCEST — margem bruta (VEN-07), CMV do giro (EST-04) e valor de estoque (EST-01) devem usar a MESMA visão. SQL: `SELECT COUNT(*) tot, COUNT(NULLIF(custoreal,0)) c_real, COUNT(NULLIF(custofin,0)) c_fin, COUNT(NULLIF(custocont,0)) c_cont, COUNT(custoultent) c_ult, COUNT(custorep) c_rep FROM pcmov WHERE codoper = 'S';` e comparar `SELECT SUM(qtestger*NVL(custofin,0)), SUM(qtestger*NVL(custoreal,0)), SUM(qtestger*NVL(custocont,0)) FROM pcest WHERE codfilial='1'` com o relatório oficial (rotina 1118). [VEN-2, EST-3]
- **P-04 (A)** Conciliar item × cabeçalho — define a medida canônica de faturamento: PUNIT é líquido de desconto? PCNFSAID.VLTOTAL inclui frete/IPI/ST? SQL: `SELECT n.numtransvenda, n.vltotal, SUM(m.qt*m.punit) soma_itens FROM pcnfsaid n JOIN pcmov m ON m.numtransvenda = n.numtransvenda AND m.codoper = 'S' WHERE n.dtcancel IS NULL GROUP BY n.numtransvenda, n.vltotal HAVING ABS(n.vltotal - SUM(m.qt*m.punit)) > 0.01 FETCH FIRST 50 ROWS ONLY;` [VEN-3, DIM-1]
- **P-05 (B)** Unicidade de PCMOV.NUMTRANSITEM (PK não declarada; PK de PCMOVCOMPLE é NUMTRANSITEM): `SELECT COUNT(*), COUNT(DISTINCT numtransitem), COUNT(numtransitem) FROM pcmov;` [VEN-11]

### Vendas-Faturamento

- **P-06 (A)** Cobertura de PCCONSOLIDARECEITA sobre as NFs de saída válidas (fonte dos impostos do faturamento líquido VEN-02): `SELECT COUNT(*) FROM pcnfsaid n WHERE n.dtcancel IS NULL AND NOT EXISTS (SELECT 1 FROM pcconsolidareceita r WHERE r.numtransvenda = n.numtransvenda);` [VEN-4]
- **P-07 (B)** Domínio de CONDVENDA/TIPOVENDA em PCNFSAID (tratamento de bonificações e vendas especiais no faturamento bruto). [VEN-5]
- **P-08 (B)** Domínio de PCMOV.STATUS (NOT NULL, sem rótulo). [VEN-6]
- **P-09 (B)** Domínio de PCCONSOLIDAMES.TIPO (define a entidade de CODIGO — pré-requisito para usar o agregado como conferência mensal e atalho de giro). [VEN-7, EST-8]
- **P-10 (B)** PCAUXVENDA não tem CODFILIAL — confirmar que consolida a empresa e que VLVENDAFATURADA bate com PCMOV (conferência mensal). [VEN-10]
- **P-11 (B)** Medir quanto de PCNFSAID NÃO é venda (remessas, devolução a fornecedor) para documentar o filtro do ticket médio VEN-03. [VEN-12]

### Estoque-Produtos

- **P-12 (B)** Cadência e lacunas de PCHISTEST (dias corridos × úteis) — condiciona a série EST-02 e o estoque médio de EST-04. [EST-2]
- **P-13 (A)** PCDTPROD sem PK: validar unicidade do grão (codfilial, codprod, dtmov) e reconciliar `SUM(QTVENDA)` com PCMOV CODOPER='S' — condiciona EST-09. SQL: `SELECT COUNT(*) total, COUNT(DISTINCT codfilial||'~'||codprod||'~'||TO_CHAR(dtmov,'YYYYMMDD')) distintos FROM pcdtprod;` [EST-4/5]
- **P-14 (B)** QTINDENIZ (avaria) está contida em QTESTGER ou é saldo à parte? (afeta a composição EST-08). [EST-7]
- **P-15 (C)** PCLOTE vazia: confirmar que nenhum produto controla lote/validade (`SELECT NVL(controledevalidade,'N'), COUNT(*) FROM pcprodfilial GROUP BY NVL(controledevalidade,'N');`) — relevante para distribuidora de higiene. [EST-9]
- **P-16 (C)** PCEST.QTVENDMES/QTVENDMES1-3/QTVENDDIA são atualizadas nesta instalação? (dariam cobertura sem JOIN em PCMOV). [EST-10]
- **P-17 (B)** Preenchimento de PCPRODFILIAL.ATIVO/FORALINHA (nulos em massa distorcem o denominador da ruptura EST-05). [EST-11]

### Compras-Suprimentos

- **P-18 (A)** Status derivado do pedido de compra (PCPEDIDO não tem POSICAO): medir preenchimento de DTENTRADAESTOQUE, DTPREVENT, DTFATUR, VLENTREGUE e PCITEM.QTENTREGUE — condiciona CMP-03 (lead time), CMP-05 (exclusão de cancelados) e CMP-06 (fill rate). SQL: `SELECT COUNT(*) total, COUNT(dtentradaestoque), COUNT(dtprevent), COUNT(dtfatur), COUNT(vlentregue), SUM(CASE WHEN vlentregue >= vltotal THEN 1 ELSE 0 END) FROM pcpedido;` [CMP-2]
- **P-19 (A)** Fórmula do valor de item de entrada (QT×PUNIT vs QTCONT×PUNITCONT; inclui IPI/frete?) contra PCNFENT.VLTOTAL — condiciona CMP-07. SQL: `SELECT n.numtransent, n.vltotal, SUM(m.qt*m.punit), SUM(m.qtcont*m.punitcont) FROM pcnfent n JOIN pcmov m ON m.numtransent = n.numtransent AND m.codoper = 'E' GROUP BY n.numtransent, n.vltotal FETCH FIRST 20 ROWS ONLY;` [CMP-3]
- **P-20 (B)** Vínculo PCMOV.NUMPED → PCPEDIDO nas entradas (habilita lead time fallback via nota e o % de compras sem pedido — 329 pedidos p/ 681 notas). [CMP-4/5]
- **P-21 (B)** Unicidade de NUMTRANSENT em PCNFENT (PK composta com CODCONT): `SELECT numtransent, COUNT(*) FROM pcnfent GROUP BY numtransent HAVING COUNT(*) > 1;` — se duplicar, somar valor por nota via subquery. [CMP-6]
- **P-22 (B)** PCNFENT.VLTOTAL inclui IPI/ST/frete? (colunas VLTOTALIPI, VLFRETE, VLOUTRAS existem) — define 'valor comprado' bruto vs mercadoria. [CMP-8]
- **P-23 (B)** Pré-entradas (PCNFENTPREENT, 254): estágio transitório ou histórico paralelo? Evita dupla contagem em painéis de recebimento. [CMP-9]
- **P-24 (C)** Domínio de TIPOFORNEC: isolar transportadoras/fornecedores de serviço do ranking de compras CMP-04. [CMP-10]

### Financeiro — Contas a Receber

- **P-25 (B)** Domínio de PCPREST.STATUS (rótulo vazio): há status de cancelado/estornado além de DTCANCEL? [FCR-1]
- **P-26 (A)** Cobranças internas a excluir da carteira/inadimplência (padrão Winthor: DEVP, CRED, BNF, BNFT, DESD...): `SELECT p.codcob, c.cobranca, COUNT(*), SUM(p.valor - NVL(p.vpago,0)) FROM pcprest p LEFT JOIN pccob c ON c.codcob = p.codcob WHERE p.dtpag IS NULL GROUP BY p.codcob, c.cobranca ORDER BY 4 DESC;` — condiciona FCR-01/FCR-02/FCR-03. [FCR-2]
- **P-27 (B)** Cancelados: conferir que DTCANCEL IS NULL não conflita com os 336 abertos já validados. [FCR-3]
- **P-28 (B)** Composição de VPAGO (inclui juros TXPERM? desconto?) — conferir contra os R$ 2.028.529,87 validados; decide se FCR-05 usa VPAGO ou VALOR. [FCR-5]
- **P-29 (B)** PCMOVCR: unicidade de NUMTRANS e domínio de TIPO (crédito/débito) para conciliar recebido por banco com PCPREST. [FCR-6]
- **P-30 (C)** Carteira sem NF de saída (avulsos, desdobramentos, cheques): medir `NOT EXISTS` contra PCNFSAID. [FCR-7]
- **P-31 (C)** PCCRECLI.SITUACAO: domínio + decisão de carteira bruta × líquida de créditos de cliente. [FCR-8]
- **P-32 (C)** Prorrogações: volume de DTVENC ≠ DTVENCORIG (duas visões de atraso no aging). [FCR-9]
- **P-33 (C)** Aging histórico é reconstrução aproximada (VPAGO é valor final, não saldo na data de referência) — documentar a limitação. [FCR-10]

### Financeiro — Contas a Pagar / família PCFINANC

- **P-34 (A)** Domínio de TIPODADO na família PCFINANC — destrava FCP-10/11/12 (PCFINANC2 tem 76.404 linhas). SQL: `SELECT 'PCFINANC2' tab, tipodado, COUNT(*), SUM(valor) FROM pcfinanc2 GROUP BY tipodado UNION ALL SELECT 'PCFINANC3LANCFORNEC', tipodado, COUNT(*), SUM(valor) FROM pcfinanc3lancfornec GROUP BY tipodado UNION ALL SELECT 'PCFINANC3PREST', tipodado, COUNT(*), SUM(valor) FROM pcfinanc3prest GROUP BY tipodado UNION ALL SELECT 'PCFINANC3LANCOUTROS', tipodado, COUNT(*), SUM(valor) FROM pcfinanc3lancoutros GROUP BY tipodado;` [FCP-1]
- **P-35 (A)** Múltiplas gerações por DATAREFERENCIA (CODROTINAGERACAO/TIPODADO) nos snapshots PCFINANC3* — risco de dupla contagem em FCP-11. [FCP-2]
- **P-36 (A)** Regra de status de PCLANC (aberto/pago/cancelado) e volume de estornos de baixa (DTESTORNOBAIXA) — sustenta FCP-01..FCP-06. SQL: `SELECT CASE WHEN dtcancel IS NOT NULL THEN 'CANCELADO' WHEN dtpagto IS NULL THEN 'ABERTO' ELSE 'PAGO' END st, COUNT(*), SUM(valor), SUM(NVL(vpago,0)), SUM(CASE WHEN dtestornobaixa IS NOT NULL THEN 1 ELSE 0 END) FROM pclanc GROUP BY CASE WHEN dtcancel IS NOT NULL THEN 'CANCELADO' WHEN dtpagto IS NULL THEN 'ABERTO' ELSE 'PAGO' END;` [FCP-3]
- **P-37 (B)** Reconciliar PCFINANC.SALDOCP com a soma de PCLANC em aberto na mesma data (confirma a semântica dos SALDOs, todos sem rótulo). [FCP-4]
- **P-38 (A)** Sobreposição PCLANC × PCFINANC3LANCFORNEC (27.392 fotos de ~4.786 lançamentos): comparar contagem/valores por período para garantir que o fato transacional é PCLANC e as fotos são derivadas — evita dupla contagem no CAP. [cobertura]
- **P-39 (B)** Domínios de PCLANC.TIPOLANC e TIPOPARCEIRO (excluir adiantamentos/transferências das despesas FCP-07/FCP-08). [FCP-6]
- **P-40 (B)** Cobertura temporal e % de nulos das datas de PCLANC (DTVENC, DTEMISSAO, DTCOMPETENCIA) usadas nos KPIs. [FCP-7]
- **P-41 (B)** Decodificar CODIGON/CODIGOA de PCFINANC2 por TIPODADO (hipótese: banco/cobrança/conta — cruzar com PCBANCO). [FCP-8]
- **P-42 (B)** PCFINANC3PREST é foto fiel de PCPREST? (mesma contagem/valor de abertos na última DATAREFERENCIA). [FCP-9]
- **P-43 (C)** Periodicidade de geração dos snapshots (PCFINANC.DTGERACAO / PCFINANC_LOG). [FCP-10]

### Dimensões conformadas

- **P-44 (B)** Domínios dos flags de status das dimensões (PCCLIENT.BLOQUEIO/TIPOFJ, PCEMPR.SITUACAO, PCPRACA.SITUACAO, PCREGIAO.STATUS, PCUSUARI.BLOQUEIO/DTTERMINO) — define o atributo Ativo/Inativo e o critério de 'carteira ativa' de VEN-05/DIM-03. [DIM-3, VEN-5]
- **P-45 (B)** Órfãos nas hierarquias (produto→seção→depto; cliente→praça) — integridade não garantida por FK declarada. [DIM-4]
- **P-46 (C)** Uso do nível Categoria: % de PCPRODUT com CODCATEGORIA preenchido (se baixo, modelar só até seção). [DIM-5]
- **P-47 (B)** Preenchimento da hierarquia comercial (PCSUPERV com 2 linhas; distribuição de CODSUPERVISOR em PCUSUARI). [DIM-6]
- **P-48 (B)** Vínculo PCCONTA.GRUPOCONTA → PCGRUPO (nome fora do padrão) + domínio de PCCONTA.TIPO (filtrar contas de receita/investimento nas despesas). [DIM-7]
- **P-49 (B)** PCCLIENT.DTULTCOMP é atualizada pelo faturamento? (base do DIM-08 — comparar com MAX(PCMOV.DTMOV) por cliente). [DIM-8]
- **P-50 (C)** PCPRACA.CODMUNIC referencia PCCIDADE.CODCIDADE? (sem rótulo no dicionário). [DIM-9]
- **P-51 (B)** MIN/MAX das datas dos fatos (PCMOV, PCPEDC, PCPREST, PCLANC) para dimensionar a DIM_TEMPO gerada no BI. [DIM-10]

### Segunda onda

- **P-52 (C)** PCPRECO: medir a frequência mensal de alterações de preço para decidir se KPIs de reajuste/pricing valem a pena. [cobertura]
- **P-53 (C)** PCTABPR: contar regiões ativas (`SELECT numregiao, COUNT(*) FROM pctabpr WHERE NVL(excluido,'N')='N' GROUP BY numregiao;`) antes de modelar a dimensão de pricing. [cobertura]
