"""Agendador do agente: roda o sincronismo em intervalo fixo dentro do container.

INTERVALO_MIN  minutos entre execuções (padrão 20)
PRIMEIRA_COMPLETA=1  força recarga total na primeira execução
"""
import os
import sys
import time
import datetime as dt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agente import executa  # noqa: E402

INTERVALO = int(os.environ.get("INTERVALO_MIN", "20")) * 60


def main() -> None:
    primeira = os.environ.get("PRIMEIRA_COMPLETA", "0") == "1"
    print(f"agendador iniciado · intervalo {INTERVALO // 60} min", flush=True)
    while True:
        try:
            executa(forcar_completo=primeira)
        except SystemExit as e:
            print(f"configuração inválida: {e}", flush=True)
        except Exception as e:  # noqa: BLE001 — nunca derruba o loop
            print(f"erro na rodada: {e}", flush=True)
        primeira = False
        proxima = dt.datetime.now() + dt.timedelta(seconds=INTERVALO)
        print(f"próxima rodada às {proxima:%H:%M:%S}\n", flush=True)
        time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
