import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Callout,
  LegalDocument,
  LegalHeading,
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
  title: 'Privacy policy',
  description: `What ${siteName} collects, why, who else sees it, how long it is kept and how to have it deleted.`,
};

const recipients = [
  {
    key: 'resend',
    who: (
      <>
        <strong>Resend</strong> (email delivery)
      </>
    ),
    sees: 'Your email address and the contents of the message',
    why: 'Only to deliver the two emails this app sends: the link that confirms your address when you sign up with a password, and the password reset link when you ask for one. No newsletters, no reminders, no marketing, and no other message of any kind. If you only ever sign in with Google and never reset a password, Resend never sees your address.',
  },
  {
    key: 'google',
    who: (
      <>
        <strong>Google</strong> (sign-in)
      </>
    ),
    sees: 'That you signed in to this app, at the moment you do it',
    why: 'Only if you choose to sign in with Google. Its handling of your information is governed by its own privacy policy, not this one. If you sign in with a password, Google is not involved.',
  },
  {
    key: 'openai',
    who: (
      <>
        <strong>OpenAI</strong> (label reading and meal estimates)
      </>
    ),
    sees: 'The photo of a nutrition label you scan; or the photos of a meal you ask it to estimate, your description of the meal, your foods and recipes whose names match what it searches for, and, when you ask it to correct an estimate, the estimate as you left it and what you said. Nothing else about you',
    why: 'Only when you scan a label, to read the product name, brand and nutrition table from the photo so the food fills itself in, or when you ask for a meal estimate, to name the foods on the plate and how much of each so you can review them before anything is logged. The photos are held in memory on our server while they are read and then discarded: we never store them or write them to a log, so correcting an estimate sends them again. OpenAI does not use any of it to train its models, and may keep it for up to 30 days to detect abuse before deleting it. If you never scan a label or estimate a meal, OpenAI sees nothing.',
  },
  {
    key: 'cloudflare',
    who: (
      <>
        <strong>Cloudflare</strong> (network and security)
      </>
    ),
    sees: 'Request metadata — IP address, user agent, requested URL — as traffic passes through their network',
    why: 'Cloudflare sits in front of the server on every request, terminating TLS and filtering malicious traffic. They act as our processor.',
  },
  {
    key: 'hetzner',
    who: (
      <>
        <strong>Hetzner</strong> (backup storage)
      </>
    ),
    sees: 'Encrypted backup archives, and nothing it can read',
    why: 'Backups are encrypted on our server before they are sent to a Hetzner Storage Box in the European Union. Hetzner holds the archives; it does not hold the key.',
  },
];

