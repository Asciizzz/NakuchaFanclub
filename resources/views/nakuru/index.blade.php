<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nakuru Fanclub</title>
    @vite(['resources/css/app.css'])
</head>

<body>
    <input type="radio" name="toggle" id="toggle-none" hidden checked>
    <input type="radio" name="toggle" id="toggle-introduction" hidden>
    <input type="radio" name="toggle" id="toggle-news" hidden>
    <input type="radio" name="toggle" id="toggle-discography" hidden>
    <input type="radio" name="toggle" id="toggle-merch" hidden>

    <input type="checkbox" id="toggle-biography" hidden>

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

    <div id="jellytank"></div>

    <div id="welcome">
        <input type="checkbox" id="toggle-popup" hidden>

        <div class="scene" aria-hidden="true">
            <img class="background" src="{{ asset('assets/nakurite/images/welcome_background.png') }}" alt="">
            <div id="starglitter"></div>
            <img class="nakuru" src="{{ asset('assets/nakurite/images/welcome_nakuru.png') }}" alt="">
            <img class="foreground" src="{{ asset('assets/nakurite/images/welcome_foreground.png') }}" alt="">
        </div>

        <div class="left-side">
            <h2 id="insane-effect-1">News from our beloved</h2>
            <label for="toggle-biography" id="nakuru-name-1"></label>
            <label for="toggle-popup">
                <p class="not-hover">We got you covered!</p>
            </label>
        </div>

        <div class="right-side">
            <label for="toggle-introduction" class="introduction">
                <div class="introduction-div">Introduction</div>
            </label>
            <label for="toggle-news" class="news">
                <div class="news-div">News</div>
            </label>
            <label for="toggle-discography" class="discography">
                <div class="discography-div">Discography</div>
            </label>
            <label for="toggle-merch" class="merch">
                <div class="merch-div">Merch</div>
            </label>
        </div>
    </div>

    <div id="biography" class="reveal-section">
        <div class="reveal-section-content">
            <h2>Biography</h2>
            <p>Your biography content goes here</p>
            <label for="toggle-biography" class="reveal-close-btn">Close</label>
        </div>
    </div>

    <div id="introduction" class="reveal-section">
        <div class="reveal-section-content">
            <h2>Introduction</h2>
            <p></p>
            <label for="toggle-none" class="reveal-close-btn">Close</label>
        </div>
    </div>

    <div id="news" class="reveal-section">
        <div class="reveal-section-content">
            <h2>News</h2>
            <p></p>
            <label for="toggle-none" class="reveal-close-btn">Close</label>
        </div>
    </div>

    <div id="discography" class="reveal-section">
        <div class="reveal-section-content">
            <h2>Discography</h2>
            <p></p>
            <label for="toggle-none" class="reveal-close-btn">Close</label>
        </div>
    </div>

    <div id="merch" class="reveal-section">
        <div class="reveal-section-content">
            <h2>Merch</h2>
            <p></p>
            <label for="toggle-none" class="reveal-close-btn">Close</label>
        </div>
    </div>

    <script src="{{ asset('assets/nakurite/scripts/global/EzSprite.js') }}"></script>
    <script src="{{ asset('assets/nakurite/scripts/global/glitchAnimation.js') }}"></script>
    <script src="{{ asset('assets/nakurite/scripts/global/EzParallax.js') }}"></script>

    <script src="{{ asset('assets/nakurite/scripts/particles.js') }}"></script>
    <script src="{{ asset('assets/nakurite/scripts/jellytank.js') }}"></script>
    <script src="{{ asset('assets/nakurite/scripts/starglitter.js') }}"></script>
    <script src="{{ asset('assets/nakurite/scripts/various.js') }}"></script>
</body>
</html>