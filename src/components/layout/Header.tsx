import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronDown, LogOut, Search, Settings, User } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { AppNotification, SearchResult } from '../../types';

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: 'Super Admin',
  warden: 'Warden',
  mess_staff: 'Mess Staff',
  security_staff: 'Security Staff',
  maintenance_staff: 'Maintenance Staff',
};

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const res = await api.get<{ notifications: AppNotification[]; unreadCount: number }>(
        '/api/dashboard/notifications',
      );
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore transient polling failures
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>(
          `/api/dashboard/search?q=${encodeURIComponent(trimmed)}`,
        );
        setResults(res.results);
        setSearchOpen(true);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const markRead = async (id: number, path: string) => {
    try {
      await api.patch(`/api/dashboard/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // still navigate
    }
    setNotifOpen(false);
    navigate(path);
  };

  const markAllRead = async () => {
    try {
      await api.patch('/api/dashboard/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const initials = (user?.full_name || 'HM')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-[68px] bg-[#FFFFFF] border-b border-[#E9E9E9] px-7 flex items-center justify-between shrink-0">
      {/* Global Search */}
      <div ref={searchRef} className="relative w-[320px]">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#777777] absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setSearchOpen(true);
            }}
            placeholder="Search"
            aria-label="Global search"
            className="w-full h-[40px] pl-10 pr-3.5 bg-[#F4F4F4] text-[16px] font-normal leading-[1.45] text-[#292929] placeholder-[#777777] rounded-[8px] border border-transparent focus:border-[#E9E9E9] focus:bg-[#FFFFFF] focus:outline-none transition-colors"
          />
        </div>

        {searchOpen && query.trim().length >= 2 ? (
          <div className="absolute left-0 right-0 top-[46px] bg-[#FFFFFF] border border-[#E9E9E9] rounded-[10px] shadow-lg z-40 overflow-hidden">
            {results.length === 0 ? (
              <div className="px-4 py-3 text-[14px] leading-[1.45] text-[#777777]">
                No matching records found.
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-[#E9E9E9]">
                {results.map((r) => (
                  <button
                    key={`${r.category}-${r.id}`}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery('');
                      navigate(r.path);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-[#F4F4F4] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[16px] font-medium leading-[1.4] text-[#292929] truncate">{r.title}</div>
                      <div className="text-[14px] leading-[1.45] text-[#777777] truncate">{r.subtitle}</div>
                    </div>
                    <span className="text-[13px] font-semibold uppercase tracking-wide text-[#777777] shrink-0">
                      {r.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Right Controls: Notification + Admin Profile */}
      <div className="flex items-center gap-4">
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="Notifications"
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-[#777777] hover:text-[#292929] hover:bg-[#F4F4F4] transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.9} />
            {unreadCount > 0 ? (
              <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#D9383A] ring-2 ring-white" />
            ) : null}
          </button>

          {notifOpen ? (
            <div className="absolute right-0 top-[44px] w-[370px] bg-[#FFFFFF] border border-[#E9E9E9] rounded-[10px] shadow-lg z-40 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E9E9E9] flex items-center justify-between">
                <span className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Notifications</span>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#777777] hover:text-[#292929]"
                  >
                    <CheckCheck className="w-4 h-4" />
                    Mark all read
                  </button>
                ) : null}
              </div>
              <div className="max-h-[340px] overflow-y-auto divide-y divide-[#E9E9E9]">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[14px] leading-[1.45] text-[#777777]">
                    No notifications recorded.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => markRead(n.id, n.link_path)}
                      className={`w-full px-4 py-3 text-left hover:bg-[#F4F4F4] flex items-start gap-2.5 ${
                        n.is_read === 0 ? 'bg-[#F4F4F4]/55' : ''
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                          n.is_read === 0 ? 'bg-[#D9383A]' : 'bg-[#E9E9E9]'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold leading-[1.35] text-[#292929]">{n.title}</div>
                        <div className="text-[14px] text-[#777777] mt-0.5 leading-[1.45]">{n.message}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Profile Avatar + Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            aria-label="Admin profile menu"
            className="flex items-center gap-2 rounded-full p-0.5 hover:bg-[#F4F4F4] transition-colors"
          >
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt={user.full_name}
                className="w-9 h-9 rounded-full object-cover border border-[#E9E9E9]"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#222222] text-white text-[14px] font-semibold flex items-center justify-center">
                {initials}
              </div>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-[#777777] mr-1" />
          </button>

          {profileOpen ? (
            <div className="absolute right-0 top-[46px] w-[250px] bg-[#FFFFFF] border border-[#E9E9E9] rounded-[10px] shadow-lg z-40 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E9E9E9]">
                <div className="text-[16px] font-semibold leading-[1.35] text-[#292929] truncate">
                  {user?.full_name}
                </div>
                <div className="text-[14px] leading-[1.45] text-[#777777] truncate">{user?.email}</div>
                <div className="mt-1.5 inline-block text-[13px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-[#F4F4F4] text-[#292929]">
                  {ROLE_DISPLAY[user?.role || ''] || user?.role}
                </div>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-2 text-left text-[15px] font-semibold leading-[1.3] text-[#292929] hover:bg-[#F4F4F4] flex items-center gap-2.5"
                >
                  <User className="w-4 h-4 text-[#777777]" />
                  Admin Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-2 text-left text-[15px] font-semibold leading-[1.3] text-[#292929] hover:bg-[#F4F4F4] flex items-center gap-2.5"
                >
                  <Settings className="w-4 h-4 text-[#777777]" />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full px-4 py-2 text-left text-[15px] font-semibold leading-[1.3] text-[#D9383A] hover:bg-[#F4F4F4] flex items-center gap-2.5"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

