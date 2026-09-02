import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectUnlessTeacher();

  return (
    <DashboardThemeProvider>
      <TermsGuard>{children}</TermsGuard>
    </DashboardThemeProvider>
  );
}
