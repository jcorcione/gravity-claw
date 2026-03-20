import https from 'https';

https.get('https://openrouter.ai/api/v1/models', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const free = json.data.filter((m: any) => m.pricing && m.pricing.prompt === '0');
      console.log("Free gemini models:", free.map((m: any) => m.id).filter((id: string) => id.includes('gemini')));
      console.log("Free llama models:", free.map((m: any) => m.id).filter((id: string) => id.includes('llama')));
      console.log("Free models:", free.map((m: any) => m.id));
    } catch(e) { console.error(e); }
  });
});
