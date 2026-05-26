const express = require('express');
const OpenAI = require('openai');
const { ElevenLabsClient } = require('elevenlabs');

const app = express();
app.use(express.json());

// Initialize AI Clients using secure cloud environment variables
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// HTML Interface
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>AI Play Rehearsal</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f4f5f7; padding: 20px; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        textarea { width: 100%; height: 150px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
        button { background: #0076ff; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold; margin-top: 10px; }
        .line-card { background: #f8f9fa; border-left: 4px solid #0076ff; padding: 12px; margin-top: 10px; border-radius: 4px; }
        .play-btn { background: #28a745; width: auto; padding: 6px 12px; font-size: 13px; }
    </style>
</head>
<body>
<div class="container">
    <h1>🎭 AI Play Rehearsal</h1>
    <textarea id="scriptInput" placeholder="MARK: You really thought you were driving the car?&#10;HELEN: (furious) I built this house, Mark!"></textarea>
    <button id="parseBtn" onclick="parseScript()">Parse Script</button>
    <div id="status" style="margin-top:10px; color:#666;"></div>
    <div id="timeline" style="margin-top:20px;"></div>
</div>

<script>
    async function parseScript() {
        const text = document.getElementById('scriptInput').value;
        document.getElementById('status').innerText = "Analyzing script with AI...";
        const res = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: text })
        });
        const data = await res.json();
        
        const container = document.getElementById('timeline');
        container.innerHTML = '';
        data.lines.forEach(line => {
            const div = document.createElement('div');
            div.className = 'line-card';
            div.innerHTML = '<strong>' + line.character + '</strong> <em>(' + line.emotion + ')</em>:<br>' + line.text + '<br><button class="play-btn" onclick="playLine(this, \'' + encodeURIComponent(line.text) + '\', \'' + encodeURIComponent(line.emotion) + '\')">🔊 Play Line</button>';
            container.appendChild(div);
        });
        document.getElementById('status').innerText = "Ready!";
    }

    async function playLine(btn, text, emotion) {
        btn.innerText = "⏳ Speaking...";
        const res = await fetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: decodeURIComponent(text), emotion: decodeURIComponent(emotion) })
        });
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        audio.onended = () => { btn.innerText = "🔊 Play Line"; };
    }
</script>
</body>
</html>
`;

// Serve the Web Interface
app.get('/', (req, res) => res.send(htmlContent));

// API 1: Parse the script text into clean lines
app.post('/api/parse', async (req, res) => {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "Parse the script text into a JSON object with a single array property named 'lines'. Each item in 'lines' must have 'character', 'text', and 'emotion' string properties." },
            { role: "user", content: req.body.script }
        ],
        response_format: { type: "json_object" }
    });
    res.json(JSON.parse(completion.choices[0].message.content));
});

// API 2: Turn text into emotional speech
app.post('/api/speak', async (req, res) => {
    const { text, emotion } = req.body;
    const audioStream = await elevenlabs.generate({
        voice: "21m00Tcm4TlvDq8ikWAM", // Standard express voice
        text: `[Tone: ${emotion}] ${text}`,
        model_id: "eleven_v3"
    });
    audioStream.pipe(res);
});

module.exports = app;
