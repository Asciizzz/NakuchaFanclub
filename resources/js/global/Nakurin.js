// Live Nakuru entity that is semi-sentient and can be interacted with.

// require: EzCanvas3D.js

/*
Root
├─ Hip
│  ├─ Chest
│  │  ├─ Neck
│  │  │  └─ Head
│  │  ├─ ShoulderRight
│  │  │  └─ ForearmRight
│  │  └─ ShoulderLeft
│  │     └─ ForearmLeft
├─ ThighRight
│  └─ ShinRight
└─ ThighLeft
   └─ ShinLeft
*/

class Nakurin {
    #gl = null; // Needed for rendering

    // We can get away with this hardcode approach because the rig has very few bones
    // When hair rig is added, the number should only increase by about 4-8.
    HIERARCHY_ID = {
        "Root": 0,
            "Hip": 1,
                "Chest": 2,
                    "Neck": 3,
                        "Head": 4,
                "ShoulderRight": 5,
                    "ForearmRight": 6,
                "ShoulderLeft": 7,
                    "ForearmLeft": 8,
            "ThighRight": 9,
                "ShinRight": 10,
            "ThighLeft": 11,
                "ShinLeft": 12
    };

    MODEL_URL = "/models/Nakurin.glb";
}


window.Nakurin = Nakurin;