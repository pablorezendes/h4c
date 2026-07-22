import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import './index.css'
import Login from './pages/Login'
import Comercial from './pages/Comercial'
import Financeiro from './pages/Financeiro'
import Compras from './pages/Compras'
import Estoque from './pages/Estoque'
import Apuracao from './pages/Apuracao'
import Analises from './pages/Analises'
import { getToken } from './lib/api'

function Protegida({ children }: { children: React.ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* uma única guarda para todas as áreas — o Outlet renderiza a rota casada */}
        <Route
          element={
            <Protegida>
              <Outlet />
            </Protegida>
          }
        >
          <Route path="/comercial" element={<Comercial />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/compras/estoque" element={<Estoque />} />
          <Route path="/apuracao" element={<Apuracao />} />
          <Route path="/analises" element={<Analises />} />
        </Route>

        {/* Comercial é a porta de entrada do BI. /futuro existiu na versão anterior e
            continua respondendo para não quebrar link salvo/favorito. */}
        <Route path="/" element={<Navigate to="/comercial" replace />} />
        <Route path="/futuro" element={<Navigate to="/comercial" replace />} />
        <Route path="*" element={<Navigate to="/comercial" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
