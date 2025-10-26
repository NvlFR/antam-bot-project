<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Models\Registration;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProcessRegistration implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $registrationId;

    public function __construct(int $registrationId)
    {
        $this->registrationId = $registrationId;
    }

    /**
     * Execute the job.
     */
public function handle(): void
    {
        $registration = Registration::find($this->registrationId);
        
        if ($registration) {
            // Update status menjadi processing di awal
            $registration->update(['status' => 'processing']);
            
            Log::info("Job ID #{$this->registrationId} diterima, memicu Node.js Worker...");

            try {
                // Panggil endpoint baru di Node.js Worker untuk memulai otomatisasi
                $response = Http::timeout(60) // Beri waktu tunggu 60 detik
                    ->post(env('NODE_WORKER_URL') . '/start-automation', [ 
                        'registration_id' => $this->registrationId,
                    ]);

                if ($response->failed()) {
                    throw new \Exception('Node Worker API call failed: ' . $response->body());
                }

            } catch (\Exception $e) {
                // Logika jika Node.js Worker gagal dipicu
                $registration->update(['status' => 'failed']);
                // TODO: Kirim notifikasi kegagalan ke user via Baileys API (F4)
                Log::error("Gagal memicu Node Worker untuk Reg ID {$this->registrationId}: " . $e->getMessage());
            }
        }
    }
}
