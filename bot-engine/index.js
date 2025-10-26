// Memuat environment variables dari .env
require("dotenv").config({ path: "./.env" });

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");

const qrcode = require("qrcode-terminal");
const axios = require("axios");
const express = require("express"); // Tambah: Express untuk Worker API
const { runAutomation } = require("./automation"); // Tambah: Import fungsi otomatisasi

// --- KONFIGURASI GLOBAL ---
const API_BASE_URL = process.env.LARAVEL_API_BASE_URL;
const API_TOKEN = process.env.API_TOKEN;
const WA_JID_SUFFIX = "@s.whatsapp.net";
const WORKER_PORT = 3000; // Port untuk Worker API

// Map untuk menyimpan status percakapan setiap user (jid)
const userSessions = new Map();
let globalWaSock = null; // Tambah: Variabel untuk menyimpan koneksi WA global

const STEPS = {
  IDLE: "IDLE",
  ASK_NIK: "ASK_NIK",
  ASK_BRANCH: "ASK_BRANCH",
  ASK_DATE: "ASK_DATE",
  CONFIRMATION: "CONFIRMATION",
};

// Instance Axios dengan header otorisasi (API Bridge ke Laravel)
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// --- INISIALISASI EXPRESS WORKER API ---
const app = express();
app.use(express.json());

// ----------------------------------------------------
// --- ENDPOINT WORKER API (Dipanggil oleh Laravel) ---
// ----------------------------------------------------

// F3.1: Endpoint yang dipanggil oleh Laravel Job untuk memulai otomatisasi
app.post("/start-automation", async (req, res) => {
  const registrationId = req.body.registration_id;

  if (!registrationId) {
    return res.status(400).json({ error: "Missing registration_id" });
  }

  console.log(
    `[WORKER] Menerima Job untuk Reg ID: #${registrationId}. Memulai otomatisasi...`
  );

  try {
    // Panggil fungsi otomatisasi secara asinkron (tidak menunggu hasilnya)
    runAutomation(registrationId);

    // Langsung kirim respons 202 ke Laravel Job
    return res.status(202).json({
      status: "Automation process accepted and started",
      registration_id: registrationId,
    });
  } catch (error) {
    console.error(
      `[WORKER ERROR] Gagal memicu otomatisasi untuk ID ${registrationId}:`,
      error.message
    );
    return res
      .status(500)
      .json({ error: "Internal worker error during initiation" });
  }
});

// F4.1: Endpoint yang dipanggil oleh Laravel Job untuk mengirim notifikasi WA
app.post("/send-notification", async (req, res) => {
  const { whatsapp_id, message } = req.body;

  if (!whatsapp_id || !message) {
    return res.status(400).json({ error: "Missing whatsapp_id or message" });
  }

  if (!globalWaSock) {
    console.error("[NOTIF] WA Socket not initialized.");
    return res
      .status(503)
      .json({ error: "WA service temporarily unavailable" });
  }

  const jid = `${whatsapp_id}${WA_JID_SUFFIX}`;

  try {
    await globalWaSock.sendMessage(jid, { text: message });
    console.log(`[NOTIF] Pesan berhasil dikirim ke ${whatsapp_id}`);
    return res.status(200).json({ status: "Notification sent" });
  } catch (error) {
    console.error(
      `[NOTIF ERROR] Gagal mengirim pesan ke ${whatsapp_id}:`,
      error.message
    );
    return res.status(500).json({ error: "Failed to send message" });
  }
});

// ---------------------------------------------
// --- LOGIKA WA BOT & API KE LARAVEL (F0-F2) ---
// ---------------------------------------------

// Test koneksi API (Hanya untuk verifikasi awal)
async function testApiConnection() {
  try {
    console.log(`[API] Mencoba koneksi ke: ${API_BASE_URL}`);
    await api.get("/status");
    console.log(`[API] Token Otorisasi dan koneksi berhasil.`);
  } catch (error) {
    console.error(
      `[API ERROR] Gagal inisialisasi Axios atau koneksi API: ${error.message}`
    );
  }
}

// --- F2.3: Kirim Data ke Laravel Queue (API Bridge) ---
async function sendToLaravelQueue(sock, jid, data) {
  const payload = {
    whatsapp_id: jid.replace(WA_JID_SUFFIX, ""),
    name: data.name,
    nik: data.nik,
    branch_code: data.branch_code,
    date_requested: data.date_requested,
  };

  try {
    const response = await api.post("/queue-registration", payload);
    console.log(
      `[API SUCCESS] Permintaan #${response.data.registration_id} berhasil diantrikan.`
    );
  } catch (error) {
    console.error(
      `[API ERROR] Gagal mengirim ke Laravel Queue: ${error.message}`
    );
    console.error(
      `[API ERROR] Detail Respons: ${
        error.response?.data?.message || "Tidak ada detail respons."
      }`
    );

    await sock.sendMessage(jid, {
      text:
        "❌ *Pendaftaran GAGAL.* Terjadi kesalahan teknis saat mengantrikan data Anda. Mohon coba lagi nanti. Kode: " +
        (error.response?.status || "500"),
    });
  }
}

