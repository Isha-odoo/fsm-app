'use client';

import { createContext, Suspense, useContext, useState, type ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { SideMenu } from './SideMenu';

const MenuContext = createContext<() => void>(() => undefined);
/** AppBar calls this to open the side menu. Outside the technician app it does nothing. */
export const useOpenMenu = () => useContext(MenuContext);

/** Frame of the technician app: phone-width column, side menu and bottom navigation. */
export function TechChrome({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <MenuContext.Provider value={() => setMenu(true)}>
      <div className="relative mx-auto min-h-dvh max-w-md bg-canvas text-ink sm:shadow-2xl">{children}</div>
      <Suspense fallback={null}>
        <BottomNav />
        <SideMenu open={menu} onClose={() => setMenu(false)} />
      </Suspense>
    </MenuContext.Provider>
  );
}
