import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, asked from the browser. The nav and the follow button read
 * this instead of the layout reading cookies, because a single `cookies()` call
 * in the root layout would opt all 22k show pages out of static rendering.
 */
export async function GET() {
  const user = await currentUser();
  return Response.json(
    user ? { signedIn: true, email: user.email } : { signedIn: false },
    { headers: { "cache-control": "private, no-store" } },
  );
}
