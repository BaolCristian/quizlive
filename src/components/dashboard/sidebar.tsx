"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/quiz", label: "I miei Quiz" },
  { href: "/dashboard/sessions", label: "Sessioni" },
  { href: "/dashboard/stats", label: "Statistiche" },
  { href: "/dashboard/share", label: "Condivisioni" },
];

function SidebarContent({ user, onNavigate }: { user: any; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="text-xl font-bold mb-8">Quiz Live</div>
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t pt-4 mt-4">
        <div className="text-sm font-medium">{user?.name}</div>
        <div className="text-xs text-muted-foreground">{user?.email}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-red-500 mt-2 hover:underline"
        >
          Esci
        </button>
      </div>
    </>
  );
}

export function DashboardSidebar({ user }: { user: any }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-muted/30 p-4 flex-col">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile header with hamburger */}
      <div className="md:hidden flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger>
            <button
              className="inline-flex items-center justify-center rounded-md p-2 hover:bg-muted transition-colors"
              aria-label="Apri menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4 flex flex-col">
            <SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="text-lg font-bold">Quiz Live</span>
      </div>
    </>
  );
}
