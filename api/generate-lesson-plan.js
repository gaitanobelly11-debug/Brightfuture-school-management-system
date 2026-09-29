// POST /api/generate-lesson-plan
//
// Calls the Anthropic API server-side to draft a KICD-aligned CBC/CBE
// lesson plan from a strand and sub-strand. Holds ANTHROPIC_API_KEY
// server-side only (set in Vercel — never sent to the browser, never
// committed to source) and requires the caller to be a signed-in staff
// member first, so a stranger can't rack up API costs on this school's key.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://nravzlpapxolmzgjqwws.supabase.co";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_Kh5GWC2h_Ga0qe5RmA3LKw_4CWL6BIW";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-5";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel → Project Settings → Environment Variables, then redeploy." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing authorization token." });
    return;
  }
  // Any signed-in staff member can use this (it's a teaching resource, not
  // an admin tool) — this check just confirms it's a real session, so the
  // endpoint (and the API key behind it) can't be hit by an anonymous caller.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }

  const { grade, learningArea, strand, subStrand, duration, roll, specialInstructions } = req.body || {};
  if (!grade || !learningArea || !strand || !subStrand) {
    res.status(400).json({ error: "Grade, learning area, strand, and sub-strand are required." });
    return;
  }

  const prompt = `You are a Kenyan CBC/CBE curriculum expert helping a teacher prepare a KICD-aligned lesson plan.

Generate a lesson plan for:
- Grade/Class: ${grade}
- Learning Area: ${learningArea}
- Strand: ${strand}
- Sub-strand: ${subStrand}
- Lesson duration: ${duration || "35 minutes"}
- Class size (roll): ${roll || "not specified"}
${specialInstructions ? `- Special instructions from the teacher: ${specialInstructions}` : ""}

Respond with ONLY a JSON object (no markdown code fences, no commentary before or after) matching exactly this shape:
{
  "specificLearningOutcomes": ["...", "...", "..."],
  "keyInquiryQuestions": ["...", "..."],
  "coreCompetencies": ["...", "..."],
  "values": ["...", "..."],
  "organizationOfLearning": {
    "introduction": "...",
    "lessonDevelopment": ["step 1...", "step 2...", "step 3..."],
    "conclusion": "..."
  },
  "resources": ["...", "..."],
  "assessmentMethods": ["...", "..."],
  "extendedActivities": "..."
}

Follow KICD conventions: exactly three specific learning outcomes, each beginning "By the end of the lesson, the learner should be able to...", covering one knowledge outcome, one skill outcome, and one attitude/value outcome. Keep everything concrete and specific to the given strand and sub-strand — not generic filler.`;

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      res.status(aiRes.status).json({ error: data?.error?.message || "The AI service returned an error." });
      return;
    }
    const text = (data.content || []).map((b) => b.text || "").join("\n").trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let plan;
    try {
      plan = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: "The generated plan wasn't valid — please try again." });
      return;
    }
    res.status(200).json({ plan });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
