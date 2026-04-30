import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for handleAgentFailure() — the auto-refund path triggered when
 * any step.run throws past Inngest's retries. Cases per Cameron's PR6
 * spec:
 *   1. Step throws → row marked failed, refund issued, refund event logged
 *   2. Refund call fails → row marked failed, refund_failed event logged,
 *      alert email fires
 *   3. Idempotency: handler called twice with same report_id passes the
 *      same idempotency_key on both calls (Stripe dedupes server-side)
 *   4. Successful run → handler is never called (verified by the
 *      orchestrator integration; not covered here directly)
 *
 * Case 4 is implicit: handleAgentFailure is only called from the
 * orchestrator's catch block. A successful run means catch never fires.
 * Asserting "never called" requires the full orchestrator under test,
 * which has too much surface for a unit test. The PR6 48h prod
 * observation ceremony validates this case end-to-end with a real
 * Stripe test-mode payment that runs through normalize + parcel
 * successfully and fails at step 3 (plan).
 */

// Mock Supabase client.
const mockUpdateEq = vi.fn();
const mockInsert = vi.fn();
vi.mock("../lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "reports_v2") {
        return {
          update: () => ({ eq: mockUpdateEq }),
        };
      }
      if (table === "report_events") {
        return { insert: mockInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

// Mock Stripe.
const mockRefundsCreate = vi.fn();
vi.mock("../lib/stripe", () => ({
  getStripe: () => ({
    refunds: { create: mockRefundsCreate },
  }),
}));

// Mock Resend.
const mockResendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockResendSend };
  },
}));

import { handleAgentFailure } from "../lib/agent/refund";

const REPORT_ID = "00000000-0000-0000-0000-000000000123";
const PAYMENT_INTENT_ID = "pi_test_stub_123";

beforeEach(() => {
  mockUpdateEq.mockReset();
  mockUpdateEq.mockResolvedValue({ error: null });
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
  mockRefundsCreate.mockReset();
  mockResendSend.mockReset();
  mockResendSend.mockResolvedValue({ error: null });
});

describe("handleAgentFailure — case 1: refund issued", () => {
  it("marks reports_v2 failed, issues refund, logs the refunded event", async () => {
    mockRefundsCreate.mockResolvedValue({
      id: "re_test_123",
      amount: 2900,
      currency: "usd",
    });

    await handleAgentFailure({
      reportId: REPORT_ID,
      stripePaymentIntentId: PAYMENT_INTENT_ID,
      failedStepName: "plan",
      errorMessage: "plan: not implemented (PR3 scaffold)",
    });

    // reports_v2 was updated with status='failed'
    expect(mockUpdateEq).toHaveBeenCalledTimes(1);

    // Two report_events inserts: one for the step error, one for the refund
    expect(mockInsert).toHaveBeenCalledTimes(2);
    const errorEventCall = mockInsert.mock.calls[0][0];
    expect(errorEventCall.event_type).toBe("error");
    expect(errorEventCall.step_name).toBe("plan");

    const refundEventCall = mockInsert.mock.calls[1][0];
    expect(refundEventCall.step_name).toBe("refund");
    expect(refundEventCall.payload.outcome).toBe("refunded");
    expect(refundEventCall.payload.refund_id).toBe("re_test_123");

    // Stripe refund called with idempotency_key=reports_v2.id
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    expect(mockRefundsCreate.mock.calls[0][0]).toEqual({
      payment_intent: PAYMENT_INTENT_ID,
      reason: "requested_by_customer",
    });
    expect(mockRefundsCreate.mock.calls[0][1]).toEqual({
      idempotencyKey: REPORT_ID,
    });

    // Alert email NOT sent on success path
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

describe("handleAgentFailure — case 2: refund call fails", () => {
  it("logs refund_failed event AND fires alert email", async () => {
    mockRefundsCreate.mockRejectedValue(
      new Error("Stripe API error: payment_intent already refunded"),
    );

    await handleAgentFailure({
      reportId: REPORT_ID,
      stripePaymentIntentId: PAYMENT_INTENT_ID,
      failedStepName: "plan",
      errorMessage: "plan: not implemented",
    });

    // reports_v2 still marked failed
    expect(mockUpdateEq).toHaveBeenCalledTimes(1);

    // Two report_events inserts: error for the step, error for refund_failed
    expect(mockInsert).toHaveBeenCalledTimes(2);
    const refundFailedCall = mockInsert.mock.calls[1][0];
    expect(refundFailedCall.event_type).toBe("error");
    expect(refundFailedCall.step_name).toBe("refund");
    expect(refundFailedCall.payload.outcome).toBe("refund_failed");
    expect(refundFailedCall.payload.refund_error).toContain(
      "already refunded",
    );

    // Alert email FIRES on refund failure (the silent-failure-is-dangerous case)
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const alertArgs = mockResendSend.mock.calls[0][0];
    expect(alertArgs.subject).toContain("auto-refund failed");
    expect(alertArgs.subject).toContain(REPORT_ID);
    expect(alertArgs.html).toContain("plan");
    expect(alertArgs.html).toContain("already refunded");
  });
});

describe("handleAgentFailure — case 3: idempotency key", () => {
  it("passes the same idempotency_key on repeat calls (Stripe dedupes server-side)", async () => {
    mockRefundsCreate.mockResolvedValue({
      id: "re_test_dedup",
      amount: 2900,
      currency: "usd",
    });

    await handleAgentFailure({
      reportId: REPORT_ID,
      stripePaymentIntentId: PAYMENT_INTENT_ID,
      failedStepName: "plan",
      errorMessage: "first attempt",
    });

    await handleAgentFailure({
      reportId: REPORT_ID,
      stripePaymentIntentId: PAYMENT_INTENT_ID,
      failedStepName: "plan",
      errorMessage: "retry attempt",
    });

    // Both calls passed the SAME idempotency_key. Stripe is responsible
    // for deduplicating; our contract is just to pass the key consistently.
    expect(mockRefundsCreate).toHaveBeenCalledTimes(2);
    expect(mockRefundsCreate.mock.calls[0][1]).toEqual({
      idempotencyKey: REPORT_ID,
    });
    expect(mockRefundsCreate.mock.calls[1][1]).toEqual({
      idempotencyKey: REPORT_ID,
    });
  });
});

describe("handleAgentFailure — no payment_intent_id", () => {
  it("skips refund when stripe_payment_intent_id is null", async () => {
    await handleAgentFailure({
      reportId: REPORT_ID,
      stripePaymentIntentId: null,
      failedStepName: "plan",
      errorMessage: "no PI test",
    });

    // Row still marked failed + step error logged
    expect(mockUpdateEq).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0].event_type).toBe("error");
    expect(mockInsert.mock.calls[0][0].step_name).toBe("plan");

    // Refund NOT attempted, alert NOT sent
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
