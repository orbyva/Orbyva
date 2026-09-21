import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  PublicPageShell,
  PublicSection,
} from "@/components/PublicPageShell";
import { PublicFaq } from "@/components/seo/PublicFaq";
import { PublicInternalNav } from "@/components/seo/PublicInternalNav";
import { JsonLd } from "@/components/seo/JsonLd";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_DAYS } from "@/lib/plan";
import {
  buildOrganizationJsonLd,
  buildWebApplicationJsonLd,
  buildFaqPageJsonLd,
  DEFAULT_OG_IMAGE,
} from "@/lib/seo";
import { GEO_FAQS } from "@/content/geoFaqs";

export type MarketingSection = {
  title: string;
  body: ReactNode;
};

type MarketingPageProps = {
  path: string;
  title: string;
  description: string;
  h1: string;
  lead: ReactNode;
  sections: MarketingSection[];
  showFaq?: boolean;
  faqItems?: readonly { q: string; a: string }[];
  includeAppSchema?: boolean;
};

export function MarketingPage({
  path,
  title,
  description,
  h1,
  lead,
  sections,
  showFaq = true,
  faqItems = GEO_FAQS,
  includeAppSchema = false,
}: MarketingPageProps) {
  useDocumentMeta({
    title,
    description,
    path,
    image: DEFAULT_OG_IMAGE,
    brandSuffix: false,
  });

  const schemas: unknown[] = [buildOrganizationJsonLd()];
  if (includeAppSchema) schemas.push(buildWebApplicationJsonLd());
  if (showFaq) schemas.push(buildFaqPageJsonLd(faqItems));

  return (
    <PublicPageShell width="wide">
      <JsonLd data={schemas} />
      <PublicInternalNav current={path} className="mb-8" />

      <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
        {h1}
      </h1>
      <div className="mt-4 max-w-2xl space-y-3 text-base leading-relaxed text-zinc-400 sm:text-lg">
        {lead}
      </div>

      {sections.map((section) => (
        <PublicSection key={section.title} title={section.title}>
          {section.body}
        </PublicSection>
      ))}

      {showFaq ? <PublicFaq items={faqItems} /> : null}

      <p className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
        Experimente o {BRAND.name}: {TRIAL_DAYS} dias grátis, depois Pro por{" "}
        {PLANS.pro.priceLabel}.{" "}
        <Link
          to="/login?mode=signup"
          className="font-medium text-sky-400 underline-offset-4 hover:underline"
        >
          Criar conta
        </Link>
        {" · "}
        <Link
          to="/dentro-do-orcamento"
          className="underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          Está dentro do orçamento?
        </Link>
      </p>
    </PublicPageShell>
  );
}
