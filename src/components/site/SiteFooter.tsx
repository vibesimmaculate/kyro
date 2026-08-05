import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { FOOTER_NAV, SUPPORTED_ASSET_LINKS } from "@/lib/nav";

/**
 * A footer, not a farewell. No oversized logo, no final call to action, no
 * newsletter. Navigation, how to reach a human, what KYRO handles, and the
 * legal line.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-rule bg-paper-sunk">
      <div className="shell py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4">
            <Wordmark size="md" />
            <p className="mt-3 max-w-[26ch] text-small text-ink-muted">
              Cash to crypto. Crypto to cash. At a counter, with a person, for one
              clear fee.
            </p>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.title} aria-label={group.title} className="md:col-span-2">
              <h2 className="label-mono text-ink-faint">{group.title}</h2>
              <ul className="mt-3 space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-8 items-center text-small text-ink-muted transition-colors duration-[var(--duration-fast)] hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="md:col-span-2">
            <h2 className="label-mono text-ink-faint">Handled</h2>
            <ul className="mt-3 space-y-1.5">
              {SUPPORTED_ASSET_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-8 items-center text-small text-ink-muted transition-colors duration-[var(--duration-fast)] hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-rule pt-6 text-micro text-ink-faint md:flex-row md:items-center md:justify-between">
          <p>© {year} KYRO. Sample locations and preview rates — see Fees.</p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <li>
              <Link href="/terms" className="transition-colors hover:text-ink">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="transition-colors hover:text-ink">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/games" className="transition-colors hover:text-ink">
                Games
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
