"use server";

import { signOut } from "@/lib/auth/config";

export async function serverSignOut() {
  await signOut({ redirectTo: "/savint/login" });
}
