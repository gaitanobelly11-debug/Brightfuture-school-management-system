// POST /api/send-sms
//
// Sends bulk SMS via Africa's Talking. Holds AFRICASTALKING_API_KEY and
// AFRICASTALKING_USERNAME server-side only (set in Vercel — never sent to
// the browser). Since this costs real money per message, the caller must
// be a signed-in Head Teacher or Deputy Head Teacher — checked here, not
// just "any staff member" like the lesson-plan generator.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://nravzlpapxolmzgjqwws.supabase.co";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_Kh5GWC2h_Ga0qe5RmA3LKw_4CWL6BIW";
const AT_API_KEY = process.env.AFRICASTALKING_API_KEY;
const AT_USERNAME = process.env.AFRICASTALKING_USERNAME;
// The sandbox account can only message numbers you've explicitly registered
// as test numbers in the AT dashboard — switch AFRICASTALKING_USERNAME to
// your live app's username once you're ready for real parents to receive it.
const AT_BASE_URL = AT_USERNAME === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";

// Normalizes Kenyan numbers to E.164 (+254...), which is what the API
// requires. Accepts "07...", "254...", or already-correct "+254..." forms.
function toE164(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("254")) return `+${digits}`;
  if (digits.startsWith("0")) return `+254${digits.slice(1)}`;
  if (digits) return `+254${digits}`;
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!AT_API_KEY || !AT_USERNAME) {
    res.status(500).json({ error: "Server is missing AFRICASTALKING_API_KEY or AFRICASTALKING_USERNAME. Add them in Vercel → Project Settings → Environment Variables, then redeploy." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing authorization token." });
    return;
  }
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  const { data: profile, error: profileErr } = await callerClient
    .from("staff_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile || !["Head Teacher", "Deputy Head Teacher"].includes(profile.role)) {
    res.status(403).json({ error: "Only the Head Teacher or Deputy Head Teacher can send SMS." });
    return;
  }

  const { message, recipients, batch } = req.body || {};

  // Batch mode: each recipient gets their own message text (used for exam
  // results, where every student's message is different). Africa's Talking
  // only accepts one message per "to" list per call, so this sends one
  // request per unique message — in small concurrent groups, so a class of
  // 30-40 doesn't take forever, but without hammering the API all at once.
  if (Array.isArray(batch)) {
    const items = batch
      .map((b) => ({ to: toE164(b.to), message: (b.message || "").trim() }))
      .filter((b) => b.to && b.message);
    if (items.length === 0) {
      res.status(400).json({ error: "No valid recipients in the batch." });
      return;
    }
    const results = [];
    const CHUNK = 8;
    try {
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        const chunkResults = await Promise.all(chunk.map(async (item) => {
          try {
            const atRes = await fetch(`${AT_BASE_URL}/version1/messaging`, {
              method: "POST",
              headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", apiKey: AT_API_KEY },
              body: new URLSearchParams({ username: AT_USERNAME, to: item.to, message: item.message }),
            });
            const data = await atRes.json();
            if (!atRes.ok) return { to: item.to, ok: false, error: data?.SMSMessageData?.Message || "Error" };
            const rec = data?.SMSMessageData?.Recipients?.[0];
            return { to: item.to, ok: true, cost: rec ? parseFloat(String(rec.cost || "0").replace(/[^\d.]/g, "")) || 0 : 0 };
          } catch (err) {
            return { to: item.to, ok: false, error: err.message };
          }
        }));
        results.push(...chunkResults);
      }
      const succeeded = results.filter((r) => r.ok);
      const totalCost = succeeded.reduce((s, r) => s + r.cost, 0);
      res.status(200).json({
        recipientCount: succeeded.length,
        failedCount: results.length - succeeded.length,
        costEstimate: succeeded.length ? `KES ${totalCost.toFixed(2)}` : null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Unexpected server error." });
    }
    return;
  }

  if (!message || !message.trim()) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  const numbers = (recipients || []).map(toE164).filter(Boolean);
  const uniqueNumbers = Array.from(new Set(numbers));
  if (uniqueNumbers.length === 0) {
    res.status(400).json({ error: "No valid phone numbers among the selected recipients." });
    return;
  }

  try {
    const atRes = await fetch(`${AT_BASE_URL}/version1/messaging`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: AT_API_KEY,
      },
      body: new URLSearchParams({ username: AT_USERNAME, to: uniqueNumbers.join(","), message }),
    });
    const data = await atRes.json();
    if (!atRes.ok) {
      res.status(atRes.status).json({ error: data?.SMSMessageData?.Message || "Africa's Talking returned an error." });
      return;
    }
    const recipientResults = data?.SMSMessageData?.Recipients || [];
    const totalCost = recipientResults.reduce((sum, r) => {
      const val = parseFloat(String(r.cost || "0").replace(/[^\d.]/g, ""));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    res.status(200).json({
      recipientCount: uniqueNumbers.length,
      costEstimate: recipientResults.length ? `KES ${totalCost.toFixed(2)}` : null,
      raw: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
