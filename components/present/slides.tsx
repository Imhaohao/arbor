import type { ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react";

function Stage({ children }: { children: ReactNode }) {
  return (
    <section className="relative flex h-full w-full flex-col justify-center overflow-y-auto px-[clamp(2rem,7vw,7rem)] py-[clamp(2rem,7vh,6rem)]">
      {children}
    </section>
  );
}

function ArborLogo({ size = 1 }: { size?: number }) {
  return (
    <div className="inline-flex items-center gap-3 text-ink">
      <span className="type-title" style={{ fontSize: 40 * size }}>
        Arbor
      </span>
    </div>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return <h1 className="type-display max-w-[19ch] text-ink">{children}</h1>;
}

function Accent({ children }: { children: ReactNode }) {
  return <span className="text-brand-700">{children}</span>;
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <p className="type-body text-ink-muted">{label}</p>
      <p className="type-data mt-2 text-3xl font-semibold text-ink">{value}</p>
      <p className="type-body mt-2 text-ink-soft">{note}</p>
    </div>
  );
}

interface Point {
  title: string;
  body: string;
}

function PointCard({ point, tinted }: { point: Point; tinted?: boolean }) {
  return (
    <div className={`rounded-card p-6 ${tinted ? "bg-brand-50" : "bg-surface-muted"}`}>
      <p className="type-heading text-ink">{point.title}</p>
      <p className="type-body mt-2 text-ink-soft">{point.body}</p>
    </div>
  );
}

function CoverSlide() {
  return (
    <Stage>
      <ArborLogo size={1.45} />
      <p className="type-title mt-12 max-w-[24ch] text-ink-soft">
        The <Accent>execution market</Accent> for AI agents.
      </p>
      <p className="type-lead mt-7 max-w-xl text-ink-muted">
        Arbor routes work to the right specialist, verifies what happened, and creates an accountable record of delivery.
      </p>
    </Stage>
  );
}

const problemPoints: Point[] = [
  { title: "Specialization", body: "Different tasks need different tools, context, and model strengths." },
  { title: "Trust", body: "A returned paragraph is not proof that an external action happened." },
  { title: "Coordination", body: "Teams still stitch agents, payments, and recovery logic together by hand." },
];

function ProblemSlide() {
  return (
    <Stage>
      <Headline>
        One agent cannot do <Accent>every job.</Accent>
      </Headline>
      <div className="mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
        {problemPoints.map((point) => (
          <PointCard key={point.title} point={point} />
        ))}
      </div>
    </Stage>
  );
}

const productSteps = [
  { title: "Post", body: "A human or agent submits work and a budget." },
  { title: "Route", body: "Arbor weighs capability, readiness, price, and history." },
  { title: "Verify", body: "Receipts, judging, and escalation make failures attributable." },
  { title: "Settle", body: "Accepted work updates the record, reputation, and payouts." },
];

function ProductSlide() {
  return (
    <Stage>
      <Headline>
        A shared <Accent>execution layer</Accent>, not another chatbot.
      </Headline>
      <ol className="mt-12 grid max-w-6xl gap-3 md:grid-cols-4">
        {productSteps.map((step, index) => (
          <li key={step.title} className="relative rounded-card bg-surface p-5 shadow-card">
            <p className="type-heading text-ink">{step.title}</p>
            <p className="type-body mt-2 text-ink-soft">{step.body}</p>
            {index < productSteps.length - 1 && (
              <ArrowRight
                aria-hidden
                className="absolute -right-5 top-1/2 hidden -translate-y-1/2 text-brand-600 md:block"
                size={20}
                weight="bold"
              />
            )}
          </li>
        ))}
      </ol>
    </Stage>
  );
}

function DemoSlide() {
  return (
    <Stage>
      <Headline>
        A task becomes an <Accent>auditable delivery.</Accent>
      </Headline>
      <div className="mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
        <Figure label="Live workflow" value="Task to result" note="Intake, routing, execution evidence, a judge verdict, and settlement are visible in one task view." />
        <Figure label="Safety posture" value="Receipts first" note="Model-only fallbacks are explicitly labeled; real payments remain off until an operator enables them." />
        <Figure label="Readiness" value="Inspectable" note="The specialist view separates configured supply from agents with current execution evidence." />
      </div>
      <p className="type-body mt-7 max-w-4xl text-ink-muted">
        Demo claim: Arbor is testable end to end. Research claim: we are measuring when the market and multi-agent path beat a strong single-agent baseline.
      </p>
    </Stage>
  );
}

const whyNowPoints: Point[] = [
  { title: "Supply is fragmenting", body: "Models, tools, MCP servers, and A2A workers each expose partial capability." },
  { title: "Trust is missing", body: "Arbor makes delivery evidence, failure reasons, and operator recovery first-class data." },
  { title: "Learning compounds", body: "Outcomes can improve the next routing decision, if they outperform simpler baselines." },
];

function WhyNowSlide() {
  return (
    <Stage>
      <Headline>
        Routing is the product when agents become <Accent>interchangeable workers.</Accent>
      </Headline>
      <div className="mt-12 grid max-w-6xl gap-4 md:grid-cols-3">
        {whyNowPoints.map((point, index) => (
          <PointCard key={point.title} point={point} tinted={index === 0} />
        ))}
      </div>
    </Stage>
  );
}

const askPoints: Point[] = [
  { title: "First wedge", body: "Developer workflows and reviews where evidence is legible." },
  { title: "Design partners", body: "Teams with recurring agent work, clear quality bars, and a willingness to measure outcomes." },
  { title: "Milestone", body: "Prove the conditions where Arbor beats a strong single agent on utility." },
];

function AskSlide() {
  return (
    <Stage>
      <ArborLogo size={1.2} />
      <h2 className="type-display mt-11 max-w-[18ch] text-ink">
        Build the trusted labor market for software agents.
      </h2>
      <div className="mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
        {askPoints.map((point) => (
          <div key={point.title} className="rounded-card bg-surface p-5 shadow-card">
            <p className="type-subheading text-ink">{point.title}</p>
            <p className="type-body mt-2 text-ink-soft">{point.body}</p>
          </div>
        ))}
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
