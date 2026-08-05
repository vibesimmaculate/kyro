import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

/**
 * The staff register: dense, plain, no marketing. A tool for someone on a
 * shift, which is why it gets its own layout rather than borrowing the
 * customer's.
 */
export default function OperatorLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper-sunk">
      <header className="border-b border-rule-strong bg-white">
        <div className="shell flex h-12 items-center gap-4">
          <Link href="/" className="flex items-center">
            <Wordmark size="sm" />
          </Link>
          <span className="label-mono text-ink-faint">Counter console</span>
          <Link
            href="/"
            className="label-mono ms-auto text-ink-muted transition-colors hover:text-ink"
          >
            Exit
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
