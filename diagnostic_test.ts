import fetch from 'node-fetch';

async function test() {
    console.log("--- Testing ElevenLabs API ---");
    const elKey = "sk_3010c605d1e5b37431767546766b1ee7c443fbf44352950d";
    const voiceId = "2EsgRiyQL1INfP0QD8HP";
    
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
            method: 'POST',
            headers: {
                'xi-api-key': elKey,
                'Content-Type': 'application/json',
                'accept': 'audio/mpeg'
            },
            body: JSON.stringify({
                text: "Test script for diagnostic purposes.",
                model_id: "eleven_monolingual_v1"
            })
        });
        
        console.log(`ElevenLabs Status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            const err = await response.text();
            console.log("ElevenLabs Error:", err);
        } else {
            console.log("ElevenLabs: OK");
        }
    } catch (err) {
        console.log("ElevenLabs Fetch Error:", err.message);
    }

    console.log("\n--- Testing Flask Assemble Endpoint Local ---");
    try {
        const response = await fetch('http://127.0.0.1:5055/assemble', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_path: 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/output/gravity_claw_thumb_00003_.png',
                audio_path: 'C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/output/temp_aba58833231a4495887a8f5d3d05399c.wav',
                effect: 'zoom_in',
                subtitle: 'Diagnostic test'
            })
        });
        console.log(`Flask Status: ${response.status} ${response.statusText}`);
        const resBody = await response.json();
        console.log("Flask Response:", JSON.stringify(resBody, null, 2));
    } catch (err) {
        console.log("Flask Fetch Error:", err.message);
    }
}

test();
