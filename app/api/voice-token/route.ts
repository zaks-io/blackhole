import { NextResponse } from 'next/server';

export async function GET() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return NextResponse.json({ error: 'Voice agent not configured' }, { status: 503 });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!response.ok) {
    const errorData = await response.text();
    console.error('ElevenLabs API error:', response.status, errorData);
    return NextResponse.json({ error: 'Failed to get token', details: errorData }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
