import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerLocale, setDefaultLocale } from 'react-datepicker';
import { fr } from 'date-fns/locale/fr';
import './index.css';
import App from './App.jsx';

// Register French locale for react-datepicker and set as default
// based on browser language
const lang = (navigator.language || 'en').slice(0, 2);
if (lang === 'fr') {
  registerLocale('fr', fr);
  setDefaultLocale('fr');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
