// src/controllers/chat.controller.js
import { pool } from "../db.js";
import fetch from "node-fetch";
// 💡 Import the necessary service functions
import {
  validateMessage,
  querySchedules,
} from "../services/chatbot.service.js";

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

    const messageLower = message.toLowerCase();

    // --- 1. Intent Check & Message Parsing ---
    // Detect and block creation intent
    const creationKeywords = [
      "create",
      "schedule",
      "book",
      "add",
      "make",
      "set up",
    ];
    const isCreationIntent = creationKeywords.some((keyword) =>
      messageLower.includes(keyword)
    );

    if (isCreationIntent) {
      return res.json({ reply: "Sorry, can't create exam via chatbot" });
    }

    // Parse the message into structured search criteria
    const parsedMessage = validateMessage(message);

    // --- 2. Database Lookup using Service Layer ---
    let schedules = [];

    // Check if the message contains ANY valid filter (date, time, venue, batch, or generic upcoming)
    if (
      parsedMessage.dateStr ||
      parsedMessage.timeStart ||
      parsedMessage.venueName ||
      parsedMessage.batchName ||
      parsedMessage.wantsUpcoming
    ) {
      // Use the advanced, structured query from the service for accurate time/venue filtering
      schedules = await querySchedules(parsedMessage);
    } else {
      // Fallback for simple, unstructured title search (e.g., "AI Workshop")
      const [results] = await pool.query(
        // Use the original simple LIKE query for unstructured text
        `SELECT title, venue_id, start_utc, end_utc FROM events
             WHERE LOWER(title) LIKE LOWER(?)
             UNION
             SELECT title, venue_id, start_utc, end_utc FROM exams
             WHERE LOWER(title) LIKE LOWER(?)
             LIMIT 5`,
        [`%${message}%`, `%${message}%`]
      );
      schedules = results;
    }

    // Format the context string for the LLM
    const context = JSON.stringify({ schedules }, null, 2);

    // --- 3. Send query to Gemini API ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set.");
      return res
        .status(500)
        .json({ error: "Internal server error: API Key missing." });
    }
    const GEMINI_MODEL = "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                // Prompt update: instructs the LLM on how to interpret results for availability
                text: `You are a helpful assistant that answers queries about university schedules.
If the user's message is a question about **availability** (e.g., 'Is F403 free...'), and the 'schedules' context is **empty**, reply 'Yes, it is free.' If the context contains results, reply with a polite summary of the conflict(s).
If the query is about **upcoming events**, summarize the events/exams listed in the context.
User message: ${message}
Database context:
${context}

Respond briefly and politely.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
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
