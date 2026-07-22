from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth, migracoes
from .config import get_settings
from .routers import (
    ajuda, analises, apuracao, clientes, comercial, compras, financeiro,
    indicadores, kpis, meta, sync, usuarios,
)


@asynccontextmanager
async def ciclo(app: FastAPI):
    # cria o schema `app` (anotacoes do gestor, lead time, feriados locais) se faltar.
    # Nao pode ficar so em sync/sql/: aquele diretorio e /docker-entrypoint-initdb.d,
    # que o Postgres so executa em volume novo. Falha aqui nunca derruba o boot.
    migracoes.aplicar()
    yield


app = FastAPI(title="h4c BI", version="0.2.0", docs_url="/api/docs",
              openapi_url="/api/openapi.json", lifespan=ciclo)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
# administracao do BI (usuarios, senhas, permissoes, carteira) — todo o /api/usuarios
# exige papel admin, conferido dentro do proprio router (permissoes.requer_admin)
app.include_router(usuarios.router)
app.include_router(meta.router)
# abas do BI (uma area por router, como o painel e organizado na tela)
app.include_router(comercial.router)
app.include_router(financeiro.router)
app.include_router(compras.router)
app.include_router(apuracao.router)
app.include_router(clientes.router)
# transversais
app.include_router(kpis.router)
app.include_router(analises.router)
app.include_router(indicadores.router)
app.include_router(sync.router)
app.include_router(ajuda.router)
# ★ NAO existe mais router "futuro": /caixa-previsto era projecao de fluxo de caixa
# (so pode ser construida com a base do BPO) e as demais previsoes usavam janela movel
# de 30 dias em vez do fechamento do mes por dias uteis. Ver o cabecalho de kpis.py.


@app.get("/api/health")
def health():
    return {"status": "ok"}
