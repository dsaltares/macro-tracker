export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailFailure = 'rejected' | 'rate-limited' | 'unavailable';

export type EmailResult =
  | { delivered: true; id: string }
  | { delivered: false; failure: EmailFailure; message: string };

export type SendEmail = (message: EmailMessage) => Promise<EmailResult>;
