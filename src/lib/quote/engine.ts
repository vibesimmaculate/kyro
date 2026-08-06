/**
 * The quote engine.
 *
 * Pure, deterministic and shared by the browser and the server. The browser
 * runs it so the calculator responds the instant a key is pressed; the server
 * runs it again when an order is created and that result is the authoritative
 * one. Because the function is pure and the rate is anchored to a timestamp,
 * both sides agree — and if they ever disagree, the server wins and says so.
 */

import {
  CRYPTO,
  FIAT,
  supportsNetwork,
} from "@/lib/money/currencies";
import {
  applyBasisPoints,
  convertCryptoToFiat,
  convertFiatToCrypto,
  crypto,
  floorToQuotePrecision,
  money,
  parseCrypto,
  parseMoney,
  subCrypto,
  subMoney,
  zeroCrypto,
  type CryptoAmount,
  type Money,
} from "@/lib/money/amounts";
import { formatMoney } from "@/lib/money/format";
import { QUOTE_TTL_MS, previewRateProvider, type RateProvider } from "@/lib/rates/preview";
import {
  sampleNetworkFeeProvider,
  type NetworkFeeProvider,
} from "@/lib/rates/network-fees";
import {
  SERVICE_FEE_BP,
  type Quote,
  type QuoteIssue,
  type QuoteRequest,
  type QuoteResult,
} from "./types";

export interface QuoteDependencies {
  readonly rates: RateProvider;
  readonly networkFees: NetworkFeeProvider;
  readonly ttlMs: number;
}

export const defaultQuoteDependencies: QuoteDependencies = {
  rates: previewRateProvider,
  networkFees: sampleNetworkFeeProvider,
  ttlMs: QUOTE_TTL_MS,
};

const DECIMAL_INPUT = /^\d{1,12}(?:[.,]\d{0,18})?$/;

/** Accepts what people actually type: "1 000,50", "1000.5", "€1000". */
export function normaliseAmountInput(raw: string): string {
  return raw
    .replace(/[\s  ']/g, "")
    .replace(/[€$£]|KM|дин|ден|\bL\b/gi, "")
    .replace(",", ".")
    .trim();
}

export function buildQuote(
  request: QuoteRequest,
  deps: QuoteDependencies = defaultQuoteDependencies,
): QuoteResult {
  const issues: QuoteIssue[] = [];
  const { direction, fiat, asset, network, at } = request;

  if (!supportsNetwork(asset, network)) {
    issues.push({
      code: "network-unsupported",
      field: "network",
      message: `${CRYPTO[asset].name} does not move on ${network}. Choose another network.`,
    });
    return { ok: false, issues };
  }

  const raw = normaliseAmountInput(request.give);
  if (raw === "" || raw === ".") {
    issues.push({
      code: "amount-missing",
      field: "give",
      message: "Enter how much you are exchanging.",
    });
    return { ok: false, issues };
  }
  if (!DECIMAL_INPUT.test(raw)) {
    issues.push({
      code: "amount-invalid",
      field: "give",
      message: "Enter a plain number, for example 1000 or 1000.50.",
    });
    return { ok: false, issues };
  }

  const rate = deps.rates.getRate(fiat, asset, at);
  const networkFee = deps.networkFees.getFee(asset, network);
  const currency = FIAT[fiat];
  const minimum = parseMoney(currency.minAmount, fiat);
  const maximum = parseMoney(currency.maxAmount, fiat);

  let give: Money | CryptoAmount;
  let gross: Money;

  if (direction === "cash-to-crypto") {
    give = parseMoney(raw, fiat);
    gross = give;
  } else {
    const given = parseCrypto(raw, asset);
    give = given;
    gross = convertCryptoToFiat(given, rate);
  }

  // Pickup-point limits are always expressed against the cash side of the trade,
  // whichever way round it runs.
  if (gross.minor < minimum.minor) {
    issues.push({
      code: "amount-too-small",
      field: "give",
      message:
        direction === "cash-to-crypto"
          ? `Pickup points start at ${formatMoney(minimum)}.`
          : `That is worth less than ${formatMoney(minimum)}, the pickup-point minimum.`,
    });
  }
  if (gross.minor > maximum.minor) {
    issues.push({
      code: "amount-too-large",
      field: "give",
      message:
        direction === "cash-to-crypto"
          ? `${formatMoney(maximum)} is the most one order can carry. Split it, or talk to us first.`
          : `That is worth more than ${formatMoney(maximum)}, the most one order can carry.`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  const serviceFee = applyBasisPoints(gross, SERVICE_FEE_BP, "half-up");

  let receive: Money | CryptoAmount;
  let networkFeeDeducted: boolean;

  if (direction === "cash-to-crypto") {
    // Cash in, crypto out. KYRO pays the gas, so it comes off the payout.
    const netCash = subMoney(gross, serviceFee);
    const grossCrypto = convertFiatToCrypto(netCash, rate);
    const afterNetwork = subCrypto(grossCrypto, networkFee);

    if (afterNetwork.base <= 0n) {
      return {
        ok: false,
        issues: [
          {
            code: "fee-exceeds-amount",
            field: "give",
            message: `At this size the ${CRYPTO[asset].name} network fee would take the whole payout. Exchange more, or choose a cheaper network.`,
          },
        ],
      };
    }

    receive = floorToQuotePrecision(afterNetwork);
    networkFeeDeducted = true;
  } else {
    // Crypto in, cash out. The customer's own wallet pays the gas to send, so
    // KYRO deducts nothing — but the line is still shown.
    receive = subMoney(gross, serviceFee);
    networkFeeDeducted = false;
  }

  const quote: Quote = {
    direction,
    fiat,
    asset,
    network,
    rate,
    rateLabel: deps.rates.label,
    rateIsLive: deps.rates.isLive,
    give,
    gross,
    serviceFeeBp: SERVICE_FEE_BP,
    serviceFee,
    networkFee,
    networkFeeDeducted,
    receive,
    createdAt: at,
    expiresAt: at + deps.ttlMs,
  };

  return { ok: true, quote };
}

/** The crypto figure before the network fee — shown as its own receipt line. */
export function grossCryptoOf(quote: Quote): CryptoAmount {
  if (quote.direction !== "cash-to-crypto") return zeroCrypto(quote.asset);
  const receive = quote.receive;
  if (receive.kind !== "crypto") return zeroCrypto(quote.asset);
  return crypto(receive.base + quote.networkFee.base, quote.asset);
}

/** Cash left after the service fee — the amount actually converted. */
export function netCashOf(quote: Quote): Money {
  return money(quote.gross.minor - quote.serviceFee.minor, quote.fiat);
}

export function isQuoteExpired(quote: Quote, now: number): boolean {
  return now >= quote.expiresAt;
}

export function msRemaining(quote: Quote, now: number): number {
  return Math.max(0, quote.expiresAt - now);
}
