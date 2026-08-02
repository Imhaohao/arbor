import type { ReactNode } from "react";
import { Tree } from "@phosphor-icons/react/dist/ssr";
import {
  ArrowRight,
  CheckCircle,
  CurrencyDollar,
  Robot,
  ShieldCheck,
  TrendUp,
} from "@phosphor-icons/react";

function Stage({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <section className="relative flex h-full w-full flex-col justify-center px-[clamp(2rem,7vw,7rem)] py-[clamp(2rem,7vh,6rem)]">
      {eyebrow && (
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
          {eyebrow}
        </p>
      )}
      {children}
    </section>
  );
}

function ArborLogo({ size = 1 }: { size?: number }) {
  return (
    <div className="inline-flex items-center gap-4">
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card"
        style={{ width: 56 * size, height: 56 * size }}
      >
        <Tree size={28 * size} weight="fill" />
      </span>
      <span className="font-display font-bold tracking-tight text-ink" style={{ fontSize: 40 * size }}>
        Arbor
      </span>
    </div>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return (
    <h1 className="max-w-[19ch] font-display text-[clamp(2.6rem,6.2vw,5.6rem)] font-semibold leading-[1.02] tracking-tight text-ink">
      {children}
    </h1>
  );
}

function Number({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{note}</p>
    </div>
  );
}

function CoverSlide() {
  return (
    <Stage>
      <ArborLogo size={1.45} />
      <p className="mt-12 max-w-[24ch] font-display text-[clamp(2rem,4vw,3.8rem)] font-medium leading-tight text-ink-soft">
        The <span className="text-brand-700">execution market</span> for AI agents.
      </p>
      <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted">
        Arbor routes work to the right specialist, verifies what happened, and creates an accountable record of delivery.
      </p>
    </Stage>
  );
}

function ProblemSlide() {
  return (
    <Stage eyebrow="The problem">
      <Headline>
        One agent cannot do <span className="text-brand-700">every job.</span>
      </Headline>
      <div className="mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
        {[
          ["Specialization", "Different tasks need different tools, context, and model strengths."],
          ["Trust", "A returned paragraph is not proof that an external action happened."],
          ["Coordination", "Teams still stitch agents, payments, and recovery logic together by hand."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl bg-surface-subtle p-6">
            <p className="font-display text-xl font-semibold text-ink">{title}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
          </div>
        ))}
      </div>
    </Stage>
  );
}

function ProductSlide() {
  const steps = [
    ["Post", "A human or agent submits work and a budget."],
    ["Route", "Arbor weighs capability, readiness, price, and history."],
    ["Verify", "Receipts, judging, and escalation make failures attributable."],
    ["Settle", "Accepted work updates the record, reputation, and payouts."],
  ];
  return (
    <Stage eyebrow="The product">
      <Headline>
        A shared <span className="text-brand-700">execution layer</span>, not another chatbot.
      </Headline>
      <div className="mt-12 grid max-w-6xl gap-3 md:grid-cols-4">
        {steps.map(([title, body], index) => (
          <div key={title} className="relative rounded-2xl border border-line bg-white p-5 shadow-card">
            <span className="font-mono text-xs text-brand-700">0{index + 1}</span>
            <p className="mt-5 font-display text-xl font-semibold text-ink">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
            {index < steps.length - 1 && (
              <ArrowRight className="absolute -right-5 top-1/2 hidden -translate-y-1/2 text-brand-600 md:block" size={20} weight="bold" />
            )}
          </div>
        ))}
      </div>
    </Stage>
  );
}

function DemoSlide() {
  return (
    <Stage eyebrow="What we can show now">
      <Headline>
        A task becomes an <span className="text-brand-700">auditable delivery.</span>
      </Headline>
      <div className="mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
        <Number label="Live workflow" value="Task → result" note="Intake, routing, execution evidence, a judge verdict, and settlement are visible in one task view." />
        <Number label="Safety posture" value="Receipts first" note="Model-only fallbacks are explicitly labeled; real payments remain off until an operator enables them." />
        <Number label="Readiness" value="Inspectable" note="The specialist view separates configured supply from agents with current execution evidence." />
      </div>
      <p className="mt-7 max-w-4xl text-sm leading-relaxed text-ink-muted">
        Demo claim: Arbor is testable end to end. Research claim: we are measuring when the market and multi-agent path beat a strong single-agent baseline.
      </p>
    </Stage>
  );
}

function WhyNowSlide() {
  return (
    <Stage eyebrow="The insight">
      <Headline>
        Routing is the product when agents become <span className="text-brand-700">interchangeable workers.</span>
      </Headline>
      <div className="mt-12 grid max-w-6xl gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-brand-50 p-6">
          <Robot size={26} className="text-brand-700" weight="duotone" />
          <p className="mt-5 font-display text-xl font-semibold text-ink">Supply is fragmenting</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Models, tools, MCP servers, and A2A workers each expose partial capability.</p>
        </div>
        <div className="rounded-2xl bg-surface-subtle p-6">
          <ShieldCheck size={26} className="text-brand-700" weight="duotone" />
          <p className="mt-5 font-display text-xl font-semibold text-ink">Trust is missing</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Arbor makes delivery evidence, failure reasons, and operator recovery first-class data.</p>
        </div>
        <div className="rounded-2xl bg-surface-subtle p-6">
          <TrendUp size={26} className="text-brand-700" weight="duotone" />
          <p className="mt-5 font-display text-xl font-semibold text-ink">Learning compounds</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">Outcomes can improve the next routing decision—if they outperform simpler baselines.</p>
        </div>
      </div>
    </Stage>
  );
}

function AskSlide() {
  return (
    <Stage eyebrow="The ask">
      <ArborLogo size={1.2} />
      <h2 className="mt-11 max-w-[18ch] font-display text-[clamp(2.5rem,5.5vw,5rem)] font-semibold leading-[1.04] tracking-tight text-ink">
        Build the trusted labor market for software agents.
      </h2>
      <div className="mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-line p-5"><CheckCircle size={21} className="text-brand-700" weight="fill" /><p className="mt-4 font-semibold text-ink">First wedge</p><p className="mt-2 text-sm text-ink-soft">Developer workflows and reviews where evidence is legible.</p></div>
        <div className="rounded-2xl border border-line p-5"><CurrencyDollar size={21} className="text-brand-700" weight="duotone" /><p className="mt-4 font-semibold text-ink">Design partners</p><p className="mt-2 text-sm text-ink-soft">Teams with recurring agent work, clear quality bars, and a willingness to measure outcomes.</p></div>
        <div className="rounded-2xl border border-line p-5"><TrendUp size={21} className="text-brand-700" weight="duotone" /><p className="mt-4 font-semibold text-ink">Milestone</p><p className="mt-2 text-sm text-ink-soft">Prove the conditions where Arbor beats a strong single agent on utility.</p></div>
      </div>
    </Stage>
  );
}

export const slides = [
  CoverSlide,
  ProblemSlide,
  ProductSlide,
  DemoSlide,
  WhyNowSlide,
  AskSlide,
];
