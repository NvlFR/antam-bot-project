<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Registration extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'nik',
        'branch_code',
        'date_requested',
        'status',
        'queue_number',
        'processed_by_bot_id',
        'processed_at',
    ];
}