import { NextResponse } from "next/server";

import { type AppRole, roleLabel } from "@/lib/constants/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  target_user_id: string;
  previous_role: AppRole | null;
  new_role: AppRole | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
};

type ProfileBasic = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function canReviewAudit(role: AppRole) {
  return role === "admin" || role === "superadmin";
}

function profileName(profile: ProfileBasic | undefined) {
  if (!profile) return "Usuario";
  const value = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return value || "Usuario";
}

function normalizeRoleFilter(value: string): "all" | AppRole {
  if (value === "general_user" || value === "event_organizer" || value === "admin" || value === "superadmin") {
    return value;
  }
  return "all";
}

function dateAtStartOfDay(dateText: string) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateAtEndOfDay(dateText: string) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeCsvField(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  const currentRole = (currentProfile?.role ?? "general_user") as AppRole;
  if (!canReviewAudit(currentRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const q = (requestUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const role = normalizeRoleFilter((requestUrl.searchParams.get("role") ?? "all").trim());
  const fromDate = dateAtStartOfDay((requestUrl.searchParams.get("from") ?? "").trim());
  const toDate = dateAtEndOfDay((requestUrl.searchParams.get("to") ?? "").trim());

  const { data: auditRows } = await supabase
    .from("role_change_audit")
    .select("id, target_user_id, previous_role, new_role, changed_by, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const audits = (auditRows ?? []) as AuditRow[];

  const profileIds = new Set<string>();
  for (const row of audits) {
    profileIds.add(row.target_user_id);
    if (row.changed_by) {
      profileIds.add(row.changed_by);
    }
  }

  let profilesById = new Map<string, ProfileBasic>();
  if (profileIds.size > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", Array.from(profileIds));

    profilesById = new Map((profileRows ?? []).map((item) => [item.id, item as ProfileBasic]));
  }

  let emailsByUserId = new Map<string, string>();
  if (profileIds.size > 0) {
    const serviceClient = createServiceClient();
    const { data: authUserRows } = await serviceClient
      .schema("auth")
      .from("users")
      .select("id, email")
      .in("id", Array.from(profileIds));

    emailsByUserId = new Map(
      (authUserRows ?? [])
        .filter((row) => typeof row.id === "string" && typeof row.email === "string")
        .map((row) => [row.id as string, row.email as string]),
    );
  }

  const filteredAudits = audits.filter((row) => {
    if (role !== "all") {
      if (row.previous_role !== role && row.new_role !== role) {
        return false;
      }
    }

    if (fromDate || toDate) {
      const createdAt = new Date(row.created_at);
      if (Number.isNaN(createdAt.getTime())) {
        return false;
      }
      if (fromDate && createdAt < fromDate) {
        return false;
      }
      if (toDate && createdAt > toDate) {
        return false;
      }
    }

    if (!q) {
      return true;
    }

    const targetProfile = profilesById.get(row.target_user_id);
    const actorProfile = row.changed_by ? profilesById.get(row.changed_by) : undefined;

    const targetName = profileName(targetProfile).toLowerCase();
    const actorName = profileName(actorProfile).toLowerCase();
    const reasonText = (row.reason ?? "").toLowerCase();
    const targetEmail = (emailsByUserId.get(row.target_user_id) ?? "").toLowerCase();
    const actorEmail = (row.changed_by ? emailsByUserId.get(row.changed_by) : "")?.toLowerCase() ?? "";

    return (
      targetName.includes(q) ||
      actorName.includes(q) ||
      reasonText.includes(q) ||
      targetEmail.includes(q) ||
      actorEmail.includes(q)
    );
  });

  const lines = [
    [
      "fecha",
      "objetivo_nombre",
      "objetivo_correo",
      "rol_anterior",
      "rol_nuevo",
      "actor_nombre",
      "actor_correo",
      "motivo",
    ].map(escapeCsvField).join(","),
  ];

  for (const row of filteredAudits) {
    const targetProfile = profilesById.get(row.target_user_id);
    const actorProfile = row.changed_by ? profilesById.get(row.changed_by) : undefined;

    const record = [
      row.created_at,
      profileName(targetProfile),
      emailsByUserId.get(row.target_user_id) ?? "",
      roleLabel((row.previous_role ?? "general_user") as AppRole),
      roleLabel((row.new_role ?? "general_user") as AppRole),
      row.changed_by ? profileName(actorProfile) : "Sistema",
      row.changed_by ? (emailsByUserId.get(row.changed_by) ?? "") : "",
      row.reason ?? "",
    ];

    lines.push(record.map((value) => escapeCsvField(String(value))).join(","));
  }

  const csv = lines.join("\n");
  const fileName = `auditoria_roles_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
