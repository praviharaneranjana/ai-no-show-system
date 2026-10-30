import { ShapTornadoChart } from "@/components/shap-tornado-chart";
import type { FeatureContribution } from "@/lib/types";

export function ContributionList({
  contributions,
}: {
  contributions: FeatureContribution[];
}) {
  return <ShapTornadoChart contributions={contributions} />;
}
