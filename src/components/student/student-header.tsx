"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

export function StudentHeader({ name }: { name: string }) {
  const t = useTranslations("student");
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-3">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="h-9 w-9 object-contain" />
        <div className="leading-tight">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("areaTitle")}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{t("greeting", { name })}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { window.location.href = withBasePath("/api/auth/logout"); }}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <LogOut className="h-4 w-4" />
        {t("logout")}
      </button>
    </header>
  );
}
