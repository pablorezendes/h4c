"""Perfila as 53 analises: linhas retornadas, colunas, viz atual — insumo para a reforma."""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8110"


def req(path, method="GET", body=None, token=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body else None
    try:
        with urllib.request.urlopen(r, data, timeout=180) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception as e:  # noqa: BLE001
        return 0, {"erro": str(e)}


_, login = req("/api/auth/login", "POST", {"email": "admin@h4c.sys", "password": sys.argv[1]})
token = login["access_token"]
_, catalogo = req("/api/analises", token=token)

perfil = []
for a in catalogo:
    st, resp = req(f"/api/analises/{a['id']}?dt_ini=2026-04-18&dt_fim=2026-07-17", token=token)
    rows = resp.get("rows", []) if st == 200 else []
    exemplo = rows[0] if rows else {}
    perfil.append({
        "id": a["id"],
        "titulo": a["titulo"],
        "nivel": a["nivel"],
        "viz_atual": (a.get("viz") or {}).get("tipo"),
        "status_http": st,
        "n_linhas": len(rows),
        "colunas": list(exemplo.keys()),
        "exemplo_linha": {k: (str(v)[:40] if v is not None else None) for k, v in list(exemplo.items())[:8]},
    })
    print(f"{a['id']:12s} {len(rows):>5d} linhas  viz={(a.get('viz') or {}).get('tipo')}")

with open(r"Z:\h4c-bi\discovery\perfil-analises.json", "w", encoding="utf-8") as f:
    json.dump(perfil, f, ensure_ascii=False, indent=1)

vazias = [p["id"] for p in perfil if p["n_linhas"] == 0]
print(f"\nvazias ({len(vazias)}): {vazias}")
print("perfil salvo em Z:\\h4c-bi\\discovery\\perfil-analises.json")
