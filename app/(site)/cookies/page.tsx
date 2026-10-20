import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Callout,
  LegalDocument,
  LegalSection,
  LegalTable,
  operator,
  Prose,
  siteHost,
  supportEmail,
} from '@/components/legal/legal-document';
import { siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description: `Every cookie ${siteName} sets, named individually, and why there is no cookie banner.`,
};

const cookies = [
  {
    key: 'session',
    name: <code>__Secure-better-auth.session_token</code>,
    lifetime: 'Persistent',
    purpose:
      'Identifies your session, so the server knows which account is making the request. This is the cookie that keeps you signed in; deleting it signs you out. Set when you sign in, and renewed while you keep using the Website.',
  },
  {
    key: 'state',
    name: <code>__Secure-better-auth.state</code>,
    lifetime: '5 minutes',
    purpose:
      'Set only while you are signing in with Google. It holds a single random value that is matched against a record on our server when Google sends you back, which is what proves the response belongs to the sign-in you started and stops one being forged.',
  },
  {
    key: 'cloudflare',
    name: (
      <>
        <code>__cf_bm</code>, <code>cf_clearance</code> and other Cloudflare
        cookies
      </>
    ),
    lifetime: 'Up to 30 minutes, or up to a year for cf_clearance',
    purpose:
      'Set by Cloudflare, which sits in front of our server on every request, to distinguish human visitors from automated traffic and to remember that a challenge has been passed. They are security cookies; Cloudflare does not use them to profile you or to serve advertising.',
  },
];

export default function CookiesPage() {
  return (
    <LegalDocument
      title="Cookie policy"
      summary="Every cookie this app sets, named individually, and why you are never asked to accept one."
    >
      <Prose>
        <p>
          This cookie policy (“Policy”) describes the cookies used by the{' '}
          <strong>{siteName}</strong> website at <strong>{siteHost}</strong>{' '}
          (“Website”, “Service” or “Services”), operated by{' '}
          <strong>{operator}</strong> (“we”, “us” or “our”). It names every
          cookie individually, because there are few enough of them to list. For
          how we handle personal information generally, see our{' '}
          <Link href={routes.privacy}>privacy policy</Link>.
        </p>
      </Prose>

      <Callout>
        <p>
          <strong>The short version.</strong> The Website sets only cookies that
          are strictly necessary for it to work: keeping you signed in, and
          securing sign-in with Google. There are no analytics cookies, no
          advertising cookies and no third-party tracking cookies. That is why
          you are not asked to accept anything — there is nothing optional to
          consent to.
        </p>
      </Callout>

      <LegalSection title="What cookies are">
        <Prose>
          <p>
            Cookies are small text files a website asks your browser to store
            and send back on later requests. A <strong>session cookie</strong>{' '}
            lasts until you close your browser; a{' '}
            <strong>persistent cookie</strong> survives until it expires or you
            delete it. A <strong>first-party cookie</strong> is set by the site
            you are visiting; a <strong>third-party cookie</strong> is set by
            someone else whose content the page loads, and is the mechanism
            behind most tracking across websites. The Website sets no
            third-party cookies, because it loads no third-party content.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="The cookies we use">
        <Prose>
          <p>
            All of these are strictly necessary. Each is a first-party cookie
            set on <code>{siteHost}</code>, sent only to our own server, and all
            except the Cloudflare entries are marked <code>HttpOnly</code> (so
            JavaScript on the page cannot read them), <code>Secure</code> (so
            they travel only over HTTPS) and <code>SameSite=Lax</code>.
          </p>
        </Prose>
        <LegalTable
          columns="sm:grid sm:grid-cols-[11rem_7rem_minmax(0,1fr)]"
          headings={['Cookie', 'Lifetime', 'What it is for']}
          rows={cookies.map(({ key, name, lifetime, purpose }) => ({
            key,
            cells: [name, lifetime, purpose],
          }))}
        />
        <Prose>
          <p>
            The first two carry a <code>__Secure-</code> prefix over HTTPS,
            which is how you will see them in production. Running the app
            locally over plain HTTP, the prefix is absent.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Not a cookie, but stored in your browser">
        <Prose>
          <p>
            Your <strong>light or dark theme preference</strong> is kept in your
            browser’s local storage under the key <code>theme</code>. It never
            leaves your device, is never sent to our server, and exists only so
            the page does not flash the wrong colour scheme when it loads.
            Clearing site data resets it to following your system setting.
          </p>
          <p>
            If the Website ever keeps another convenience on your device, it
            will be kept the same way — in your browser, never sent to us, gone
            when you clear site data — and listed here.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="What we do not use">
        <Prose>
          <ul>
            <li>
              <strong>No analytics cookies.</strong> There is no analytics
              product on the Website, and we keep no record of the pages you
              open.
            </li>
            <li>
              <strong>No advertising or retargeting cookies</strong>, and no
              advertising identifiers.
            </li>
            <li>
              <strong>No third-party or cross-site tracking cookies.</strong>{' '}
              The Website loads no third-party scripts, no embedded social
              widgets and no externally hosted fonts, so no other party is in a
              position to set a cookie on your visit.
            </li>
            <li>
              <strong>No preference cookies</strong> beyond the local-storage
              theme setting described above.
            </li>
          </ul>
        </Prose>
      </LegalSection>

      <LegalSection title="Why there is no cookie banner">
        <Prose>
          <p>
            Under the ePrivacy Directive and the GDPR, consent is required for
            cookies that are not strictly necessary to deliver a service the
            user has asked for. Every cookie listed above is strictly necessary
            in that sense — authentication and security — so no consent banner
            is required and we do not show one. If we ever add a cookie that
            falls outside that exemption, we will ask you first and this Policy
            will change to say so.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Your options">
        <Prose>
          <p>
            You can delete cookies already set and refuse new ones through your
            browser’s settings, and every major browser lets you do this per
            site. On this Website, that means you will not be able to sign in,
            or to stay signed in, and since everything the Website does needs an
            account, it will not be of much use to you. What you have logged is
            kept on our server, not in your browser, so clearing cookies never
            loses it: sign in again and it is all there.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Changes to this Policy">
        <Prose>
          <p>
            We may update this Policy. When we do, we will revise the date at
            the top of this page, and the updated version takes effect when it
            is posted. Continuing to use the Website after that means you accept
            the revised Policy.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Contact">
        <Prose>
          <p>
            Questions or complaints about this Policy or about our use of
            cookies: <strong>{supportEmail}</strong>
          </p>
          <p>
            {operator}, operator of {siteHost}.
          </p>
        </Prose>
      </LegalSection>
    </LegalDocument>
  );
}
