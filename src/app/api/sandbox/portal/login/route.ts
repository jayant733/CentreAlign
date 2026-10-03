import { NextResponse } from "next/server";
import { portalAuth, audit } from "@/sandbox/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const origin = new URL(req.url).origin;

  const user = portalAuth.verify(email, password);
  if (!user) {
    audit.log("portal", "login_failed", email);
    return NextResponse.redirect(`${origin}/sandbox/portal/login?error=invalid`, 303);
  }

  const token = portalAuth.createSession(user.email);
  audit.log("portal", "login_success", user.email);

  const res = NextResponse.redirect(`${origin}/sandbox/portal`, 303);
  res.cookies.set("nw_portal_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
