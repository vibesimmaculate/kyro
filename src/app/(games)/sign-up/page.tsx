import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/games/AuthForm";
import { signUp } from "@/server/auth/actions";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="shell flex min-h-[70vh] items-center py-12">
      <div className="mx-auto w-full max-w-[26rem]">
        <h1 className="text-title">Create an account.</h1>
        <p className="mt-3 text-lead text-night-muted">
          Needed for the games, where balances are real. You will confirm your age next.
        </p>

        <AuthForm action={signUp} submitLabel="Create account" next={next} />

        <p className="mt-6 text-small text-night-muted">
          Already have one?{" "}
          <Link
            href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-night-text underline underline-offset-4"
          >
            Sign in
          </Link>
          .
        </p>

        <p className="mt-8 border-t border-night-rule pt-5 text-micro text-night-muted">
          18+. KYRO holds no gaming licence — this wing is a preview build and is not open
          to the public. Deposit and loss limits, session reminders and self-exclusion are
          available from the moment the account exists.
        </p>
      </div>
    </div>
  );
}
