import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        all.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        all.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  if (!user && !isLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (user && isLogin) return NextResponse.redirect(new URL("/tarefas", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next|api/cron|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)"] };
