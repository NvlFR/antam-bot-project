<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Registration;
use App\Jobs\ProcessRegistration;
use Illuminate\Support\Facades\DB; // Untuk transaksi
use Illuminate\Validation\Rule; // Tambahkan untuk validasi lebih robust

class RegistrationController extends Controller
{
    /**
     * F1.1: Menerima data pendaftaran dari WhatsApp Bot dan memasukkannya ke Queue.
     */
    public function queueRegistration(Request $request)
    {
        // 1. Validasi Input
        $request->validate([
            'whatsapp_id' => 'required|string|max:255',
            'nik' => 'required|string|max:16',
            'name' => 'required|string|max:255',
            'branch_code' => 'required|string|max:10',
            'date_requested' => 'required|date_format:Y-m-d',
        ]);

        try {
            DB::beginTransaction();

            // 2. Ambil/Buat User (Pastikan NIK juga diupdate jika ada perubahan)
            $user = User::firstOrCreate(
                ['whatsapp_id' => $request->whatsapp_id],
                ['name' => $request->name, 'nik' => $request->nik]
            );
            // Tambahkan update NIK dan Nama jika user sudah ada namun ada data yang diperbarui
            $user->update([
                'name' => $request->name, 
                'nik' => $request->nik
            ]);


            // 3. Simpan Permintaan Pendaftaran (status default: 'queued')
            $registration = Registration::create([
                'user_id' => $user->id,
                'nik' => $request->nik,
                'branch_code' => $request->branch_code,
                'date_requested' => $request->date_requested,
                'status' => 'queued',
            ]);

            // 4. Kirim Job ke Queue
            ProcessRegistration::dispatch($registration->id);

            DB::commit();

            return response()->json([
                'status' => 'success',
                'message' => 'Permintaan antrian berhasil diantrikan.',
                'registration_id' => $registration->id
            ], 202); // 202 Accepted, karena diproses secara async

        } catch (\Exception $e) {
            DB::rollBack();
            // TODO: Catat error di tabel logs (Akan diimplementasikan di fase berikutnya)
            return response()->json([
                'status' => 'error',
                'message' => 'Gagal mengantrikan permintaan.',
                'details' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * F3.1: Endpoint bagi Node Worker untuk mengambil detail data registrasi.
     * Menggunakan Route Model Binding: Registration $registration
     */
    public function getRegistrationData(Registration $registration) 
    {
        // Memastikan data user terkait juga dimuat untuk mendapatkan whatsapp_id
        $registration->load('user'); 
        
        return response()->json([
            'registration' => [
                'id' => $registration->id,
                'nik' => $registration->nik,
                'branch_code' => $registration->branch_code,
                'date_requested' => $registration->date_requested,
                'whatsapp_id' => $registration->user->whatsapp_id // Ambil whatsapp_id dari relasi user
            ]
        ]);
    }

    /**
     * F3.5: Endpoint bagi Node Worker untuk mengirimkan hasil otomatisasi.
     */
    public function updateResult(Request $request) 
    {
        $request->validate([
            'registration_id' => 'required|exists:registrations,id',
            'status' => ['required', Rule::in(['success', 'failed'])], // Validasi status lebih rapi
            'queue_number' => 'nullable|string|max:50',
            'notes' => 'nullable|string'
        ]);

        $registration = Registration::find($request->registration_id);
        
        if (!$registration) {
            return response()->json(['message' => 'Registration not found'], 404);
        }

        $registration->update([
            'status' => $request->status,
            'queue_number' => $request->queue_number,
            'notes' => $request->notes,
            'processed_at' => now(),
            'status' => $request->status,
        ]);

        dispatch(new \App\Jobs\SendWaNotification($registration)); // Panggil Job Notifikasi

        return response()->json(['message' => 'Result updated successfully']);
    }
}