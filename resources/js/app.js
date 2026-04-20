import jellyfishSpriteUrl from '../assets/images/jellyfish.png';
import starglitterSpriteUrl from '../assets/images/starglitter.png';
import welcomeBackgroundUrl from '../assets/images/welcome_background.png';
import welcomeNakuruUrl from '../assets/images/welcome_nakuru.png';
import welcomeForegroundUrl from '../assets/images/welcome_foreground.png';

window.nakuriteAssets = {
    ...(window.nakuriteAssets ?? {}),
    images: {
        ...(window.nakuriteAssets?.images ?? {}),
        jellyfish: jellyfishSpriteUrl,
        starglitter: starglitterSpriteUrl,
        welcomeBackground: welcomeBackgroundUrl,
        welcomeNakuru: welcomeNakuruUrl,
        welcomeForeground: welcomeForegroundUrl,
    },
};

import '../assets/scripts/global/EzSprite.js';
import '../assets/scripts/global/glitchAnimation.js';
import '../assets/scripts/global/EzParallax.js';

import '../assets/scripts/particles.js';
import '../assets/scripts/jellytank.js';
import '../assets/scripts/starglitter.js';
import '../assets/scripts/various.js';
