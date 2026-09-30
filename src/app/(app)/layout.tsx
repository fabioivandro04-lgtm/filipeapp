import { requireUser } from "@/lib/auth";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Nav user={user} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10">{children}</main>
    </>
  );
}
