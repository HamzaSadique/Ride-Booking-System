import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

// Redux aur Persist ke imports
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { store, persistor } from './redux/store.js' 

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Provider poori app ko store ka access deta hai */}
    <Provider store={store}>
      {/* PersistGate refresh hone par data ko wapas lata hai */}
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
)