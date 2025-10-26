<?php

namespace App\Models;

// Tambahkan import untuk Traits yang dibutuhkan
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens; // <--- INI PENTING UNTUK SANCTUM

class User extends Authenticatable
{
    // Pastikan trait ini ada
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * Tambahkan 'whatsapp_id' agar bisa di Mass Assigned saat membuat user baru.
     */
    protected $fillable = [
        'name',
        'whatsapp_id', // <--- Kolom dari migrasi kita
        'nik', // <--- Kolom dari migrasi kita
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * Biarkan ini jika Anda tidak menggunakan password.
     */
    protected $hidden = [
        // 'password', // Kita mungkin tidak perlu password karena ini API/WA user
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     */
    protected function casts(): array
    {
        return [
            // 'email_verified_at' => 'datetime', // Tidak perlu email
            // 'password' => 'hashed', // Tidak perlu hash password
        ];
    }
}