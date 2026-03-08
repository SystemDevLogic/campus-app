import { redirect } from "next/navigation";

export default async function OrganizationPortalPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const suffix = query.welcome === "1" ? "?welcome=1" : "";
  redirect(`/organizations/dashboard${suffix}`);
}
