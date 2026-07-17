from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth
from .config import get_settings
from .routers import analises, futuro, indicadores, kpis, meta

app = FastAPI(title="h4c BI", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(meta.router)
app.include_router(kpis.router)
app.include_router(analises.router)
app.include_router(futuro.router)
app.include_router(indicadores.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
