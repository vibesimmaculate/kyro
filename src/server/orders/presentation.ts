import type { TimelineStage } from "@/components/orders/OrderTimeline";
import type { Order, OrderStatus } from "./types";
import { STATUS_SEQUENCE, statusRank } from "./types";

/**
 * Turns an order's status into words a person would use.
 *
 * The database calls it `settlement-sent`. The customer is told "Crypto sent"
 * or "Cash ready", depending on which way their exchange runs. No internal
 * state name ever reaches the screen.
 */

interface StageCopy {
  readonly title: string;
  readonly body: string;
}

function copyFor(status: OrderStatus, order: Order): StageCopy {
  const cashToCrypto = order.direction === "cash-to-crypto";

  switch (status) {
    case "created":
      return {
        title: "Order created",
        body: cashToCrypto
          ? "Your rate is locked and the pickup point has been told to expect you."
          : "Your rate is locked and a deposit address has been issued for this order.",
      };
    case "identity-confirmed":
      return {
        title: "Identity confirmed",
        body: "ID checked at the pickup point against the name on the order.",
      };
    case "awaiting-funds":
      return {
        title: "Waiting for exchange",
        body: cashToCrypto
          ? "The cashier is counting and confirming your cash."
          : `Waiting for your ${order.asset} to arrive and confirm on the network.`,
      };
    case "funds-received":
      return {
        title: cashToCrypto ? "Cash received" : "Crypto received",
        body: cashToCrypto
          ? "The pickup point has your money and the transfer is authorised."
          : "Your transfer has confirmed. The pickup point is counting out your cash.",
      };
    case "settlement-sent":
      return {
        title: cashToCrypto ? "Crypto sent" : "Cash ready",
        body: cashToCrypto
          ? "Broadcast to the network. The transaction ID is below."
          : "Counted and waiting for you. Bring your ID and order code.",
      };
    case "complete":
      return {
        title: "Complete",
        body: cashToCrypto
          ? "Confirmed on-chain and in your wallet."
          : "Collected. Thank you.",
      };
    case "cancelled":
      return { title: "Cancelled", body: "This order was cancelled. Nothing was charged." };
    case "expired":
      return {
        title: "Expired",
        body: "The rate on this order is no longer held. Start again and the pickup point will quote you afresh.",
      };
    default:
      return { title: "In progress", body: "" };
  }
}

export function timelineFor(order: Order): readonly TimelineStage[] {
  const eventFor = (status: OrderStatus) => order.events.find((e) => e.status === status);
  const current = statusRank(order.status);

  return STATUS_SEQUENCE.map((status, index) => {
    const event = eventFor(status);
    const copy = copyFor(status, order);

    const state: TimelineStage["state"] =
      index < current ? "done" : index === current ? (order.status === "complete" ? "done" : "current") : "upcoming";

    return {
      key: status,
      title: copy.title,
      body: copy.body,
      state,
      at: event
        ? new Date(event.at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : undefined,
      note: event?.note,
    };
  });
}

/** The single line at the top of the order page: what to do right now. */
export function nextActionFor(order: Order): { readonly headline: string; readonly body: string } {
  const cashToCrypto = order.direction === "cash-to-crypto";

  switch (order.status) {
    case "created":
      return {
        headline: cashToCrypto ? "Your exchange is ready." : "Send your crypto.",
        body: cashToCrypto
          ? "Bring your ID and order code to the pickup point, with the exact cash."
          : "Send the exact amount to the address below, then come and collect your cash.",
      };
    case "identity-confirmed":
      return {
        headline: "You are checked in.",
        body: cashToCrypto
          ? "Hand over the cash when the cashier asks for it."
          : "We are waiting for your transfer to confirm.",
      };
    case "awaiting-funds":
      return {
        headline: cashToCrypto ? "Waiting on the cash count." : "Waiting on the network.",
        body: cashToCrypto
          ? "The cashier is confirming the amount. This takes a minute or two."
          : "Nothing to do — the confirmations arrive on their own.",
      };
    case "funds-received":
      return {
        headline: cashToCrypto ? "Cash received." : "Transfer confirmed.",
        body: cashToCrypto
          ? "Your transfer is being sent now."
          : "Your cash is being counted out.",
      };
    case "settlement-sent":
      return {
        headline: cashToCrypto ? "Sent to your wallet." : "Your cash is ready.",
        body: cashToCrypto
          ? "It will appear once the network confirms it."
          : "Bring your ID and order code to the pickup point.",
      };
    case "complete":
      return { headline: "Done.", body: "This exchange is finished. Thank you." };
    case "cancelled":
      return {
        headline: "This order was cancelled.",
        body: "Nothing was charged. Start a new exchange whenever you like.",
      };
    case "expired":
      return {
        headline: "This order has expired.",
        body: "Its rate is no longer held. Start again for a current quote.",
      };
    default:
      return { headline: "In progress.", body: "" };
  }
}
