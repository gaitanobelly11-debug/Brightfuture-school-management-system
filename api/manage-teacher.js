// POST /api/manage-teacher
//
// Handles the two operations that need Supabase's privileged service-role
// key (creating a real login, or changing an existing one's email/
// password) — operations the public frontend must never be trusted to do
// directly, since the service-role key can bypass every RLS policy in the
// database. This function holds that key server-side only (as the
// SUPABASE_SERVICE_ROLE_KEY environment variable, set in the Vercel
// project — never committed to source or sent to the browser) and re-
// checks on every request that the caller is actually signed in as an
// Admin, Head Teacher, or Deputy Head Teacher before doing anything.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://nravzlpapxolmzgjqwws.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_Kh5GWC2h_Ga0qe5RmA3LKw_4CWL6BIW";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Project Settings → Environment Variables, then redeploy." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing authorization token." });
    return;
  }

  // Verify who's calling, using their own token against the normal
  // (RLS-respecting) anon client — this cannot be spoofed since it's a
  // real Supabase-issued session token.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }

  const { data: profileRows, error: profileErr } = await callerClient
    .from("staff_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .limit(1);
  const callerRole = profileRows?.[0]?.role;
  if (profileErr || !["Admin", "Head Teacher", "Deputy Head Teacher"].includes(callerRole)) {
    res.status(403).json({ error: "Only an Admin, Head Teacher, or Deputy Head Teacher can manage staff logins." });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = req.body || {};

  try {
    if (body.action === "create") {
      const { name, email, password, role, subjects, classTeacherOf, phone, photoUrl, designation } = body;
      if (!name || !email || !password) {
        res.status(400).json({ error: "Name, email, and password are required." });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters." });
        return;
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createErr) {
        res.status(400).json({ error: createErr.message });
        return;
      }
      const newId = created.user.id;
      const { error: insertErr } = await admin.from("staff_profiles").insert({
        id: newId, name, role: role || "Subject Teacher", subjects: subjects || "",
        class_teacher_of: classTeacherOf || null, phone: phone || "", email, photo_url: photoUrl || null,
        designation: role === "Subordinate Staff" ? (designation || null) : null,
      });
      if (insertErr) {
        // Roll back the auth user so we don't leave a login with no profile.
        await admin.auth.admin.deleteUser(newId).catch(() => {});
        res.status(400).json({ error: insertErr.message });
        return;
      }
      res.status(200).json({ id: newId });
      return;
    }

    if (body.action === "update_credentials") {
      const { teacherId, email, password } = body;
      if (!teacherId) {
        res.status(400).json({ error: "Missing teacherId." });
        return;
      }
      if (password && password.length < 8) {
        res.status(400).json({ error: "New password must be at least 8 characters." });
        return;
      }
      const patch = {};
      if (email) patch.email = email;
      if (password) patch.password = password;
      if (Object.keys(patch).length) {
        const { error: updErr } = await admin.auth.admin.updateUserById(teacherId, patch);
        if (updErr) {
          res.status(400).json({ error: updErr.message });
          return;
        }
      }
      if (email) {
        await admin.from("staff_profiles").update({ email }).eq("id", teacherId);
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === "delete") {
      const { teacherId } = body;
      if (!teacherId) {
        res.status(400).json({ error: "Missing teacherId." });
        return;
      }
      if (teacherId === userData.user.id) {
        res.status(400).json({ error: "You can't delete your own account while signed in as it." });
        return;
      }
      // Clear out records that reference this staff member before removing
      // the profile and login, so nothing is left pointing at a deleted id.
      await admin.from("staff_attendance").delete().eq("staff_id", teacherId);
      await admin.from("staff_profiles").delete().eq("id", teacherId);
      const { error: delErr } = await admin.auth.admin.deleteUser(teacherId);
      if (delErr) {
        res.status(400).json({ error: delErr.message });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
