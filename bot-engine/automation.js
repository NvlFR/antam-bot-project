// bot-engine/automation.js

const axios = require("axios");
const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");
// Import api client dari index.js
const { api } = require("./index");
const fs = require("fs");
const path = require("path");

// --- Konfigurasi Cabang dan URL ---
// KODE CABANG HARUS MATCH DENGAN INPUT USER
const BRANCH_CONFIG = {
  BINTARO: { url: "https://www.antributikbintaro.com/", openTime: "07:00" },
  SETIABUDI: { url: "https://www.antributikemas.com", openTime: "07:30" },
  SERPONG: { url: "https://antributikserpong.com/", openTime: "07:00" },
  PULOGADUNG: { url: "http://antrigrahadipta.com/", openTime: "07:30" },
  TBSIMATUPANG: { url: "https://antrisimatupang.com/", openTime: "15:00" },
  BEKASI: { url: "https://www.antributikbekasi.com/", openTime: "07:30" },
  PURI: { url: "https://www.antrijktpr6.com/", openTime: "07:30" },
  JUANDA: { url: "https://antrijktjd5.com/", openTime: "07:30" },
  // Tambahkan cabang lain di sini jika ada
};

// Buat direktori temp jika belum ada
if (!fs.existsSync(path.join(__dirname, "temp"))) {
  fs.mkdirSync(path.join(__dirname, "temp"));
}

/**
 * Fungsi untuk menghitung delay (penundaan) hingga waktu buka cabang.
 * Ini adalah logika penting untuk "war" antrian.
 * (Contoh sederhana: 5 detik sebelum waktu buka)
 */
function calculateDelay(openTime) {
  // Implementasi logika waktu di sini
  // Untuk tujuan demo, kita tidak akan menunggu jam tertentu,
  // tetapi ini adalah tempat logikanya berada.

  // Asumsi: Waktu server bot harus di-sinkronkan dengan waktu Antam.

  console.log(
    `[DELAY] Waktu buka cabang: ${openTime}. Otomatisasi akan berjalan sekarang (tanpa delay waktu nyata).`
  );
  return 1000; // 1 detik delay untuk inisialisasi
}

/**
 * Fungsi utama untuk menjalankan otomatisasi web.
 */
async function runAutomation(registrationId) {
  let browser;
  let page;
  let data; // Untuk menyimpan data registrasi
  const ANTAM_URL = "https://www.logammulia.com/id/booking"; // Default, akan ditimpa

  try {
    // 1. Ambil Data Registrasi dari Laravel (F3.1)
    const response = await api.get(`/registrations/${registrationId}`);
    data = response.data.registration;

    if (!data) throw new Error("Registration data not found.");

    // --- LOGIKA MULTI-CABANG (Fase Baru) ---
    const branchCode = data.branch_code.toUpperCase();
    const config = BRANCH_CONFIG[branchCode];

    if (!config) {
      throw new Error(
        `Cabang ${branchCode} tidak valid atau tidak terkonfigurasi.`
      );
    }

    const targetUrl = config.url;
    const targetOpenTime = config.openTime;
    // ----------------------------------------

    console.log(
      `[Puppeteer] Target URL: ${targetUrl}. Waktu Buka: ${targetOpenTime}`
    );

    // Hitung delay (jika diperlukan untuk "war" antrian)
    // const delayMs = calculateDelay(targetOpenTime);
    // await new Promise(resolve => setTimeout(resolve, delayMs));

    // 2. Inisialisasi Puppeteer (F3.2)
    browser = await puppeteer.launch({
      headless: true, // Ubah ke false untuk debugging visual
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage();

    // Atur timeout yang panjang karena proses pendaftaran bisa lama
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });
    console.log(`[Puppeteer] Navigasi ke ${targetUrl} berhasil.`);

    // 3. Logika Pengisian Form (F3.2)
    // Catatan: Anda mungkin perlu menyesuaikan selector ini untuk setiap website!
    // Karena semua website adalah "Antri Butik", kita asumsikan selectornya MIRIP.
    await page.type("#input-nik", data.nik);
    await page.type("#input-date", data.date_requested);
    await page.click("#submit-button"); // Tombol submit awal

    // 4. Proses CAPTCHA (F3.3 - OCR) - Asumsi halaman berikutnya muncul CAPTCHA
    await page.waitForSelector("#captcha-image", { timeout: 20000 });

    const captchaImageElement = await page.$("#captcha-image");
    if (!captchaImageElement)
      throw new Error("Captcha image element not found.");

    const captchaImagePath = path.join(
      __dirname,
      `temp/captcha_${registrationId}.png`
    );
    await captchaImageElement.screenshot({ path: captchaImagePath });
    console.log("[OCR] Screenshot CAPTCHA berhasil diambil.");

    const {
      data: { text },
    } = await Tesseract.recognize(captchaImagePath, "eng", {
      logger: (m) => console.log(`[OCR Log] ${m.status}`),
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    });

    const captchaText = text.trim();
    console.log(`[OCR] Teks CAPTCHA Terbaca: ${captchaText}`);

    // Isi dan Submit CAPTCHA
    await page.type("#input-captcha", captchaText);
    await page.click("#submit-final-button");

    // 5. Verifikasi Hasil dan Kirim Balik ke Laravel (F3.5)

    // Tunggu pesan sukses
    await page.waitForSelector("#success-message", { timeout: 15000 });
    const queueNumber = await page.$eval("#queue-number-display", (el) =>
      el.textContent.trim()
    );

    // Kirim hasil SUKSES kembali ke Laravel
    await api.post("/update-result", {
      registration_id: registrationId,
      status: "success",
      queue_number: queueNumber,
      notes: `Pendaftaran berhasil di butik ${branchCode} (${targetUrl}).`,
    });

    console.log(
      `[SUCCESS] Reg ID #${registrationId} berhasil! Cabang: ${branchCode}.`
    );
    return true;
  } catch (error) {
    const errorMessage = error.message || "Unknown error during automation.";
    console.error(
      `[AUTOMATION ERROR] Reg ID #${registrationId} GAGAL:`,
      errorMessage
    );

    // Kirim hasil GAGAL kembali ke Laravel
    await api
      .post("/update-result", {
        registration_id: registrationId,
        status: "failed",
        queue_number: null,
        notes: `Gagal di cabang ${
          data?.branch_code || "N/A"
        }: ${errorMessage.substring(0, 200)}`,
      })
      .catch((e) =>
        console.error("Gagal update status di Laravel:", e.message)
      );

    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { runAutomation };
