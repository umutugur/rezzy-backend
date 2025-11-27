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
function buildSystemPrompt(lang, intent) {
  return `
You are "Rezzy Assistant", a helpful multilingual assistant for the Rezzy restaurant reservation app.

App context:
- Rezzy helps users discover venues (restaurants, taverns, meyhanes, cafés).
- Users can make normal or deposit-based reservations.
- Payments: card, cash, or bank transfer with receipt upload (depends on venue).
- Target regions: Cyprus, Greece, Turkey, UK.
- You must answer ONLY in the user's language: ${lang}.
- Be short, clear, friendly and practical (max 4 sentences).
- If user seems to ask about places, reservations, payments or policies, answer with concrete guidance inside the app.

Detected intent (may be approximate): ${intent || "unknown"}.

You MUST respond ONLY with valid minified JSON in this exact shape:

{
  "reply": "text the user will see",
  "suggestions": [
    { "label": "Short button text", "message": "message that will be sent if user taps the suggestion" }
  ]
}

Rules:
- Do NOT include any markdown.
- Do NOT include explanations or extra fields.
- "suggestions" can be empty array, or 1–3 items.
- "reply" must be in language ${lang}.
`.trim();
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
async function generateWithGemini({ message, lang, intent }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[assistant][gemini] GEMINI_API_KEY tanımlı değil.");
    return null;
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const systemPrompt = buildSystemPrompt(lang, intent);

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
async function generateWithHuggingFace({ message, lang, intent }) {
  const token = process.env.HF_API_KEY;
  if (!token) {
    console.warn("[assistant][hf] HF_API_KEY tanımlı değil.");
    return null;
  }

  const url = `${HF_BASE_URL}/${encodeURIComponent(HF_MODEL)}`;

  const systemPrompt = buildSystemPrompt(lang, intent);

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
export async function generateAssistantReply({ message, lang, intent }) {
  const L = (lang || FALLBACK_LANG).toLowerCase();

  if (L === "tr" || L === "en") {
    const r = await generateWithGemini({ message, lang: L, intent });
    if (r) return r;
  } else if (L === "ru" || L === "el") {
    const r = await generateWithHuggingFace({ message, lang: L, intent });
    if (r) return r;
  }

  // Her ihtimale karşı hiçbir şey dönmediyse:
  return null;
}