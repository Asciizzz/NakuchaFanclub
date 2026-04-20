# Idol1st Development Guide

This guide explains how to work on HTML/PHP (Blade), CSS, and JavaScript in this Laravel project.

## 1. Project Layout You Will Edit Most

- Laravel app root: `Idol1st/`
- Main page template: `resources/views/nakuru/index.blade.php`
- Main styles:
  - `resources/css/app.css`
  - `resources/css/index.css`
- Static animation scripts used by homepage:
  - `public/assets/nakurite/scripts/...`
- Static images/fonts:
  - `public/assets/nakurite/images/...`
  - `public/assets/nakurite/fonts/...`
- Route for homepage: `routes/web.php`

## 2. Start The Project Correctly

Always run commands from the Laravel app folder (`Idol1st/`, not parent folder).

```powershell
cd C:\Users\Asciiz\Downloads\VSCLMAO\Project\Idol1st
php artisan serve
```

Open:

- http://127.0.0.1:8000

## 3. CSS Workflow

Primary styling is in `resources/css/index.css`, imported by `resources/css/app.css`.

### After changing CSS

For development (auto rebuild):

```powershell
npm run dev
```

For production build output in `public/build`:

```powershell
npm run build
```

If page looks wrong after CSS edits, rebuild assets (`npm run build`) and hard refresh browser.

## 4. HTML/PHP (Blade) Workflow

Edit:

- `resources/views/nakuru/index.blade.php`

This is Blade template syntax, so you can use:

- Plain HTML
- Laravel helpers like `{{ asset('...') }}`
- Blade directives if needed (`@if`, `@foreach`, etc.)

Current homepage route:

- `Route::get('/', [NakuruController::class, 'index']);`

Controller:

- `app/Http/Controllers/NakuruController.php`

## 5. JavaScript Workflow

JavaScript for homepage effects is served as static files from:

- `public/assets/nakurite/scripts/`

Current homepage relies heavily on static scripts (parallax, jellytank, starglitter). That is intentional to preserve 1:1 behavior.

### If you edit scripts

Edit files under:

- `public/assets/nakurite/scripts/...`

No Vite rebuild is required for these direct public files.

## 6. Important Note: External Nakurite Folder

The site no longer depends on `../Nakurite`.

You can delete the external `Nakurite/` folder without breaking homepage scripts, because required JS is now copied into:

- `public/assets/nakurite/scripts/`

## 7. Common Gotchas

1. Running `php artisan serve` in the wrong folder causes:
   - `Could not open input file: artisan`
2. Editing CSS but not seeing changes usually means:
   - old built assets are still being served
   - run `npm run build` and refresh
3. If image paths break, make sure paths are absolute from public root:
   - `/assets/nakurite/images/...`

## 8. Suggested Safe Editing Pattern

1. Start server: `php artisan serve`
2. If changing CSS, run `npm run dev`
3. Edit one area at a time (Blade, CSS, static JS)
4. Refresh and verify
5. Do final production build: `npm run build`
