import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/designSystem.css';
import App from './App.jsx';

// Purge any stale/legacy test and dummy mock sessions from localStorage
try {
  const userStr = localStorage.getItem('nivaaro-user');
  if (userStr && (userStr.includes('Anjan') || userStr.includes('anjansingh100@gmail.com') || userStr.includes('dummy') || userStr.includes('qa_'))) {
    localStorage.removeItem('nivaaro-user');
  }
  const agentStr = localStorage.getItem('nivaaro-agent');
  if (agentStr && (agentStr.includes('Suresh') || agentStr.includes('FIX-PRO-8894') || agentStr.includes('dummy') || agentStr.includes('qa_'))) {
    localStorage.removeItem('nivaaro-agent');
  }
} catch (e) {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
