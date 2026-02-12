// src/ai/llmClient.js
import axios from "axios";

const FALLBACK_LANG = "tr";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models";

const HF_MODEL = process.env.HF_MODEL || "bigscience/bloomz-7b1";
const HF_BASE_URL =
  process.env.HF_BASE_URL || "https://api-inference.huggingface.co/models";

/**
 * Ortak system prompt – tüm modeller için
 */
// src/ai/llmClient.js

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  const lines = history
    .map((m) => `- ${m.role}: ${String(m.text || "").replace(/\s+/g, " ").trim()}`)
    .filter(Boolean)
    .slice(-8);
  if (!lines.length) return "";
  return `\n=== CONVERSATION HISTORY (most recent) ===\n${lines.join("\n")}\n`;
}

function buildSystemPrompt(lang, intent, history) {
  const historyBlock = formatHistory(history);
  return `
You are "Rezvix Assistant", a strict, task-focused multilingual assistant for the Rezvix restaurant reservation app.

=== APP CONTEXT ===
- Rezvix helps users discover venues (restaurants, taverns, meyhanes, cafés) and make reservations.
- Users can make normal or deposit-based reservations.
- Payments: card, cash, or bank transfer with receipt upload (depends on venue).
- Target regions: Cyprus, Greece, Turkey, UK.
- You must answer ONLY in the user's language: ${lang}.
- Tone: short, clear, friendly and practical (max 3–4 sentences), no chit-chat unless the user clearly wants it.

=== INTENT (approximate) ===
${intent || "unknown"}

=== SPECIAL BEHAVIOUR FOR PLACE / RESERVATION QUERIES ===
If the intent is about finding a place or making a reservation
("find_restaurant", "make_reservation", "filter_restaurant", "modify_reservation"):

1. Extract from the user message if present:
   - city / area (e.g. "Girne", "Lefkoşa", "Gazimağusa")
   - date (today, tomorrow, a specific day)
   - time or time range (e.g. 20:00, 19:00–22:00, "akşam")
   - people count (e.g. 4 persons)
   - budget level (₺, ₺₺, ₺₺₺) inferred from words like "ucuz", "orta", "pahalı"
   - venue type / style (meyhane, balıkçı, steakhouse, canlı müzik, vb.)

2. ALWAYS behave like a slot-filling wizard:
   - First sentence: briefly summarize what you understood.
     Example (TR): "Şöyle anladım: Girne'de 4 kişi için bir yer arıyorsun."
   - Then explicitly ask 1–2 missing details (NOT all at once).
     Example (TR): "Hangi gün ve saat aralığında olsun? Fiyat seviyesi nasıl olsun (₺ / ₺₺ / ₺₺₺)?"

3. Use "suggestions" as quick buttons for those missing details.
   Examples (TR, you must localize to ${lang}):
   - If date missing: "Bu akşam", "Yarın", "Bu hafta sonu"
   - If time missing: "19:00", "20:00", "21:00–23:00"
   - If budget missing: "₺ (uygun fiyat)", "₺₺ (orta seviye)", "₺₺₺ (yüksek seviye)"
   - If style missing: "Meyhane", "Balıkçı", "Canlı müzik"

4. When you believe all key info is present (city + people + some date/time),
   you MUST offer at least one suggestion whose "message" is a special command
   that the mobile app can parse to open the listing screen:

   {
     "label": "Girne’de mekanları göster",
     "message": "@search city=Girne;people=4;date=yarın;timerange=20:00-23:00;budget=₺₺;style=meyhane"
   }

   Rules for this:
   - Always start the command with "@search ".
   - Use semicolon-separated key=value pairs (keys: city, people, date, timerange, budget, style).
   - Values can be short natural text (e.g. "yarın", "bu aksam", "orta").
   - Still keep a normal natural-language "reply" that explains what will happen.

The assistant MUST NOT invent real restaurant names or fake availability.
Instead, it should say that Rezvix will show matching venues on the map / list
and provide the "@search ..." suggestion so the app can navigate.

=== GENERAL RULES ===
- Always answer ONLY in language ${lang}.
- Be concrete and useful. Avoid vague marketing talk.
- Do NOT reintroduce yourself in every answer. A short re-intro is allowed only in the first reply.
- If the user asks something unrelated to Rezvix or restaurants, politely say that you are focused on Rezvix and steer back to venues/reservations/payments.

=== OUTPUT FORMAT (VERY IMPORTANT) ===
You MUST respond ONLY with valid minified JSON in this exact shape:

{
  "reply": "text the user will see",
  "suggestions": [
    { "label": "Short button text", "message": "message that will be sent if user taps the suggestion" }
  ]
}

- No markdown.
- No explanations.
- No extra top-level fields besides "reply" and "suggestions".
- "suggestions" can be [] or 1–3 items.
- "reply" must be in language ${lang}.
${historyBlock}`.trim();
}
/**
 * Gelen LLM text çıktısını JSON'a çevirmeye çalış.
 * Bozulursa -> sade reply sar.
 */
