<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
    Schema::create('registrations', function (Blueprint $table) {
        $table->id();
        $table->foreignId('user_id')->constrained()->onDelete('cascade'); // Foreign Key ke tabel users
        $table->string('nik', 16);
        $table->string('branch_code', 10);
        $table->date('date_requested');
        
        // Status proses antrian
        $table->enum('status', ['queued', 'processing', 'success', 'failed'])->default('queued');
        $table->string('queue_number', 50)->nullable()->comment('Hasil nomor antrian dari Antam');
        
        // Detail Bot Engine yang memproses
        $table->string('processed_by_bot_id', 50)->nullable()->comment('ID worker Node.js yang memproses');
        $table->timestamp('processed_at')->nullable()->comment('Waktu mulai diproses oleh bot');

        $table->timestamps();
    });
}

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('registrations');
    }
};
