import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PersonalAccess } from './components/PersonalAccess';
import './index.css';

createRoot(document.getElementById('root')!).render(<PersonalAccess><App /></PersonalAccess>);
