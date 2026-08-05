"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cn } from "@/lib/cn";
import { crypto as cryptoAmount, money as fiatMoney } from "@/lib/money/amounts";
import { formatCrypto, formatMoney } from "@/lib/money/format";
import { advanceOrder } from "@/server/operator/actions";
import type { Order, OrderStatus } from "@/server/orders/types";
import { STATUS_SEQUENCE, statusRank } from "@/server/orders/types";

/**
 * One order, one row, one button.
 *
 * The button always shows the single next stage rather than a menu of every
 * status — a cashier mid-transaction should not be choosing from a dropdown.
 */
export function OperatorOrderRow({
  order,
  expired,
}: {
  readonly order: Order;
  /** Computed once on the server, so the row renders from data alone. */
  readonly expired: boolean;
}) {
  const [state, action, pending] = useActionState(advanceOrder, {});

  const rank = statusRank(order.status);
  const next: OrderStatus | undefined = STATUS_SEQUENCE[rank + 1];

  const cashToCrypto = order.direction === "cash-to-crypto";
  const give = cashToCrypto
    ? formatMoney(fiatMoney(BigInt(order.giveUnits), order.fiat))
    : formatCrypto(cryptoAmount(BigInt(order.giveUnits), order.asset));
  const receive = cashToCrypto
    ? formatCrypto(cryptoAmount(BigInt(order.receiveUnits), order.asset))
    : formatMoney(fiatMoney(BigInt(order.receiveUnits), order.fiat));

  return (
    <tr className="border-b border-rule align-baseline">
      <td className="py-2.5 pe-4">
        <Link
          href={`/orders/${order.reference}`}
          className="figure-num underline underline-offset-4"
        >
          {order.reference}
        </Link>
        {expired ? (
          <span className="label-mono ms-2 text-amber">rate expired</span>
        ) : null}
      </td>
      <td className="py-2.5 pe-4 text-ink-muted">
        {cashToCrypto ? "Cash → Crypto" : "Crypto → Cash"}
      </td>
      <td className="figure-num py-2.5 pe-4 text-end whitespace-nowrap">{give}</td>
      <td className="figure-num py-2.5 pe-4 text-end whitespace-nowrap">{receive}</td>
      <td className="py-2.5 pe-4 text-ink-muted">{order.locationSlug}</td>
      <td className="py-2.5 pe-4">
        <span className="label-mono">{order.status}</span>
      </td>
      <td className="py-2.5 text-end">
        {next ? (
          <form action={action} className="inline">
            <input type="hidden" name="reference" value={order.reference} />
            <input type="hidden" name="status" value={next} />
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "tap inline-flex items-center rounded-[6px] border border-rule-strong bg-white px-3",
                "text-small transition-colors hover:bg-paper-sunk active:translate-y-px",
                "disabled:opacity-50",
              )}
            >
              {pending ? "…" : `→ ${next}`}
            </button>
          </form>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
        {state.error ? <p className="mt-1 text-micro text-red">{state.error}</p> : null}
      </td>
    </tr>
  );
}
