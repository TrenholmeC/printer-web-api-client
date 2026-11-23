const {execSync, spawn} = require('node:child_process');
const CONFIG = require("./config.json");
const SCRIPTS = require("./scripts.json");
let print_jobs = [];
let printing = false;

const datef = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
}).format;

async function post(path, data) {
    return await fetch(CONFIG.api+path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ _key: CONFIG.key, ...data })
    });
}

async function image_post(path, data) {
    await fetch(CONFIG.api+path, {
        method: 'POST',
        headers: {
            'Content-Type': 'image/png',
            'Content-Length': data.length
        },
        body: data
    });
}

setInterval(async () => {
    let res = await post("printer/poll", {});

    if(res.status == 200) {
        let new_jobs = await res.json();
        for(const job of new_jobs) {
            if(Object.hasOwn(SCRIPTS, job.script)) {
                let preview = execSync(`{ printf "%%!PS\n/PAuthor (<From: ${job.user} @ ${datef(new Date(job.time))}>) def /PText <${Buffer.from(`${job.args.text}`, 'utf8').toString('hex')}> def /PRed ${job.args.red/255} def /PGreen ${job.args.green/255} def /PBlue ${job.args.blue/255} def\n"; cat ./postscript/single-color-text.ps; } | gs -dSAFER -dBATCH -dNOPAUSE -q -sDEVICE=png16m -r150 -dFirstPage=1 -dLastPage=1 -sOutputFile=- -`, { maxBuffer: 1024 * 1024 * 20  })
                await image_post(`printer/preview/${job.id}`, preview);
                await post(`printer/update/${job.id}`, {status: "PIQ"});
                job.status = "PIQ";
                print_jobs.push(job);
            } else {
                await post(`printer/update/${job.id}`, {status: "RUS"});
            }
        }
    }

    let job = print_jobs[0];

    if(printing) {
        let status = execSync(`ipptool -c ${CONFIG.ipp} ./job-info.test | awk -F, '$2 == "${job.id}" {print $3}'`, {encoding: "utf-8"});
        if(status.includes("completed")) {
            await post(`printer/update/${job.id}`, {status: "CSP"});
            print_jobs.shift();
            printing = false;
        }
    } else if(print_jobs.length > 0) {
        execSync(`{ printf "%%!PS\n/PAuthor (<From: ${job.user} @ ${datef(new Date(job.time))}>) def /PText <${Buffer.from(`${job.args.text}`, 'utf8').toString('hex')}> def /PRed ${job.args.red/255} def /PGreen ${job.args.green/255} def /PBlue ${job.args.blue/255} def\n"; cat ./postscript/single-color-text.ps; } | lp -d ${CONFIG.dev} -t "${job.id}"`)
        printing = true;
    }

}, 10_000);

//execSync(`{ printf "%%!PS\n/PAuthor (<From: ${keys[req.body.key].name} @ ${timestamp}>) def /PText <${Buffer.from(`${req.body.text}`, 'utf8').toString('hex')}> def /PRed ${req.body.red/255} def /PGreen ${req.body.green/255} def /PBlue ${req.body.blue/255} def\n"; cat ./postscript/single-color-text.ps; } | lpr -P canon_printer`, { encoding: 'utf8' })