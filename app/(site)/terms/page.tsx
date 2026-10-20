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
import { dataSourcesUrl } from '@/components/site-footer';
import { siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Terms and conditions',
  description: `The terms of using ${siteName}: open food data that can be wrong, estimates that are not medical advice, and no warranty.`,
};

const foodTables = [
  {
    key: 'off',
    table: (
      <a
        href="https://world.openfoodfacts.org"
        target="_blank"
        rel="noreferrer"
      >
        Open Food Facts
      </a>
    ),
    what: 'Barcoded products, entered by volunteers',
    licence: (
      <a
        href="https://opendatacommons.org/licenses/odbl/1-0/"
        target="_blank"
        rel="noreferrer"
      >
        Open Database License (ODbL) 1.0
      </a>
    ),
  },
  {
    key: 'ciqual',
    table: (
      <a href="https://ciqual.anses.fr" target="_blank" rel="noreferrer">
        ANSES CIQUAL
      </a>
    ),
    what: 'The French food composition table',
    licence: (
      <a
        href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/"
        target="_blank"
        rel="noreferrer"
      >
        Licence Ouverte / Open Licence 2.0
      </a>
    ),
  },
  {
    key: 'cofid',
    table: (
      <a
        href="https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid"
        target="_blank"
        rel="noreferrer"
      >
        McCance and Widdowson’s CoFID
      </a>
    ),
    what: 'The UK food composition table',
    licence: (
      <a
        href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
        target="_blank"
        rel="noreferrer"
      >
        Open Government Licence v3.0
      </a>
    ),
  },
  {
    key: 'usda',
    table: (
      <a href="https://fdc.nal.usda.gov" target="_blank" rel="noreferrer">
        USDA FoodData Central
      </a>
    ),
    what: 'The US food composition tables',
    licence: 'Public domain (CC0 1.0)',
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms and conditions"
      summary="The terms you accept by using this app, including what its numbers are and are not."
    >
      <Prose>
        <p>
          These terms and conditions (“Agreement”) govern your use of the{' '}
          <strong>{siteName}</strong> website at <strong>{siteHost}</strong>{' '}
          (“Website”, “Service” or “Services”), operated by{' '}
          <strong>{operator}</strong> (“we”, “us” or “our”). By creating an
          account you confirm that you have read, understood and agree to be
          bound by this Agreement. If you do not agree, do not use the Website.
        </p>
      </Prose>

      <LegalSection title="Not medical advice">
        <Callout>
          <p>
            <strong>
              The Website is a food diary and a calculator. It is not a medical
              device and it does not give medical or dietary advice.
            </strong>{' '}
            It is not for diagnosing, treating or managing any condition.
          </p>
        </Callout>
        <Prose>
          <p>
            The energy and nutrient targets the Website shows are{' '}
            <strong>estimates</strong>: an energy expenditure worked out from
            your sex, age, height, weight and activity level with a published
            formula, and vitamin and mineral targets taken from published
            population reference values. Those formulas describe averages. Your
            own needs can differ from them, sometimes a great deal, and the
            Website knows nothing about your health beyond what you typed in.
          </p>
          <p>
            Nothing on the Website is a substitute for a doctor, a registered
            dietitian or another qualified professional. Talk to one before you
            change what you eat because of a number the Website shows you,
            especially if you are pregnant or breastfeeding, under 18, managing
            a medical condition or an eating disorder, or taking medication that
            interacts with food. If the Website ever makes eating feel worse
            rather than easier, stop using it and talk to someone.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Where the food data comes from">
        <Callout>
          <p>
            <strong>
              This is not an official product of any food database.
            </strong>{' '}
            The Website is an independent, unpaid project. It is not published,
            sponsored, endorsed by or affiliated with any of the organisations
            whose data it uses, and nothing on it should be read as coming from
            them.
          </p>
        </Callout>
        <Prose>
          <p>
            The reference foods you search come from these open datasets, each
            imported as published and used under its licence:
          </p>
        </Prose>
        <LegalTable
          columns="sm:grid sm:grid-cols-[10rem_minmax(0,1fr)_12rem]"
          headings={['Source', 'What it is', 'Licence']}
          rows={foodTables.map(({ key, table, what, licence }) => ({
            key,
            cells: [table, what, licence],
          }))}
        />
        <Prose>
          <p>
            The full attribution of each, and how it is imported, is on the{' '}
            <a href={dataSourcesUrl} target="_blank" rel="noreferrer">
              data sources
            </a>{' '}
            page. The foods table built from Open Food Facts is a derived
            database and stays under the ODbL. We make no claim of ownership
            over any of this data and cannot grant you rights to it beyond what
            its licence already does.
          </p>
          <p>
            <strong>Food data can be wrong.</strong> Open Food Facts is
            crowd-sourced: anyone can add or edit a product, and a label can be
            mistyped, out of date or for a different recipe from the one in your
            hand. Composition tables are averages over samples, not the food on
            your plate. We import what is published and do not check it product
            by product. Where a number matters to you — an allergen, a sugar or
            a sodium count you have been told to watch — read the packaging.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Accounts">
        <Prose>
          <p>
            You need an account to use the Website. You are responsible for
            keeping it secure and for everything done through it, including
            through an API key you created, and you should tell us promptly at
            the address below if you believe someone else has access to it.
          </p>
          <p>
            Provide an email address that is actually yours. An account created
            with a password must confirm its address by following a link we
            email before it can be signed in to, and an account created by
            signing in with Google uses the address Google confirms.
          </p>
          <p>
            You must be at least 16 to create an account. We may suspend or
            delete an account that breaks this Agreement.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Your data">
        <Prose>
          <p>
            What you log, and the foods and recipes you create, are yours. We do
            not claim ownership of them, we do not publish them, and we do not
            use them for anything other than storing them and showing them back
            to you. The only permission you give us is the one needed to run the
            Service: to store, copy, back up and display them to you. You can
            export them and delete them at any time. Our{' '}
            <Link href={routes.privacy}>privacy policy</Link> describes how we
            handle them, and why we ask for your consent to.
          </p>
          <p>
            You are responsible for what you put in a food or recipe you create,
            including its name. We may remove content that is unlawful or
            abusive, though we are under no obligation to monitor for it.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <Prose>
          <p>Do not use the Website to:</p>
          <ul>
            <li>break the law, or infringe anyone’s rights;</li>
            <li>
              gain unauthorised access to accounts, data or infrastructure, or
              probe, scan or test our systems without permission;
            </li>
            <li>
              place automated load on the Website — scraping, bulk account
              creation, bulk writes — or otherwise degrade it for other people;
            </li>
            <li>
              share an API key, use one for anyone but yourself, or use the API
              to copy the food tables wholesale. They are available from their
              publishers, under their own licences, as linked above;
            </li>
            <li>
              upload malware, or use a food, recipe or account name to harass or
              abuse anyone;
            </li>
            <li>
              present the Website as an official product of any of the food
              databases it uses.
            </li>
          </ul>
          <p>
            We may revoke an API key, or rate-limit it, if its use threatens the
            Website’s operation or breaks this Agreement.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="A hobby service, with no guarantees">
        <Callout>
          <p>
            <strong>
              The Website is provided free of charge, as is and as available,
              with no warranty of any kind.
            </strong>{' '}
            It is run by one person on self-hosted hardware in their spare time.
          </p>
        </Callout>
        <Prose>
          <ul>
            <li>
              <strong>No uptime guarantee.</strong> Availability is whatever the
              hardware and the domestic internet connection behind it happen to
              give you. There is no service level agreement, no support
              commitment and no on-call rotation.
            </li>
            <li>
              <strong>Backups are daily, and nothing better.</strong> If
              something goes wrong, losing what you logged since the last backup
              is the likely case.
            </li>
            <li>
              <strong>Data may be lost, and the Service may stop.</strong> We
              may change, suspend or discontinue the Website, or any part of it,
              at any time, and accounts and what they hold may go with it. We
              will make a reasonable effort to give notice on the Website, and
              time to export, and we cannot promise it.
            </li>
            <li>
              <strong>Keep your own copy of anything that matters.</strong>{' '}
              Export your diary from time to time.
            </li>
          </ul>
          <p>
            To the fullest extent permitted by law we disclaim all warranties,
            express or implied, including merchantability, fitness for a
            particular purpose, accuracy and non-infringement.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Termination">
        <Prose>
          <p>
            You may stop using the Website and delete your account at any time.
            We may suspend or terminate your access if you break this Agreement,
            if your use threatens the Website’s operation or other users, or if
            we discontinue the Service. On termination your right to use the
            Website ends; the sections of this Agreement that by their nature
            should survive, do.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Links to other resources">
        <Prose>
          <p>
            The Website links to sites we do not control. We are not responsible
            for their content, products or practices, and a link is not an
            endorsement. Review their own terms before relying on them.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <Prose>
          <p>
            To the fullest extent permitted by applicable law, in no event will{' '}
            {operator} be liable for any indirect, incidental, special, punitive
            or consequential damages, or for any loss of data, loss of use or
            lost time, or for any consequence of relying on a nutrient value, a
            total or a target the Website showed you, however caused and under
            any theory of liability, even if advised of the possibility of such
            damages.
          </p>
          <p>
            To the maximum extent permitted by law, our total aggregate
            liability arising out of or relating to the Website is limited to{' '}
            <strong>fifty euros (€50)</strong>, or the amount you have actually
            paid us for the Service, whichever is greater. You have paid us
            nothing, because the Website is free.
          </p>
          <p>
            Nothing in this Agreement excludes or limits liability that cannot
            lawfully be excluded or limited, including liability for death or
            personal injury caused by negligence, for fraud, or any statutory
            rights you have as a consumer that cannot be waived.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Governing law">
        <Prose>
          <p>
            This Agreement is governed by the laws of Romania, without regard to
            conflict of law rules. If you are a consumer resident in the
            European Union, you keep the protection of the mandatory provisions
            of the law of the country you live in, and you may bring proceedings
            in your local courts.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Changes to this Agreement">
        <Prose>
          <p>
            We may modify this Agreement at any time. When we do, we will revise
            the date at the top of this page, and the updated version takes
            effect when it is posted. Continuing to use the Website after that
            means you accept the revised Agreement.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Severability and entire agreement">
        <Prose>
          <p>
            If any provision of this Agreement is found unenforceable, the rest
            remains in effect. This Agreement, together with our{' '}
            <Link href={routes.privacy}>privacy policy</Link> and{' '}
            <Link href={routes.cookies}>cookie policy</Link>, is the entire
            agreement between you and us regarding the Website. Our failure to
            enforce a provision is not a waiver of it.
          </p>
        </Prose>
      </LegalSection>

      <LegalSection title="Contact">
        <Prose>
          <p>
            Questions or complaints about this Agreement:{' '}
            <strong>{supportEmail}</strong>
          </p>
          <p>
            {operator}, operator of {siteHost}.
          </p>
        </Prose>
      </LegalSection>
    </LegalDocument>
  );
}
