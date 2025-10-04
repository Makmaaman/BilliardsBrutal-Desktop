// tools/gen-license.js
const crypto = require("crypto");

const SECRET = process.env.BB_LIC_SECRET || "CHANGE_ME_SECRET_32_CHARS_MIN";

function hmac(s) { return crypto.createHmac("sha256", SECRET).update(s).digest("hex"); }

function gen({ name, mid, days }) {
  const expires = Date.now() + days*24*60*60*1000;
  const sig = hmac(`${name}|${expires}|${mid}`);
  const obj = { name, expires, mid, sig };
  const b64 = Buffer.from(JSON.stringify(obj)).toString("base64");
  return { b64, obj };
}

function usage() {
  console.log(`Usage: BB_LIC_SECRET=... node tools/gen-license.js --name "Client" --mid "<hostname|platform|arch>" --days 365`);
  process.exit(1);
}

const args = process.argv.slice(2);
const get = (k, d=null) => {
  const i = args.indexOf(k);
  return i === -1 ? d : args[i+1];
};

const name = get("--name");
const mid  = get("--mid");
const days = parseInt(get("--days","365"),10);

if (!name || !mid || !days) usage();

const { b64, obj } = gen({ name, mid, days });
console.log("License (base64):\n", b64);
console.log("\nParsed JSON:\n", JSON.stringify(obj, null, 2));
