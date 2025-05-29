// LLMService base class
export class LLMService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  async generateContent(screenshotUrl, prompt, model) {
    throw new Error('Not implemented');
  }
}

// OpenAIService for OpenAI models
export class OpenAIService extends LLMService {
  async generateContent(screenshotUrl, prompt, model) {
    try {
      const base64Image = screenshotUrl ? screenshotUrl.split(",")[1] : null;
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
          ],
        },
      ];
      if (base64Image) {
        messages[0].content.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64Image}` },
        });
      }
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages,
        }),
      });
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API Error:", error);
      throw error;
    }
  }
}

// GeminiService for Gemini models
export class GeminiService extends LLMService {
  async generateContent(screenshotUrl, prompt, model) {
    try {
      const parts = [];
      if (screenshotUrl) {
        // Parse data URL
        const match = screenshotUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            }
          });
        }
      }
      parts.push({ text: prompt });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      const body = { contents: [{ parts }] };
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }
      // Gemini returns candidates[0].content.parts[0].text
      return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}
