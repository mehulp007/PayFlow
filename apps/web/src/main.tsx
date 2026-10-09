import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './app/AuthProvider';
import { FeedbackProvider } from './app/FeedbackProvider';
import { queryClient } from './app/queries';
import { router } from './app/router';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FeedbackProvider>
          <RouterProvider router={router} />
        </FeedbackProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
