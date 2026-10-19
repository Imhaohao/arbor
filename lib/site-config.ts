export const SITE = {
  name: "Arbor",
  supportEmail: "imzihaoi@gmail.com",
  operator: process.env.NEXT_PUBLIC_ARBOR_OPERATOR_NAME ?? "Arbor's founder",
  operatorKind: "a sole proprietor",
  jurisdiction: process.env.NEXT_PUBLIC_ARBOR_JURISDICTION ?? "California, United States",
  effectiveDate: "2026-10-18",
} as const;
