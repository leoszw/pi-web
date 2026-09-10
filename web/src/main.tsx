import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'highlight.js/styles/github-dark.css'
import './styles.css'
import App from './App'

const rootEl = document.getElementById('root')
if (rootEl === null) throw new Error('missing #root')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
