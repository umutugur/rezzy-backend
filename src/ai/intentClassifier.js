// src/ai/intentClassifier.js
import { INTENT_DATASET, SUPPORTED_LANGUAGES } from "./intentDataset.js";

/**
 * Örnek vektör tipi:
 * - intent: "find_restaurant" vs
 * - lang: "tr" | "en" | ...
 * - text: örnek cümle
 * - vector: embedding (dizi)
 */
const EXAMPLES = [];

/** Embeddingler hazır mı? */
let embeddingsInitialized = false;

/**
 * Basit, tamamen lokal "pseudo-embedding" fonksiyonu.
 * - Hiçbir dış servise ihtiyaç yok.
 * - Aynı text her çağrıda aynı vektöre gider.
 * - Token hash + bucket mantığıyla sabit boyutlu bir vektör üretiyoruz.
 */

const EMBEDDING_DIM = 256;

/** Basit normalize: küçük harf + fazlalıkları temizle */
function normalize(text = "") {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:()[\]{}«»"“”'`´]/g, "")
    .trim();
}

/** Tokenize: boşluğa göre böl, boşları at */
function tokenize(text) {
  const norm = normalize(text);
  if (!norm) return [];
  return norm.split(" ").filter(Boolean);
}

/**
 * Çok basit hash: token karakter kodlarının toplamı → bucket index
 */
function hashToken(token) {
  let sum = 0;
  for (let i = 0; i < token.length; i++) {
    sum += token.charCodeAt(i);
  }
  return sum % EMBEDDING_DIM;
}

/**
 * "Embedding" üret:
 * - Boyutu EMBEDDING_DIM olan bir vektör
 * - Her token için ilgili bucket +1
 */
async function embedText(text, lang = "tr") {
  const tokens = tokenize(text);
  const vec = new Array(EMBEDDING_DIM).fill(0);

  for (const tok of tokens) {
    const idx = hashToken(tok + "|" + lang); // dile göre hafif ayrıştırma
    vec[idx] += 1;
  }

  return vec;
}

/**
 * Cosine similarity helper
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Uygulama ayağa kalkarken 1 kere çağrılacak:
 * - Intent dataset'teki tüm cümleleri embed edip hafızaya alır.
 */
export async function initIntentEmbeddings() {
  if (embeddingsInitialized) return;

  const intents = INTENT_DATASET.intents || {};
  const tasks = [];

  for (const [intent, langs] of Object.entries(intents)) {
    for (const [lang, sentences] of Object.entries(langs)) {
      if (!SUPPORTED_LANGUAGES.includes(lang)) continue;
      for (const text of sentences) {
        const ex = { intent, lang, text, vector: null };
        EXAMPLES.push(ex);
        tasks.push(
          (async () => {
            ex.vector = await embedText(text, lang);
          })()
        );
      }
    }
  }

  await Promise.all(tasks);
  embeddingsInitialized = true;
  console.log("[intent] embeddings initialized:", EXAMPLES.length, "examples");
}

/**
 * Kullanıcı mesajı için intent tahmini yapar.
 *
 * @param {string} message - Kullanıcı mesajı
 * @param {string} lang    - "tr" | "en" | "ru" | "el"
 * @returns {Promise<{ intent: string, confidence: number, matchedExample?: string }>}
 */
export async function classifyIntent(message, lang = "tr") {
  if (!embeddingsInitialized) {
    console.warn("[intent] initIntentEmbeddings() otomatik tetiklendi.");
    await initIntentEmbeddings();
  }

  if (!message || !message.trim()) {
    return { intent: "fallback", confidence: 0 };
  }

  const language = SUPPORTED_LANGUAGES.includes(lang) ? lang : "tr";

  const msgVec = await embedText(message, language);

  let best = null;

  for (const ex of EXAMPLES) {
    if (ex.lang !== language) continue;
    if (!ex.vector) continue;

    const score = cosineSimilarity(msgVec, ex.vector);

    if (!best || score > best.score) {
      best = { score, ex };
    }
  }

  if (!best) {
    return { intent: "fallback", confidence: 0 };
  }

  const confidence = best.score;
  const intent = best.ex.intent;
  const matchedExample = best.ex.text;

  // 🔻 Biraz düşürdüm: pseudo-embedding için 0.5 daha mantıklı
  const THRESHOLD = 0.5;
  if (confidence < THRESHOLD) {
    return {
      intent: "fallback",
      confidence,
      matchedExample,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[intent] classified:", {
      lang: language,
      intent,
      confidence: Number(confidence.toFixed(3)),
      matchedExample,
    });
  }

  return {
    intent,
    confidence,
    matchedExample,
  };
}