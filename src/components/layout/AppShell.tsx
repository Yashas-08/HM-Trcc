import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const AppShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  return (
    <div className="h-screen w-full flex bg-[#F4F4F4] overflow-hidden min-w-[1200px]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        <Header />
        <main ref={mainRef} className="flex-1 overflow-y-auto main-scroll px-7 py-6">
          <div key={location.pathname} className="page-transition-enter">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
};

