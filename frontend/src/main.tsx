import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ShieldOff, TriangleAlert } from 'lucide-react'
import './index.css'
import Login from './pages/Login'
import TrocarSenha from './pages/TrocarSenha'
import Comercial from './pages/Comercial'
import Financeiro from './pages/Financeiro'
import Compras from './pages/Compras'
import Estoque from './pages/Estoque'
import Apuracao from './pages/Apuracao'
import Analises from './pages/Analises'
import Configuracoes from './pages/Configuracoes'
import Layout, { TelaAviso, TelaCarregando } from './components/Layout'
import { clearToken, getToken } from './lib/api'
import { limparSessao, podeCom, useSessao } from './lib/sessao'
import { filtrarAbas, rotaInicial } from './lib/navegacao'

/**
 * Guarda de rota.
 *
 * Três perguntas, nesta ordem — e a ordem importa:
 *   1. tem token?              não -> /login
 *   2. a sessão já carregou?   não -> "Carregando" (e NUNCA tela branca)
 *   3. deve trocar a senha?    sim -> /trocar-senha, de onde não se sai
 *   4. pode ver este recurso?  não -> recado dentro do Layout, com o menu do lado
 *
 * ★ ISTO NÃO É SEGURANÇA, É EDUCAÇÃO. Quem digitar /financeiro na barra de endereço
 *   sem ter a permissão vê o recado daqui; quem chamar /api/financeiro/vencido no
 *   DevTools vê o 403 do backend. A única trava que vale é a de lá
 *   (`Depends(permissoes.requer(...))`); esta existe para a pessoa entender o que
 *   houve em vez de olhar um relatório vazio e achar que a empresa não vendeu nada.
 */
function Protegida({ recurso, children }: { recurso?: string; children: React.ReactElement }) {
  const { situacao, sessao, erro } = useSessao()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const voltarAoLogin = () => {
    clearToken()
    limparSessao()
    navigate('/login', { replace: true })
  }

  if (!getToken()) return <Navigate to="/login" replace />

  // 'carregando' com sessão em mãos é recarga (a tela de Configurações pede uma
  // depois de mexer na própria conta): segue mostrando o que já estava lá
  if (!sessao) {
    if (situacao === 'erro') {
      return (
        <TelaAviso
          Icone={TriangleAlert}
          titulo="Não consegui carregar sua sessão"
          texto={erro ?? 'O servidor do BI não respondeu. Tente de novo em instantes.'}
          acaoRotulo="Entrar de novo"
          onAcao={voltarAoLogin}
        />
      )
    }
    return <TelaCarregando />
  }

  // ★ Enquanto a senha for a provisória, o BI inteiro está fechado: o backend
  // responde 403 em todo relatório (`permissoes._exigir_troca_de_senha`). Mandar
  // para cá é o que evita a pessoa passear por telas que só sabem dizer "Erro 403".
  if (sessao.deve_trocar_senha && pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />
  }

  if (recurso && !podeCom(sessao, recurso)) {
    return (
      <Layout>
        <TelaAviso
          compacto
          Icone={ShieldOff}
          titulo="Você não tem acesso a esta área"
          texto="Peça ao administrador do BI para liberar este item em Configurações. O menu ao lado mostra o que já está liberado para você."
        />
      </Layout>
    )
  }

  return children
}

/** Administração é PAPEL, não caixinha — igual ao `requer_admin()` do backend. */
function SomenteAdmin({ children }: { children: React.ReactElement }) {
  const { sessao } = useSessao()
  if (sessao && sessao.papel !== 'admin') {
    return (
      <Layout>
        <TelaAviso
          compacto
          Icone={ShieldOff}
          titulo="Área do administrador"
          texto="Só quem administra o BI cria usuários, gera senha e define permissão."
        />
      </Layout>
    )
  }
  return children
}

/**
 * A raiz '/'.
 *
 * Manda para a primeira aba que a pessoa pode abrir — que para quem tem tudo é
 * Comercial, a porta de entrada de sempre, e para o vendedor restrito à carteira é a
 * única aba dele. Sem isso, quem não tem Comercial entraria no BI direto num recado
 * de "sem acesso" na sua primeira impressão do sistema.
 */
function Inicio() {
  const { sessao } = useSessao()
  const navigate = useNavigate()
  const destino = rotaInicial(filtrarAbas((r) => podeCom(sessao, r), sessao?.papel === 'admin'))

  if (destino) return <Navigate to={destino} replace />

  // conta recém-criada sem nenhuma caixinha marcada: acontece, e precisa dizer o que fazer
  return (
    <TelaAviso
      Icone={ShieldOff}
      titulo="Nenhuma área liberada"
      texto="Seu usuário existe, mas ainda não tem nenhuma área do BI liberada. Peça ao administrador para definir suas permissões em Configurações."
      acaoRotulo="Sair"
      onAcao={() => {
        clearToken()
        limparSessao()
        navigate('/login', { replace: true })
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* protegida, mas sem `recurso`: é a única tela que quem está com senha
            provisória consegue abrir */}
        <Route
          path="/trocar-senha"
          element={
            <Protegida>
              <TrocarSenha />
            </Protegida>
          }
        />

        {/* ★ O `recurso` de cada rota é o mesmo id do catálogo em
            backend/app/permissoes.py. Rota nova sem recurso = rota liberada para
            qualquer pessoa autenticada — repare que Estoque tem recurso próprio
            ('estoque'), e não 'compras', apesar de morar no ramo de Compras. */}
        <Route
          path="/comercial"
          element={
            <Protegida recurso="comercial">
              <Comercial />
            </Protegida>
          }
        />
        <Route
          path="/financeiro"
          element={
            <Protegida recurso="financeiro">
              <Financeiro />
            </Protegida>
          }
        />
        <Route
          path="/compras"
          element={
            <Protegida recurso="compras">
              <Compras />
            </Protegida>
          }
        />
        <Route
          path="/compras/estoque"
          element={
            <Protegida recurso="estoque">
              <Estoque />
            </Protegida>
          }
        />
        <Route
          path="/apuracao"
          element={
            <Protegida recurso="apuracao">
              <Apuracao />
            </Protegida>
          }
        />
        <Route
          path="/analises"
          element={
            <Protegida recurso="analises">
              <Analises />
            </Protegida>
          }
        />
        <Route
          path="/configuracoes"
          element={
            <Protegida recurso="configuracoes">
              <SomenteAdmin>
                <Configuracoes />
              </SomenteAdmin>
            </Protegida>
          }
        />

        {/* A porta de entrada deixou de ser fixa: depende do que a pessoa pode ver.
            /futuro existiu na versão anterior e continua respondendo para não quebrar
            link salvo/favorito. */}
        <Route
          path="/"
          element={
            <Protegida>
              <Inicio />
            </Protegida>
          }
        />
        <Route path="/futuro" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
