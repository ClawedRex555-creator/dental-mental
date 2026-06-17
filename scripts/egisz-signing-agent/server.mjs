#!/usr/bin/env node
/**
 * Агент подписи CDA для Emkaro (Windows + КриптоПро CSP).
 *
 * Запуск на ПК с флешкой КЭП:
 *   set EGISZ_SIGNING_SECRET=длинный-секрет
 *   set CRYPTOPRO_CRYPTCP=C:\Program Files\Crypto Pro\CSP\cryptcp.exe
 *   node server.mjs
 *
 * Emkaro на сервере: EGISZ_SIGNING_URL=http://IP_ЭТОГО_ПК:9876/sign
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.EGISZ_SIGNING_PORT || 9876);
const HOST = process.env.EGISZ_SIGNING_HOST || "0.0.0.0";
const SECRET = process.env.EGISZ_SIGNING_SECRET?.trim() || "";
const CRYPTCP =
  process.env.CRYPTOPRO_CRYPTCP?.trim() ||
  "C:\\Program Files\\Crypto Pro\\CSP\\cryptcp.exe";

function normalizeThumbprint(value) {
  return String(value || "")
    .replace(/[\s:]/g, "")
    .toUpperCase();
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runCryptcpDetached(thumbprint, inputPath, outputPath) {
  const args = [
    "-sign",
    "-detached",
    "-nochain",
    "-thumbprint",
    thumbprint,
    inputPath,
    outputPath,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn(CRYPTCP, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `cryptcp exit ${code}`));
    });
  });
}

async function signDetached(xml, thumbprint) {
  const dir = join(tmpdir(), `emkaro-sign-${randomBytes(6).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const dataPath = join(dir, "document.xml");
  const sigPath = join(dir, "signature.p7s");
  try {
    await writeFile(dataPath, xml, "utf8");
    await runCryptcpDetached(thumbprint, dataPath, sigPath);
    const sig = await readFile(sigPath);
    return sig.toString("base64");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function checkAuth(req) {
  if (!SECRET) return true;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token === SECRET;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { ok: true, cryptcp: CRYPTCP });
      return;
    }

    if (req.method !== "POST" || req.url !== "/sign") {
      json(res, 404, { error: "Not found" });
      return;
    }

    if (!checkAuth(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return;
    }

    const xml = typeof payload.xml === "string" ? payload.xml : "";
    const doctorThumbprint = normalizeThumbprint(payload.doctorCertThumbprint);
    const orgThumbprint = normalizeThumbprint(payload.orgCertThumbprint);

    if (!xml.trim()) {
      json(res, 400, { error: "xml is required" });
      return;
    }
    if (!doctorThumbprint || !orgThumbprint) {
      json(res, 400, { error: "doctorCertThumbprint and orgCertThumbprint are required" });
      return;
    }

    const dataBase64 = Buffer.from(xml, "utf8").toString("base64");
    const personalSignBase64 = await signDetached(xml, doctorThumbprint);
    const organizationSignBase64 = await signDetached(xml, orgThumbprint);

    json(res, 200, {
      ok: true,
      dataBase64,
      personalSignBase64,
      organizationSignBase64,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[egisz-signing-agent]", message);
    json(res, 500, { error: message });
  }
});

if (!SECRET) {
  console.warn("WARNING: EGISZ_SIGNING_SECRET не задан — агент принимает запросы без авторизации");
}

server.listen(PORT, HOST, () => {
  console.log(`Emkaro signing agent: http://${HOST}:${PORT}`);
  console.log(`cryptcp: ${CRYPTCP}`);
  console.log("GET /health  POST /sign");
});
