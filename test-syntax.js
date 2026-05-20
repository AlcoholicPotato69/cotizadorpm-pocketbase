const fs = require('fs');
const html = fs.readFileSync('frontend/client/index.html', 'utf8');
const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
let i = 1;
for (const match of scriptMatches) {
    if (match[1].trim() === '') continue;
    fs.writeFileSync(`test-script-${i}.js`, match[1]);
    try {
        require('child_process').execSync(`node -c test-script-${i}.js`);
        console.log(`Script ${i} syntax ok`);
    } catch (e) {
        console.error(`Script ${i} syntax error!`);
    }
    i++;
}
