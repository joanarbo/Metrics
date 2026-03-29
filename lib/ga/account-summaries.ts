import { protos, v1beta } from "@google-analytics/admin";
import { googleAnalyticsClientOptions } from "@/lib/ga/google-client-options";

export type PropertyRow = {
  property: string;
  displayName: string;
  propertyType: string;
  parent: string;
};

export type AccountRow = {
  name: string;
  account: string;
  displayName: string;
  propertySummaries: PropertyRow[];
};

type PropertySummaryProto =
  protos.google.analytics.admin.v1beta.IPropertySummary;

function propertyTypeLabel(value: PropertySummaryProto["propertyType"]): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "number") {
    const labels = protos.google.analytics.admin.v1beta.PropertyType;
    return labels[value] ?? String(value);
  }
  return String(value);
}

export async function fetchAllAccountSummaries(): Promise<AccountRow[]> {
  const client = new v1beta.AnalyticsAdminServiceClient(googleAnalyticsClientOptions());
  const [summaries] = await client.listAccountSummaries({ pageSize: 200 });

  return summaries.map((s) => ({
    name: s.name ?? "",
    account: s.account ?? "",
    displayName: s.displayName ?? "",
    propertySummaries: (s.propertySummaries ?? []).map((p) => ({
      property: p.property ?? "",
      displayName: p.displayName ?? "",
      propertyType: propertyTypeLabel(p.propertyType),
      parent: p.parent ?? "",
    })),
  }));
}
