import { getLogger } from '../logger.ts';
import { createLogTransport, type LogLine } from './log-transport.ts';
import { createOutboxTransport } from './outbox.ts';
import { createResendTransport } from './resend-transport.ts';
import {
  isReservedRecipient,
  reservedRecipientReason,
} from './reserved-recipients.ts';
import type { SendEmail } from './transport.ts';

export type EmailTransportOptions = {
  apiKey?: string | undefined;
  from?: string | undefined;
  outboxDir?: string | undefined;
  log?: LogLine | undefined;
};

const chooseTransport = ({
  apiKey,
  from,
  log,
}: EmailTransportOptions): SendEmail => {
  if (!apiKey) {
    return createLogTransport('RESEND_API_KEY is not set', log);
  }
  if (!from) {
    return createLogTransport('EMAIL_FROM is not set', log);
  }
  const resend = createResendTransport({ apiKey, from });
  const reserved = createLogTransport(reservedRecipientReason, log);
  return (message) =>
    isReservedRecipient(message.to) ? reserved(message) : resend(message);
};

export const createEmailTransport = ({
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.EMAIL_FROM,
  outboxDir = process.env.EMAIL_OUTBOX_DIR,
  log,
}: EmailTransportOptions = {}): SendEmail => {
  const transport = chooseTransport({ apiKey, from, log });
  return outboxDir ? createOutboxTransport(outboxDir, transport) : transport;
};

const logger = getLogger('email');

let instance: SendEmail | undefined;

export const sendEmail: SendEmail = async (message) => {
  instance ??= createEmailTransport();
  const result = await instance(message);
  if (!result.delivered) {
    logger.error(
      { to: message.to, subject: message.subject, failure: result.failure },
      result.message,
    );
  }
  return result;
};
