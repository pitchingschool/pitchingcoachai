import crypto from "crypto";

/**
 * Adds or updates a PitchingCoachAI lead in the Mailchimp audience so the
 * weekly marketing emails can target new signups automatically.
 *
 * Needs two Netlify environment variables:
 *   MAILCHIMP_API_KEY   (ends in -us13, the data center is read from it)
 *   MAILCHIMP_LIST_ID   (Audience > Settings > Audience name and defaults > Audience ID)
 * If either is missing this is a silent no-op, so signups never break.
 */
export async function syncLeadToMailchimp(lead: {
  email: string;
  firstName?: string;
  age?: number | null;
  score?: number | null;
}) {
  const key = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!key || !listId) return { skipped: true };

  const dc = key.split("-").pop();
  const email = lead.email.trim().toLowerCase();
  const hash = crypto.createHash("md5").update(email).digest("hex");
  const base = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}`;
  const auth = "Basic " + Buffer.from(`pcai:${key}`).toString("base64");

  const month = new Date().toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" });
  const tags = ["PitchingCoachAI", "PCAI Public", `PCAI Signup ${month}`];
  if (lead.age != null && lead.age < 13) tags.push("PCAI Under 13");

  try {
    const put = await fetch(base, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: lead.firstName ? { FNAME: lead.firstName } : {},
      }),
    });
    if (!put.ok) {
      console.error("[Mailchimp] upsert failed:", put.status, await put.text());
      return { ok: false };
    }
    const tagRes = await fetch(`${base}/tags`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: tags.map((name) => ({ name, status: "active" })) }),
    });
    if (!tagRes.ok) console.error("[Mailchimp] tag failed:", tagRes.status, await tagRes.text());
    return { ok: true };
  } catch (err) {
    console.error("[Mailchimp] sync error:", err);
    return { ok: false };
  }
}
