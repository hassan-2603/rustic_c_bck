import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 17890);

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body is too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function escPosText(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function wrapText(text, width) {
  const words = String(text).split(" ");
  const result = [];
  let line = "";
  for (const word of words) {
    if ((line + word).length <= width) {
      line += (line ? " " : "") + word;
    } else {
      if (line) result.push(line);
      line = word;
    }
  }
  if (line) result.push(line);
  return result;
}

function buildReceiptWithAlignment({ bill, kot, printType, autoCut, test }) {
  const buffers = [];
  
  // Initialize and set center alignment
  buffers.push(Buffer.from([0x1b, 0x40])); // Reset
  buffers.push(Buffer.from([0x1b, 0x45, 0x00])); // Normal weight
  buffers.push(Buffer.from([0x1d, 0x21, 0x00])); // Normal size
  buffers.push(Buffer.from([0x1b, 0x4d, 0x00])); // Font A
  buffers.push(Buffer.from([0x1d, 0x4c, 0x10, 0x00])); // Set left margin
  buffers.push(Buffer.from([0x1d, 0x57, 0x20, 0x02])); // Set print width
  buffers.push(Buffer.from([0x1b, 0x61, 0x01])); // Center alignment
  
  // Top margin
  buffers.push(Buffer.from("\n\n", "utf8"));
  
  // Restaurant header (centered)
  buffers.push(Buffer.from("RUSTIC CHARM\n", "utf8"));
  buffers.push(Buffer.from("RESTRO BAR AND CAFE BY DAAOM\n", "utf8"));
  buffers.push(Buffer.from("RUSTIC CHARM\n", "utf8"));
  buffers.push(Buffer.from("------------------------------------------\n", "utf8"));
  
  if (test) {
    buffers.push(Buffer.from("Printer test successful\n", "utf8"));
  } else if (printType === "kot") {
    // KOT header (centered)
    buffers.push(Buffer.from("KITCHEN ORDER TICKET\n", "utf8"));
    buffers.push(Buffer.from(`KOT No: ${escPosText(kot?.orderNumber)}\n`, "utf8"));
    buffers.push(Buffer.from(`Table: ${escPosText(kot?.tableNumber || "--")}\n`, "utf8"));
    buffers.push(Buffer.from(`Waiter: ${escPosText(kot?.waiterName || "--")}\n`, "utf8"));
    buffers.push(Buffer.from(`Date: ${escPosText(kot?.date)}\n`, "utf8"));
    buffers.push(Buffer.from("------------------------------------------\n", "utf8"));
    
    // Switch to left alignment for items
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])); // Left alignment
    buffers.push(Buffer.from("\n", "utf8"));
    
    // Food items (left-aligned)
    for (const item of kot?.items || []) {
      const quantity = escPosText(String(item.quantity || ""));
      const itemName = escPosText(item.name || "");
      const itemCategory = item.category ? `(${escPosText(item.category)})` : "";
      const nameAndCategory = itemCategory ? `${itemName} ${itemCategory}` : itemName;
      const maxWidth = 38;
      const wrapped = wrapText(nameAndCategory, maxWidth);
      for (let i = 0; i < wrapped.length; i++) {
        if (i === 0) {
          buffers.push(Buffer.from(`${quantity}  ${wrapped[i]}\n`, "utf8"));
        } else {
          buffers.push(Buffer.from(`    ${wrapped[i]}\n`, "utf8"));
        }
      }
      buffers.push(Buffer.from("\n", "utf8"));
    }
  } else {
    // Bill (centered header)
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])); // Center alignment
    buffers.push(Buffer.from(`Bill No: ${escPosText(bill.orderNumber)}\n`, "utf8"));
    buffers.push(Buffer.from(`Table: ${escPosText(bill.tableNumber || "--")}\n`, "utf8"));
    buffers.push(Buffer.from(`Waiter: ${escPosText(bill.waiterName || "--")}\n`, "utf8"));
    buffers.push(Buffer.from(`Date: ${escPosText(bill.date)}\n`, "utf8"));
    buffers.push(Buffer.from("------------------------------------------\n", "utf8"));
    
    // Switch to left for bill items
    buffers.push(Buffer.from([0x1b, 0x61, 0x00])); // Left alignment
    buffers.push(Buffer.from("Particulars                 Qty Rate    Amt\n", "utf8"));
    buffers.push(Buffer.from("------------------------------------------\n", "utf8"));
    
    for (const item of bill.items || []) {
      const name = escPosText(item.name).slice(0, 24).padEnd(24);
      const quantity = String(item.quantity).padStart(3);
      const rate = String(item.price).padStart(6);
      const amount = String(item.amount).padStart(7);
      buffers.push(Buffer.from(`${name} ${quantity} ${rate} ${amount}\n`, "utf8"));
    }
    
    buffers.push(Buffer.from("------------------------------------------\n", "utf8"));
    buffers.push(Buffer.from(`FOOD TOTAL: Rs ${bill.total}\n`, "utf8"));
    
    if (bill.discountAmount > 0) {
      buffers.push(Buffer.from(`DISCOUNT: -Rs ${bill.discountAmount}\n`, "utf8"));
    }
    
    buffers.push(Buffer.from(`TOTAL: Rs ${bill.finalTotal ?? bill.total}\n`, "utf8"));
    buffers.push(Buffer.from("\n", "utf8"));
    buffers.push(Buffer.from("TIN NO: 30410500872\n", "utf8"));
    buffers.push(Buffer.from("GSTIN: 30BJUNPM9167Q1ZQ\n", "utf8"));
    buffers.push(Buffer.from("\n", "utf8"));
    
    // Center for thank you
    buffers.push(Buffer.from([0x1b, 0x61, 0x01])); // Center alignment
    buffers.push(Buffer.from("Thank You, Visit Again\n", "utf8"));
  }
  
  // Bottom margin
  buffers.push(Buffer.from("\n\n\n\n", "utf8"));
  
  // Reset alignment and prepare footer
  buffers.push(Buffer.from([0x1b, 0x61, 0x00])); // Left alignment (reset)
  
  // Footer (cut)
  const footer = Buffer.from([
    0x1b, 0x61, 0x00,
    ...(autoCut ? [0x1d, 0x56, 0x00] : []),
  ]);
  buffers.push(footer);
  
  return Buffer.concat(buffers);
}

