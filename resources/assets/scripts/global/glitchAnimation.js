/*
Glitch Animation
By Asciiz

Supported attributes:

data-glitch : text to glitch and alternate (default: the same text)
data-glitch-time : glitch interval time in milliseconds (default: 50)
*/

const asciiTable = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
const asciiException = [" ", "\n", "°"]
const asciiLength = asciiTable.length

function randomAscii() {
    const rndIndex = Math.floor(Math.random() * asciiLength)
    return asciiTable[rndIndex]
}

function glitchEffect(element, text, time) {
    // Effect in "effect"
    if (parseInt(element.getAttribute("data-glitch-active"))) return
    element.setAttribute("data-glitch-active", 1)

    // Time interval
    const glitchTime = time || parseInt(element.getAttribute("data-glitch-time"))

    let ogText = text || element.getAttribute("data-glitch")
    let gText = ogText

    // Swap content
    if (element.getAttribute("data-glitch") != element.innerText) {
        element.setAttribute("data-glitch", element.innerText)
    }

    // Glitch interval
    if (glitchTime == 0) {
        element.setAttribute("data-glitch-active", 0)
        element.innerText = ogText
        return
    }

    let iteration = -1
    let glitchInterval = setInterval(() => {
        // Remap text
        gText = ogText.split("").map((letter, index) => {
            if (asciiException.indexOf(letter) > -1) return letter

            return index > iteration ? randomAscii() : letter
        }).join("")

        // Update element
        element.innerText = gText

        iteration++

        if (gText == ogText) {
            element.setAttribute("data-glitch-active", 0)
            clearInterval(glitchInterval)
        }
    }, glitchTime || 50)
}

function glitchActivate(element) {
    if (!element.getAttribute("data-glitch")) {
        element.setAttribute("data-glitch", element.innerText)
    }

    element.onmouseover = () => glitchEffect(element)
    element.ontouchstart = () => glitchEffect(element)
}

const glitchElement = document.querySelectorAll("[data-glitch]")
glitchElement.forEach(element => {
    glitchActivate(element)
})