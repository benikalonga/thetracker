'use client';
import clsx from 'clsx';
import { BarChart3, CheckSquare, History, LayoutDashboard, LogOut, MapPinned, Menu, Route, Settings, ShieldCheck, UserCog, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { Loading } from '@/components/ui';
import Logo from '@/components/Logo';
import { api, session } from '@/lib/api';
import { closeSocket } from '@/lib/socket';

const Me = createContext<any>(null);
export const useMe = () => useContext(Me);

const NAV: { href: string; label: string; icon: any; admin?: boolean }[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/live', label: 'Live map', icon: MapPinned },
  { href: '/visits', label: 'Visits', icon: ShieldCheck },
  { href: '/plans', label: 'Route plans', icon: Route },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/team', label: 'Team', icon: UserCog },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/audit', label: 'Audit log', icon: History, admin: true },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<any>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const s = session.get();
    if (!s) return router.replace('/sign-in');
    setMe(s.profile);
  }, [router]);
  useEffect(() => setMenu(false), [path]);
  if (!me) return <Loading />;

  const signOut = async () => {
    const s = session.get();
    if (s) await api('/auth/logout', { body: { refreshToken: s.refreshToken } }).catch(() => undefined);
    closeSocket();
    session.clear();
    router.replace('/sign-in');
  };

  const sidebar = (
    <aside className="flex h-full w-60 flex-col bg-brand-900 text-white">
      <div className="flex items-center justify-between px-4 py-4"><Logo size={28} light /><button className="lg:hidden" aria-label="Close menu" onClick={() => setMenu(false)}><X size={20} /></button></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {NAV.filter((n) => !n.admin || me.role === 'ADMIN').map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === href : path.startsWith(href);
          return <Link key={href} href={href} className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium', active ? 'bg-brand-500 text-white' : 'text-white/70 hover:bg-white/5')}><Icon size={16} />{label}</Link>;
        })}
      </nav>
      <div className="border-t border-white/10 p-3 text-sm">
        <p className="truncate font-semibold">{me.fullName}</p>
        <p className="truncate text-xs capitalize text-white/50">{me.role.toLowerCase()}</p>
        <button onClick={signOut} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white"><LogOut size={13} /> Sign out</button>
      </div>
    </aside>
  );

  return (
    <Me.Provider value={me}>
      <div className="min-h-screen lg:pl-60">
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
        {menu && <div className="fixed inset-0 z-50 flex bg-ink/40 lg:hidden" onClick={() => setMenu(false)}><div onClick={(e) => e.stopPropagation()}>{sidebar}</div></div>}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-edge bg-white px-4 py-2.5 lg:hidden">
          <button aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={22} /></button><Logo size={24} />
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </Me.Provider>
  );
}
