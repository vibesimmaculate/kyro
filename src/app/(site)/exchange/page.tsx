import type { Metadata } from "next";
import { ExchangeCalculator } from "@/components/exchange/ExchangeCalculator";
import { FlowProgress } from "@/components/exchange/FlowProgress";
import { isCryptoCode, isFiatCode, isNetworkId } from "@/lib/money/currencies";
import { isDirection } from "@/lib/quote/types";
import { readDraft } from "@/server/exchange/draft";
import { requestNow } from "@/server/clock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start an exchange",
  description: "Price your exchange, see the 4% fee in full, and choose a counter.",
};

/**
 * Step one. The same calculator as the homepage, carrying over whatever was
 * already chosen — from the link that got here, or from a draft in progress.
 */
export default async function ExchangePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const draft = await readDraft();

  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const direction = one("direction");
  const fiat = one("fiat");
  const asset = one("asset");
  const network = one("network");

  return (
    <>
      <FlowProgress current={0} completed={draft?.done ?? []} />

      <div className="shell py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 lg:col-span-5 lg:pt-4">
            <p className="label-mono text-ink-muted">Step 1 of 5</p>
            <h1 className="mt-3 text-title text-balance">
              See exactly what you&rsquo;ll get.
            </h1>
            <p className="mt-4 max-w-[46ch] text-lead text-ink-muted">
              Set the amount, the coin and the counter. Everything that affects the
              final figure is on this screen — nothing is added later.
            </p>

            <ul className="mt-8 space-y-3 border-t border-rule pt-6 text-small">
              <li className="flex gap-3">
                <span aria-hidden="true" className="mark-square mt-[0.5rem]" />
                <span className="text-ink-muted">
                  No account needed. You will get a code to track the order and to read
                  out at the counter.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="mark-square mt-[0.5rem]" />
                <span className="text-ink-muted">
                  Nothing is charged here. You pay, or get paid, in person.
                </span>
              </li>
            </ul>
          </div>

          <div className="mx-auto w-full min-w-0 max-w-[30rem] lg:col-span-6 lg:col-start-7 lg:max-w-none">
            <ExchangeCalculator
              anchor={requestNow()}
              variant="page"
              defaults={{
                direction: isDirection(direction) ? direction : draft?.direction,
                amount: one("amount") ?? draft?.amount,
                fiat: isFiatCode(fiat) ? fiat : draft?.fiat,
                asset: isCryptoCode(asset) ? asset : draft?.asset,
                network: isNetworkId(network) ? network : draft?.network,
                location: one("location") ?? draft?.location,
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
