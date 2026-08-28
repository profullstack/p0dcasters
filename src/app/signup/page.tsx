import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create a free p0dcasters account to follow independent, self-hosted podcasts.",
};

// Same mechanism as /login — see AuthForm. This page exists because a visitor
// looking for a way in should find one named after what they came to do.
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await currentUser()) redirect(next || "/following");
  return (
    <div className="wrap narrow">
      <AuthForm mode="signup" next={next} expired={false} />
    </div>
  );
}
