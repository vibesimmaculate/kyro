"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { submitQuote } from "@/server/exchange/actions";
import { AmountReadout } from "@/components/exchange/AmountReadout";
import { DirectionSwitch } from "@/components/exchange/DirectionSwitch";
import { FeeReceipt } from "@/components/exchange/FeeReceipt";
import { MoneyInput } from "@/components/exchange/MoneyInput";
import { QuoteTimer } from "@/components/exchange/QuoteTimer";
import { Button } from "@/components/ui/Button";
import { Selector, type SelectorOption } from "@/components/ui/Selector";
import {
  availabilityOf,
  counterClock,
  locationsSupporting,
  sampleLocationProvider,
} from "@/fixtures/locations";
import { cn } from "@/lib/cn";
import {
  CRYPTO,
  FIAT,
  FIAT_CODES,
  defaultNetworkFor,
  networksFor,
  supportsNetwork,
  type CryptoCode,
  type FiatCode,
  type NetworkId,
} from "@/lib/money/currencies";
import { formatCrypto, formatMoney, formatRate } from "@/lib/money/format";
import { buildQuote } from "@/lib/quote/engine";
import { QUOTE_TTL_MS } from "@/lib/rates/preview";
import type { Direction } from "@/lib/quote/types";

/**
 * The exchange ticket.
 *
 * Inputs above the tear, the printed breakdown below it. The same pure engine
 * that the server uses to create the order runs here, anchored to a timestamp
 * handed down from the request, so the first paint on the server and the first
 * paint in the browser agree to the last minor unit.
 */

export interface CalculatorDefaults {
  readonly direction?: Direction;
  readonly amount?: string;
  readonly fiat?: FiatCode;
  readonly asset?: CryptoCode;
  readonly network?: NetworkId;
  readonly location?: string;
}

export interface ExchangeCalculatorProps {
  /** Request time. Anchors the quote so SSR and hydration produce the same figures. */
  readonly anchor: number;
  readonly defaults?: CalculatorDefaults;
  /**
   * `hero` hands the inputs to /exchange through the URL, so the homepage stays
   * static and shareable. `page` submits them to the server action that starts
   * the order — where the price is recomputed authoritatively.
   */
  readonly variant?: "hero" | "page";
  readonly className?: string;
}

interface State {
  direction: Direction;
  amount: string;
  fiat: FiatCode;
  asset: CryptoCode;
  network: NetworkId;
  location: string;
}

const ASSET_ORDER: readonly CryptoCode[] = ["BTC", "ETH", "USDT", "USDC", "SOL"];

function initialState(defaults: CalculatorDefaults | undefined): State {
  const direction = defaults?.direction ?? "cash-to-crypto";
  const fiat = defaults?.fiat ?? "EUR";
  const asset = defaults?.asset ?? "BTC";
  const network =
    defaults?.network && supportsNetwork(asset, defaults.network)
      ? defaults.network
      : defaultNetworkFor(asset);

  const amount =
    defaults?.amount ?? (direction === "cash-to-crypto" ? FIAT[fiat].defaultAmount : "0.05");

  const candidates = locationsSupporting(direction, fiat, asset);
  const location =
    defaults?.location && candidates.some((l) => l.slug === defaults.location)
      ? defaults.location
      : (candidates[0]?.slug ?? "");

  return { direction, amount, fiat, asset, network, location };
}

/** Keeps the four selectors consistent with one another after any change. */
function reconcile(next: State, previous: State): State {
  const network = supportsNetwork(next.asset, next.network)
    ? next.network
    : defaultNetworkFor(next.asset);

  const candidates = locationsSupporting(next.direction, next.fiat, next.asset);
  const location = candidates.some((l) => l.slug === next.location)
    ? next.location
    : (candidates[0]?.slug ?? "");

  // Switching direction swaps what the amount means, so carry over a sensible
  // figure rather than leaving "1000" in a field that now wants BTC.
  let amount = next.amount;
  if (next.direction !== previous.direction) {
    amount =
      next.direction === "cash-to-crypto"
        ? FIAT[next.fiat].defaultAmount
        : defaultCryptoAmount(next.asset);
  } else if (next.fiat !== previous.fiat && next.direction === "cash-to-crypto") {
    amount = FIAT[next.fiat].defaultAmount;
  } else if (next.asset !== previous.asset && next.direction === "crypto-to-cash") {
    amount = defaultCryptoAmount(next.asset);
  }

  return { ...next, network, location, amount };
}

