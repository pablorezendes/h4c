# Frontend do BI h4c

React 19 + Vite + Tailwind v4 + Recharts, tema claro *Paper & Ink* (verde oliva da marca).
Sem biblioteca de UI e sem gerenciador de estado: o que existe está em `src/`.

```bash
npm install
npm run dev      # 5173, com proxy de /api para 127.0.0.1:8110
npm run build    # tsc -b + vite build
npm run lint     # oxlint
npx tsc -p tsconfig.app.json --noEmit   # checagem de tipos sem gerar nada
```

## Organização

```
src/
  main.tsx                  rotas; / e /futuro caem em /comercial
  lib/navegacao.ts          ABAS — fonte de verdade ÚNICA do menu
  lib/dimensoes.ts          listas de RCA e departamento (cache por sessão)
  lib/api.ts                cliente HTTP + tipos compartilhados entre telas
  lib/format.ts             brl, brlCompacto, inteiro, diaCurto
  lib/exportarExcel.ts      exportação das tabelas
  components/FiltroBar.tsx  filtro global (período, hora, RCA, departamento)
  components/Semaforo.tsx   semáforo de meta (avaliarMeta, Semaforo, SemaforoPonto)
  components/MultiSelecao.tsx, Layout.tsx, AnaliseViz.tsx
  pages/                    uma página por aba + Login
```

Uma página por aba (`Comercial`, `Financeiro`, `Compras`, `Estoque`, `Apuracao`, `Analises`),
espelhando a estrutura do BI descrita no README da raiz. `AnaliseViz.tsx` é o renderizador
genérico das 49 análises: escolhe o gráfico por `viz.tipo` e deduz eixos e unidades das
colunas — mudar heurística ali afeta todas as análises de uma vez.

## Regras que o código do frontend precisa respeitar

- **Nada de dependência nova.** Gráfico é Recharts, ícone é Lucide, planilha é `xlsx`.
- **O menu sai de `lib/navegacao.ts`.** Sidebar, bottom nav e atalhos leem daquela lista;
  ninguém redeclara aba.
- **Filtro é o `FiltroBar`,** com `filtroQuery()` montando a query. Lista vazia de RCA ou
  departamento significa "todos" — é assim que o backend entende.
- **Semáforo vem do `Semaforo.tsx`:** os limiares são sobre o atingimento da meta (verde
  ≥ 100%, amarelo 90–100%, vermelho < 90%), e a cor nunca é a única informação — sempre
  acompanhada do rótulo e do percentual.
- **Nunca escrever "próximos 30 dias" em tela.** O BI trabalha por mês fechado; a projeção
  é o fechamento do mês corrente por dias úteis, e o rótulo tem que dizer que é projeção.
- **Faturamento exibido é sempre líquido de devolução.** Se a tela mostrar bruto, o rótulo
  diz "sem dedução de devolução".
- **Falha de rede não derruba a tela:** `Promise.allSettled` e estado vazio discreto (a
  seção some ou mostra um aviso), nunca tela branca.
