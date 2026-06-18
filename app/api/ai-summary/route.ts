import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { transcript } = await req.json();
        
        // 1. Check if there is any conversation to summarize
        if (!transcript || transcript.trim().length === 0) {
            return NextResponse.json({ 
                success: false, 
                error: "No conversation detected to summarize." 
            });
        }

        // 2. Fetch API Key from Environment Variables
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ 
                success: false, 
                error: "Gemini API Key is missing." 
            });
        }

        // 3. Initialize Gemini Pro Model
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        // 4. Strict Prompt to ensure 100% accuracy and prevent hallucinations
        const prompt = `
        You are a highly professional and strictly objective AI Meeting Assistant. 
        Below is the text transcript of a video meeting. 
        
        Your task:
        1. Write a clear, professional summary of the meeting.
        2. Extract a bulleted list of Action Items / To-Do list (if any).
        
        CRITICAL RULES:
        - ONLY use the information provided in the transcript below.
        - DO NOT make up, guess, or hallucinate ANY information, names, or events.
        - If the transcript is too short or doesn't have meaningful context, simply state: "The meeting was too short or lacked enough context to generate a detailed summary."
        - Format the output beautifully using Markdown (bold headings, bullet points).

        Meeting Transcript:
        """
        ${transcript}
        """
        `;

        // 5. Generate content from Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiSummary = response.text();

        return NextResponse.json({ success: true, summary: aiSummary });

    } catch (error) {
        console.error("AI Generation Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: "Failed to generate AI Summary. Please try again." 
        });
    }
}
