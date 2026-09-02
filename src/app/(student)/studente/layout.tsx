import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { StudentHeader } from "@/components/student/student-header";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-blue-50 via-background to-brand-magenta-50">
      <StudentHeader name={session.user.name ?? session.user.email ?? ""} />
      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">{children}</main>
    </div>
  );
}
