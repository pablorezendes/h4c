"""Verificação do espelho Postgres: roda TODAS as consultas e confere os números.

Executa dentro do container do backend, no servidor:
    docker compose exec backend python scripts/verifica_espelho.py

Faz três coisas:
  1. confere se o espelho tem as 19 tabelas e quantas linhas cada uma tem;
  2. executa as 58 consultas (49 análises + 9 indicadores) e reporta erro de SQL;
  3. compara os indicadores com os valores conhecidos do Oracle (regressão).
"""
import sys
import traceback
from datetime import date, timedelta

sys.path.insert(0, "/app")

from app import consulta  # noqa: E402
from app.routers import analises as r_analises  # noqa: E402
from app.routers import indicadores as r_indicadores  # noqa: E402

# valores medidos no Oracle (período de 30 dias encerrando em 17/07/2026)
REFERENCIA = {
    "IND-01": ("Faturamento", 430737.86, 0.02),
    "IND-02": ("Itens vendidos", 7245, 0.02),
    "IND-03": ("Ticket médio por cliente", 3915.80, 0.02),
    "IND-04": ("Clientes cadastrados", 237, 0.01),
    "IND-06": ("Clientes ativos", 161, 0.05),
    "IND-07": ("Clientes positivados", 110, 0.02),
    "IND-08": ("% positivados", 46.41, 0.05),
    "IND-09": ("% margem", 28.98, 0.05),
}

DT_FIM = date(2026, 7, 17)
DT_INI = DT_FIM - timedelta(days=29)


def secao(titulo: str) -> None:
    print(f"\n{'=' * 72}\n{titulo}\n{'=' * 72}")


def main() -> int:
    print(f"fonte de dados: {consulta.fonte()}  |  schema: {consulta.esquema()}")
    problemas = 0

    # ---------- 1. espelho populado? ----------
    secao("1. TABELAS DO ESPELHO")
    try:
        linhas = consulta.consultar("""
            SELECT c.relname AS tabela, c.reltuples::bigint AS aprox
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'winthor' AND c.relkind = 'r'
              AND c.relname NOT LIKE '%__stg' AND c.relname <> 'sync_controle'
            ORDER BY c.relname""")
        for r in linhas:
            exata = consulta.consultar(f"SELECT COUNT(*) AS n FROM winthor.{r['tabela']}")[0]["n"]
            marca = "vazia!" if exata == 0 else ""
            if exata == 0:
                problemas += 1
            print(f"  {r['tabela']:16s} {exata:>9,} linhas  {marca}")
    except Exception as e:  # noqa: BLE001
        print(f"  FALHA ao listar tabelas: {e}")
        return 1

    # ---------- 2. as 58 consultas executam? ----------
    secao("2. EXECUÇÃO DAS CONSULTAS")
    quebradas = []
    for spec in r_analises._carregar_spec():
        try:
            sql = spec["sql"].replace("{OWNER}", consulta.esquema())
            usados = consulta.binds_usados(sql)
            binds = {k: v for k, v in {
                "dt_ini": DT_INI, "dt_fim": DT_FIM, "hora_ini": 0.0, "hora_fim": 23.999,
                "top_n": 10, "limite": 10,
            }.items() if k in usados}
            faltando = usados - set(binds)
            if faltando:
                quebradas.append((spec["id"], f"binds sem valor: {sorted(faltando)}"))
                continue
            rows = consulta.consultar(sql, binds)
            print(f"  OK    {spec['id']:14s} {len(rows):>6,} linhas")
        except Exception as e:  # noqa: BLE001
            quebradas.append((spec["id"], str(e).splitlines()[0][:150]))
            print(f"  ERRO  {spec['id']:14s} {str(e).splitlines()[0][:110]}")

    # ---------- 3. indicadores batem com o Oracle? ----------
    secao("3. CONFERÊNCIA DOS INDICADORES (espelho x Oracle)")
    print(f"  período: {DT_INI} a {DT_FIM}\n")
    for spec in r_indicadores._carregar_spec():
        ident = spec["id"]
        try:
            atual = r_indicadores._executar(spec, DT_INI, DT_FIM) or {}
            valor = atual.get("valor")
            if ident in REFERENCIA:
                nome, esperado, tol = REFERENCIA[ident]
                v = float(valor or 0)
                dif = abs(v - esperado) / max(abs(esperado), 1e-9)
                ok = dif <= tol
                if not ok:
                    problemas += 1
                print(f"  {'OK   ' if ok else 'DIVERGE'} {ident} {nome:28s} "
                      f"espelho={v:>12,.2f}  oracle={esperado:>12,.2f}  dif={dif*100:5.1f}%")
            else:
                print(f"  ----  {ident} {spec['nome'][:28]:28s} valor={valor}")
        except Exception as e:  # noqa: BLE001
            problemas += 1
            quebradas.append((ident, str(e).splitlines()[0][:150]))
            print(f"  ERRO  {ident} {str(e).splitlines()[0][:110]}")

    # ---------- resumo ----------
    secao("RESUMO")
    if quebradas:
        print(f"{len(quebradas)} consulta(s) com erro:")
        for i, e in quebradas:
            print(f"  - {i}: {e}")
    else:
        print("todas as consultas executaram sem erro")
    print(f"divergências/tabelas vazias: {problemas}")
    return 1 if (quebradas or problemas) else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        sys.exit(1)
