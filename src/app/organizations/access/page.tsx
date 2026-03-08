import Link from "next/link";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  buildOrganizationSessionToken,
  getOrganizationSessionCookieName,
  getOrganizationSessionDurationSeconds,
  hashOrganizationPassword,
  verifyOrganizationPassword,
} from "@/lib/organizations/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type SearchQuery = Record<string, string | string[] | undefined>;

function readFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validatePassword(password: string) {
  return password.length >= 8;
}

function getInfoMessage(info: string) {
  if (info === "otp") return "Primer ingreso detectado: ingresa OTP y crea tu clave.";
  if (info === "password") return "Cuenta activa: ingresa tu clave.";
  if (info === "notFound") return "No existe una cuenta de organizacion con ese correo.";
  return "";
}

function getSetupMessage(error: string) {
  if (error === "missing") return "Completa todos los campos para activar el acceso.";
  if (error === "send") return "No se pudo enviar el OTP. Intenta de nuevo en un minuto.";
  if (error === "password") return "La clave debe tener al menos 8 caracteres.";
  if (error === "match") return "Las claves no coinciden.";
  if (error === "expired") return "El OTP expiro. Solicita un nuevo codigo.";
  if (error === "already") return "Esta cuenta ya activo su acceso inicial.";
  if (error === "server") return "No se pudo guardar la clave. Intenta de nuevo.";
  if (error === "invalid") return "Correo u OTP invalido.";
  return "";
}

function cleanErrorDetail(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9 _.,:;-]/g, "").slice(0, 180);
}

function readSearchText(query: SearchQuery, key: string) {
  const value = query[key];
  return typeof value === "string" ? value : "";
}

function getAccessPageState(query: SearchQuery) {
  const stage = readSearchText(query, "stage");
  const email = readSearchText(query, "email");
  const info = readSearchText(query, "info");
  const setupError = readSearchText(query, "setupError");
  const setupErrorDetail = readSearchText(query, "setupErrorDetail");
  const passwordError = readSearchText(query, "passwordError");

  return {
    stage,
    email,
    setupErrorDetail,
    infoMessage: getInfoMessage(info),
    setupMessage: getSetupMessage(setupError),
    passwordMessage: getPasswordMessage(passwordError),
  };
}

async function ensureSupabaseAuthUserForOrganizationEmail(email: string) {
  const serviceClient = createServiceClient();
  const temporaryPassword = `${randomUUID()}Aa1!`;

  const { error } = await serviceClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      account_type: "organization",
    },
  });

  if (!error) {
    return;
  }

  const alreadyExists = /already|exists|registered/i.test(error.message);
  if (!alreadyExists) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=send&setupErrorDetail=${encodeURIComponent(cleanErrorDetail(error.message))}`);
  }
}

function getPasswordMessage(error: string) {
  if (error === "missing") return "Ingresa la clave.";
  if (error === "otp") return "Esta cuenta aun no activa su acceso inicial con OTP.";
  if (error === "invalid") return "Credenciales invalidas.";
  return "";
}

async function setOrganizationSessionCookie(accountId: string) {
  const cookieStore = await cookies();
  cookieStore.set(getOrganizationSessionCookieName(), buildOrganizationSessionToken(accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getOrganizationSessionDurationSeconds(),
  });
}

async function clearSupabaseUserSession() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

async function setupWithOtpAction(formData: FormData) {
  "use server";

  const email = readFormText(formData, "email").toLowerCase();
  const otp = readFormText(formData, "otp").replaceAll(" ", "");
  const password = readFormText(formData, "password");
  const confirmPassword = readFormText(formData, "confirmPassword");

  if (!email || !otp || !password || !confirmPassword) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=missing`);
  }

  if (!validatePassword(password)) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=password`);
  }

  if (password !== confirmPassword) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=match`);
  }

  const supabase = await createClient();

  const { data: account } = await supabase
    .from("organization_accounts")
    .select("id, is_active, first_login_completed")
    .eq("email", email)
    .maybeSingle();

  if (!account?.is_active) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=invalid`);
  }

  if (account.first_login_completed) {
    redirect(`/organizations/access?stage=password&email=${encodeURIComponent(email)}&passwordError=otp`);
  }

  const serviceClient = createServiceClient();
  const { error: otpVerifyError } = await serviceClient.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });

  if (otpVerifyError) {
    const isExpired = /expired/i.test(otpVerifyError.message);
    if (isExpired) {
      redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=expired`);
    }

    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=invalid`);
  }

  const passwordHash = hashOrganizationPassword(password);
  const { error: accountError } = await supabase
    .from("organization_accounts")
    .update({
      password_hash: passwordHash,
      first_login_completed: true,
    })
    .eq("id", account.id);

  if (accountError) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=server`);
  }

  await clearSupabaseUserSession();
  await setOrganizationSessionCookie(account.id);
  redirect("/organizations/dashboard?welcome=1");
}

