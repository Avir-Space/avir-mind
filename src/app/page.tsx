import { redirect } from "next/navigation";

/**
 * Root entry. Middleware already gates auth; an authenticated user landing on
 * "/" is sent straight to the Command Center.
 */
export default function RootPage() {
  redirect("/command-center");
}
