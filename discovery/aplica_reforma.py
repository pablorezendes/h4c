"""Aplica a reforma de linguagem/viz na analises-spec.json.

Entrada: reforma-final.json — lista de itens {id, acao, titulo_novo, pergunta_nova,
como_calculado, como_ler, viz_nova{tipo,x,y,serie}, obs_viz, motivo_remocao}.
- acao=remover -> analise sai da spec (guardamos backup).
- textos novos substituem titulo/pergunta_negocio; tecnica vira como_calculado/como_ler.
- viz_nova substitui viz (mantendo campos extras da viz antiga se a nova nao definir x/y/serie).
"""
import json
import shutil

SPEC = "analises-spec.json"
REFORMA = "reforma-final.json"

shutil.copy(SPEC, SPEC + ".bak-pre-reforma")

doc = json.load(open(SPEC, encoding="utf-8"))
reforma = {r["id"]: r for r in json.load(open(REFORMA, encoding="utf-8"))}

mantidas, removidas, sem_reforma = [], [], []
for a in doc["analises"]:
    r = reforma.get(a["id"])
    if r is None:
        sem_reforma.append(a["id"])
        mantidas.append(a)
        continue
    if r["acao"] == "remover":
        removidas.append((a["id"], r.get("motivo_remocao", "")))
        continue
    a["titulo"] = r["titulo_novo"]
    a["pergunta_negocio"] = r["pergunta_nova"]
    a["como_calculado"] = r["como_calculado"]
    a["como_ler"] = r["como_ler"]
    a["tecnica"] = ""  # aposentada na interface; historico tecnico segue em obs/spec .md
    viz_antiga = a.get("viz") or {}
    nova = r.get("viz_nova") or {}
    a["viz"] = {
        "tipo": nova.get("tipo", viz_antiga.get("tipo", "tabela")),
        "x": nova.get("x") or viz_antiga.get("x"),
        "y": nova.get("y") or viz_antiga.get("y"),
        "serie": nova.get("serie") or viz_antiga.get("serie"),
    }
    if r.get("obs_viz"):
        a["obs"] = ((a.get("obs") or "") + " | viz: " + r["obs_viz"]).strip(" |")
    mantidas.append(a)

doc["analises"] = mantidas
json.dump(doc, open(SPEC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print(f"aplicadas: {len(mantidas)} | removidas: {len(removidas)} | sem reforma (mantidas como estavam): {sem_reforma}")
for rid, motivo in removidas:
    print(f"  - {rid}: {motivo[:80]}")
from collections import Counter
print("viz finais:", Counter((a.get('viz') or {}).get('tipo') for a in mantidas))