const retention = [
  {
    key: 'account',
    what: 'Your account, profile, diary, body weight, foods, recipes, goals and API keys',
    period: 'Until you delete them or your account, and then no longer',
  },
  {
    key: 'sessions',
    what: 'Session records, including IP address and user agent',
    period:
      'Until the session expires, you sign out, or the session is revoked. A session unused for 400 days expires',
  },
  {
    key: 'tokens',
    what: 'Confirmation and password reset tokens',
    period: 'Until used, and otherwise an hour',
  },
  {
    key: 'deploy-copies',
    what: 'Copies of the database taken before each new version is deployed',
    period: (
      <>
        On the same server, the last <strong>ten</strong> are kept and older
        ones are deleted
      </>
    ),
  },
  {
    key: 'backups',
    what: 'Encrypted backups',
    period: (
      <>
        Seven daily, four weekly and six monthly archives: a deleted record is
        gone from them within <strong>about six months</strong>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy policy"
      summary="What this app collects, why, who else ever sees it, how long it is kept and what you can ask us to do about it."
    >
      <Prose>
        <p>
          This privacy policy (“Policy”) describes the personal information the{' '}
          <strong>{siteName}</strong> website at <strong>{siteHost}</strong>{' '}
          (“Website”, “Service” or “Services”) collects from you. It is written
          to describe this particular app rather than to cover every practice a
          template might anticipate, so where it says we do not do something, we
          do not do it.
        </p>
        <p>
          The Website is operated by <strong>{operator}</strong> (“we”, “us” or
          “our”), and is the data controller for the personal information
          described here. It is a hobby project run by one person: a food diary
          that tracks calories, macronutrients and micronutrients against goals
          worked out from your body. By using the Website you agree to this
          Policy. If you do not agree, you should not use the Website.
        </p>
      </Prose>

      <LegalSection title="What we collect">
        <Prose>
          <p>
            The Website is useful only with an account, so everything below is
            collected from the moment you create one, and only from then.
          </p>

          <LegalHeading>Account information</LegalHeading>
          <ul>
            <li>
              <strong>Email address and display name.</strong> Typed by you when
              you sign up with a password, or supplied by Google when you choose
              to sign in with it.
            </li>
            <li>
              <strong>A password hash</strong>, if you created a password. We
              never store, see or log your password itself — only a one-way hash
              of it, from which the password cannot be recovered.
            </li>
            <li>
              <strong>A profile image URL</strong>, if Google supplies one. We
              store the address, not a copy of the image.
            </li>
            <li>
              <strong>Whether your email address has been confirmed</strong>,
              and <strong>when you agreed to the terms</strong> and acknowledged
              this Policy.
            </li>
          </ul>

          <LegalHeading>Sign-in with Google</LegalHeading>
          <p>
            If you choose to sign in with Google, we ask for the{' '}
            <code>openid</code>, <code>email</code> and <code>profile</code>{' '}
            scopes: a stable account identifier, your email address, your name
            and your profile picture. We do not request access to Gmail, Drive,
            Contacts, Calendar, Fit or any other Google service, and we could
            not read them if we tried. We store the account identifier, the
            granted scopes and the tokens the sign-in produced, and use the
            tokens only to complete the sign-in.
          </p>

          <LegalHeading>Your profile</LegalHeading>
          <p>
            Your <strong>sex</strong>, <strong>birth date</strong>,{' '}
            <strong>height</strong> and <strong>activity level</strong>. These
            are what an energy target and the reference values for vitamins and
            minerals are worked out from, which is the only thing we use them
            for.
          </p>

          <LegalHeading>What you log</LegalHeading>
          <ul>
            <li>
              <strong>Your food diary</strong>: for each day, what you ate, how
              much, at which meal and optionally at what time, and the nutrients
              that came to.
            </li>
            <li>
              <strong>Your body weight</strong>, each time you record it.
            </li>
            <li>
              <strong>Your goals</strong>: the weekly rate you are aiming for
              and any targets you set by hand.
            </li>
            <li>
              <strong>Your own foods, portions and recipes</strong>, and which
              food tables you want to see in search. They are visible to you
              alone.
            </li>
            <li>
              <strong>API keys</strong> you create: a name, their scopes, the
              first eight characters of the key so you can tell them apart, a
              hash of the key, and when it was created, last used and revoked.
              The key itself is shown to you once and never stored.
            </li>
            <li>
              <strong>Imports you start</strong>: when you import your history
              from Cronometer, the diary, foods and weights it brings in, which
              are then what you log, and a record of each import (when it ran,
              how far it got and a summary of what it brought). The Cronometer
              email and password you give for it are sent to Cronometer to sign
              in for that import alone, and never stored.
            </li>
          </ul>

          <LegalHeading>Session records</LegalHeading>
          <p>
            When you are signed in we store a session record so that the next
            request knows it is you. Each holds a session token, an expiry time,
            and the <strong>IP address</strong> and{' '}
            <strong>browser user agent string</strong> the session was created
            from. We disclose those last two because they are personal
            information, not because we analyse them; they exist so that a
            session can be attributed and, if necessary, revoked.
          </p>

          <LegalHeading>Confirming your address</LegalHeading>
          <p>
            An account created with a password must confirm its email address
            before it can be used: we send a link to the address you gave us,
            and there is no session until you follow it. To do that — and to
            reset a forgotten password — we store a short-lived single-use token
            until it is used or expires.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection id="health-data" title="Your diary is health data">
        <Callout>
          <p>
            <strong>
              What you eat and what you weigh are information about your health.
            </strong>{' '}
            The GDPR gives that kind of information extra protection, and so do
            we: we process it only because you consented to it when you created
            your account.
          </p>
        </Callout>
        <Prose>
          <p>
            When you sign up you are asked to agree to the{' '}
            <Link href={routes.terms}>terms</Link> and to acknowledge this
            Policy, and you cannot create an account without doing so. That
            agreement is your <strong>explicit consent</strong> to us storing
            your food diary, body weight, profile and goals and computing your
            totals and targets from them, and nothing else. We record when you
            gave it.
          </p>
          <p>
            You can withdraw that consent at any time by deleting the records
            concerned or your account, as described under{' '}
            <a href="#your-rights">your rights</a>. Because a food diary cannot
            work without them, withdrawing it means the account goes too. It
            does not affect what we did before you withdrew it.
          </p>
          <p>
            We never use this information for anything but showing it back to
            you: not for advertising, not for research, not to train a model,
            and it is never sold or shared.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="What we do not collect">
        <Prose>
          <p>
            This list is short and specific, and worth stating plainly because
            people reasonably assume otherwise of any website, and of a diet app
            most of all:
          </p>
          <ul>
            <li>
              <strong>No analytics and no activity log.</strong> No Google
              Analytics, no Plausible, no Matomo, no session recording, no
              heatmaps, and no record of the pages you open or the buttons you
              press, whether by a product or by us.
            </li>
            <li>
              <strong>
                No third-party tracking pixels or beacons, and no
                fingerprinting.
              </strong>
            </li>
            <li>
              <strong>
                No advertising, no ad networks and no advertising identifiers.
              </strong>
            </li>
            <li>
              <strong>No third-party scripts.</strong> The Website loads no code
              from anyone else’s domain. Its font is downloaded at build time
              and served from our own domain, so{' '}
              <em>loading a page makes no request to a third party at all</em>.
            </li>
            <li>
              <strong>No photos.</strong> A photo of a nutrition label you scan
              or of a meal you estimate is read by OpenAI and then discarded; we
              never store it. See <em>Who else sees it</em>.
            </li>
            <li>
              <strong>No camera footage.</strong> The camera is on only while
              the barcode scanner is open, with your permission. Its picture is
              read for a barcode on your device and never leaves it; only the
              barcode it finds is sent to look the food up.
            </li>
            <li>
              <strong>No location data</strong>, no other device sensors, no
              contacts, and no data from fitness trackers or health apps except
              the Cronometer history you choose to import.
            </li>
            <li>
              <strong>No payment information.</strong> The Website is free and
              there is nothing to buy.
            </li>
            <li>
              <strong>
                No personal information bought, rented or obtained from data
                brokers, social platforms or any other outside source.
              </strong>{' '}
              Everything we hold about you, you gave us yourself or asked Google
              to give us.
            </li>
          </ul>
          <p>
            If this ever changes, this section changes with it, and the change
            will be visible in the revision date at the top of this page.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Children">
        <Prose>
          <p>
            The Website is not directed at children. We do not knowingly collect
            personal information from anyone under 16, and if you are under 16
            you should not create an account. If you believe a child under 16
            has given us personal information, contact us and we will delete it.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="How we use what we collect">
        <Prose>
          <p>
            Every use of your personal information falls under one of these:
          </p>
          <ul>
            <li>To create your account and let you sign in and out.</li>
            <li>
              To store what you log and show it back to you, with its totals,
              trends and targets, on any device you sign in from.
            </li>
            <li>
              To answer requests made with an API key you created, as if they
              came from you.
            </li>
            <li>
              To send you the link that confirms your email address, a password
              reset link when you ask for one, and a note when an import you
              started finishes.
            </li>
            <li>
              To fetch your diary, the foods you logged and your weights from
              Cronometer when you start an import, signed in with the email and
              password you give for it, and nothing else from it.
            </li>
            <li>
              To keep the Service working and secure: rate-limiting sign-in,
              confirmation and reset requests, identifying and blocking abuse,
              and diagnosing errors.
            </li>
            <li>To answer you if you contact us for support.</li>
            <li>To comply with a legal obligation, if one ever arises.</li>
          </ul>
          <p>
            We do not profile you, we do not make automated decisions with legal
            or similarly significant effects about you, and we do not use your
            information to market anything — to you or to anyone else. The
            targets the Website suggests are arithmetic over what you entered,
            for you to accept or change.
          </p>

          <LegalHeading>Legal bases under the GDPR</LegalHeading>
          <ul>
            <li>
              <strong>Explicit consent</strong> (Article 9(2)(a)) — your food
              diary, body weight, profile and goals, as described under{' '}
              <a href="#health-data">your diary is health data</a>.
            </li>
            <li>
              <strong>Performance of a contract</strong> — creating and running
              your account and storing the foods, recipes and API keys you asked
              us to store.
            </li>
            <li>
              <strong>Legitimate interests</strong> — keeping the Service
              available and free of abuse, and keeping the minimum session
              records needed to do that.
            </li>
            <li>
              <strong>Legal obligation</strong> — where the law requires us to
              keep or disclose something.
            </li>
          </ul>
        </Prose>
      </LegalSection>

      <LegalSection title="Who else sees it">
        <Prose>
          <p>
            We do not sell your personal information, we do not rent or trade
            it, and we do not share it for anyone else’s marketing. Nothing you
            log is visible to other users. The complete list of third parties
            that ever touch your information is:
          </p>
        </Prose>
        <LegalTable
          columns="sm:grid sm:grid-cols-[9rem_11rem_minmax(0,1fr)]"
          headings={['Who', 'What they see', 'Why, and when']}
          rows={recipients.map(({ key, who, sees, why }) => ({
            key,
            cells: [who, sees, why],
          }))}
        />
        <Prose>
          <p>
            That is the entire list. There is no analytics provider, no
            advertising partner, no CRM, no customer data platform and no
            affiliate. The food tables the Website searches are copies held on
            our own server: searching for a food or scanning a barcode tells
            nobody else what you looked for.
          </p>
          <p>
            We may disclose personal information where the law requires it — to
            comply with a court order or similar legal process, or where we
            believe in good faith that disclosure is necessary to protect our
            rights, investigate fraud or respond to a lawful government request.
            If the Website is ever transferred to someone else, your account and
            what you logged would move with it, and we would say so on the
            Website before it happened.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Where it is stored, and transfers">
        <Prose>
          <p>
            Your personal information is held in a single database file on one
            server we run and operate ourselves in the European Union. The
            database is not hosted with a third-party database provider and is
            not replicated anywhere else. Before each new version of the Website
            is deployed, a copy of the database is taken on the same server.
            Backups are encrypted on that server and kept on a Hetzner Storage
            Box, also in the European Union.
          </p>
          <p>
            Requests reach that server through Cloudflare’s global network,
            which means request metadata may be processed at a Cloudflare
            location outside the European Economic Area. That processing is
            covered by Cloudflare’s data processing terms and the European
            Commission’s Standard Contractual Clauses. If you sign in with
            Google, receive an email through Resend, or scan a label or estimate
            a meal, which OpenAI reads in the United States, information travels
            to those providers under their own terms and safeguards.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalTable
          columns="sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
          headings={['What', 'How long']}
          rows={retention.map(({ key, what, period }) => ({
            key,
            cells: [what, period],
          }))}
        />
        <Prose>
          <p>
            We do not keep an archive of deleted accounts, and nothing outlives
            your account but the copies and backups above, until they age out.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection id="your-rights" title="Your rights">
        <Prose>
          <p>
            If you are in the European Economic Area or the United Kingdom, the
            GDPR gives you the rights below. We extend them to everyone who uses
            the Website, because operating two standards for a hobby project
            would be a poor use of everyone’s time.
          </p>
          <ul>
            <li>
              <strong>Access</strong> — to be told whether we hold personal
              information about you and to receive a copy of it.
            </li>
            <li>
              <strong>Rectification</strong> — to have inaccurate information
              corrected and incomplete information completed. Almost all of it
              you can edit yourself.
            </li>
            <li>
              <strong>Erasure</strong> — to have your personal information
              deleted.
            </li>
            <li>
              <strong>Portability</strong> — to receive the information you gave
              us in a structured, commonly used, machine-readable format.
            </li>
            <li>
              <strong>Restriction</strong> — to have processing limited in the
              circumstances the GDPR sets out.
            </li>
            <li>
              <strong>Objection</strong> — to object to processing carried out
              on the basis of our legitimate interests, on grounds relating to
              your situation.
            </li>
            <li>
              <strong>Withdrawal of consent</strong> — at any time, where
              processing rests on consent. This does not affect processing
              carried out before you withdrew it.
            </li>
            <li>
              <strong>Complaint</strong> — to lodge a complaint with your local
              supervisory authority. In Romania this is the National Supervisory
              Authority for Personal Data Processing (ANSPDCP). We would rather
              you raised it with us first, but it is your right either way.
            </li>
          </ul>

          <LegalHeading>How to exercise them</LegalHeading>
          <p>
            <strong>Export</strong> and <strong>deletion</strong> are buttons in
            Settings, and need nothing from us: export gives you everything you
            logged as CSV and JSON, and deleting your account removes your
            account record, your sign-in credentials, your sessions, your API
            keys and everything you logged or created, at once.
          </p>
          <p>
            For everything else, email us at <strong>{supportEmail}</strong>{' '}
            from the address on your account. We will confirm receipt and
            respond within one month, as the GDPR requires; if a request is
            complex we may extend that and will tell you why. We may need to
            verify that the request comes from you before we act on it,
            particularly for erasure.
          </p>
          <p>
            Deletion cannot reach into copies and backups that have already been
            taken; your records disappear from them as they age out, as
            described above, and are never restored into the Website.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Cookies">
        <Prose>
          <p>
            The Website sets only cookies that are strictly necessary for it to
            work — keeping you signed in, and securing the sign-in exchange with
            Google. There are no analytics or advertising cookies, which is why
            you are not asked to accept anything. The one other thing stored in
            your browser is your light or dark theme preference, which is kept
            in local storage and never sent to us. Our{' '}
            <Link href={routes.cookies}>cookie policy</Link> describes each
            cookie individually.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Do Not Track">
        <Prose>
          <p>
            Some browsers send a Do Not Track or Global Privacy Control signal.
            The Website does not track you, on it or across other websites, with
            or without one, so there is nothing for the signal to turn off.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Security">
        <Prose>
          <p>
            Traffic to the Website is encrypted in transit. Passwords are stored
            only as one-way hashes, and API keys likewise. Sign-in, confirmation
            and password reset endpoints are rate-limited. Sessions are held in
            cookies that JavaScript cannot read, marked secure and same-site.
            Backups are encrypted before they leave the server. Access to the
            server is restricted to the operator.
          </p>
          <p>
            No service can promise perfect security, and this one is run by one
            person on self-hosted hardware rather than by a company with a
            security team. We would rather you knew that than assumed otherwise.
            Please use a unique password and keep the device you sign in from
            secure.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Data breach">
        <Prose>
          <p>
            If we become aware that personal information has been exposed, we
            will investigate, take reasonable steps to contain it, and — where
            there is a risk to your rights and freedoms — notify the relevant
            supervisory authority within 72 hours and tell affected users
            directly and by a notice on the Website.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Changes to this Policy">
        <Prose>
          <p>
            We may update this Policy. When we do, we will revise the date at
            the top of this page, and the updated version takes effect when it
            is posted. If a change is material — if we start collecting
            something new, or share information with someone not named above —
            we will not apply it to information already collected without
            telling you first. Continuing to use the Website after a change
            means you accept the revised Policy.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Contact">
        <Prose>
          <p>
            Questions, requests or complaints about this Policy or about your
            personal information: <strong>{supportEmail}</strong>
          </p>
          <p>
            {operator}, operator of {siteHost}. We will make every reasonable
            effort to resolve complaints and to honour your rights as quickly as
            possible, and in any event within the timescales set by applicable
            data protection law.
          </p>
        </Prose>
      </LegalSection>
    </LegalDocument>
  );
}
