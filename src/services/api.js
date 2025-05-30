// LLMService base class
export class LLMService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  async generateContent(screenshotUrl, prompt, model, webpageContent) {
    throw new Error('Not implemented');
  }
}

// OpenAIService for OpenAI models
export class OpenAIService extends LLMService {
  async generateContent(screenshotUrl, prompt, model, webpageContent) {
    try {
      const base64Image = screenshotUrl ? screenshotUrl.split(",")[1] : null;
      
      // Prepare the content array
      const content = [
        { type: "text", text: prompt }
      ];

      // Add webpage content if available
      if (webpageContent) {
        const { content: text, metadata } = webpageContent;
        const contextText = `Webpage Context:\nTitle: ${metadata.title}\nURL: ${metadata.url}\n${metadata.description ? `Description: ${metadata.description}\n` : ''}${metadata.author ? `Author: ${metadata.author}\n` : ''}${metadata.date ? `Date: ${metadata.date}\n` : ''}\n\nContent:\n${text}`;
        content.push({ type: "text", text: contextText });
      }

      // Add image if available
      if (base64Image) {
        content.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64Image}` },
        });
      }

      const messages = [{ role: "user", content }];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4-vision-preview",
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
  async generateContent(screenshotUrl, prompt, model, webpageContent) {
    try {
      const parts = [];

      // Add webpage content if available
      if (webpageContent) {
        const { content: text, metadata } = webpageContent;
        const contextText = `Webpage Context:\nTitle: ${metadata.title}\nURL: ${metadata.url}\n${metadata.description ? `Description: ${metadata.description}\n` : ''}${metadata.author ? `Author: ${metadata.author}\n` : ''}${metadata.date ? `Date: ${metadata.date}\n` : ''}\n\nContent:\n${text}`;
        parts.push({ text: contextText });
      }

      // Add prompt
      parts.push({ text: prompt });

      // Add image if available
      if (screenshotUrl) {
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
      return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}
