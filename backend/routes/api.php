<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\RegistrationController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

// Route test koneksi (Opsional, untuk verifikasi F0)
Route::get('status', function () {
    return response()->json(['status' => 'ok', 'message' => 'Laravel API is running.'], 200);
});


// Group ini memastikan semua endpoint API diakses oleh Bot Engine
Route::middleware('auth:sanctum')->group(function () {
    // F1.1: Endpoint untuk memasukkan permintaan ke antrian
    Route::post('queue-registration', [RegistrationController::class, 'queueRegistration']);
    
    // F1.4: Endpoint untuk update hasil (Akan digunakan di Fase 3)
    // Route::post('update-result', [RegistrationController::class, 'updateResult']); 
});