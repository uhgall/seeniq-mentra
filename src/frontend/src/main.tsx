import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MentraAuthProvider } from '@mentra/react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MentraAuthProvider>
      <App />
    </MentraAuthProvider>
  </StrictMode>,
)

