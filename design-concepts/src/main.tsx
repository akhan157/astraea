import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// No StrictMode: drei's <Html> overlays lose one of two sibling roots under
// StrictMode's double-mount in React 19, which drops 3D labels.
createRoot(document.getElementById('root')!).render(<App />);
