# h4c BI — Hygiene For Care

BI operacional sobre o ERP **Winthor** (Oracle, owner `U_CMT9GE_WI`), lido de um **espelho
Postgres** sincronizado pelo `sync/` (`FONTE_DADOS=postgres`; `oracle` continua valendo como
plano B, sem redeploy). Interface em tema claro *Paper & Ink* (verde oliva da marca).

## Estrutura

| Pasta | O quê |
|---|---|
| `discovery/` | Artefatos do discovery: dicionário de dados, catálogo de KPIs validado e `analises-spec.json` / `analises-spec-pg.json` (as 49 análises com SQL, texto e viz; a marcada como `backlog` não vai para a tela) |
| `backend/` | API FastAPI. `regras.py` (medida canônica, metas, semáforo), `calendario.py` (dias úteis/feriados), `consulta.py` (espelho ou Oracle), `routers/` por aba |
| `sync/` | Espelho Winthor → Postgres: recarga completa das tabelas pequenas, incremental só no histórico de estoque |
| `frontend/` | React 19 + Vite + Tailwind v4 + Recharts. Uma página por aba em `src/pages/`, menu em `src/lib/navegacao.ts` |
| `docker-compose.yml` | Deploy no servidor docker (h4c): frontend na **8100**, API na **8110**, Postgres do espelho na rede interna |

## Como o BI está organizado

Uma aba por área, e **cada métrica pertence a exatamente uma aba** — nada é duplicado:

| Aba | Rota | O que responde |
|---|---|---|
| **Comercial** | `/comercial` | Faturamento líquido do mês fechado, margem e positivação com semáforo de meta, projeção do fechamento, desempenho por RCA (faturamento, mix, devolução, RCA × departamento) |
| **Financeiro** | `/financeiro` | PMR × prazo concedido × PMP e o gap de caixa, vencido a receber com aging e maiores devedores, faturamento por prazo de pagamento |
| **Compras** | `/compras` | Demanda do último mês fechado, curva ABC e sugestão de compra (cobertura-alvo de 45 dias na curva A) |
| ↳ **Estoque** | `/compras/estoque` | Físico × reservado × **trancado** × disponível, cobertura em dias e quantos dias de demanda estão trancados |
| **Apuração** | `/apuracao` | Substituto da rotina 1464: faturamento com dimensões combináveis (cliente, produto, RCA, fornecedor, seção, ramo, UF…) e ordenação por curva ABC |
| **Análises** | `/analises` | Catálogo das análises (descritiva → prescritiva) sobre os mesmos dados |

**Regra de ouro:** todo número de venda, receita, ticket, margem e ABC é **líquido de
devolução** — `PCMOV` com `CODOPER IN ('S','ED')`, o `ED` entrando negativo. A dedução é
embutida na medida (`backend/app/regras.py`), nunca um filtro opcional de tela; visão bruta,
quando existe, vem rotulada. Projeção é sempre **fechamento do mês corrente por dias úteis**,
nunca "próximos 30 dias".

**Fora de escopo até a rodada com o BPO financeiro:** projeção de fluxo de caixa, margem de
lucro líquido, break-even e custo de antecipação de recebíveis. Não há dado no Winthor para
apurá-los, e a análise que os tocava fica escondida do catálogo até ser validada.

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

- O backend só executa `SELECT/WITH` (guarda no `db.py`); usuário Oracle `AUTOMACAO` é de
  leitura e serve apenas ao `sync/` — o BI consulta o espelho Postgres, com cache de 120 s.
- `PCCLIENT`/`PCFORNEC`/`PCEMPR` contêm PII (LGPD) — o dashboard não expõe CPF/CNPJ nem contato;
  ver marcação PII no `discovery/dicionario-dados.md`.

## KPIs

- **Metas com semáforo** (limiares sobre o *atingimento*: verde ≥ 100%, amarelo 90–100%,
  vermelho < 90%): margem de contribuição **33%** e positivação de carteira **80%** — as duas
  na aba Comercial, sempre sobre faturamento líquido. Margem de contribuição é antes de
  imposto e frete; não confundir com a margem de lucro líquido (meta 7%, fase do BPO).
- **Suprimento:** cobertura-alvo de **45 dias** na curva A (químicos e papéis), com a linha de
  meta nos gráficos de cobertura. Demanda vem do **último mês fechado**, nunca de janela móvel.
- **Churn:** perdido em `MIN(30 dias, 2,0 × ciclo médio)`, risco em `1,6 × ciclo`, com o ciclo
  medido nos últimos 90 dias a partir da última compra.
- Catálogo com definição, grão, fontes e SQL: `discovery/catalogo-kpis-validado.md`. Os IDs
  (VEN-xx, EST-xx, FCR-xx…) mapeiam para `backend/app/routers/kpis.py`, o painel legado; a
  apuração canônica de cada aba vive em `routers/comercial.py`, `financeiro.py`, `compras.py`,
  `apuracao.py` e `clientes.py`.
