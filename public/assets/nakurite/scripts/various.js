    
const WELCOME_LEFT_SIDE_CONFIG = {
    trigger: {
        delay: 300,
        threshold: 0.2,
        sentinelHeightPercent: 10
    },
    top: {
        selector: "#insane-effect-1",
        text: "Are you a fan of",
        preserveSpaces: true,
        initialOffset: (index, total) => 260 + (total - 1 - index) * 62,
        durationVar: "--fly-duration",
        fromProperty: "--from-x",
        revealClass: "fly-in-left",
        baseGap: 200,
        minGap: 26,
        accel: 0.73,
        durationStart: 0.58,
        durationFloor: 0.14,
        durationStep: 0.035
    },
    mid: {
        selector: "#nakuru-name-1",
        text: "Nakuru?",
        preserveSpaces: false,
        initialOffset: (index) => (index % 2 === 0 ? -160 : 160),
        durationVar: "--nakuru-in-duration",
        fromProperty: null,
        baseGap: 210,
        minGap: 24,
        accel: 0.81,
        durationStart: 0.52,
        durationFloor: 0.16,
        durationStep: 0.04,
        bounceCooldown: 4000,
        bounceStagger: 100,
        bounceDuration: 500
    },
    bottom: {
        selector: "#welcome .left-side label[for='toggle-popup']",
        initialStyle: {
            opacity: "0",
            ctaLift: "24px",
            transition: "0.28s ease-out"
        },
        revealStyle: {
            opacity: "1",
            ctaLift: "0px"
        },
        revealDelayAfterMid: 120,
    },
};

const WELCOME_PARALLAX_CONFIG = {
    ease: 0.08,
    restThreshold: 0.02,
    exitProgress: { x: 0.5, y: 0.5 },
    background: {
        translateX: 5,
        translateY: 2,
        rotateX: 0.4,
        rotateY: 0.2,
    },
    nakuru: {
        translateX: 28,
        translateY: 20,
        rotateX: 1.25,
        rotateY: 1.45,
    },
    foreground: {
        translateX: 35,
        translateY: 24,
        rotateX: 5.95,
        rotateY: 1.55,
    },
    leftside: {
        translateX: 40,
        translateY: 20,
        rotateX: 0.8,
        rotateY: 1.5,

        // Layers
        top: {
            translateX: 22,
            translateY: 16,
            rotateX: 0.8,
            rotateY: 1.5,
        },
        mid: {
            translateX: 40,
            translateY: 32,
            rotateX: 0.8,
            rotateY: 1.5,
        },
        bottom: {
            translateX: 26,
            translateY: 19,
            rotateX: 0.8,
            rotateY: 1.5,
        },
    },

    rightside: {
        translateX: 28,
        translateY: 16,
        rotateX: 0.8,
        rotateY: 1.5,

        general: {
            translateX: 32,
            translateY: 52,
            rotateX: 0.4,
            rotateY: 1.0,
        }
    },
};

function createRevealSentinel(container, bandPercent) {
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.position = "absolute";
    sentinel.style.left = "0";
    sentinel.style.top = `${100 - bandPercent}%`;
    sentinel.style.width = "100%";
    sentinel.style.height = `${bandPercent}%`;
    sentinel.style.pointerEvents = "none";
    sentinel.style.opacity = "0";
    container.appendChild(sentinel);
    return sentinel;
}

function createTextSpans(target, text, options) {
    target.innerHTML = "";
    const spans = [];
    const letters = Array.from(text);
    const total = letters.length;

    letters.forEach((letter, index) => {
        const span = document.createElement("span");
        span.textContent = options.preserveSpaces && letter === " " ? "\u00A0" : letter;

        const offset = options.initialOffset(index, total);
        span.style.display = "inline-block";

        if (options.fromProperty === "--from-x") {
            span.style.setProperty(options.fromProperty, `-${offset}px`);
        } else {
            span.style.opacity = "0";
            span.style.transform = `translateY(${offset}px)`;
            span.style.transition = "transform var(--nakuru-in-duration, 0.45s) cubic-bezier(0.22, 1, 0.36, 1), opacity var(--nakuru-in-duration, 0.45s) ease-out";
        }

        target.appendChild(span);
        spans.push(span);
    });

    return spans;
}

