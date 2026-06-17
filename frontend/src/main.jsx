import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Landing from './pages/Landing.jsx';
import './index.css';

function Root() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const fn = () => setHash(window.location.hash);
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash === '#app' ? <App /> : <Landing />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
