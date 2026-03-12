"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

const LOCALES = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    if (newLocale === locale) return;
    startTransition(async () => {
      await fetch(withBasePath("/api/locale"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
      router.refresh();
    });
  };

  return (
    <div className="relative flex items-center gap-2">
      <Globe className="h-4 w-4 text-slate-400" />
      <select
        value={locale}
        onChange={handleChange}
        disabled={isPending}
        className="appearance-none bg-transparent text-sm text-slate-600 dark:text-slate-400 hover:text-foreground cursor-pointer pr-5 py-1 focus:outline-none disabled:opacity-50"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
