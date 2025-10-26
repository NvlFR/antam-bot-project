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
{
    Schema::create('users', function (Blueprint $table) {
        $table->id();
        $table->string('whatsapp_id')->unique()->comment('Nomor WA atau JID pengguna, kunci utama interaksi');
        $table->string('name')->nullable();
        $table->string('nik', 16)->nullable()->comment('NIK terakhir yang digunakan pengguna');
        $table->timestamps();
    });
}
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
