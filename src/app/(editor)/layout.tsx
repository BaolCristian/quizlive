import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return <DashboardThemeProvider>{children}</DashboardThemeProvider>;
}
