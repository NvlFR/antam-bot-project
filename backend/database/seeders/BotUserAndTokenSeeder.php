<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class BotUserAndTokenSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Cek apakah user bot sudah ada
        $user = User::firstOrCreate(
            [
                'whatsapp_id' => 'BOT_ENGINE_SERVICE', // Gunakan ID unik untuk Bot
            ],
            [
                'name' => 'Antam Automation Bot',
                // 'nik' dan kolom lain bisa dikosongkan/diisi default
            ]
        );

        // 2. Hapus token lama jika ada
        $user->tokens()->delete();

        // 3. Buat token baru dengan kemampuan (abilities) spesifik
        $token = $user->createToken(
            'bot-automation-token', 
            ['queue:write', 'result:write'] // Kemampuan yang diizinkan
        )->plainTextToken;

        // 4. Tampilkan token di console (INI SANGAT PENTING!)
        $this->command->info("--- SERVICE API TOKEN GENERATED ---");
        $this->command->info("Token: " . $token);
        $this->command->info("Simpan token ini di file .env BOT ENGINE.");
        $this->command->info("-------------------------------------");
    }
}