<?php

use App\Http\Controllers\NakuruController;
use Illuminate\Support\Facades\Route;

Route::get('/', [NakuruController::class, 'index']);
