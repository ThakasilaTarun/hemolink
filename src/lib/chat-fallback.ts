type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const KNOWLEDGE = `
HEMO LINK helps hospitals manage blood inventory, emergency requests, donors, and donations.
Donors register at /auth, view "My Donations" and certificates in the donor portal.
Hospitals record donations under Donor Management; inventory updates automatically.
Minimum 90 days between donations (56 days for urgent alerts).
Blood groups: A+, A-, B+, B-, AB+, AB-, O+, O-.
Admin portal: /admin — manages all hospitals, donors, and requests.
`;

export function getLocalChatResponse(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const q = (last?.content ?? "").toLowerCase();

  if (!q.trim()) {
    return "Please type a question about HEMO LINK or blood donation.";
  }

  if (/hello|hi|hey|start/.test(q)) {
    return "Hello! I'm the HEMO LINK assistant (offline mode). Ask about registration, donations, eligibility, inventory, or emergency requests.";
  }

  if (/register|sign up|signup|account/.test(q)) {
    return "To register: open Login → Register, choose Donor or Hospital, fill details, and submit. Turn off email confirmation in Supabase if you hit rate limits.";
  }

  if (/login|sign in/.test(q)) {
    return "Use the Login tab at /auth. Donors go to /donor; hospitals and admins go to /dashboard. Admins use /admin.";
  }

  if (/donat|certificate|my donation/.test(q)) {
    return "Your donation history is under Donor Portal → My Donations. Hospitals record donations after you give blood; certificates appear when generated. If empty, no donation has been recorded yet for your account.";
  }

  if (/eligib|how often|interval|90|56/.test(q)) {
    return "Donors should wait at least 90 days between donations (about 56 days for urgent/critical requests). You must be 18–65, at least 50 kg, and in good health.";
  }

  if (/blood group|compatibility|o\+|ab\+/.test(q)) {
    return "O- is the universal donor. O+ can give to O+, A+, B+, AB+. AB+ can receive from all types. The platform matches requests to compatible donors automatically.";
  }

  if (/inventory|stock|units/.test(q)) {
    return "Hospitals track units per blood group in Blood Inventory. Recording a donation increases stock for that group.";
  }

  if (/emergency|urgent|alert|request/.test(q)) {
    return "Hospitals create blood requests with urgency levels. Matching donors may receive alerts. Donors see matching requests in the Blood Requests tab.";
  }

  if (/admin/.test(q)) {
    return "Admins sign in at /admin with an admin account. Setup: create user in Supabase Auth, then run supabase/SETUP_ADMIN.sql in SQL Editor.";
  }

  if (/ai|chatbot|not work/.test(q)) {
    return "Full AI chat needs the Supabase edge function deployed and HEMO_AI_API_KEY set. You're in offline help mode now — I can still answer common HEMO LINK questions.";
  }

  return `I'm in offline help mode (AI edge function not deployed).${KNOWLEDGE}\n\nYour question: "${last?.content}"\n\nTry asking about: registration, donations, eligibility, blood groups, inventory, or emergency requests.`;
}

export function isChatUnavailableStatus(status: number): boolean {
  return status === 404 || status === 502 || status === 503;
}
