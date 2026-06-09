export type Channel = 'whatsapp' | 'sms' | 'email' | 'rcs';

export type DeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'failed';

export interface SendRequest {
  messageId: string;
  recipientPhone: string | null;
  recipientEmail: string;
  message: string;
  channel: Channel;
  /** CRM endpoint to POST status callbacks to. */
  callbackUrl: string;
}

export interface StatusCallback {
  messageId: string;
  status: DeliveryStatus;
  timestamp: string; // ISO 8601
  failureReason?: string;
}