function safeParseLlmJson(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return {
      reply: "Şu anda asistan cevabını oluşturamadım. Birazdan tekrar dener misin?",
      suggestions: [],
    };
  }

  // Bazı modeller code block ile döndürebilir, onları temizle
  const cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    const obj = JSON.parse(cleaned);
    const reply = String(obj.reply || "").trim();
    const suggestions = Array.isArray(obj.suggestions) ? obj.suggestions : [];
    if (!reply) {
      return {
        reply:
          "Şu anda asistan cevabını oluşturamadı. Birazdan tekrar denemeni rica edeceğim.",
        suggestions: [],
      };
    }
    return { reply, suggestions };
  } catch (e) {
    // JSON değilse komple text'i reply yap
    return {
      reply: cleaned,
      suggestions: [],
    };
  }
}

/**
 * Gemini çağrısı (TR/EN için)
 */
async function generateWithGemini({ message, lang, intent, history }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[assistant][gemini] GEMINI_API_KEY tanımlı değil.");
    return null;
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const systemPrompt = buildSystemPrompt(lang, intent, history);

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\nUser message:\n${message}`,
          },
        ],
      },
    ],
  };

  try {
    const resp = await axios.post(url, body, {
      timeout: 8000,
    });

    const text =
      resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = safeParseLlmJson(text);
    return { ...parsed, provider: "gemini" };
  } catch (err) {
    console.error("[assistant][gemini] error:", err?.response?.data || err);
    return null;
  }
}

/**
 * HuggingFace Inference API (RU / EL için)
 */
async function generateWithHuggingFace({ message, lang, intent, history }) {
  const token = process.env.HF_API_KEY;
  if (!token) {
    console.warn("[assistant][hf] HF_API_KEY tanımlı değil.");
    return null;
  }

  const url = `${HF_BASE_URL}/${encodeURIComponent(HF_MODEL)}`;

  const systemPrompt = buildSystemPrompt(lang, intent, history);

  const prompt = `${systemPrompt}\n\nUser message:\n${message}\n\nJSON:`;

  try {
    const resp = await axios.post(
      url,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 256,
          temperature: 0.3,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 12000,
      }
    );

    // Çoğu text-generation modeli şöyle döner:
    // [ { generated_text: "..." } ]
    const data = resp.data;
    let text = "";

    if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
      text = data[0].generated_text;
      // Bazı modeller prompt + output birleştirir, son JSON'u yakalamaya çalış
      const jsonStart = text.lastIndexOf("{");
      if (jsonStart !== -1) {
        text = text.slice(jsonStart);
      }
    } else if (typeof data === "string") {
      text = data;
    } else {
      text = JSON.stringify(data);
    }

    const parsed = safeParseLlmJson(text);
    return { ...parsed, provider: "huggingface" };
  } catch (err) {
    console.error("[assistant][hf] error:", err?.response?.data || err);
    return null;
  }
}

/**
 * Ana router:
 * - tr / en → Gemini
 * - ru / el → HuggingFace
 * - Error olursa: null döner, controller fallback'e geçer
 */
export async function generateAssistantReply({ message, lang, intent, history }) {
  const L = (lang || FALLBACK_LANG).toLowerCase();

  if (L === "tr" || L === "en") {
    const r = await generateWithGemini({ message, lang: L, intent, history });
    if (r) return r;
  } else if (L === "ru" || L === "el") {
    const r = await generateWithHuggingFace({ message, lang: L, intent, history });
    if (r) return r;
  }

  // Her ihtimale karşı hiçbir şey dönmediyse:
  return null;
}