/** Roughly €1 000 worth, so switching asset does not produce a silly figure. */
function defaultCryptoAmount(asset: CryptoCode): string {
  switch (asset) {
    case "BTC":
      return "0.01";
    case "ETH":
      return "0.3";
    case "SOL":
      return "6";
    default:
      return "1000";
  }
}

export function ExchangeCalculator({
  anchor,
  defaults,
  variant = "hero",
  className,
}: ExchangeCalculatorProps) {
  const router = useRouter();
  const fieldId = useId();
  const [state, setState] = useState<State>(() => initialState(defaults));
  const [quoteAt, setQuoteAt] = useState(anchor);
  const [expired, setExpired] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announceTimer = useRef<number | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [formState, formAction, submitting] = useActionState(submitQuote, {});

  const update = useCallback((patch: Partial<State>) => {
    setState((previous) => reconcile({ ...previous, ...patch }, previous));
    setQuoteAt(Date.now());
    setExpired(false);
  }, []);

  const result = useMemo(
    () =>
      buildQuote({
        direction: state.direction,
        give: state.amount,
        fiat: state.fiat,
        asset: state.asset,
        network: state.network,
        at: quoteAt,
      }),
    [state, quoteAt],
  );

  const quote = result.ok ? result.quote : null;
  const issue = result.ok ? null : (result.issues[0] ?? null);

  // Announce the settled figure once the typing stops, not on every keystroke.
  useEffect(() => {
    if (!quote) return;
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      const receive =
        quote.receive.kind === "fiat" ? formatMoney(quote.receive) : formatCrypto(quote.receive);
      setAnnouncement(`You receive ${receive}. Service fee ${formatMoney(quote.serviceFee)}.`);
    }, 700);
    return () => window.clearTimeout(announceTimer.current);
  }, [quote]);

  const refresh = useCallback(() => {
    setQuoteAt(Date.now());
    setExpired(false);
  }, []);

  const locations = useMemo(
    () => locationsSupporting(state.direction, state.fiat, state.asset),
    [state.direction, state.fiat, state.asset],
  );

  const fiatOptions: SelectorOption[] = FIAT_CODES.map((code) => ({
    value: code,
    label: code,
    caption: FIAT[code].name,
  }));

  const assetOptions: SelectorOption[] = ASSET_ORDER.map((code) => ({
    value: code,
    label: code,
    caption: CRYPTO[code].name,
  }));

  const networkOptions: SelectorOption[] = networksFor(state.asset).map((network) => ({
    value: network.id,
    label: network.name,
    note: network.note,
  }));

  const locationOptions: SelectorOption[] = locations.map((location) => {
    const availability = availabilityOf(location, counterClock(new Date(quoteAt)));
    return {
      value: location.slug,
      label: `${location.city} — ${location.branch}`,
      caption: `${availability.label} · ${availability.detail}`,
    };
  });

  const selectedLocation = sampleLocationProvider.bySlug(state.location);

  const cashToCrypto = state.direction === "cash-to-crypto";
  const submits = variant === "page";
  const errorId = issue || formState.error ? `${fieldId}-error` : undefined;

  function onContinue() {
    if (!quote || expired) return;
    setPending(true);
    const params = new URLSearchParams({
      direction: state.direction,
      amount: state.amount,
      fiat: state.fiat,
      asset: state.asset,
      network: state.network,
    });
    if (state.location) params.set("location", state.location);
    router.push(`/exchange?${params.toString()}`);
  }

  return (
    <Wrapper
      submits={submits}
      action={formAction}
      className={cn(
        "relative block rounded-[10px] border border-rule-strong bg-white",
        variant === "hero" && "shadow-[var(--shadow-ticket)]",
        className,
      )}
    >
      {submits ? (
        <>
          <input type="hidden" name="direction" value={state.direction} />
          <input type="hidden" name="amount" value={state.amount} />
          <input type="hidden" name="fiat" value={state.fiat} />
          <input type="hidden" name="asset" value={state.asset} />
          <input type="hidden" name="network" value={state.network} />
          <input type="hidden" name="location" value={state.location} />
        </>
      ) : null}
      {/* ── Above the tear: what you choose ─────────────────────────────── */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="label-mono text-ink-faint">Exchange ticket</h2>
          <span className="label-mono text-ink-faint">4% fee</span>
        </div>

        <DirectionSwitch
          value={state.direction}
          onValueChange={(direction) => update({ direction })}
          className="mt-3"
        />

        <div className="mt-5">
          <MoneyInput
            id={`${fieldId}-amount`}
            label="You give"
            value={state.amount}
            onValueChange={(amount) => update({ amount })}
            invalid={Boolean(issue && issue.field === "give")}
            describedBy={errorId}
            suffix={
              cashToCrypto ? (
                <Selector
                  value={state.fiat}
                  onValueChange={(fiat) => update({ fiat: fiat as FiatCode })}
                  options={fiatOptions}
                  ariaLabel="Currency you are paying with"
                  display="code"
                  className="w-[7.25rem] border-0 bg-transparent hover:border-0"
                />
              ) : (
                <Selector
                  value={state.asset}
                  onValueChange={(asset) => update({ asset: asset as CryptoCode })}
                  options={assetOptions}
                  ariaLabel="Cryptocurrency you are sending"
                  display="code"
                  className="w-[7.25rem] border-0 bg-transparent hover:border-0"
                />
              )
            }
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${fieldId}-counter`}
              className="label-mono block text-ink-muted"
            >
              {cashToCrypto ? "You receive" : "Paid out in"}
            </label>
            <div className="mt-2">
              {cashToCrypto ? (
                <Selector
                  id={`${fieldId}-counter`}
                  value={state.asset}
                  onValueChange={(asset) => update({ asset: asset as CryptoCode })}
                  options={assetOptions}
                  ariaLabel="Cryptocurrency you will receive"
                  display="code"
                />
              ) : (
                <Selector
                  id={`${fieldId}-counter`}
                  value={state.fiat}
                  onValueChange={(fiat) => update({ fiat: fiat as FiatCode })}
                  options={fiatOptions}
                  ariaLabel="Currency you will be paid in"
                  display="code"
                />
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`${fieldId}-network`} className="label-mono block text-ink-muted">
              Network
            </label>
            <div className="mt-2">
              {networkOptions.length === 1 ? (
                /*
                  With one option there is nothing to choose. A disabled select
                  reads as broken, so the single network is stated as a fact —
                  same height and box as its neighbour, so the row still aligns.
                */
                <p
                  id={`${fieldId}-network`}
                  className="flex min-h-11 items-center rounded-[8px] border border-rule bg-paper-sunk px-3 text-[0.9375rem] text-ink-muted"
                >
                  {networkOptions[0]?.label}
                  <span className="label-mono ms-auto text-ink-faint">Only network</span>
                </p>
              ) : (
                <Selector
                  id={`${fieldId}-network`}
                  value={state.network}
                  onValueChange={(network) => update({ network: network as NetworkId })}
                  options={networkOptions}
                  ariaLabel="Network"
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor={`${fieldId}-location`} className="label-mono block text-ink-muted">
            {cashToCrypto ? "Pay cash at" : "Collect cash at"}
          </label>
          <div className="mt-2">
            {locationOptions.length > 0 ? (
              <Selector
                id={`${fieldId}-location`}
                value={state.location}
                onValueChange={(location) => update({ location })}
                options={locationOptions}
                ariaLabel="Exchange location"
                placeholder="Choose a location"
              />
            ) : (
              <p className="rounded-[8px] border border-amber/40 bg-amber-wash px-3 py-2.5 text-small text-ink">
                No counter handles {state.asset} for {state.fiat} in that direction yet.
                Change the currency or the coin.
              </p>
            )}
          </div>
        </div>

        {issue || formState.error ? (
          <p
            id={errorId}
            role="alert"
            className="mt-3 flex items-start gap-2 text-small text-red"
          >
            <span aria-hidden="true" className="mt-[0.45em] h-1.5 w-1.5 flex-none bg-red" />
            {issue?.message ?? formState.error}
          </p>
        ) : null}
      </div>

      {/* ── The tear ────────────────────────────────────────────────────── */}
      <div className="relative h-0" aria-hidden="true">
        <span className="absolute -start-[9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-paper" />
        <span className="absolute -end-[9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-paper" />
        <span className="absolute inset-x-3 top-1/2 border-t border-dashed border-rule-strong" />
      </div>

      {/* ── Below the tear: what it costs ───────────────────────────────── */}
      <div className="rounded-b-[10px] bg-paper-sunk p-4 pt-6 sm:p-5 sm:pt-6">
        {quote ? (
          <>
            <div className={cn("transition-opacity", expired && "opacity-45")}>
              <FeeReceipt quote={quote} showRate={false} showTotal={false} />
            </div>

            <div className="mt-4 border-t border-rule pt-4">
              <p className="label-mono text-ink-muted">
                {cashToCrypto ? "You receive" : "You collect"}
              </p>
              <AmountReadout amount={quote.receive} dimmed={expired} className="mt-1.5" />
              <p className="mt-1.5 text-micro text-ink-muted">
                {quote.rateLabel} · {formatRate(quote.rate)}
              </p>
            </div>

            <QuoteTimer
              expiresAt={quote.expiresAt}
              totalMs={QUOTE_TTL_MS}
              onExpire={() => setExpired(true)}
              className="mt-4"
            />

            <div className="mt-3">
              {expired ? (
                <Button type="button" variant="secondary" full size="lg" onClick={refresh}>
                  Refresh quote
                </Button>
              ) : submits ? (
                <Button full size="lg" type="submit" disabled={submitting || !state.location}>
                  {submitting ? "Checking the price…" : "Continue"}
                </Button>
              ) : (
                <Button
                  type="button"
                  full
                  size="lg"
                  onClick={onContinue}
                  disabled={pending || !state.location}
                >
                  {pending ? "Opening…" : "Continue"}
                </Button>
              )}
            </div>

            {selectedLocation && !expired ? (
              <p className="mt-3 text-micro text-ink-muted">
                {cashToCrypto
                  ? `Bring cash and ID to ${selectedLocation.city} — ${selectedLocation.branch}. Nothing is charged until you do.`
                  : `Send your ${state.asset}, then collect cash at ${selectedLocation.city} — ${selectedLocation.branch}.`}
              </p>
            ) : null}
          </>
        ) : (
          /* Loading and error states hold the same height, so nothing jumps. */
          <div className="flex min-h-[16.5rem] flex-col justify-center gap-2 text-center">
            <p className="text-small text-ink-muted">
              Enter an amount to see exactly what you will get.
            </p>
            <p className="text-micro text-ink-faint">
              The 4% fee and the network fee are both shown before you commit.
            </p>
          </div>
        )}

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </Wrapper>
  );
}

/**
 * The ticket is a form on the flow page and a plain section on the homepage.
 * Split out so the markup below stays one shape rather than two branches.
 */
function Wrapper({
  submits,
  action,
  className,
  children,
}: {
  readonly submits: boolean;
  readonly action: (formData: FormData) => void;
  readonly className: string;
  readonly children: React.ReactNode;
}) {
  if (submits) {
    return (
      <form action={action} aria-label="Exchange calculator" className={className}>
        {children}
      </form>
    );
  }
  return (
    <section aria-label="Exchange calculator" className={className}>
      {children}
    </section>
  );
}
