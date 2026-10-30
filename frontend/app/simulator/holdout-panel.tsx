import { Panel } from "@/components/page-header";
import type { HoldoutReport } from "@/lib/types";

const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

/** What outreach really did, measured against a no-contact control group (the efficacy the ROI page can only assume). */
export function HoldoutPanel({ report }: { report: HoldoutReport | null }) {
  if (!report) return null;
  if (!report.enabled) {
    return (
      <Panel title="Measured efficacy (hold-out)" subtitle="Off">
        <p className="text-xs text-muted-foreground">
          {report.message} A hold-out leaves a small random share of flagged patients uncontacted, so the benefit of outreach can be
          measured here instead of assumed in the ROI above. Use it in a real pilot, not on synthetic data.
        </p>
      </Panel>
    );
  }
  const { contact, holdout } = report.arms;
  return (
    <Panel
      title="Measured efficacy (hold-out)"
      subtitle={`${report.holdout_pct}% of flagged appointments are the no-contact control · ${report.tiers.join(", ")} risk · last ${report.days} days`}
    >
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 font-semibold">Group</th>
            <th className="font-semibold">Appointments</th>
            <th className="font-semibold">No-show rate</th>
            <th className="font-semibold">Actually contacted</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          <tr className="border-b border-border/50">
            <td className="py-2 font-sans font-semibold">Outreach</td>
            <td>{contact.n}</td>
            <td>{pct(contact.rate)}</td>
            <td>{pct(contact.contacted_share, 0)}</td>
          </tr>
          <tr>
            <td className="py-2 font-sans font-semibold">Control (not contacted)</td>
            <td>{holdout.n}</td>
            <td>{pct(holdout.rate)}</td>
            <td>{pct(holdout.contacted_share, 0)}</td>
          </tr>
        </tbody>
      </table>
      {report.implied_efficacy && report.difference ? (
        <p className="mt-3 text-xs text-foreground">
          Outreach lowered the no-show rate by <b>{pct(report.difference.absolute)}</b> points ({pct(report.difference.ci[0])} to{" "}
          {pct(report.difference.ci[1])}), an efficacy of about <b>{pct(report.implied_efficacy.point, 0)}</b> (range{" "}
          {pct(report.implied_efficacy.ci[0], 0)} to {pct(report.implied_efficacy.ci[1], 0)}).{" "}
          {report.difference.significant ? "That difference is larger than chance." : "That difference could still be chance."}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Not enough appointments in both groups yet.</p>
      )}
      {report.required_n_per_arm && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          To detect an efficacy of 26% you need about {report.required_n_per_arm} appointments in each group.
        </p>
      )}
      {report.contamination_warning && (
        <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          Some control-group patients were contacted, which weakens the comparison. Remind staff to leave them alone.
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">{report.caveat}</p>
    </Panel>
  );
}
