// src/controllers/chat.controller.js
import {
  queryAllSchedules,
  validateMessage,
} from "../services/chatbot.service.js";
import fetch from "node-fetch";

/**
 * POST /api/chatbot
 * Handles user messages and responds using Gemini API + database context
 */
export async function handleChat(req, res) {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    // --- 1. Intent Check & Message Parsing ---
    const creationKeywords = [
      "create",
      "schedule",
      "book",
      "add",
      "make",
      "set up",
    ];
    if (
      creationKeywords.some((keyword) =>
        message.toLowerCase().includes(keyword)
      )
    ) {
      return res.json({
        reply:
          "Sorry, I cannot create or schedule events. I can only check existing schedules.",
      });
    }

    // Extract the user's intended filters
    const parsedMessage = validateMessage(message);

    // --- 2. Database Lookup (Fetch All relevant schedules) ---
    // This fetches a large, time-zone corrected list.
    const allSchedules = await queryAllSchedules();

    // Format the context string for the LLM
    const context = JSON.stringify(
      {
        request: parsedMessage, // The AI uses this as the filter criteria
        schedules: allSchedules, // The AI filters this large, time-corrected list
      },
      null,
      2
    );

    // --- 3. Build and Log Gemini Request ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set.");
      return res
        .status(500)
        .json({ error: "Internal server error: API Key missing." });
    }
    const GEMINI_MODEL = "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              // CRITICAL PROMPT: Instruct the AI on how to filter the large context
              text: `You are an expert, professional, and friendly University Schedule Assistant built to efficiently check availability and summarize events. Your responses must be concise, polite, and clearly structured. Use emojis sparingly but appropriately to enhance clarity and tone.

              The 'schedules' context below contains ALL relevant events and exams. The times in 'local_start' and 'local_end' are ALREADY converted to IST (Local Time).
              
              Instructions for Filtering and Responding:
              FILTER: Use the 'request' fields (dateStr, timeStart, timeEnd, venueName, batchName) to filter the 'schedules'.
              
              AVAILABILITY (✅ Positive/Greeting): If the user asks for availability (e.g., 'is F403 free...') and you find NO conflicts based on the filters, reply with a positive greeting and a clear confirmation.
              
              Format: Hello! ✅ Yes, [Venue/Batch/Time] is free.
              
              CONFLICTS/SUMMARY (⚠️ Warning/Polite Conflict): If you find conflicts or the user asks for a summary, provide a polite, concise list of the conflicting events/exams. Always use the local time from the 'local_start'/'local_end' fields.
              
              Format:
              
              Hello! ⚠️ I found some scheduled events.
              [Event Type] | [Local Start] - [Local End] | [Event Name] | [Venue] | [Batch]
              [Event Type] | [Local Start] - [Local End] | [Event Name] | [Venue] | [Batch]
              SPECIFIC CHECK (🔍 Check/Confirmation): If the user asks about a specific event or exam, confirm its details if found, otherwise state it is not scheduled or cannot be found.
              
              Format (Found): Hello! 🔍 Yes, that is scheduled: then list the event's details concisely (Time, Venue, Batch).
              
              Format (Not Found): Hello! ❌ I could not find that specific event or exam in the schedule.
              
              NO SCHEDULES FOUND (❓ Empty Context): If the request fields are vague or lead to an empty list, and the user hasn't asked a specific availability/conflict question, respond politely by indicating that you need more information.
              
              Format: Hello! ❓ Could you please provide a specific date, time, or venue so I can check the schedule for you?
              
              User message: ${message}
              Database context (All Relevant Schedules: ${allSchedules.length}):
              ${context}
              
              Respond briefly, politely, and adhere strictly to the above formatting and icons.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    };

    // 📢 Log the entire request body to the console for inspection!
    console.log("--- DEBUG: AI Request Payload ---");
    console.log(JSON.stringify(requestBody, null, 2));
    console.log("----------------------------------");

    // --- 4. Send query to Gemini API ---
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Gemini API Error:", data.error.message);
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Sorry, I couldn’t understand that. The API may be unavailable or returned an error.";

    res.json({ reply });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
}
