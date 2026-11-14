import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { PopupTools } from './PopupTools';
import './styles.css';

const isPopup = document.body.classList.contains('popup');
if (isPopup) document.body.classList.add('quick-popup');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{isPopup ? <PopupTools /> : <App />}</React.StrictMode>);
