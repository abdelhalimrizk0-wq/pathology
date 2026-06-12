import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini client to keep startup safe
let aiInstance: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey || "PLACEHOLDER_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiInstance;
}

// Translate endpoint
app.post("/api/translate", async (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing string parameter 'text'" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Return a simulated high-quality offline fallback notice or simulation for testing
      res.json({
        translatedText: `[ترجمة تجريبية - يرجى تفعيل مفتاح API] ${text} (هذه ترجمة محاكاة لأن مفتاح GEMINI_API_KEY غير متوفر حالياً)`,
        isMock: true
      });
      return;
    }

    const ai = getGemini();
    const systemPrompt = `You are a professional medical translator specializing in pathology.
Translate the following English pathology exam question or option into accurate, natural medical Arabic so it can be easily understood by a medical student.
Keep key English medical terms in parentheses next to their Arabic translation where helpful (e.g. "Catarrhal Inflammation (الالتهاب النزلي)").
Do NOT give any introductory remarks or explanations. Return ONLY the translated Arabic text.`;

    const contents = context 
      ? `Text to translate: "${text}"\nContext of the question: "${context}"`
      : text;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3
      }
    });

    const translatedText = response.text?.trim() || "";
    res.json({ translatedText, isMock: false });
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error?.message || "Internal server error during translation" });
  }
});

// Configure Vite or Static Assets serving
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite hot-reload middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode serving static dist files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error("Failed to start Vite middleware server:", err);
});
