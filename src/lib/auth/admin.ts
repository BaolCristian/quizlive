import { auth } from "@/lib/auth/config";

export async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401, session: null };
  }
  if (session.user.role !== "ADMIN") {
    return { error: "Forbidden", status: 403, session: null };
  }
  return { error: null, status: null, session };
}