// --- F2.2: Fungsi Handler Pesan Masuk ---
async function handleMessages(sock, messages) {
  for (const msg of messages.messages) {
    if (
      !msg.message ||
      msg.key.remoteJid === "status@broadcast" ||
      msg.key.fromMe
    )
      continue;

    const jid = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const userSession = userSessions.get(jid) || {
      step: STEPS.IDLE,
      data: {},
    };

    console.log(`[Pesan Masuk dari ${jid}] Text: ${text}`);

    // Logika untuk Memulai Percakapan (F2.1)
    if (
      text.toLowerCase().includes("daftar antrian antam") &&
      userSession.step === STEPS.IDLE
    ) {
      userSessions.set(jid, {
        step: STEPS.ASK_NIK,
        data: { name: msg.pushName || "User" },
      });
      await sock.sendMessage(jid, {
        text:
          `Halo *${
            msg.pushName || "User"
          }*! Selamat datang di layanan Bot Antrian Antam.\n\n` +
          `Untuk memulai pendaftaran, silakan kirimkan **NIK** Anda (16 digit angka).`,
      });
      continue;
    }

    // Logika Berdasarkan Status Percakapan (State Machine)
    switch (userSession.step) {
      case STEPS.ASK_NIK:
        if (text.length === 16 && /^\d+$/.test(text)) {
          userSession.data.nik = text;
          userSession.step = STEPS.ASK_BRANCH;
          userSessions.set(jid, userSession);
          await sock.sendMessage(jid, {
            text:
              `NIK Anda (*${text}*) berhasil dicatat.\n\n` +
              `Sekarang, silakan sebutkan **Kode Cabang Antam** yang Anda tuju (Contoh: BDO, JKT, SBY).`,
          });
        } else {
          await sock.sendMessage(jid, {
            text: "❌ Format NIK salah. Mohon masukkan **16 digit angka** NIK yang valid.",
          });
        }
        break;

      case STEPS.ASK_BRANCH:
        if (text.length >= 3 && text.length <= 5 && text.match(/^[a-zA-Z]+$/)) {
          userSession.data.branch_code = text.toUpperCase();
          userSession.step = STEPS.ASK_DATE;
          userSessions.set(jid, userSession);
          await sock.sendMessage(jid, {
            text:
              `Cabang *${text.toUpperCase()}* berhasil dicatat.\n\n` +
              `Terakhir, masukkan **Tanggal** antrian yang Anda inginkan (Format: YYYY-MM-DD, contoh: 2025-11-01).`,
          });
        } else {
          await sock.sendMessage(jid, {
            text: "❌ Mohon masukkan kode cabang yang valid (minimal 3-5 huruf, tanpa angka).",
          });
        }
        break;

      case STEPS.ASK_DATE:
        if (text.match(/^\d{4}-\d{2}-\d{2}$/) && !isNaN(new Date(text))) {
          const requestedDate = new Date(text);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (requestedDate >= today) {
            userSession.data.date_requested = text;
            userSession.step = STEPS.CONFIRMATION;
            userSessions.set(jid, userSession);

            const finalData = userSession.data;
            await sock.sendMessage(jid, {
              text:
                `*--- KONFIRMASI PENDAFTARAN ---*\n` +
                `Nama: ${finalData.name}\n` +
                `NIK: ${finalData.nik}\n` +
                `Cabang: ${finalData.branch_code}\n` +
                `Tanggal: ${finalData.date_requested}\n\n` +
                `Ketik *YA* untuk mengantrikan sekarang, atau *BATAL* untuk memulai lagi.`,
            });
          } else {
            await sock.sendMessage(jid, {
              text: "❌ Tanggal yang Anda masukkan sudah lewat (di masa lalu). Mohon masukkan tanggal hari ini atau tanggal di masa depan.",
            });
          }
        } else {
          await sock.sendMessage(jid, {
            text: "❌ Mohon masukkan format tanggal yang benar (YYYY-MM-DD), contoh: 2025-11-01.",
          });
        }
        break;

      case STEPS.CONFIRMATION:
        if (text.toLowerCase() === "ya") {
          await sock.sendMessage(jid, {
            text: "✅ Data Anda diterima dan sedang dimasukkan ke antrian server. Mohon tunggu notifikasi hasil antrian Anda.",
          });
          await sendToLaravelQueue(sock, jid, userSession.data);
          userSessions.delete(jid);
        } else if (text.toLowerCase() === "batal") {
          userSessions.delete(jid);
          await sock.sendMessage(jid, {
            text: "Pendaftaran dibatalkan. Ketik 'Daftar Antrian Antam' untuk memulai kembali.",
          });
        } else {
          await sock.sendMessage(jid, {
            text: "Pilihan tidak valid. Silakan ketik *YA* atau *BATAL*.",
          });
        }
        break;

      case STEPS.IDLE:
        break;
    }
  }
}

// --- P.4.2: Inisialisasi Baileys (WA Service) ---
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    process.env.BAILEYS_AUTH_FOLDER
  );

  const sock = makeWASocket({
    auth: state,
    // ... konfigurasi lainnya
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log(
        "Koneksi tertutup, mencoba menghubungkan ulang:",
        lastDisconnect.error,
        shouldReconnect
      );
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("✅ Koneksi WhatsApp terhubung!");
      console.log(`[WA] Bot Siap Menerima Perintah: ${process.env.BOT_NAME}`);
    }

    if (qr) {
      console.log("\n----------------------------------------------------");
      console.log("[WA] 📱 Scan QR code berikut untuk login ke WhatsApp:");
      qrcode.generate(qr, { small: true });
      console.log("----------------------------------------------------\n");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", ({ messages }) => {
    handleMessages(sock, { messages });
  });

  // SIMPAN KONEKSI WA SECARA GLOBAL
  globalWaSock = sock;
  return sock;
}

// --- Main Program ---
(async () => {
  // 1. Inisialisasi Express Worker API
  app.listen(WORKER_PORT, () => {
    console.log(
      `[WORKER] Node.js Worker Engine listening at http://localhost:${WORKER_PORT}`
    );
  });

  // 2. Test dan siapkan koneksi API ke Laravel
  await testApiConnection();

  // 3. Mulai koneksi WhatsApp
  await connectToWhatsApp();
})();
