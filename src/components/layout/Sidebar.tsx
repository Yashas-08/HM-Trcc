import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NavLink, matchPath, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  BedDouble,
  CalendarClock,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageSquareWarning,
  QrCode,
  Settings,
  ShieldCheck,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleKey } from '../../types';

interface NavItem {
  label: string;
  to: string;
  moduleKey: ModuleKey;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'MAIN MENU',
    items: [
      { label: 'Dashboard', to: '/', moduleKey: 'dashboard', icon: LayoutGrid },
      { label: 'Students', to: '/students', moduleKey: 'students', icon: Users },
      { label: 'Rooms', to: '/rooms', moduleKey: 'rooms', icon: BedDouble },
      { label: 'Leave Management', to: '/leaves', moduleKey: 'leaves', icon: CalendarClock },
      { label: 'Complaints', to: '/complaints', moduleKey: 'complaints', icon: MessageSquareWarning },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { label: 'Mess Management', to: '/mess', moduleKey: 'mess', icon: Utensils },
      { label: 'QR Scanner', to: '/qr-scanner', moduleKey: 'qr_scanner', icon: QrCode },
      { label: 'Movement & Attendance', to: '/movements', moduleKey: 'movements', icon: Activity },
      { label: 'Notices', to: '/notices', moduleKey: 'notices', icon: Megaphone },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Staff Management', to: '/staff', moduleKey: 'staff', icon: ShieldCheck },
      { label: 'Reports & Analytics', to: '/reports', moduleKey: 'reports', icon: BarChart3 },
      { label: 'Settings', to: '/settings', moduleKey: 'settings', icon: Settings },
    ],
  },
];

interface PillRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const Sidebar: React.FC = () => {
  const { can, logout } = useAuth();
  const location = useLocation();
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pillRect, setPillRect] = useState<PillRect | null>(null);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);

  const activeTo = useMemo(() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (!can(item.moduleKey, 'view')) continue;
        if (matchPath({ path: item.to, end: item.to === '/' }, location.pathname)) {
          return item.to;
        }
      }
    }
    return null;
  }, [can, location.pathname]);

  const measureActivePill = useCallback(() => {
    const activeEl = activeTo ? itemRefs.current[activeTo] : null;
    const trackEl = trackRef.current;
    if (!activeEl || !trackEl) {
      setPillRect(null);
      return;
    }

    const activeBox = activeEl.getBoundingClientRect();
    const trackBox = trackEl.getBoundingClientRect();
    const next: PillRect = {
      top: activeBox.top - trackBox.top,
      left: activeBox.left - trackBox.left,
      width: activeBox.width,
      height: activeBox.height,
    };

    setPillRect((prev) => {
      if (
        prev &&
        Math.abs(prev.top - next.top) < 0.25 &&
        Math.abs(prev.left - next.left) < 0.25 &&
        Math.abs(prev.width - next.width) < 0.25 &&
        Math.abs(prev.height - next.height) < 0.25
      ) {
        return prev;
      }
      return next;
    });
  }, [activeTo]);

  useLayoutEffect(() => {
    measureActivePill();
    const activeEl = activeTo ? itemRefs.current[activeTo] : null;
    if (activeEl) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      activeEl.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [activeTo, measureActivePill]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTransitionsEnabled(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl) return;

    const observer = new ResizeObserver(() => {
      measureActivePill();
    });
    observer.observe(trackEl);

    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) {
        measureActivePill();
      }
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measureActivePill]);

  return (
    <aside className="w-[238px] shrink-0 bg-[#222222] text-white flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <div className="relative w-7 h-7 flex items-center justify-center">
          <span className="absolute w-4 h-4 border-[1.75px] border-white rotate-45 -translate-x-1 rounded-[2px]" />
          <span className="absolute w-3.5 h-3.5 bg-[#DDF58A] rotate-45 translate-x-1 rounded-[2px]" />
        </div>
        <span className="font-slab text-[18px] font-bold tracking-[0.06em] text-white">HM TRCC</span>
      </div>

      {/* Navigation Groups */}
      <nav aria-label="Primary Sidebar Navigation" className="flex-1 overflow-y-auto overflow-x-hidden sidebar-scroll">
        <div ref={trackRef} className="relative py-2">
          {pillRect && (
            <div
              aria-hidden="true"
              className="sidebar-active-pill pointer-events-none"
              style={{
                left: `${pillRect.left}px`,
                width: `${pillRect.width}px`,
                height: `${pillRect.height}px`,
                transform: `translate3d(0, ${pillRect.top}px, 0)`,
                transition: transitionsEnabled
                  ? 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1), height 400ms cubic-bezier(0.22, 1, 0.36, 1)'
                  : 'none',
              }}
            />
          )}
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => can(item.moduleKey, 'view'));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="mb-3">
                <div className="px-5 py-1.5 text-[13px] font-semibold leading-[1.35] tracking-[0.08em] text-[#777777] uppercase">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        ref={(el) => {
                          itemRefs.current[item.to] = el;
                        }}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          `relative z-10 ml-2 pl-2.5 pr-1.5 py-[9px] flex items-center gap-2 text-[16px] font-semibold leading-[1.35] transition-colors duration-300 ease-out ${
                            isActive ? 'text-[#292929]' : 'text-[#CCCCCC] hover:text-white'
                          }`
                        }
                      >
                        <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Bottom Logout */}
      <div className="px-4 py-4 border-t border-white/10">
        <button
          type="button"
          onClick={logout}
          className="w-full pl-3 pr-3 py-2.5 flex items-center gap-2.5 text-[16px] font-semibold leading-[1.35] text-[#CCCCCC] hover:text-white rounded-[10px] hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={1.9} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

