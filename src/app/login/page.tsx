import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import AdBanner from "@/components/AdBanner";
import { currentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to follow independent podcasts on p0dcasters.",
  robots: { index: false },
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await currentUser()) redirect(next || "/following");
  return (
    <div className="wrap narrow">
      <AuthForm mode="login" next={next} expired={params.expired === "1"} />
      {/* Under the form, never beside it. Nothing on a sign-in page should
          compete with the one thing the reader is here to do. */}
      <AdBanner />
    </div>
  );
}