function printNetwork(settings, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: settings.ipAddress,
      port: Number(settings.port),
      timeout: 5000,
    });
    socket.once("connect", () => socket.end(payload));
    socket.once("timeout", () => socket.destroy(new Error("Printer connection timed out")));
    socket.once("error", reject);
    socket.once("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}

function printWindows(settings, payload) {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("USB/Windows Printer mode requires Windows"));
  }

  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr handle, int level, DOCINFO doc);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
}
'@
$printer = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:RUSTIC_PRINTER_NAME_B64))
$bytes = [Convert]::FromBase64String($env:RUSTIC_PAYLOAD_B64)
$handle = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($printer, [ref]$handle, [IntPtr]::Zero)) { throw "Could not open printer: $printer" }
try {
  $doc = New-Object RawPrinter+DOCINFO
  $doc.pDocName = "Rustic Charm Receipt"
  $doc.pDataType = "RAW"
  if (-not [RawPrinter]::StartDocPrinter($handle, 1, $doc)) { throw "Could not start printer job" }
  [RawPrinter]::StartPagePrinter($handle) | Out-Null
  $written = 0
  if (-not [RawPrinter]::WritePrinter($handle, $bytes, $bytes.Length, [ref]$written)) { throw "Could not write printer job" }
  [RawPrinter]::EndPagePrinter($handle) | Out-Null
  [RawPrinter]::EndDocPrinter($handle) | Out-Null
} finally { [RawPrinter]::ClosePrinter($handle) | Out-Null }
`;

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: {
        ...process.env,
        RUSTIC_PRINTER_NAME_B64: Buffer.from(String(settings.printerName), "utf8").toString("base64"),
        RUSTIC_PAYLOAD_B64: payload.toString("base64"),
      },
    });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `Windows printer exited with code ${code}`)));
  });
}

async function printJob({ settings, bill, kot, printType, test = false }) {
  if (!settings || !settings.connectionType) throw new Error("Printer settings are required");
  const payload = buildReceiptWithAlignment({ bill, kot, printType, autoCut: settings.autoCut, test });
  if (settings.connectionType === "network") {
    if (!settings.ipAddress || !settings.port) throw new Error("Printer IP address and port are required");
    return printNetwork(settings, payload);
  }
  if (!settings.printerName) throw new Error("Windows printer name is required");
  return printWindows(settings, payload);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return sendJson(res, 200, { ok: true });
  if (req.method !== "POST" || !["/print", "/test-print"].includes(req.url)) return sendJson(res, 404, { error: "Not found" });

  try {
    const body = await readBody(req);
    await printJob({ ...body, test: req.url === "/test-print" });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Print failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Rustic Charm Print Connector listening on http://${HOST}:${PORT}`);
});