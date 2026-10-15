import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app';
import './styles.css';
import './styles-responsive.css';

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10000 } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
