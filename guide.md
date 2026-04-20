I need your help with this, I want you to completely remove the iframe based logic (this also means removing the scope and selector value ofc). I realized that making a context menu that is aware of iframe is kind of... dumb, with how fragile it could be, especially when cross origin came into play, which makes it impossible to retrieve elements.

So i propose this iframe free rework:


class EzFloater

    FLOATER_ID = "ez-floater"
    FLOATER_STYLE_ID = "ez-floater-style"

    floater = div element with ID FLOATER_ID
            will be mounted to the body with fixed position

    // A collection of actions that can will be explain later
    actions = {
        "clickForCookies": function(element, event) {
            event->get position and stuff

            if event.pos in element
                element.text = "You got a cookie!"
        }, ...
    }

    // A collection of floaters
    displays = {
        "name": {
            // trigger: right click or long press
            context(element) {
                create a button
                button.dataset.click = "clickForCookies"
                can use other events like dataset. "hover" , "mousedown", etc
            } 
            // trigger: hover
            tooltip(element) { ... } 

            both will return a wrapper element that will be appended to the floater
        }, ...
    }

    // A collection of queries
    queries = {
        ".class or #id or any selector": {
            delegate: true or false, // whether to use event delegation or not,
            display: "name of display"


            // scope or selector no longer needed since we dont use iframe
        }
    }

    hideFloater(), showFloater(), setPosition(x, y) {
        self-explanatory
    }

    addAction(name, function) {
        this.actions[name] = function // set or override an action
    }

    addDisplay(name, {context, tooltip}) {
        in the case the object only contain A instead of B and display already exist, override the A with new A but keep the old B

        displays[name] = {
            context: context or displays[name]?.context,
            tooltip: tooltip or displays[name]?.tooltip
        }
    }

    addQuery(selector, {delegate, display}) { - as in display name
        queries[selector] = {
            delegate: delegate,
            display: display
        }
    }

    // The rest you can figure out, like event listeners, creating the floater element, etc. you can use the old code as reference, i also saved it in ./reference



window.EzFloater = EzFloater

every script that want to use EzFloater can just do

const floater = new EzFloater() (automatic initialization)