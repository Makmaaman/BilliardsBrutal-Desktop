import GlobalAlertsProvider from "./components/GlobalAlerts.jsx"
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './services/license.js'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalAlertsProvider>
    <App />
  </GlobalAlertsProvider>
  </React.StrictMode>
)
