import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoadingState } from './components/ui/States';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { RoomsPage } from './pages/RoomsPage';
import { LeavesPage } from './pages/LeavesPage';
import { ComplaintsPage } from './pages/ComplaintsPage';
import { MessPage } from './pages/MessPage';
import { QrScannerPage } from './pages/QrScannerPage';
import { MovementsPage } from './pages/MovementsPage';
import { NoticesPage } from './pages/NoticesPage';
import { StaffPage } from './pages/StaffPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import type { ModuleKey } from './types';

const AuthenticatedShell: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F4]">
        <LoadingState label="Restoring session..." />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
};

const ProtectedRoute: React.FC<{
  moduleKey: ModuleKey;
  children: React.ReactNode;
}> = ({ moduleKey, children }) => {
  const { can } = useAuth();

  if (!can(moduleKey, 'view')) {
    return (
      <div className="bg-white border border-[#E9E9E9] rounded-[12px] p-8 text-center">
        <h2 className="font-slab text-[22px] font-bold leading-[1.3] text-[#292929]">Access Restricted</h2>
        <p className="text-[16px] leading-[1.5] text-[#777777] mt-1">
          Your staff role does not have permission to view this module.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthenticatedShell />}>
            <Route
              path="/"
            element={
              <ProtectedRoute moduleKey="dashboard">
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute moduleKey="students">
                <StudentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms"
            element={
              <ProtectedRoute moduleKey="rooms">
                <RoomsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaves"
            element={
              <ProtectedRoute moduleKey="leaves">
                <LeavesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complaints"
            element={
              <ProtectedRoute moduleKey="complaints">
                <ComplaintsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mess"
            element={
              <ProtectedRoute moduleKey="mess">
                <MessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/qr-scanner"
            element={
              <ProtectedRoute moduleKey="qr_scanner">
                <QrScannerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/movements"
            element={
              <ProtectedRoute moduleKey="movements">
                <MovementsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notices"
            element={
              <ProtectedRoute moduleKey="notices">
                <NoticesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute moduleKey="staff">
                <StaffPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute moduleKey="reports">
                <ReportsPage />
              </ProtectedRoute>
            }
          />
            <Route
              path="/settings"
              element={
                <ProtectedRoute moduleKey="settings">
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