async function checkOrganizationEmailAction(formData: FormData) {
  "use server";

  const email = readFormText(formData, "email").toLowerCase();
  if (!email) {
    redirect("/organizations/access?passwordError=missing");
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("organization_accounts")
    .select("first_login_completed, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!account?.is_active) {
    redirect("/organizations/access?info=notFound");
  }

  if (account.first_login_completed) {
    redirect(`/organizations/access?stage=password&email=${encodeURIComponent(email)}&info=password`);
  }

  await ensureSupabaseAuthUserForOrganizationEmail(email);

  const serviceClient = createServiceClient();
  const { error: otpSendError } = await serviceClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (otpSendError) {
    redirect(
      `/organizations/access?stage=otp&email=${encodeURIComponent(email)}&setupError=send&setupErrorDetail=${encodeURIComponent(cleanErrorDetail(otpSendError.message))}`,
    );
  }

  redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&info=otp`);
}

async function signInOrganizationAction(formData: FormData) {
  "use server";

  const email = readFormText(formData, "email").toLowerCase();
  const password = readFormText(formData, "password");

  if (!email || !password) {
    redirect(`/organizations/access?stage=password&email=${encodeURIComponent(email)}&passwordError=missing`);
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("organization_accounts")
    .select("id, password_hash, is_active, first_login_completed")
    .eq("email", email)
    .maybeSingle();

  if (!account?.is_active) {
    redirect(`/organizations/access?passwordError=invalid`);
  }

  if (!account.first_login_completed) {
    redirect(`/organizations/access?stage=otp&email=${encodeURIComponent(email)}&info=otp`);
  }

  if (!verifyOrganizationPassword(password, account.password_hash)) {
    redirect(`/organizations/access?stage=password&email=${encodeURIComponent(email)}&passwordError=invalid`);
  }

  await clearSupabaseUserSession();
  await setOrganizationSessionCookie(account.id);
  redirect("/organizations/dashboard");
}

export default async function OrganizationAccessPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = (await searchParams) ?? {};
  const { stage, email, setupErrorDetail, infoMessage, setupMessage, passwordMessage } = getAccessPageState(query);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <Link href="/login" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        {"<- Volver"}
      </Link>

      <h1 className="mt-4 text-3xl font-semibold">Acceso de organizaciones</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Primero valida tu correo para continuar con OTP o clave.</p>

      <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100">
        <h2 className="text-lg font-semibold">Paso 1: correo de organizacion</h2>
        <form action={checkOrganizationEmailAction} className="mt-4 space-y-3">
          <input
            name="email"
            type="email"
            defaultValue={email}
            placeholder="correo@organizacion.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            required
          />
          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg border border-zinc-400 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-200"
          >
            Continuar
          </button>
        </form>

        {infoMessage ? <p className="mt-3 text-sm text-emerald-300">{infoMessage}</p> : null}

        {stage === "otp" && email ? (
          <div className="mt-6 border-t border-zinc-700 pt-4">
            <h3 className="text-base font-semibold">Paso 2: OTP y nueva clave</h3>
            <form action={setupWithOtpAction} className="mt-3 space-y-3">
              <input type="hidden" name="email" value={email} />
              <input
                name="otp"
                type="text"
                placeholder="Codigo OTP"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Nueva clave"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                required
              />
              <input
                name="confirmPassword"
                type="password"
                placeholder="Confirmar clave"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                required
              />
              <button
                type="submit"
                className="w-full cursor-pointer rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Activar cuenta
              </button>
            </form>
            {setupMessage ? <p className="mt-3 text-sm text-amber-300">{setupMessage}</p> : null}
            {setupErrorDetail ? <p className="mt-2 text-xs text-zinc-400">Detalle: {setupErrorDetail}</p> : null}
          </div>
        ) : null}

        {stage === "password" && email ? (
          <div className="mt-6 border-t border-zinc-700 pt-4">
            <h3 className="text-base font-semibold">Paso 2: ingresar clave</h3>
            <form action={signInOrganizationAction} className="mt-3 space-y-3">
              <input type="hidden" name="email" value={email} />
              <input
                name="password"
                type="password"
                placeholder="Clave"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                required
              />
              <button
                type="submit"
                className="w-full cursor-pointer rounded-lg border border-zinc-400 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-200"
              >
                Ingresar
              </button>
            </form>
            {passwordMessage ? <p className="mt-3 text-sm text-amber-300">{passwordMessage}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
