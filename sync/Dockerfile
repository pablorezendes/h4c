FROM python:3.12-slim

WORKDIR /app

# oracledb em modo THIN: não precisa de Instant Client
RUN pip install --no-cache-dir "oracledb==4.0.*"

COPY config.py oracle.py agente.py agendador.py ./

CMD ["python", "agendador.py"]
