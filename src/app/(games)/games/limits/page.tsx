import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LimitsForm } from "@/components/games/LimitsForm";
import { SelfExclusionForm } from "@/components/games/SelfExclusionForm";
import { helpline } from "@/server/env";
import { admin } from "@/server/supabase/admin";
import { currentUser } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Limits and self-exclusion",
  robots: { index: false, follow: false },
};

export default async function LimitsPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/games/limits");

  const db = admin();

  const { data: limits } = await db
    .from("user_limits")
    .select("daily_deposit_cap_usd::text,daily_loss_cap_usd::text,session_minutes,pending_increase_at")
    .eq("user_id", user.id)
    .maybeSingle()
    .returns<{
      daily_deposit_cap_usd: string | null;
      daily_loss_cap_usd: string | null;
      session_minutes: number | null;
      pending_increase_at: string | null;
    } | null>();

  const { data: profile } = await db
    .from("profiles")
    .select("self_excluded_until")
    .eq("id", user.id)
    .maybeSingle();

  const excluded =
    profile?.self_excluded_until && new Date(profile.self_excluded_until) > new Date()
      ? new Date(profile.self_excluded_until)
      : undefined;

  const support = helpline();

  const toDecimal = (units: string | null): string =>
    units ? (Number(BigInt(units) / 1_000n) / 1_000).toString() : "";

  return (
    <div className="shell py-10 md:py-14">
      <div className="max-w-[62ch]">
        <p className="label-mono flex items-center gap-2 text-night-muted">
          <span aria-hidden="true" className="mark-square bg-night-blue" />
          Responsible play
        </p>
        <h1 className="mt-5 text-title">Set your own ceiling.</h1>
        <p className="mt-4 text-lead text-night-muted">
          Lowering a limit takes effect immediately. Raising one waits 24 hours — the
          moment you want a higher limit is exactly the moment you should not get one.
        </p>
      </div>

      {excluded ? (
        <div className="mt-8 max-w-[52rem] rounded-[10px] border border-night-amber/40 bg-night-amber/10 p-5">
          <p className="text-subhead font-medium">Your account is self-excluded.</p>
          <p className="mt-1.5 text-small text-night-muted">
            Until{" "}
            {excluded.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            . This cannot be shortened. Withdrawals can still be arranged through support.
          </p>
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <LimitsForm
          dailyDeposit={toDecimal(limits?.daily_deposit_cap_usd ?? null)}
          dailyLoss={toDecimal(limits?.daily_loss_cap_usd ?? null)}
          sessionMinutes={limits?.session_minutes ?? null}
          pendingAt={limits?.pending_increase_at ?? null}
        />
        <SelfExclusionForm disabled={Boolean(excluded)} />
      </div>

      <section className="mt-14 max-w-[62ch] border-t border-night-rule pt-8">
        <h2 className="text-section">If it stops being fun</h2>
        <p className="mt-3 text-body text-night-muted">
          The tools above are yours and take effect whether or not anyone agrees with you
          using them. Nobody at KYRO will call to ask you to reconsider.
        </p>

        {support.name && support.url ? (
          <p className="mt-4 text-body text-night-muted">
            Independent support is available from{" "}
            <a
              href={support.url}
              className="text-night-text underline underline-offset-4"
              rel="noreferrer noopener"
              target="_blank"
            >
              {support.name}
            </a>
            .
          </p>
        ) : (
          <p className="mt-4 text-small text-night-muted">
            No support service is configured for this install. KYRO will not print a
            helpline it has not verified serves your market — an operator must set{" "}
            <code className="figure-num">KYRO_HELPLINE_NAME</code> and{" "}
            <code className="figure-num">KYRO_HELPLINE_URL</code> with a real service
            before this wing opens to anyone.
          </p>
        )}
      </section>
    </div>
  );
}
