require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000; // Port yang didefinisikan di NODE_WORKER_URL Laravel

// --- PERBAIKAN SINTAKS: Import runAutomation ---
// Pastikan file automation.js sudah ada dan mengekspor runAutomation
const { runAutomation } = require("./automation");
// ----------------------------------------------

app.use(express.json());

// Endpoint yang dipanggil oleh Laravel Job (F3.1)
// PERHATIKAN: Sintaks app.post harus menggunakan fungsi callback (req, res) => {...}
app.post("/start-automation", async (req, res) => {
  const registrationId = req.body.registration_id;

  if (!registrationId) {
    return res.status(400).json({ error: "Missing registration_id" });
  }

  console.log(
    `[WORKER] Menerima Job untuk Reg ID: #${registrationId}. Memulai otomatisasi...`
  );

  // ** F3.2: Panggil Fungsi Otomatisasi Utama **
  // Kita TIDAK menggunakan try/catch di sini karena runAutomation sudah handle error-nya sendiri
  // dan mengirim status ke Laravel. Kita hanya memastikan pemanggilan fungsi berhasil.

  // Karena runAutomation sudah menangani error internal dan melaporkan ke Laravel,
  // di sini kita hanya memastikan eksekusi dimulai.
  try {
    // Kita panggil fungsi dan biarkan berjalan secara asinkronus
    // Kita langsung kirim respons 202 (Accepted) ke Laravel
    runAutomation(registrationId);

    return res.status(202).json({
      status: "Automation process accepted and started",
      registration_id: registrationId,
    });
  } catch (error) {
    // Catch ini hanya jika ada error SEBELUM runAutomation dipanggil (sangat jarang)
    console.error(
      `[WORKER ERROR] Gagal memicu otomatisasi untuk ID ${registrationId}:`,
      error.message
    );
    return res
      .status(500)
      .json({ error: "Internal worker error during initiation" });
  }
});

// bot-engine/worker.js (Tambahkan route ini)

// Kita perlu mengekspor sock dari index.js agar bisa digunakan di sini.
// Untuk menyederhanakan, kita asumsikan 'sock' sudah bisa diakses (akan kita perbaiki di index.js)

// Endpoint yang dipanggil oleh Laravel Job (F4.1)
app.post('/send-notification', async (req, res) => {
    const { whatsapp_id, message } = req.body;

    if (!whatsapp_id || !message) {
        return res.status(400).json({ error: 'Missing whatsapp_id or message' });
    }
    
    // Perbaikan scope: Kita akan buat fungsi global getWaSock() di index.js
    const sock = getWaSock(); 
    if (!sock) {
        console.error('[NOTIF] WA Socket not initialized.');
        return res.status(503).json({ error: 'WA service temporarily unavailable' });
    }

    const jid = `${whatsapp_id}@s.whatsapp.net`;

    try {
        await sock.sendMessage(jid, { text: message });
        console.log(`[NOTIF] Pesan berhasil dikirim ke ${whatsapp_id}`);
        return res.status(200).json({ status: 'Notification sent' });
    } catch (error) {
        console.error(`[NOTIF ERROR] Gagal mengirim pesan ke ${whatsapp_id}:`, error.message);
        return res.status(500).json({ error: 'Failed to send message' });
    }
});

app.listen(port, () => {
  console.log(
    `[WORKER] Node.js Worker Engine listening at http://localhost:${port}`
  );
});
