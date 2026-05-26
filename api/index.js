require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
// Import using standard fallback to catch any version variance in their SDK package
const ElevenLabsSDK = require('elevenlabs');
const ElevenLabsClient = ElevenLabsSDK.ElevenLabsClient || ElevenLabsSDK.default?.ElevenLabsClient;

const app = express();
app.use(express.json());

// Initialize AI clients with explicit error catching so it won't crash the server container if keys are missing
let openai;
let elevenlabs;

try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing' });
    if (typeof ElevenLabsClient === 'function') {
        elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || 'missing' });
    } else {
        console.error("ElevenLabsClient constructor not found in package.");
    }
} catch (e) {
    console.error("Initialization error:", e.message);
}

// User interface layout
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Play Rehearsal Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; margin: 0; padding: 30px; color: #333; }
        .container { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        h1 { margin-top: 0; color: #1a1a1a; font-size: 26px; }
        textarea { width: 100%; height: 180px; padding: 12px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-family: monospace; font-size: 14px; margin-bottom: 15px; resize: vertical; }
        button { background: #0076ff; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; }
        button:hover { background: #0060d6; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        #output { margin-top: 30px; border-top: 2px solid #f0f0f0; padding-top: 20px; display: none; }
        .line-card { background: #f8f9fa; border-left: 4px solid #0076ff; padding: 15px; margin-bottom: 12px; border-radius: 0 6px 6px 0; }
        .character { font-weight: bold; color: #0076ff; text-transform: uppercase; font-size: 14px; margin-bottom: 4px; }
        .direction { font-style: italic; color: #666; font-size: 13px; margin-bottom: 6px; }
        .play-btn { background: #28a745; width: auto; font-size: 14px; padding: 6px 12px; margin-top: 8px; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .play-btn:hover { background: #218838; }
        .status { margin-top: 10px; color: #666; font-size: 14px; text-align: center; font-weight: 500; }
    </style>
</head>
<body>

<div class="container">
    <h1>🎭 AI Play Rehearsal Engine</h1>
    <p>Paste your script segment below. The script engine parses out lines, identifies subtext, and routes performance directions to the vocal actors.</p>
    
    <textarea id="scriptInput" placeholder="MARK: You really thought you were driving the car?&#10;HELEN: (furious) I built this house, Mark! Every single brick!"></textarea>
    <button id="submitBtn" onclick="processScript()">Parse Script Timeline</button>
    <div id="statusMessage" class="status"></div>

    <div id="output">
        <h2>Manuscript Rehearsal Mode</h2>
        <div id="timelineContainer"></div>
    </div>
</div>

<script>
    async function processScript() {
        const scriptText = document.getElementById('scriptInput').value.trim();
        const btn = document.getElementById('submitBtn');
        const status = document.getElementById('statusMessage');
        
        if(!scriptText) return alert("Please input script text first.");
        
        btn.disabled = true;
        status.style.color = "#666";
        status.innerText = "Processing structured layout analysis via OpenAI...";
        
        try {
            const response = await fetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: scriptText })
            });
            
            const data = await response.json();
            if(!response.ok) throw new Error(data.error || "Execution error");

            const container = document.getElementById('timelineContainer');
            container.innerHTML = '';
            
            data.lines.forEach(item => {
                const card = document.createElement('div');
                card.className = 'line-card';
                card.innerHTML = \`
                    <div class="character">\${item.character}</div>
                    <div class="direction">Emotion Context: "\${item.emotion}"</div>
                    <div>"\${item.text}"</div>
                    <button class="play-btn" onclick="playLine(this, '\${encodeURIComponent(item.text)}', '\${encodeURIComponent(item.emotion)}')">🔊 Speak Line</button>
                \`;
                container.appendChild(card);
            });
            
            document.getElementById('output').style.display = 'block';
            status.innerText = "Script parsed successfully!";
        } catch(err) {
            status.style.color = "#dc3545";
            status.innerText = "Error: " + err.message;
        } finally {
            btn.disabled = false;
        }
    }

    async function playLine(btn, dialogue, emotion) {
        const originalText = btn.innerText;
        btn.innerText = "⚡ Projecting Voice...";
        btn.disabled = true;

        try {
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: decodeURIComponent(dialogue),
                    emotion: decodeURIComponent(emotion)
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Voice generation failed");
            }

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.play();
            
            audio.onended = () => {
                btn.innerText = originalText;
                btn.disabled = false;
            };
        } catch (err) {
            alert(err.message);
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
</script>
</body>
</html>
`;

// Interface Delivery Route
app.get('/', (req, res) => {
    res.send(htmlContent);
});

// Endpoint 1: Structured Text Context Extraction Router
app.post('/api/parse', async (req, res) => {
    try {
        if (!openai || process.env.OPENAI_API_KEY === 'missing') {
            return res.status(500).json({ error: "OpenAI API key is missing or not configured in Vercel environment variables." });
        }
        
        const { script } = req.body;
        if (!script) {
            return res.status(400).json({ error: "Missing script payload context data" });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: "Parse the script text into a strict JSON format object containing a single root array property named 'lines'. Every object in the 'lines' array must possess these exact string parameters keys: 'character', 'text', and 'emotion'." 
                },
                { role: "user", content: script }
            ],
            response_format: { type: "json_object" }
        });

        const outputData = JSON.parse(completion.choices[0].message.content);
        res.json(outputData);
    } catch (error) {
        res.status(500).json({ error: "OpenAI Parser Failed: " + error.message });
    }
});

// Endpoint 2: Expressive Vocal Performance Router
app.post('/api/speak', async (req, res) => {
    try {
        if (!elevenlabs) {
            return res.status(500).json({ error: "ElevenLabs client failed to initialize or package import style mismatch." });
        }
        if (process.env.ELEVENLABS_API_KEY === 'missing') {
            return res.status(500).json({ error: "ElevenLabs API key is missing from Vercel environment variables." });
        }

        const { text, emotion } = req.body;
        if (!text) {
            return res.status(400).json({ error: "Text field content required for speech" });
        }

        const PRESET_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; 

        const audioStream = await elevenlabs.generate({
            voice: PRESET_VOICE_ID,
            text: `[Tone: ${emotion || 'neutral'}] ${text}`,
            model_id: "eleven_v3"
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        audioStream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: "ElevenLabs Generation Failed: " + error.message });
    }
});

module.exports = app;
