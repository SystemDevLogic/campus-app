export type AppRole = "general_user" | "event_organizer" | "admin" | "superadmin";

export function canCreatePlans(role: AppRole) {
  return role === "event_organizer" || role === "admin" || role === "superadmin";
}

export function roleLabel(role: AppRole) {
  switch (role) {
    case "general_user":
      return "Usuario general";
    case "event_organizer":
      return "Organizador de eventos";
    case "admin":
      return "Administrador";
    case "superadmin":
      return "Superadmin";
    default:
      return "Usuario";
  }
}
