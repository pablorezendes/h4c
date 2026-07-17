"""Isola o ORA-00937 do IND-08 rodando o SQL direto."""
import json
from datetime import date, timedelta

from db import get_connection

spec = {a["id"]: a for a in json.load(open("indicadores-spec.json", encoding="utf-8"))["indicadores"]}
sql = spec["IND-08"]["sql"]

with get_connection() as conn:
    cur = conn.cursor()
    cur.execute(f"ALTER SESSION SET CURRENT_SCHEMA = U_CMT9GE_WI")
    try:
        cur.execute(sql, {"dt_ini": date.today() - timedelta(days=29), "dt_fim": date.today()})
        cols = [d[0] for d in cur.description]
        print(dict(zip(cols, cur.fetchone())))
    except Exception as e:
        print("ERRO:", str(e).splitlines()[0])
        # bisecciona: testa a query final sem o LISTAGG
        sem_listagg = sql[: sql.rfind("LISTAGG")].rstrip().rstrip(",") + "\nFROM rca_fmt f"
        try:
            cur.execute(sem_listagg, {"dt_ini": date.today() - timedelta(days=29), "dt_fim": date.today()})
            cols = [d[0] for d in cur.description]
            print("SEM LISTAGG funciona ->", dict(zip(cols, cur.fetchone())))
        except Exception as e2:
            print("SEM LISTAGG tambem falha:", str(e2).splitlines()[0])
