import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgeForm } from "@/components/games/AgeForm";
import { currentUser } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your age",
  robots: { index: false, follow: false },
};

/**
 * The age gate.
 *
 * A real date of birth rather than a "Yes, I am 18" button, because a tick box
 * asks nothing and records nothing. The date is checked and the confirmation
 * timestamped; the date itself is not kept.
 */
export default async function AgePage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/games/age");

  return (
    <div className="shell flex min-h-[70vh] items-center py-12">
      <div className="mx-auto w-full max-w-[28rem]">
        <p className="label-mono flex items-center gap-2 text-night-muted">
          <span aria-hidden="true" className="mark-square bg-night-blue" />
          One more thing
        </p>
        <h1 className="mt-5 text-title">How old are you?</h1>
        <p className="mt-3 text-lead text-night-muted">
          You must be 18 or over to play. Your date of birth is checked and then
          discarded — only the fact that you confirmed, and when, is kept.
        </p>

        <AgeForm />

        <p className="mt-8 border-t border-night-rule pt-5 text-micro text-night-muted">
          If you are under 18 your account stays open for the exchange, which has no age
          restriction.
        </p>
      </div>
    </div>
  );
}