function animateStaggeredSequence(spans, options, revealCallback) {
    const ordered = options.reversed ? [...spans].reverse() : spans;
    let elapsed = 0;

    ordered.forEach((span, step) => {
        const duration = Math.max(options.durationFloor, options.durationStart - step * options.durationStep);
        span.style.setProperty(options.durationVar, `${duration}s`);

        setTimeout(() => {
            revealCallback(span, step);
        }, elapsed);

        const gap = Math.max(options.minGap, Math.round(options.baseGap * Math.pow(options.accel, step)));
        elapsed += gap;
    });

    return elapsed;
}

// News left-side intro animations (single synchronized observer)
(function() {
    const newsContainer = document.getElementById("welcome");
    const leftSide = document.querySelector("#welcome .left-side");
    const topTarget = document.querySelector(WELCOME_LEFT_SIDE_CONFIG.top.selector);
    const midTarget = document.querySelector(WELCOME_LEFT_SIDE_CONFIG.mid.selector);
    const bottomTarget = document.querySelector(WELCOME_LEFT_SIDE_CONFIG.bottom.selector);
    
    if (!newsContainer || !leftSide || !topTarget || !midTarget || !bottomTarget) return;

    const revealSentinel = createRevealSentinel(newsContainer, WELCOME_LEFT_SIDE_CONFIG.trigger.sentinelHeightPercent);

    const topSpans = createTextSpans(topTarget, WELCOME_LEFT_SIDE_CONFIG.top.text, {
        preserveSpaces: WELCOME_LEFT_SIDE_CONFIG.top.preserveSpaces,
        initialOffset: WELCOME_LEFT_SIDE_CONFIG.top.initialOffset,
        fromProperty: WELCOME_LEFT_SIDE_CONFIG.top.fromProperty,
    });

    const midSpans = createTextSpans(midTarget, WELCOME_LEFT_SIDE_CONFIG.mid.text, {
        preserveSpaces: WELCOME_LEFT_SIDE_CONFIG.mid.preserveSpaces,
        initialOffset: WELCOME_LEFT_SIDE_CONFIG.mid.initialOffset,
        fromProperty: WELCOME_LEFT_SIDE_CONFIG.mid.fromProperty,
    });

    bottomTarget.style.opacity = WELCOME_LEFT_SIDE_CONFIG.bottom.initialStyle.opacity;
    bottomTarget.style.setProperty("--cta-lift", WELCOME_LEFT_SIDE_CONFIG.bottom.initialStyle.ctaLift);
    bottomTarget.style.transition = WELCOME_LEFT_SIDE_CONFIG.bottom.initialStyle.transition;

    let introLoaded = false;
    let bounceCooldown = false;

    midTarget.addEventListener("mousemove", () => {
        if (!introLoaded || bounceCooldown) return;

        midSpans.forEach((span, index) => {
            setTimeout(() => {
                span.classList.add("bounce");
                setTimeout(() => span.classList.remove("bounce"), WELCOME_LEFT_SIDE_CONFIG.mid.bounceDuration);
            }, index * WELCOME_LEFT_SIDE_CONFIG.mid.bounceStagger);
        });

        bounceCooldown = true;
        setTimeout(() => {
            bounceCooldown = false;
        }, WELCOME_LEFT_SIDE_CONFIG.mid.bounceCooldown);
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            setTimeout(() => {
                const topElapsed = animateStaggeredSequence(topSpans, {
                    reversed: true,
                    durationVar: WELCOME_LEFT_SIDE_CONFIG.top.durationVar,
                    baseGap: WELCOME_LEFT_SIDE_CONFIG.top.baseGap,
                    minGap: WELCOME_LEFT_SIDE_CONFIG.top.minGap,
                    accel: WELCOME_LEFT_SIDE_CONFIG.top.accel,
                    durationStart: WELCOME_LEFT_SIDE_CONFIG.top.durationStart,
                    durationFloor: WELCOME_LEFT_SIDE_CONFIG.top.durationFloor,
                    durationStep: WELCOME_LEFT_SIDE_CONFIG.top.durationStep,
                }, (span) => {
                    span.classList.add(WELCOME_LEFT_SIDE_CONFIG.top.revealClass);
                });

                const midElapsed = animateStaggeredSequence(midSpans, {
                    reversed: false,
                    durationVar: WELCOME_LEFT_SIDE_CONFIG.mid.durationVar,
                    baseGap: WELCOME_LEFT_SIDE_CONFIG.mid.baseGap,
                    minGap: WELCOME_LEFT_SIDE_CONFIG.mid.minGap,
                    accel: WELCOME_LEFT_SIDE_CONFIG.mid.accel,
                    durationStart: WELCOME_LEFT_SIDE_CONFIG.mid.durationStart,
                    durationFloor: WELCOME_LEFT_SIDE_CONFIG.mid.durationFloor,
                    durationStep: WELCOME_LEFT_SIDE_CONFIG.mid.durationStep,
                }, (span) => {
                    span.style.opacity = "1";
                    span.style.transform = "translateY(0)";
                });

                setTimeout(() => {
                    bottomTarget.style.opacity = WELCOME_LEFT_SIDE_CONFIG.bottom.revealStyle.opacity;
                    bottomTarget.style.setProperty("--cta-lift", WELCOME_LEFT_SIDE_CONFIG.bottom.revealStyle.ctaLift);
                }, midElapsed + WELCOME_LEFT_SIDE_CONFIG.bottom.revealDelayAfterMid);

                const introDoneAt = Math.max(topElapsed, midElapsed + WELCOME_LEFT_SIDE_CONFIG.bottom.revealDelayAfterMid);
                setTimeout(() => {
                    introLoaded = true;
                }, introDoneAt + 140);
            }, WELCOME_LEFT_SIDE_CONFIG.trigger.delay);

            observer.disconnect();
        });
    }, { threshold: WELCOME_LEFT_SIDE_CONFIG.trigger.threshold });

    observer.observe(revealSentinel);
})();


