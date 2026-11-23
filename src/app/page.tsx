import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/guards";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? roleHome(user.role) : "/login");
}
