import { ChatOpenAI } from "@langchain/openai";
import { tool } from "langchain";
import { z } from "zod";
import { createAgent } from "langchain";
import readline from 'node:readline/promises';
import { MemorySaver } from '@langchain/langgraph';

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


const scheduleEvent = tool(
    async ({ request }) => {
        const result = await calendarAgent.invoke({
            messages: [{ role: "user", content: request }]
        });
        const lastMessage = result.messages[result.messages.length - 1];
        return lastMessage?.text;
    },
    {
        name: "schedule_event",
        description: `
Schedule calendar events using natural language.

Use this when the user wants to create, modify, or check calendar appointments.
Handles date/time parsing, availability checking, and event creation.

Input: Natural language scheduling request (e.g., 'meeting with design team next Tuesday at 2pm')
    `.trim(),
        schema: z.object({
            request: z.string().describe("Natural language scheduling request"),
        }),
    }
);

const manageEmail = tool(
    async ({ request }) => {
        const result = await emailAgent.invoke({
            messages: [{ role: "user", content: request }]
        });
        const lastMessage = result.messages[result.messages.length - 1];
        return lastMessage?.text;
    },
    {
        name: "manage_email",
        description: `
Send emails using natural language.

Use this when the user wants to send notifications, reminders, or any email communication.
Handles recipient extraction, subject generation, and email composition.

Input: Natural language email request (e.g., 'send them a reminder about the meeting')
    `.trim(),
        schema: z.object({
            request: z.string().describe("Natural language email request"),
        }),
    }
);

const manageContacts = tool(
    async ({ request }) => {
        const result = await contactAgent.invoke({
            messages: [{ role: 'user', content: request }],
        });
        const lastMessage = result.messages[result.messages.length - 1];
        return lastMessage?.text;
    },
    {
        name: 'manage_contacts',
        description: `
Get contacts using natural language.

Use this when the user wants to get list of contacts or even single contact.

Input: Natural language contact request (e.g., 'give me all contacts for design team.')
    `.trim(),
        schema: z.object({
            request: z.string().describe('Natural language contact list request'),
        }),
    }
);

const SUPERVISOR_PROMPT = `
You are a helpful personal assistant.
You can schedule calendar events and send emails.
To send emails/notifications, first call the manage_contacts tool to get email addresses.
Break down user requests into appropriate tool calls and coordinate the results.
When a request involves multiple actions, use multiple tools in sequence. Make sure to call the tools in correct order.
`.trim();

const supervisorAgent = createAgent({
    model: model,
    tools: [scheduleEvent, manageEmail, manageContacts],
    systemPrompt: SUPERVISOR_PROMPT,
    checkpointer: new MemorySaver(),
});

async function main() {
    const config = { configurable: { thread_id: '1' } };

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {
        // const query = `Schedule a design team standup for tomorrow at 9am.
        // Send everyone on design team the email about it`;

        const query = await rl.question('You: ');

        const stream = await supervisorAgent.stream(
            {
                messages: [{ role: 'user', content: query }],
            },
            config
        );

        for await (const step of stream) {
            for (const update of Object.values(step)) {
                if (update && typeof update === 'object' && 'messages' in update) {
                    for (const message of update.messages) {
                        console.log(message.toFormattedString());
                    }
                }
            }
        }
    }

    // const query = `Schedule a team meeting next Tuesday at 2pm for 1 hour.
    // there is no attendees for now, and use all default settings. Just create an event.`;

    // const stream = await calendarAgent.stream({
    //     messages: [{ role: 'user', content: query }],
    // });

    // for await (const step of stream) {
    //     for (const update of Object.values(step)) {
    //         if (update && typeof update === 'object' && 'messages' in update) {
    //             for (const message of update.messages) {
    //                 console.log(message.toFormattedString());
    //             }
    //         }
    //     }
    // }

    // const query = 'what is the email id of Sujoy?';

    // const stream = await contactAgent.stream({
    //     messages: [{ role: 'user', content: query }],
    // });

    // for await (const step of stream) {
    //     for (const update of Object.values(step)) {
    //         if (update && typeof update === 'object' && 'messages' in update) {
    //             for (const message of update.messages) {
    //                 console.log(message.toFormattedString());
    //             }
    //         }
    //     }
    // }
}

main();