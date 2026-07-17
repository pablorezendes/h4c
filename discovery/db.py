"""Conexao Oracle (thick mode) para o discovery Winthor — SOMENTE LEITURA."""
import os
import sys
import csv
import oracledb

ENV_PATH = r"Z:\.env"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")


def load_env(path=ENV_PATH):
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


_initialized = False


def get_connection():
    global _initialized
    env = load_env()
    if not _initialized:
        oracledb.init_oracle_client(lib_dir=env.get("ORACLE_CLIENT_PATH"))
        _initialized = True
    dsn = f'{env["DB_HOST"]}:{env["DB_PORT"]}/{env["DB_SERVICE_NAME"]}'
    return oracledb.connect(user=env["DB_USER"], password=env["DB_PASSWORD"], dsn=dsn)


def run_query(sql, binds=None, fetch=True):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, binds or {})
        if not fetch:
            return None, None
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        return cols, rows


def save_csv(name, cols, rows):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, name)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(cols)
        w.writerows(rows)
    return path


if __name__ == "__main__":
    # Teste de conexao + query 1.1 (descobrir o owner de aplicacao)
    cols, rows = run_query(
        """SELECT owner, COUNT(*) AS qtd_tabelas
           FROM   all_tables
           GROUP  BY owner
           ORDER  BY qtd_tabelas DESC"""
    )
    print("CONEXAO OK")
    for owner, qtd in rows[:15]:
        print(f"{owner:30s} {qtd}")
