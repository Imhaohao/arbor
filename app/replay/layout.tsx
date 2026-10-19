import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/auth-server";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return children;
}
