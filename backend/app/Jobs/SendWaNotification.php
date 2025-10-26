<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Models\Registration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendWaNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $registration;

    public function __construct(Registration $registration)
    {
        $this->registration = $registration->load('user'); // Pastikan user dimuat
    }

    public function handle(): void
    {
        $reg = $this->registration;
        $status = strtoupper($reg->status);

        // 1. Susun Pesan
        if ($status === 'SUCCESS') {
            $message = 
                "🎉 *SELAMAT! Pendaftaran antrian Antam Anda Berhasil!*\n\n" .
                "Rincian Antrian:\n" .
                "• Tanggal: {$reg->date_requested}\n" .
                "• Cabang: {$reg->branch_code}\n" .
                "• Nomor Antrian: *{$reg->queue_number}*\n\n" .
                "Mohon datang tepat waktu. Terima kasih!";
        } else {
            $message = 
                "❌ *Pendaftaran Antrian Antam Gagal*.\n\n" .
                "Status: {$status}\n" .
                "Rincian Gagal: {$reg->notes}\n\n" .
                "Mohon coba lagi dengan mengirim 'Daftar Antrian Antam'.";
        }

        // 2. Kirim ke Node Worker API
        try {
            $response = Http::timeout(30)
                ->post(env('NODE_WORKER_URL') . '/send-notification', [
                    'whatsapp_id' => $reg->user->whatsapp_id,
                    'message' => $message,
                ]);

            if ($response->failed()) {
                throw new \Exception('Node Worker failed to send WA message: ' . $response->body());
            }

            Log::info("Notifikasi WA berhasil dikirim untuk Reg ID {$reg->id}.");

        } catch (\Exception $e) {
            Log::error("Gagal mengirim notifikasi WA untuk Reg ID {$reg->id}: " . $e->getMessage());
            // Jika gagal, Job bisa dicoba ulang secara otomatis
            $this->fail($e); 
        }
    }
}