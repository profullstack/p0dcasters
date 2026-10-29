import { currentUser } from "@/lib/auth/session";
import { credentialsFor } from "@/lib/auth/passkey";
import { canDisconnect } from "@/lib/auth/coinpay";
import { dbCoinpayStore } from "@/lib/auth/coinpay-store";

export const dynamic = "force-dynamic";

const back = (path: string) => new Response(null, { status: 303, headers: { location: path } });

/** POST from /account. The session cookie is SameSite=Lax, so a cross-site form cannot drive it. */
export async function POST() {
  const user = await currentUser();
  if (!user) return back("/login?next=/account");
  const store = dbCoinpayStore();
  if (!(await store.identityByUser(user.id))) return back("/account");
  const passkeys = await credentialsFor(user.id);
  if (!canDisconnect(user, passkeys.length)) return back("/account?coinpay=only_way_in");
  await store.unlink(user.id);
  return back("/account?coinpay=disconnected");
}
