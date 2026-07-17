import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Analises from './pages/Analises'
import Futuro from './pages/Futuro'
import { getToken } from './lib/api'

function Protegida({ children }: { children: React.ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protegida>
              <Dashboard />
            </Protegida>
          }
        />
        <Route
          path="/analises"
          element={
            <Protegida>
              <Analises />
            </Protegida>
          }
        />
        <Route
          path="/futuro"
          element={
            <Protegida>
              <Futuro />
            </Protegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
