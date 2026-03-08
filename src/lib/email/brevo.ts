type SendOrganizationOtpEmailInput = {
  toEmail: string;
  organizationName: string;
  otpCode: string;
  expiresAtIso: string;
};

type BrevoFailReason = "missing-config" | "unauthorized" | "request-failed";

type BrevoResult =
  | { ok: true }
  | {
      ok: false;
      reason: BrevoFailReason;
      statusCode?: number;
    };

function getBrevoConfig() {
  return {
    apiKey: process.env.BREVO_API_KEY ?? "",
    senderEmail: process.env.BREVO_SENDER_EMAIL ?? "",
    senderName: process.env.BREVO_SENDER_NAME ?? "Campus App",
  };
}

export async function sendOrganizationOtpEmail(input: SendOrganizationOtpEmailInput) {
  const config = getBrevoConfig();
  if (!config.apiKey || !config.senderEmail) {
    return { ok: false, reason: "missing-config" } satisfies BrevoResult;
  }

  const expiresAtLabel = new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(input.expiresAtIso));

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: config.senderEmail,
        name: config.senderName,
      },
      to: [{ email: input.toEmail }],
      subject: "Codigo OTP para activar tu cuenta de organizacion",
      htmlContent: `
        <h2>Activacion de cuenta de organizacion</h2>
        <p>Hola,</p>
        <p>Tu solicitud para <strong>${input.organizationName}</strong> fue aprobada.</p>
        <p>Este es tu codigo OTP de primer acceso:</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${input.otpCode}</p>
        <p>Vence el ${expiresAtLabel}.</p>
        <p>Ingresa en el portal de organizaciones para crear tu clave.</p>
      `,
      textContent: `Tu solicitud para ${input.organizationName} fue aprobada. OTP: ${input.otpCode}. Vence el ${expiresAtLabel}.`,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "unauthorized", statusCode: response.status } satisfies BrevoResult;
    }

    return { ok: false, reason: "request-failed", statusCode: response.status } satisfies BrevoResult;
  }

  return { ok: true } satisfies BrevoResult;
}

export async function checkBrevoAccountAccess() {
  const config = getBrevoConfig();
  if (!config.apiKey || !config.senderEmail) {
    return { ok: false, reason: "missing-config" } satisfies BrevoResult;
  }

  const response = await fetch("https://api.brevo.com/v3/account", {
    method: "GET",
    headers: {
      accept: "application/json",
      "api-key": config.apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "unauthorized", statusCode: response.status } satisfies BrevoResult;
    }

    return { ok: false, reason: "request-failed", statusCode: response.status } satisfies BrevoResult;
  }

  return { ok: true } satisfies BrevoResult;
}

export async function sendBrevoHealthTestEmail(toEmail: string) {
  const config = getBrevoConfig();
  if (!config.apiKey || !config.senderEmail) {
    return { ok: false, reason: "missing-config" } satisfies BrevoResult;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: config.senderEmail,
        name: config.senderName,
      },
      to: [{ email: toEmail }],
      subject: "Prueba Brevo - Campus App",
      textContent: "Prueba de conexion Brevo exitosa.",
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "unauthorized", statusCode: response.status } satisfies BrevoResult;
    }

    return { ok: false, reason: "request-failed", statusCode: response.status } satisfies BrevoResult;
  }

  return { ok: true } satisfies BrevoResult;
}
