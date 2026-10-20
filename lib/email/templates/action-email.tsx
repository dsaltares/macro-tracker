import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';
import type { EmailMessage } from '../transport.ts';

export type ActionEmailCopy = {
  subject: string;
  preview: string;
  heading: string;
  body: string;
  button: string;
  footer: string;
};

const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const body = {
  backgroundColor: '#fafaf9',
  color: '#1c1917',
  fontFamily,
  margin: 0,
  padding: '24px 0',
};

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #e7e5e4',
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '520px',
  padding: '32px 24px',
};

const heading = {
  fontSize: '22px',
  fontWeight: 600,
  lineHeight: '28px',
  margin: '0 0 16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const button = {
  backgroundColor: '#292524',
  borderRadius: '6px',
  color: '#fafaf9',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 600,
  padding: '12px 20px',
  textDecoration: 'none',
};

const fallback = {
  color: '#78716c',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '24px 0 0',
  wordBreak: 'break-all' as const,
};

const link = {
  color: '#78716c',
};

const divider = {
  borderColor: '#e7e5e4',
  margin: '24px 0',
};

const footer = {
  color: '#78716c',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
};

export const pasteLink = 'Or paste this link into your browser: ';

export const ActionEmail = ({
  url,
  copy,
}: {
  url: string;
  copy: ActionEmailCopy;
}) => (
  <Html lang="en">
    <Head />
    <Preview>{copy.preview}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Heading style={heading}>{copy.heading}</Heading>
        <Text style={paragraph}>{copy.body}</Text>
        <Section>
          <Button href={url} style={button}>
            {copy.button}
          </Button>
        </Section>
        <Text style={fallback}>
          {pasteLink}
          <Link href={url} style={link}>
            {url}
          </Link>
        </Text>
        <Hr style={divider} />
        <Text style={footer}>{copy.footer}</Text>
      </Container>
    </Body>
  </Html>
);

export const actionEmail = async ({
  to,
  url,
  copy,
}: {
  to: string;
  url: string;
  copy: ActionEmailCopy;
}): Promise<EmailMessage> => {
  const element = <ActionEmail url={url} copy={copy} />;
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { to, subject: copy.subject, html, text };
};
