import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Games unavailable",
  robots: { index: false, follow: false },
};

export default function UnavailablePage() {
  return (
    <div className="shell flex min-h-[60vh] items-center py-12">
      <div className="max-w-[46ch]">
        <p className="label-mono flex items-center gap-2 text-night-muted">
          <span aria-hidden="true" className="mark-square bg-night-amber" />
          Not available here
        </p>
        <h1 className="mt-5 text-title">The games are closed in your country.</h1>
        <p className="mt-4 text-lead text-night-muted">
          KYRO does not offer games where it has no licence to do so. Nothing about this is
          negotiable and there is no version of the page that lets you through.
        </p>
        <p className="mt-4 text-body text-night-muted">
          The exchange is a different matter — it is a currency counter, not a gaming
          product, and it is open as normal.
        </p>

        <Link
          href="/"
          className="tap mt-8 inline-flex items-center rounded-[8px] border border-night-rule-strong px-4 text-night-text transition-colors hover:border-night-muted"
        >
          Go to the exchange
        </Link>
      </div>
    </div>
  );
}
