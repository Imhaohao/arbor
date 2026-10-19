import type { Metadata } from "next";
import { PageShell } from "@/components/ui/PageShell";
import { Prose, ProseSection, ProseP, ProseList, ProseLink } from "@/components/ui/Prose";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Email ${SITE.name} for support, billing and refund questions. We aim to reply within two business days.`,
};

export default function ContactPage() {
  return (
    <PageShell width="narrow" title="Contact">
      <Prose>
        <ProseSection title="Email">
          <ProseP>
            <ProseLink href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</ProseLink>
          </ProseP>
          <ProseP>{SITE.name} aims to answer within two business days.</ProseP>
        </ProseSection>

        <ProseSection title="Billing and refund questions">
          <ProseP>Send them to the same address and include:</ProseP>
          <ProseList
            items={[
              "The link to the task.",
              "The email you signed in with.",
              "What you expected to be charged and what you saw.",
            ]}
          />
        </ProseSection>

        <ProseSection title="Delete your account">
          <ProseP>
            Email the same address and ask for your account and tasks to be deleted.
          </ProseP>
        </ProseSection>
      </Prose>
    </PageShell>
  );
}
