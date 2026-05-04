<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nakuru Fanclub</title>
    <script>
        window.nakuchaAssets = {
            ...(window.nakuchaAssets ?? {}),
            images: {
                ...(window.nakuchaAssets?.images ?? {}),
                jellyfish: @json(asset('assets/images/jellyfish.png')),
                starglitter: @json(asset('assets/images/starglitter.png')),
                welcomeBackground: @json(asset('assets/images/welcome_background.png')),
                welcomeNakuru: @json(asset('assets/images/welcome_nakuru.png')),
                welcomeForeground: @json(asset('assets/images/welcome_foreground.png')),
            },
        };
    </script>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body>
    <input type="checkbox" name="toggle" id="toggle-reveal" hidden>

    <header>
        <h1>Nakucha Fanclub</h1>

        <nav>
            <a href="#">Info</a>
            <a href="#">Blog</a>
            <a href="#">Music</a>
            <a href="#">Links</a>
            <a href="#">Merch</a>
        </nav>
    </header>

    <div id="global-canvas"></div>

    <div id="welcome">
        <!-- We are absolutely going to redesign this entire thing from scratch -->

        <input type="checkbox" id="toggle-popup" hidden>

        <div class="left-side">
            <h2 id="insane-effect-1">News from our beloved</h2>
            <label for="toggle-reveal" id="nakuru-name-1">
            </label>
            <label for="toggle-popup">
                <p class="not-hover">We got you covered!</p>
            </label>
        </div>
    </div>

    <div id="reveal">
        <div class="reveal-content">
            <h2>Biography</h2>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            <p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p><p>Test</p>
            
            <label for="toggle-reveal" class="reveal-close-btn">Close</label>
        </div>
    </div>

</body>
</html>