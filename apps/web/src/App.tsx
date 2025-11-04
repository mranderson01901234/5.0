import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import { TelemetryDashboard } from '@/pages/TelemetryDashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RetryProvider } from '@/context/RetryContext';
import { Toaster } from 'sonner';
import MainChatLayout from '@/layouts/MainChatLayout';
import { Authed, Unauthed } from './auth/Guard';
import { log } from '@/utils/logger';
import { maybeThrowDevError } from '@/dev/errorTest';

const App: React.FC = () => {
  maybeThrowDevError();

  return (
    <RetryProvider>
      <ErrorBoundary
        resetKeys={[]}
        onError={(e, info) => log.error('Root boundary error', e, info)}
      >
        <Toaster position="bottom-right" />

        <div className="h-screen">
          <Authed>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<MainChatLayout />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/telemetry" element={<TelemetryDashboard />} />
              </Routes>
            </BrowserRouter>
          </Authed>
          <Unauthed/>
        </div>
      </ErrorBoundary>
    </RetryProvider>
  );
};

export default App;

