import { ChatOpenAI } from "@langchain/openai";
import { tool } from "langchain";
import { z } from "zod";
import { createAgent } from "langchain";

const model = new ChatOpenAI({
    model: "gpt-4.1",
});


const createCalendarEvent = tool(
    async ({ title, startTime, endTime, attendees, location }) => {
        // Stub: In practice, this would call Google Calendar API, Outlook API, etc.
        return `Event created: ${title} from ${startTime} to ${endTime} with ${attendees.length} attendees`;
    },
    {
        name: "create_calendar_event",
        description: "Create a calendar event. Requires exact ISO datetime format.",
        schema: z.object({
            title: z.string(),
            startTime: z.string().describe("ISO format: '2024-01-15T14:00:00'"),
            endTime: z.string().describe("ISO format: '2024-01-15T15:00:00'"),
            attendees: z.array(z.string()).describe("email addresses"),
            location: z.string().optional(),
        }),
    }
);

const sendEmail = tool(
    async ({ to, subject, body, cc }) => {
        // Stub: In practice, this would call SendGrid, Gmail API, etc.
        return `Email sent to ${to.join(', ')} - Subject: ${subject}`;
    },
    {
        name: "send_email",
        description: "Send an email via email API. Requires properly formatted addresses.",
        schema: z.object({
            to: z.array(z.string()).describe("email addresses"),
            subject: z.string(),
            body: z.string(),
            cc: z.array(z.string()).optional(),
        }),
    }
);

const getAvailableTimeSlots = tool(
    async ({ attendees, date, durationMinutes }) => {
        // Stub: In practice, this would query calendar APIs
        return ["09:00", "14:00", "16:00"];
    },
    {
        name: "get_available_time_slots",
        description: "Check calendar availability for given attendees on a specific date.",
        schema: z.object({
            attendees: z.array(z.string()),
            date: z.string().describe("ISO format: '2024-01-15'"),
            durationMinutes: z.number(),
        }),
    }
);








const CALENDAR_AGENT_PROMPT = `
You are a calendar scheduling assistant.
Parse natural language scheduling requests (e.g., 'next Tuesday at 2pm')
into proper ISO datetime formats.
Use get_available_time_slots to check availability when needed.
Use create_calendar_event to schedule events.
Always confirm what was scheduled in your final response.
`.trim();

/**
 * calender agnet
 */

const calendarAgent = createAgent({
    model: model,
    tools: [createCalendarEvent, getAvailableTimeSlots],
    systemPrompt: CALENDAR_AGENT_PROMPT,
});



const EMAIL_AGENT_PROMPT = `
You are an email assistant.
Compose professional emails based on natural language requests.
Extract recipient information and craft appropriate subject lines and body text.
Use send_email to send the message.
Always confirm what was sent in your final response.
`.trim();

const emailAgent = createAgent({
    model: model,
    tools: [sendEmail],
    systemPrompt: EMAIL_AGENT_PROMPT,
});

const CONTACT_AGENT_PROMPT = `
You are an contact assistant.
Find or create contact record as per requirement.
Use get_contact to get the contact list.
`.trim();

const getContacts = tool(
    async ({ search }) => {
        
        return JSON.stringify([
            { id: 1, team: "design", name: "nikhil", email: "nikhilkumar@gmail.com" },
            { id: 2, team: "design", name: "yuvraj", email: "yuvrajkumar@gmail.com" },
            { id: 2, team: "development", name: "karan", email: "karankumar@gmail.com" }
        ]);
    },
    {
        name: "get_contacts",
        description: "Get contact lists.",
        schema: z.object({
            search: z.string().describe("search query for the contact. e.g: design or nikhil")
        })
    }
)

const contactAgent = createAgent({
    model: model,
    tools: [getContacts],
    systemPrompt: CONTACT_AGENT_PROMPT,
});

async function main() {
    // const query = `Schedule a team meeting next Tuesday at 2pm for 1 hour.
    // there is no attendees for now, and use all default setting.Just crerate an event.`;

    // const stream = await calendarAgent.stream({
    //     messages: [{ role: "user", content: query }]
    // });

    // for await (const step of stream) {
    //     for (const update of Object.values(step)) {
    //         if (update && typeof update === "object" && "messages" in update) {
    //             for (const message of update.messages) {
    //                 console.log(message.toFormattedString());
    //             }
    //         }
    //     }
    // }




    const query = `Send the design team a reminder about reviewing the new mockups`;

    const stream = await emailAgent.stream({
        messages: [{ role: "user", content: query }]
    });

    for await (const step of stream) {
        for (const update of Object.values(step)) {
            if (update && typeof update === "object" && "messages" in update) {
                for (const message of update.messages) {
                    console.log(message.toFormattedString());
                }
            }
        }
    }
};

main();