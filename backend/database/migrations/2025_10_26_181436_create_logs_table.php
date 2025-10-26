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
        Schema::create('logs', function (Blueprint $table) {
        $table->id();
        $table->foreignId('registration_id')->nullable()->constrained()->onDelete('cascade'); // Opsional, log bisa tanpa registrasi
        $table->string('level', 20)->default('info')->comment('info, warning, error, debug');
        $table->text('message');
        $table->text('details')->nullable()->comment('Stack trace atau detail error lengkap');
        $table->timestamps();
    });
}

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('logs');
    }
};
