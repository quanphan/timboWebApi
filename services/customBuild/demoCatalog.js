const CATALOG_VERSION = 1;

const DEMO_DISCLAIMER = "Demo data for development only. These choices are not confirmed PhanQuan Guitars workshop inventory, prices, or build specifications.";

const DEMO_CATEGORIES = [
  {
    "id": "instrument-type",
    "name": "Instrument type",
    "description": "Demo instrument families for a custom-build discussion. These are not confirmed PhanQuan models.",
    "selectionMode": "single",
    "required": true,
    "maxSelections": 1,
    "options": [
      {
        "id": "instrument-type.solid-body-electric",
        "name": "Solid-body electric (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "instrument-type.semi-hollow",
        "name": "Semi-hollow electric (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "instrument-type.acoustic",
        "name": "Acoustic (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "instrument-type.electric-bass",
        "name": "Electric bass (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "instrument-type.baritone",
        "name": "Baritone electric (demo)",
        "description": "Demo choice marked unavailable. It is not an offer to build this specification.",
        "active": false
      }
    ]
  },
  {
    "id": "body-shape",
    "name": "Body shape",
    "description": "Demo body outlines. Names describe a shape only and are not trademarks or confirmed templates.",
    "selectionMode": "single",
    "required": true,
    "maxSelections": 1,
    "options": [
      {
        "id": "body-shape.single-cut",
        "name": "Single-cut (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-shape.double-cut",
        "name": "Double-cut (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-shape.offset",
        "name": "Offset (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-shape.slab",
        "name": "Slab body (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-shape.dreadnought-style",
        "name": "Dreadnought-style (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-shape.concert-style",
        "name": "Concert-style (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "body-wood",
    "name": "Body wood",
    "description": "Demo body-wood choices for discussion. They are not a stock list or a tone guarantee.",
    "selectionMode": "single",
    "required": true,
    "maxSelections": 1,
    "options": [
      {
        "id": "body-wood.alder",
        "name": "Alder (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-wood.swamp-ash",
        "name": "Swamp ash (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-wood.mahogany",
        "name": "Mahogany (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-wood.basswood",
        "name": "Basswood (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "body-wood.korina",
        "name": "Korina (demo)",
        "description": "Demo choice marked unavailable. It is not an offer to build this specification.",
        "active": false
      }
    ]
  },
  {
    "id": "top-wood",
    "name": "Top wood",
    "description": "Demo top materials, including an explicit choice for no separate top.",
    "selectionMode": "single",
    "required": false,
    "maxSelections": 1,
    "options": [
      {
        "id": "top-wood.no-separate-top",
        "name": "No separate top (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "top-wood.flamed-maple",
        "name": "Flamed maple (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "top-wood.quilted-maple",
        "name": "Quilted maple (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "top-wood.spruce",
        "name": "Spruce (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "neck-wood",
    "name": "Neck wood",
    "description": "Demo neck-wood choices for discussion. They are not confirmed shop specifications.",
    "selectionMode": "single",
    "required": true,
    "maxSelections": 1,
    "options": [
      {
        "id": "neck-wood.hard-maple",
        "name": "Hard maple (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "neck-wood.mahogany",
        "name": "Mahogany (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "neck-wood.roasted-maple",
        "name": "Roasted maple (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "fingerboard",
    "name": "Fingerboard material",
    "description": "Demo fingerboard materials for discussion. They are not a statement of regulated timber supply.",
    "selectionMode": "single",
    "required": true,
    "maxSelections": 1,
    "options": [
      {
        "id": "fingerboard.maple",
        "name": "Maple (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "fingerboard.rosewood",
        "name": "Rosewood (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "fingerboard.ebony",
        "name": "Ebony (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "fingerboard.richlite",
        "name": "Richlite (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "pickups",
    "name": "Pickups",
    "description": "Demo pickup roles. Choose none, one, or several. These are not confirmed electronics.",
    "selectionMode": "multiple",
    "required": false,
    "maxSelections": 4,
    "options": [
      {
        "id": "pickups.neck-single-coil",
        "name": "Neck single-coil (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "pickups.middle-single-coil",
        "name": "Middle single-coil (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "pickups.bridge-single-coil",
        "name": "Bridge single-coil (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "pickups.neck-humbucker",
        "name": "Neck humbucker (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "pickups.bridge-humbucker",
        "name": "Bridge humbucker (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "pickups.p90",
        "name": "P-90 (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "pickups.piezo",
        "name": "Piezo (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "electronics",
    "name": "Electronics",
    "description": "Demo electronics layouts for discussion. They are not confirmed circuits.",
    "selectionMode": "single",
    "required": false,
    "maxSelections": 1,
    "options": [
      {
        "id": "electronics.passive",
        "name": "Passive (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "electronics.active",
        "name": "Active (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "electronics.passive-piezo",
        "name": "Passive with piezo blend (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "hardware",
    "name": "Hardware",
    "description": "Demo hardware finishes for discussion. They are not a plating or supplier specification.",
    "selectionMode": "single",
    "required": false,
    "maxSelections": 1,
    "options": [
      {
        "id": "hardware.nickel",
        "name": "Nickel (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "hardware.chrome",
        "name": "Chrome (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "hardware.black",
        "name": "Black (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "hardware.gold",
        "name": "Gold (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "bridge",
    "name": "Bridge",
    "description": "Demo bridge styles for discussion. They are not confirmed hardware.",
    "selectionMode": "single",
    "required": false,
    "maxSelections": 1,
    "options": [
      {
        "id": "bridge.stud-tailpiece",
        "name": "Stud tailpiece (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "bridge.hardtail",
        "name": "Hardtail (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "bridge.tremolo",
        "name": "Tremolo (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "bridge.pin-bridge",
        "name": "Pin bridge (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "finish-color",
    "name": "Finish color",
    "description": "Demo color directions, including an option to discuss a color that is not listed.",
    "selectionMode": "single",
    "required": false,
    "maxSelections": 1,
    "options": [
      {
        "id": "finish-color.natural",
        "name": "Natural (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-color.sunburst",
        "name": "Sunburst (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-color.black",
        "name": "Black (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-color.vintage-white",
        "name": "Vintage white (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-color.olive",
        "name": "Olive (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-color.discuss-custom",
        "name": "Discuss a custom color (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "finish-type",
    "name": "Finish type",
    "description": "Demo finish surfaces for discussion. They are not confirmed finishing schedules.",
    "selectionMode": "single",
    "required": true,
    "maxSelections": 1,
    "options": [
      {
        "id": "finish-type.gloss",
        "name": "Gloss (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-type.satin",
        "name": "Satin (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-type.oil",
        "name": "Oil (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "finish-type.open-pore",
        "name": "Open pore (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  },
  {
    "id": "custom-details",
    "name": "Additional custom details",
    "description": "Optional demo details such as binding or inlays. They are not confirmed artwork or pricing.",
    "selectionMode": "multiple",
    "required": false,
    "maxSelections": 6,
    "options": [
      {
        "id": "custom-details.body-binding",
        "name": "Body binding (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "custom-details.neck-binding",
        "name": "Neck binding (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "custom-details.block-inlays",
        "name": "Block inlays (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "custom-details.dot-inlays",
        "name": "Dot inlays (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "custom-details.headstock-veneer",
        "name": "Headstock veneer (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      },
      {
        "id": "custom-details.engraved-ornament",
        "name": "Engraved ornament (demo)",
        "description": "Demo choice only. Not confirmed inventory, pricing, or a workshop specification.",
        "active": true
      }
    ]
  }
];

module.exports = {
    CATALOG_VERSION,
    DEMO_DISCLAIMER,
    DEMO_CATEGORIES,
};
