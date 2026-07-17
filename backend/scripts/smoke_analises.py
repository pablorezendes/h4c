"""Executa todas as analises da spec via API e reporta erros de runtime."""
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
        with urllib.request.urlopen(r, data, timeout=120) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")
    except Exception as e:  # noqa: BLE001
        return 0, {"detail": str(e)}


_, login = req("/api/auth/login", "POST", {"email": "admin@h4c.sys", "password": sys.argv[1]})
token = login["access_token"]

_, catalogo = req("/api/analises", token=token)
print(f"catalogo: {len(catalogo)} analises\n")

ok, falhas = 0, []
for a in catalogo:
    st, resp = req(f"/api/analises/{a['id']}?dt_ini=2026-04-17&dt_fim=2026-07-16", token=token)
    if st == 200:
        ok += 1
        print(f"  OK   {a['id']:14s} {len(resp['rows']):>5d} linhas")
    else:
        detalhe = str(resp.get("detail", resp))[:160]
        falhas.append((a["id"], st, detalhe))
        print(f"  FAIL {a['id']:14s} [{st}] {detalhe}")

print(f"\n{ok}/{len(catalogo)} OK, {len(falhas)} falhas")
for f in falhas:
    print(" -", f)
