// Runs tests/*.test.html and smoke-loads examples/*.html in headless Chrome.
// Usage: npm test            (CHROME=/path/to/chrome to override the browser)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

const chromeCandidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];
const chrome = chromeCandidates.find(p => p && fs.existsSync(p));
if (!chrome) {
    console.error('Chrome not found. Set CHROME=/path/to/chrome.');
    process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsribbon-test-'));
const profile = path.join(tmp, 'profile');

// Loads one page; returns the dumped DOM and Chrome's stderr (which carries console output).
function load(file) {
    const r = spawnSync(chrome, [
        '--headless=new', '--disable-gpu', '--no-first-run',
        `--user-data-dir=${profile}`,
        '--allow-file-access-from-files',
        '--enable-logging=stderr', '--v=0',
        '--virtual-time-budget=5000',
        '--dump-dom', pathToFileURL(file).href
    ], { encoding: 'utf8', timeout: 60000 });
    return { dom: r.stdout || '', log: r.stderr || '' };
}

const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

let failed = 0;
let passed = 0;

// 1. Assertion suites: each page writes PASS/FAIL/ERROR lines into <pre id="out">.
const suites = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.html')).sort();
for (const f of suites) {
    const { dom } = load(path.join(__dirname, f));
    const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
    const lines = m ? unescape(m[1]).split('\n').filter(Boolean) : [];
    const bad = lines.filter(l => !l.startsWith('PASS '));
    const ok = lines.length - bad.length;
    passed += ok;
    if (!lines.length) {
        failed++;
        console.log(`FAIL ${f}: no results written`);
    } else if (bad.length) {
        failed += bad.length;
        console.log(`FAIL ${f}: ${ok}/${lines.length}`);
        bad.forEach(l => console.log('    ' + l));
    } else {
        console.log(`ok   ${f}: ${ok}/${lines.length}`);
    }
}

// 2. Examples smoke test: load each against the current src, fail on uncaught errors.
const exDir = path.join(tmp, 'examples');
fs.mkdirSync(exDir);
fs.copyFileSync(path.join(root, 'src', 'jsRibbon.js'), path.join(exDir, 'jsRibbon.js'));
const examples = fs.readdirSync(path.join(root, 'examples')).filter(f => f.endsWith('.html')).sort();
let exBad = 0;
for (const f of examples) {
    fs.copyFileSync(path.join(root, 'examples', f), path.join(exDir, f));
    const { log } = load(path.join(exDir, f));
    const errors = log.split('\n').filter(l => /CONSOLE.*"Uncaught/.test(l)).map(l => l.replace(/^.*?CONSOLE[^\]]*\]\s*/, ''));
    if (errors.length) {
        exBad++;
        failed++;
        console.log(`FAIL examples/${f}`);
        errors.forEach(l => console.log('    ' + l));
    }
}
console.log(`${exBad ? 'FAIL' : 'ok  '} examples: ${examples.length - exBad}/${examples.length} load without uncaught errors`);

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
