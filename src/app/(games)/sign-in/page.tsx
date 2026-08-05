import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/games/AuthForm";
import { signIn } from "@/server/auth/actions";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="shell flex min-h-[70vh] items-center py-12">
      <div className="mx-auto w-full max-w-[26rem]">
        <h1 className="text-title">Sign in.</h1>
        <p className="mt-3 text-lead text-night-muted">
          Only the games need an account. The exchange stays open to anyone.
        </p>

        <AuthForm action={signIn} submitLabel="Sign in" next={next} />

        <p className="mt-6 text-small text-night-muted">
          No account yet?{" "}
          <Link
            href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-night-text underline underline-offset-4"
          >
            Create one
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
