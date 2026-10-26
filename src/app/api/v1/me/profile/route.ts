import { createProfileHandlers } from "@profullstack/profile";
import { currentUser } from "@/lib/auth/session";
import { profileStore } from "@/lib/profile";

export const dynamic = "force-dynamic";

/**
 * The signed-in listener's signup profile: GET it, PUT a whole one, PATCH
 * some fields. Session cookie only; anybody else gets a 401. Built on first
 * request so the build never touches the database.
 */
let handlers: ReturnType<typeof createProfileHandlers> | null = null;

function profileHandlers() {
  handlers ??= createProfileHandlers({
    store: profileStore(),
    getUser: async () => {
      const user = await currentUser();
      return user ? { id: String(user.id), email: user.email } : null;
    },
  });
  return handlers;
}

export const GET = (req: Request) => profileHandlers().GET(req);
export const PUT = (req: Request) => profileHandlers().PUT(req);
export const PATCH = (req: Request) => profileHandlers().PATCH(req);
