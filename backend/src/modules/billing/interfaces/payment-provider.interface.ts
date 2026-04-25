/**
 * PaymentProvider Interface — Sprint 6
 *
 * Abstraction layer for payment providers (Stripe, Redsys, manual, etc.)
 * The active provider is resolved at runtime from Settings.
 * Concrete implementations live in /src/plugins/payment/<name>/
 *
 * For Sprint 6, only the "manual" provider exists — admin marks invoices as paid.
 * Stripe plugin will be implemented in Sprint 15.
 */

export interface PaymentResult {
  success: boolean;
  provider: string;
  external_id?: string; // e.g., Stripe payment_intent_id
  payment_method?: string; // e.g., "card", "sepa_debit"
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  success: boolean;
  provider: string;
  refund_id?: string;
  error?: string;
}

export interface PaymentProviderInterface {
  /** Unique identifier for this provider (e.g., "stripe", "manual") */
  readonly name: string;

  /** Human-readable label */
  readonly label: string;

  /**
   * Create a payment intent/session for an invoice.
   * Returns a result with the external payment ID.
   */
  createPayment(invoice: {
    id: string;
    invoice_number: string;
    total: number;
    currency: string;
    user_email: string;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaymentResult>;

  /**
   * Process a webhook payload from the payment provider.
   * Returns the payment result after verification.
   */
  handleWebhook(
    payload: Buffer | string,
    signature: string,
  ): Promise<PaymentResult & { invoice_id?: string }>;

  /**
   * Issue a refund for a previously paid invoice.
   */
  refund(invoice: {
    id: string;
    payment_ref: string;
    amount?: number; // partial refund if specified
    currency: string;
  }): Promise<RefundResult>;

  /**
   * Check the current status of a payment.
   */
  getStatus(paymentRef: string): Promise<{
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    provider: string;
  }>;
}

/**
 * Manual Payment Provider — Default fallback
 * Admin manually marks invoices as paid from the dashboard.
 * No external API calls.
 */
export class ManualPaymentProvider implements PaymentProviderInterface {
  readonly name = 'manual';
  readonly label = 'Pago manual (admin)';

  // Implementación stub: providers reales (Stripe, etc.) sí harán await de
  // llamadas externas. Aquí devolvemos Promise.resolve para satisfacer el
  // contrato de interface sin async-without-await.
  createPayment(invoice: {
    id: string;
    invoice_number: string;
    total: number;
    currency: string;
    user_email: string;
    description: string;
  }): Promise<PaymentResult> {
    return Promise.resolve({
      success: true,
      provider: this.name,
      external_id: `manual-${invoice.id}`,
      payment_method: 'manual',
    });
  }

  handleWebhook(): Promise<PaymentResult & { invoice_id?: string }> {
    return Promise.resolve({
      success: false,
      provider: this.name,
      error: 'Manual provider does not support webhooks.',
    });
  }

  refund(invoice: {
    id: string;
    payment_ref: string;
    amount?: number;
    currency: string;
  }): Promise<RefundResult> {
    return Promise.resolve({
      success: true,
      provider: this.name,
      refund_id: `manual-refund-${invoice.id}`,
    });
  }

  getStatus(): Promise<{
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
    provider: string;
  }> {
    return Promise.resolve({ status: 'succeeded', provider: this.name });
  }
}
