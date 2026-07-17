# h4c BI — Hygiene For Care

BI operacional sobre o ERP **Winthor** (Oracle, owner `U_CMT9GE_WI`), com dashboard dark-mode
bento seguindo o design system `Z:\stitch_bento_saas_dashboard_2026` (Hyper-Functional Dark Mode).

## Estrutura

| Pasta | O quê |
|---|---|
| `discovery/` | Scripts e artefatos do discovery (playbook `Z:\skill`): CSVs de catálogo em `output/`, dicionário de dados e catálogo de KPIs validado |
| `backend/` | API FastAPI (Python), Oracle **modo thin** (sem Instant Client), somente leitura, auth JWT |
| `frontend/` | React + Vite + Tailwind v4, Recharts, Lucide, fontes Geist/Inter/JetBrains Mono |
| `docker-compose.yml` | Deploy no servidor docker (h4c): frontend na **8100**, API na **8110** |

## Desenvolvimento local

```bash
# backend (porta 8110)
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
# criar .env a partir de .env.exemplo
.venv/Scripts/python -m uvicorn app.main:app --port 8110

# frontend (porta 5173, proxy /api -> 8110)
cd frontend
npm install
npm run dev
```

Login: `admin@h4c.sys` — senha em `backend/.credenciais-admin.txt` (dev). Para trocar:
`python scripts/hash_password.py "<nova senha>"` e atualize `ADMIN_PASSWORD_HASH` no `.env`.

## Deploy em produção (h4c.codexaurora.com.br, atrás do Traefik)

O `docker-compose.yml` já vem preparado para o Traefik: só o **frontend** (nginx) é
publicado no proxy, com o host `h4c.codexaurora.com.br` e TLS automático; o **backend**
fica na rede interna e o nginx faz proxy de `/api` para ele. Não expõe portas no host.

Padrão do servidor `srv1291961` já embutido nos defaults do compose: rede externa
`proxy`, entrypoints `web`/`websecure`, certresolver `le`. **Só é preciso criar os
segredos** — as variáveis do Traefik já têm o default certo.

No servidor, em `/srv/stack/h4c`:

```bash
git clone https://github.com/pablorezendes/h4c.git .

# segredos do backend (único arquivo obrigatório a criar)
cp backend/.env.producao.exemplo backend/.env.producao
#   preencher DB_PASSWORD, JWT_SECRET e ADMIN_PASSWORD_HASH.
#   gerar JWT:   openssl rand -hex 32
#   gerar hash da senha admin:
#   docker run --rm -v "$PWD/backend:/app" -w /app python:3.12-slim \
#     python scripts/hash_password.py "SUA_SENHA_AQUI"

# subir (pega carona no 80/443 do Traefik; nenhuma porta nova é exposta)
docker compose up -d --build
```

App: **https://h4c.codexaurora.com.br** (certificado emitido automaticamente pelo
Let's Encrypt no primeiro acesso).

App: **https://h4c.codexaurora.com.br** · Docs da API: `.../api/docs`.
Atualizar depois: `git pull && docker compose up -d --build`.

> **DNS:** o registro `h4c.codexaurora.com.br` deve apontar (A/AAAA) para o IP do servidor
> **antes** de subir, senão o Let's Encrypt não emite o certificado.

### Alternativa sem Traefik (portas diretas)
Se preferir expor portas, troque o serviço `frontend` por `ports: ["8100:80"]` e remova
os `labels`/rede `traefik`. App em `http://IP:8100`.

## Segurança e dados

- O backend só executa `SELECT/WITH` (guarda no `db.py`); usuário Oracle `AUTOMACAO`.
- Conexão direta na **produção** do Winthor — as queries do BI são leves e usam cache de 120 s,
  mas o ideal em médio prazo é apontar para uma réplica de leitura.
- `PCCLIENT`/`PCFORNEC`/`PCEMPR` contêm PII (LGPD) — o dashboard não expõe CPF/CNPJ nem contato;
  ver marcação PII no `discovery/dicionario-dados.md`.

## KPIs

Catálogo com definição, grão, fontes e SQL: `discovery/catalogo-kpis-validado.md`.
IDs (VEN-xx, EST-xx, FCR-xx, FCP-xx...) mapeiam para os endpoints em `backend/app/routers/kpis.py`.
