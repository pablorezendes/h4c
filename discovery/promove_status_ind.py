"""Resolve as pendencias que travavam 8 indicadores em 'a_validar'.

Medicoes feitas na base real em 2026-07-17 (scripts validate_pendencias_ind.py,
investiga_notas_sem_item.py, investiga_pccfo.py):

P-IND01-D — o EXISTS codoper='S' REMOVE notas: 18 de 311 (R$ 31.789,33) em 30d.
  Essas notas carregam CODOPER='SR' = REMESSA de dispensers/equipamentos em comodato
  (TOALHEIRO 535 remessas x 1 venda; SABONETEIRA ESPUMA 400ML 159 x 0). Prova decisiva:
  293/293 notas com item 'S' geram titulo no contas a receber, contra 1/18 das notas 'SR'
  — o cliente nao paga por elas. ⇒ O EXISTS esta CORRETO e e NECESSARIO; a regua canonica
  da consolidacao fica confirmada. Positivados = 110 (nao 114); faturamento 30d = R$ 430.737
  (nao R$ 470.580).

P-IND02/09-REGUA — DTMOV ≡ DTSAIDA: 0 nulas e 0 divergencias em 1.273 itens de venda.
  ⇒ A regua da nota e a regua por DTMOV dao o mesmo conjunto; IND-02 e IND-09 confirmados.

Fica 'a_validar' apenas o que depende de DECISAO DO DONO (nao de medicao):
  IND-05 — a base comeca em out/2025, entao "primeira compra" e cega ao passado anterior.
"""
import json

PROMOVER = {
    "IND-01": "Regua canonica confirmada em 2026-07-17: as notas sem item 'S' sao remessas de comodato "
              "('SR'), que nao geram contas a receber (1/18 vs 293/293) — corretamente fora do faturamento. "
              "Faturamento 30d = R$ 430.737,86.",
    "IND-02": "Confirmado em 2026-07-17: DTMOV ≡ DTSAIDA (0 nulas, 0 divergencias em 1.273 itens). "
              "Regua da nota validada. 7.245 unidades em 30d.",
    "IND-03": "Confirmado: usa a mesma regua de venda do IND-01. R$ 3.915,80 = R$ 430.737,86 ÷ 110 clientes.",
    "IND-06": "Confirmado: janela de 90d sobre a regua canonica de venda. 161 clientes ativos.",
    "IND-07": "Confirmado em 2026-07-17: 110 clientes (a diferenca para os 114 medidos antes eram 4 clientes "
              "que so receberam equipamento em comodato, sem comprar).",
    "IND-08": "Confirmado: 46,41% da carteira apta (110/237); 68,32% sobre a base ativa de 90d.",
    "IND-09": "Confirmado: CUSTOREAL e a visao oficial de custo (identica a CUSTOFIN nesta base, 100% "
              "populada). 28,98% em 30d / 31,59% em 90d. Margem BRUTA de mercadoria — nao desconta "
              "impostos, frete nem comissao.",
}

MANTEM = {
    "IND-05": "Depende de decisao do dono, nao de medicao: a base comeca em out/2025, entao clientes cuja "
              "1a compra foi anterior a isso aparecem como 'novos'. Serie confiavel a partir de ~jan/2026.",
}

caminho = "indicadores-spec.json"
doc = json.load(open(caminho, encoding="utf-8"))
for ind in doc["indicadores"]:
    if ind["id"] in PROMOVER:
        ind["status"] = "validado"
        ind["obs"] = ((ind.get("obs") or "") + " | " + PROMOVER[ind["id"]]).strip(" |")
    elif ind["id"] in MANTEM:
        ind["obs"] = ((ind.get("obs") or "") + " | " + MANTEM[ind["id"]]).strip(" |")

json.dump(doc, open(caminho, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

validados = sum(1 for i in doc["indicadores"] if i["status"] == "validado")
print(f"spec atualizada: {validados}/9 validados")
for i in doc["indicadores"]:
    print(f"  {i['id']} {i['status']}")
