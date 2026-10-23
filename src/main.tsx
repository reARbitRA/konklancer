import {createRoot} from 'react-dom/client';
import {installStandaloneFetchInterceptor} from './utils/standaloneRuntime.ts';
import App from './App.tsx';
import './index.css';

installStandaloneFetchInterceptor();

createRoot(document.getElementById('root')!).render(<App />);