// Welcome parallax with ezParallax
(function() {
    const owner = document.getElementById("welcome");

    const background = document.querySelector("#welcome .background");
    const starglitter = document.querySelector("#welcome #starglitter");
    const nakuru = document.querySelector("#welcome .nakuru");
    const foreground = document.querySelector("#welcome .foreground");

    const leftside = document.querySelector("#welcome .left-side");
    const lefttop = document.querySelector("#welcome #insane-effect-1");
    const leftmid = document.querySelector("#welcome #nakuru-name-1");
    const leftbottom = document.querySelector("#welcome .left-side label[for='toggle-popup']");

    const rightside = document.querySelector("#welcome .right-side");
    const togglePopup = document.getElementById("toggle-popup");

    const cfg = WELCOME_PARALLAX_CONFIG;
    const attrs = [
        {
            element: background,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry) scale(1.01)",
            axisX: {
                0: {
                    "x": -cfg.background.translateX,
                    "ry": -cfg.background.rotateY ,
                },
                1: {
                    "x": cfg.background.translateX ,
                    "ry": cfg.background.rotateY ,
                },
            },
            axisY: {
                0: {
                    "y": -cfg.background.translateY ,
                    "rx": cfg.background.rotateX 
                },
                1: {
                    "y": cfg.background.translateY ,
                    "rx": -cfg.background.rotateX  ,
                },
            },
        },
        {
            element: starglitter,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry)",
            axisX: {
                0: {
                    "x": -cfg.nakuru.translateX * 2.0 ,
                    "ry": -cfg.nakuru.rotateY * 2.0 ,
                },
                1: {
                    "x": cfg.nakuru.translateX * 2.0 ,
                    "ry": cfg.nakuru.rotateY * 2.0 ,
                },
            },
            axisY: {
                0: {
                    "y": -cfg.nakuru.translateY * 2.0 ,
                    "rx": cfg.nakuru.rotateX * 2.0 ,
                },
                1: {
                    "y": cfg.nakuru.translateY * 2.0 ,
                    "rx": -cfg.nakuru.rotateX * 2.0 ,
                },
            },
        },
        {
            element: nakuru,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry)",
            axisX: {
                0: {
                    "x": -cfg.nakuru.translateX ,
                    "ry": -cfg.nakuru.rotateY ,
                },
                1: {
                    "x": cfg.nakuru.translateX ,
                    "ry": cfg.nakuru.rotateY ,
                },
            },
            axisY: {
                0: {
                    "y": -cfg.nakuru.translateY ,
                    "rx": cfg.nakuru.rotateX ,
                },
                1: {
                    "y": cfg.nakuru.translateY ,
                    "rx": -cfg.nakuru.rotateX ,
                },
            },
        },
        {
            element: foreground,
            template: "translate3d($x,$y,40px) rotateX($rx) rotateY($ry) scale(1.0)",
            axisX: {
                0: {
                    "x": -cfg.foreground.translateX,
                    "ry": -cfg.foreground.rotateY
                },
                1: {
                    "x": cfg.foreground.translateX,
                    "ry": cfg.foreground.rotateY
                }
            },
            axisY: {
                0: {
                    "y": -cfg.foreground.translateY,
                    "rx": cfg.foreground.rotateX
                },
                1: {
                    "y": cfg.foreground.translateY,
                    "rx": -cfg.foreground.rotateX
                }
            }
        },


        {
            element: leftside,
            template: "translate3d($x,$y,$z) rotateY($ry) scale(1.0)",
            axisX: {
                0: { 
                    "x": -cfg.leftside.translateX,
                    "ry": -cfg.leftside.rotateY
                },
                1: { 
                    "x": cfg.leftside.translateX,
                    "ry": cfg.leftside.rotateY
                }
            },
            axisY: {
                0: { 
                    "y": -cfg.leftside.translateY,
                    "rx": cfg.leftside.rotateX
                },
                1: { 
                    "y": cfg.leftside.translateY,
                    "rx": -cfg.leftside.rotateX
                }
            },
        },
        {
            element: lefttop,
            template: "translate3d($lx,$ly,0) rotateX($rx) rotateY(calc(-5deg + $ry)) scale3d($sx,$sy,$sz)",
            axisX: {
                0: {
                    "lx": -cfg.leftside.top.translateX ,
                    "ry": -cfg.leftside.top.rotateY ,
                },
                1: {
                    "lx": cfg.leftside.top.translateX ,
                    "ry": cfg.leftside.top.rotateY ,
                },
            },
            axisY: {
                0: {
                    "ly": -cfg.leftside.top.translateY ,
                    "rx": cfg.leftside.top.rotateX ,
                },
                1: {
                    "ly": cfg.leftside.top.translateY ,
                    "rx": -cfg.leftside.top.rotateX ,
                },
            }
        },
        {
            element: leftmid,
            template: "translate3d($lx,$ly,0) rotateX($rx) rotateY(calc(-5deg + $ry)) scale3d($sx,$sy,$sz)",
            axisX: {
                0: {
                    "lx": -cfg.leftside.mid.translateX ,
                    "ry": -cfg.leftside.mid.rotateY ,
                },
                1: {
                    "lx": cfg.leftside.mid.translateX ,
                    "ry": cfg.leftside.mid.rotateY ,
                },
            },
            axisY: {
                0: {
                    "ly": -cfg.leftside.mid.translateY ,
                    "rx": cfg.leftside.mid.rotateX ,
                },
                1: {
                    "ly": cfg.leftside.mid.translateY ,
                    "rx": -cfg.leftside.mid.rotateX ,
                },
            }
        },
        {
            element: leftbottom,
            template: "translate3d($lx,$ly,0) rotateX($rx) rotateY(calc(-5deg + $ry)) scale3d($sx,$sy,$sz) translateY(var(--cta-lift, 0px))",
            axisX: {
                0: {
                    "lx": -cfg.leftside.bottom.translateX ,
                    "ry": -cfg.leftside.bottom.rotateY ,
                },
                1: {
                    "lx": cfg.leftside.bottom.translateX ,
                    "ry": cfg.leftside.bottom.rotateY ,
                },
            },
            axisY: {
                0: {
                    "ly": -cfg.leftside.bottom.translateY ,
                    "rx": cfg.leftside.bottom.rotateX ,
                },
                1: {
                    "ly": cfg.leftside.bottom.translateY ,
                    "rx": -cfg.leftside.bottom.rotateX ,
                },
            }
        },


        {
            element: rightside,
            template: "translate3d($x,$y,$z) rotateX($rx) rotateY($ry) scale(1.0)",
            axisX: {
                0: { 
                    "x": -cfg.rightside.translateX,
                    "ry": -cfg.rightside.rotateY
                },
                1: { 
                    "x": cfg.rightside.translateX,
                    "ry": cfg.rightside.rotateY
                },
            },
            axisY: {
                0: { 
                    "y": -cfg.rightside.translateY,
                    "rx": cfg.rightside.rotateX
                },
                1: {
                    "y": cfg.rightside.translateY,
                    "rx": -cfg.rightside.rotateX
                },
            },
        },
    ];

    const multX = [0.8, 1.0, 0.9, 0.7];
    const multY = [1.0, 0.8, 0.8, 1.0];
    
    const rightLabelDivs = document.querySelectorAll("#welcome .right-side label");
    for (let i = 0; i < rightLabelDivs.length; i++) {
        const labelDiv = rightLabelDivs[i];

        let mx = multX[i % multX.length];
        let my = multY[i % multY.length];
        
        const attr = {
            element: labelDiv,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry)",
            axisX: {
                0: { 
                    "x": -cfg.rightside.general.translateX * mx,
                    "ry": -cfg.rightside.general.rotateY
                },
                1: { 
                    "x": cfg.rightside.general.translateX * mx,
                    "ry": cfg.rightside.general.rotateY
                }
            },
            axisY: {
                0: {
                    "y": -cfg.rightside.general.translateY * my,
                    "rx": cfg.rightside.general.rotateX
                },
                1: {
                    "y": cfg.rightside.general.translateY * my,
                    "rx": -cfg.rightside.general.rotateX
                }
            }
        };

        attrs.push(attr);
    }



    const welcomeParallax = window.ezParallax.create({
        owner,
        ease: cfg.ease,
        restThreshold: cfg.restThreshold,
        exitProgress: cfg.exitProgress,
        attrs: attrs
    });

    if (welcomeParallax && togglePopup) {
        togglePopup.addEventListener("change", () => {
            welcomeParallax.refresh();
        });
    }
})();


