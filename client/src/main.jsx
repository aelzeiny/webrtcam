import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { RoomProvider } from './contexts/RoomContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RoomProvider>
      <App />
    </RoomProvider>
  </React.StrictMode>
);