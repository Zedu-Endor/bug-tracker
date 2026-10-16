import type { ReactNode } from "react";
import { ReportIssueFab } from "@/components/report-issue-fab";
import { REPORT_FORM_URL } from "@/lib/report-form";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ReportIssueFab href={REPORT_FORM_URL} />
    </>
  );
}