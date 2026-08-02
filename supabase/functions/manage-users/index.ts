import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["admin", "responsable", "employe"]);
const protectedEmails = new Set(["contact@srlreunion.com", "quentin@lunion.be"]);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Méthode non autorisée." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return response({ error: "Configuration ou authentification manquante." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const actor = userData.user;
    if (userError || !actor) return response({ error: "Session invalide." }, 401);

    const { data: actorProfile, error: actorProfileError } = await userClient
      .from("profiles")
      .select("id,email,role,actif")
      .eq("id", actor.id)
      .single();

    if (actorProfileError || actorProfile?.role !== "admin" || actorProfile?.actif !== true) {
      return response({ error: "Cette action est réservée à l’Administrateur." }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const action = cleanText(payload.action, 30);

    if (action === "list") {
      const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authError) throw authError;

      const { data: profiles, error: profilesError } = await adminClient
        .from("profiles")
        .select("id,email,prenom,nom,role,actif,created_at,updated_at")
        .order("created_at", { ascending: true });
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const users = (authData.users ?? []).map((authUser) => {
        const profile = (profileMap.get(authUser.id) ?? {}) as Record<string, unknown>;
        const email = String(authUser.email ?? profile.email ?? "");
        return {
          id: authUser.id,
          email,
          prenom: profile.prenom ?? "",
          nom: profile.nom ?? "",
          role: profile.role ?? "employe",
          actif: profile.actif === true,
          emailConfirmee: Boolean(authUser.email_confirmed_at),
          derniereConnexion: authUser.last_sign_in_at ?? null,
          creeLe: authUser.created_at ?? profile.created_at ?? null,
          protege: protectedEmails.has(email.toLowerCase()),
        };
      });
      return response({ users });
    }

    if (action === "create") {
      const email = cleanText(payload.email, 254).toLowerCase();
      const prenom = cleanText(payload.prenom, 80);
      const nom = cleanText(payload.nom, 100);
      const role = cleanText(payload.role, 20).toLowerCase();
      const password = String(payload.password ?? "");

      if (!email || !email.includes("@")) return response({ error: "Adresse e-mail invalide." }, 400);
      if (!prenom || !nom) return response({ error: "Le prénom et le nom sont obligatoires." }, 400);
      if (!allowedRoles.has(role)) return response({ error: "Rôle invalide." }, 400);
      if (password.length < 10) return response({ error: "Le mot de passe temporaire doit contenir au moins 10 caractères." }, 400);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { prenom, nom },
      });
      if (createError || !created.user) throw createError ?? new Error("Compte non créé.");

      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ prenom, nom, role, actif: true, updated_at: new Date().toISOString() })
        .eq("id", created.user.id);

      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      await adminClient.from("user_admin_events").insert({
        actor_user_id: actor.id,
        target_user_id: created.user.id,
        target_email: email,
        action: "create",
        details: { prenom, nom, role },
      });

      return response({
        user: {
          id: created.user.id,
          email,
          prenom,
          nom,
          role,
          actif: true,
          emailConfirmee: true,
          derniereConnexion: null,
          creeLe: created.user.created_at,
          protege: false,
        },
      }, 201);
    }

    if (action === "update") {
      const id = cleanText(payload.id, 80);
      const prenom = cleanText(payload.prenom, 80);
      const nom = cleanText(payload.nom, 100);
      const role = cleanText(payload.role, 20).toLowerCase();
      const actif = payload.actif === true;

      if (!id) return response({ error: "Utilisateur manquant." }, 400);
      if (!prenom || !nom) return response({ error: "Le prénom et le nom sont obligatoires." }, 400);
      if (!allowedRoles.has(role)) return response({ error: "Rôle invalide." }, 400);
      if (id === actor.id && !actif) return response({ error: "Vous ne pouvez pas désactiver votre propre compte." }, 400);

      const { data: before, error: beforeError } = await adminClient
        .from("profiles")
        .select("id,email,prenom,nom,role,actif")
        .eq("id", id)
        .single();
      if (beforeError || !before) return response({ error: "Utilisateur introuvable." }, 404);

      const email = String(before.email ?? "").toLowerCase();
      if (protectedEmails.has(email)) {
        const expectedRole = email === "contact@srlreunion.com" ? "admin" : "responsable";
        if (role !== expectedRole || !actif) return response({ error: "Ce compte principal est protégé." }, 400);
      }

      const { data: updated, error: updateError } = await adminClient
        .from("profiles")
        .update({ prenom, nom, role, actif, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,email,prenom,nom,role,actif")
        .single();
      if (updateError) throw updateError;

      const { error: metadataError } = await adminClient.auth.admin.updateUserById(id, {
        user_metadata: { prenom, nom },
      });
      if (metadataError) throw metadataError;

      const auditAction = before.actif !== actif ? (actif ? "activate" : "deactivate") : "update";
      await adminClient.from("user_admin_events").insert({
        actor_user_id: actor.id,
        target_user_id: id,
        target_email: before.email,
        action: auditAction,
        details: {
          before: { prenom: before.prenom, nom: before.nom, role: before.role, actif: before.actif },
          after: { prenom, nom, role, actif },
        },
      });

      return response({ user: updated });
    }

    if (action === "delete") {
      const id = cleanText(payload.id, 80);
      const confirmationEmail = cleanText(payload.confirmationEmail, 254).toLowerCase();

      if (!id) return response({ error: "Utilisateur manquant." }, 400);
      if (id === actor.id) return response({ error: "Vous ne pouvez pas supprimer votre propre compte." }, 400);

      const { data: before, error: beforeError } = await adminClient
        .from("profiles")
        .select("id,email,prenom,nom,role,actif")
        .eq("id", id)
        .single();
      if (beforeError || !before) return response({ error: "Utilisateur introuvable." }, 404);

      const email = String(before.email ?? "").toLowerCase();
      if (protectedEmails.has(email)) {
        return response({ error: "Ce compte principal est protégé et ne peut pas être supprimé." }, 400);
      }
      if (confirmationEmail !== email) {
        return response({ error: "L’adresse de confirmation ne correspond pas au compte à supprimer." }, 400);
      }

      const { error: archiveError } = await adminClient.from("deleted_user_identities").insert({
        former_user_id: id,
        email,
        prenom: before.prenom,
        nom: before.nom,
        role: before.role,
        deleted_by: actor.id,
      });
      if (archiveError) throw archiveError;

      await adminClient.from("user_admin_events").insert({
        actor_user_id: actor.id,
        target_user_id: id,
        target_email: email,
        action: "delete",
        details: { prenom: before.prenom, nom: before.nom, role: before.role, actif: before.actif },
      });

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;

      return response({ deleted: true, email });
    }

    return response({ error: "Action inconnue." }, 400);
  } catch (error) {
    console.error("manage-users", error);
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return response({ error: message }, 400);
  }
});
