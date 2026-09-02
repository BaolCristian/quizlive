import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";

export default async function StudentHomePage() {
  const t = await getTranslations("student");
  return (
    <section className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center shadow-xl shadow-slate-200/50 backdrop-blur-xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
        <BookOpen className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-black text-slate-900">{t("comingSoonTitle")}</h1>
      <p className="mt-2 text-slate-600">{t("comingSoonBody")}</p>
    </section>
  );
}