// Shared circle reveal + copied tank controller for content sections
(function() {
    const sectionLinks = [
        { inputId: "toggle-biography", sectionId: "biography" },
        { inputId: "toggle-introduction", sectionId: "introduction" },
        { inputId: "toggle-news", sectionId: "news" },
        { inputId: "toggle-discography", sectionId: "discography" },
        { inputId: "toggle-merch", sectionId: "merch" },
    ];

    const sections = [];
    for (const link of sectionLinks) {
        const input = document.getElementById(link.inputId);
        const section = document.getElementById(link.sectionId);
        if (!input || !section) continue;

        sections.push({
            input,
            section,
            host: null,
            closeTimerId: null,
            mainStopTimerId: null,
        });
    }

    if (sections.length === 0) return;

    const createTankHost = () => {
        const host = document.createElement("div");
        host.dataset.jellyCopyHost = "true";
        host.style.position = "absolute";
        host.style.inset = "0";
        host.style.zIndex = "0";
        host.style.pointerEvents = "none";
        host.style.overflow = "hidden";
        return host;
    };

    const destroyTankHost = (host) => {
        if (!host) return;

        const tank = window.JellyTank?.getInstance?.(host);
        if (tank) {
            tank.destroy({ clearDom: true });
        }

        if (host.parentNode) {
            host.parentNode.removeChild(host);
        }
    };

    const copyTankBackToMain = (host, startMain = true) => {
        if (!host || !window.jellyTank || !window.JellyTank) return;

        const sectionTank = window.JellyTank.getInstance(host);
        const mainContainer = window.jellyTank.container;
        if (!sectionTank || !mainContainer || typeof sectionTank.copyStateTo !== "function") return;

        sectionTank.copyStateTo(mainContainer, {
            reuseTarget: true,
            start: startMain,
            clearExisting: true,
            keepRuntimeOptions: true,
        });
    };

    const getOpenDurationMs = (section) => {
        const raw = getComputedStyle(section).getPropertyValue("--reveal-open-duration").trim();
        if (!raw) return 500;

        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed)) return 500;
        if (raw.endsWith("ms")) return parsed;
        return parsed * 1000;
    };

    const getCloseDurationMs = (section) => {
        const raw = getComputedStyle(section).getPropertyValue("--reveal-close-duration").trim();
        if (!raw) return 400;

        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed)) return 400;
        if (raw.endsWith("ms")) return parsed;
        return parsed * 1000;
    };

    const isSectionOpen = (item) => item.input.checked;

    const hasOpenSections = () => sections.some((item) => item.input.checked);

    const getMainTank = () => window.jellyTank ?? null;

    const getSourceTankForSection = (item) => {
        const mainTank = getMainTank();
        if (!mainTank) return null;

        const hasMainEntities = mainTank.getJellyElements().length > 0 || mainTank.getBubbleElements().length > 0;
        if (hasMainEntities) {
            return mainTank;
        }

        const fallbackSection = sections.find((other) => other !== item && other.host);
        if (!fallbackSection?.host) return mainTank;

        return window.JellyTank.getInstance(fallbackSection.host) ?? mainTank;
    };

    const pauseMainTankAfterOpen = (item) => {
        if (item.mainStopTimerId != null) {
            clearTimeout(item.mainStopTimerId);
            item.mainStopTimerId = null;
        }

        const mainTank = getMainTank();
        if (!mainTank) return;

        item.mainStopTimerId = window.setTimeout(() => {
            if (!item.input.checked || !item.host) {
                item.mainStopTimerId = null;
                return;
            }

            mainTank.stop();
            mainTank.clearAllEntities();
            item.mainStopTimerId = null;
        }, getOpenDurationMs(item.section));
    };

    const openSection = (item) => {
        if (item.closeTimerId != null) {
            clearTimeout(item.closeTimerId);
            item.closeTimerId = null;
        }

        if (item.host) return;

        item.host = createTankHost();
        item.section.insertBefore(item.host, item.section.firstChild);

        const sourceTank = getSourceTankForSection(item);
        if (sourceTank && typeof sourceTank.copyStateTo === "function") {
            sourceTank.copyStateTo(item.host, {
                reuseTarget: false,
                start: true,
                targetOptions: {
                    autoStart: false,
                    startupJellyRatio: 0,
                    startupBubbleRatio: 0,
                },
            });

            if (sourceTank === getMainTank()) {
                pauseMainTankAfterOpen(item);
            }
        }
    };

    const closeSection = (item) => {
        if (item.closeTimerId != null) {
            clearTimeout(item.closeTimerId);
            item.closeTimerId = null;
        }
        if (!item.host) return;

        const closingHost = item.host;
        const closeDuration = getCloseDurationMs(item.section);
        item.closeTimerId = window.setTimeout(() => {
            const shouldStartMain = !hasOpenSections();
            copyTankBackToMain(closingHost, shouldStartMain);
            destroyTankHost(closingHost);
            if (item.host === closingHost) {
                item.host = null;
            }

            if (item.mainStopTimerId != null) {
                clearTimeout(item.mainStopTimerId);
                item.mainStopTimerId = null;
            }

            item.closeTimerId = null;
        }, closeDuration);
    };

    const syncSections = () => {
        for (const item of sections) {
            if (isSectionOpen(item)) {
                openSection(item);
            } else {
                closeSection(item);
            }
        }
    };

    const setRevealOriginFromEvent = (e) => {
        for (const item of sections) {
            const rect = item.section.getBoundingClientRect();
            const localX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const localY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

            item.section.style.setProperty("--reveal-x", `${localX}px`);
            item.section.style.setProperty("--reveal-y", `${localY}px`);
        }
    };

    document.addEventListener("pointermove", setRevealOriginFromEvent, true);
    document.addEventListener("pointerdown", setRevealOriginFromEvent, true);

    const syncInputIds = ["toggle-none", ...sectionLinks.map((link) => link.inputId)];
    const syncInputs = new Set();
    for (const inputId of syncInputIds) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        syncInputs.add(input);
    }

    for (const input of syncInputs) {
        input.addEventListener("change", syncSections);
    }

    syncSections();
})();