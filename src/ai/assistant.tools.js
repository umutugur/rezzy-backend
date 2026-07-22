// src/ai/assistant.tools.js
//
// Full tool catalog for the Gemini function-calling assistant.
// See docs/superpowers/specs/2026-07-16-full-assistant-design.md §2.
//
// Every tool: { name, description(EN), parameters(Gemini JSONSchema), mode }
//   mode: "read"    -> LLM may call freely, executor runs immediately, result
//                       is fed back to the model as a functionResponse.
//         "write"   -> LLM call is intercepted; a draft/confirmation card is
//                       produced instead of executing anything.
//         "handoff" -> LLM call is intercepted; the mobile app is told to
//                       open a specific screen (payment, receipt upload...).

const OBJECT = "OBJECT";
const STRING = "STRING";
const NUMBER = "NUMBER";
const BOOLEAN = "BOOLEAN";
const ARRAY = "ARRAY";

const geoPointSchema = {
  type: OBJECT,
  description: "A geographic point.",
  properties: {
    lat: { type: NUMBER, description: "Latitude." },
    lng: { type: NUMBER, description: "Longitude." },
    address: { type: STRING, description: "Free-text address label." },
  },
  required: ["lat", "lng"],
};

export const ASSISTANT_TOOLS = [
  // ─── READ TOOLS (17) ─────────────────────────────────────────────────
  {
    name: "get_my_context",
    description:
      "Get a live summary of the current user's state: active market/delivery orders, active taxi ride, upcoming reservations, active coupons, default address.",
    mode: "read",
    parameters: { type: OBJECT, properties: {}, required: [] },
  },
  {
    name: "search_restaurants",
    description:
      "Search restaurants/venues by free text query and optional filters (city, date, time, party size, budget, style). Returns items with `restaurantId` and `name` — always pass that exact `restaurantId` (never the restaurant name) to draft_reservation and get_restaurant.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: {
        q: { type: STRING, description: "Free-text search query." },
        filters: {
          type: OBJECT,
          description: "Optional structured filters.",
          properties: {
            city: { type: STRING },
            date: { type: STRING, description: "ISO date or natural phrase like 'tomorrow'." },
            time: { type: STRING, description: "Time or time range, e.g. '20:00' or '19:00-22:00'." },
            partySize: { type: NUMBER },
            budget: { type: STRING, description: "Budget level, e.g. '₺', '₺₺', '₺₺₺'." },
            style: { type: STRING, description: "Venue style, e.g. meyhane, steakhouse." },
          },
          required: [],
        },
      },
      required: [],
    },
  },
  {
    name: "get_restaurant",
    description: "Get full details for one restaurant/venue including menus and deposit policy.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { id: { type: STRING, description: "Restaurant id." } },
      required: ["id"],
    },
  },
  {
    name: "list_my_reservations",
    description: "List the current user's reservations, optionally filtered by status.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: {
        status: { type: STRING, description: "Optional status filter, e.g. 'upcoming', 'past', 'cancelled'." },
        limit: { type: NUMBER, description: "Max number of reservations to return." },
      },
      required: [],
    },
  },
  {
    name: "search_market_stores",
    description:
      "Search nearby market/grocery stores. Returns items with `storeId` and `name` — always pass that exact `storeId` (never the store name) to search_products and draft_market_order.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: {
        q: { type: STRING, description: "Free-text search query." },
        lat: { type: NUMBER },
        lng: { type: NUMBER },
      },
      required: [],
    },
  },
  {
    name: "search_products",
    description: "Search products within a market store, optionally by query or category.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: {
        storeId: { type: STRING, description: "Market store id." },
        q: { type: STRING, description: "Free-text search query." },
        category: { type: STRING, description: "Category filter." },
      },
      required: ["storeId"],
    },
  },
  {
    name: "get_market_order_status",
    description: "Get the status of a market order. If orderId is omitted, returns the user's most recent order.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { orderId: { type: STRING } },
      required: [],
    },
  },
  {
    name: "search_delivery_restaurants",
    description: "Search restaurants that offer food delivery, by free text query.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { q: { type: STRING } },
      required: [],
    },
  },
  {
    name: "get_delivery_menu",
    description: "Get the delivery menu (items, prices, modifiers) for a restaurant.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { restaurantId: { type: STRING } },
      required: ["restaurantId"],
    },
  },
  {
    name: "get_delivery_order_status",
    description: "Get the status of the user's delivery order. If orderId is omitted, returns the most recent one.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { orderId: { type: STRING } },
      required: [],
    },
  },
  {
    name: "taxi_quote",
    description:
      "Get a fare quote for a taxi ride between two points, optionally for a specific vehicle type. Uses regional tariff (restaurant-linked region if provided).",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: {
        pickup: geoPointSchema,
        dropoff: geoPointSchema,
        vehicleType: { type: STRING, description: "e.g. 'standard', 'comfort', 'xl'." },
      },
      required: ["pickup", "dropoff"],
    },
  },
  {
    name: "get_ride_status",
    description: "Get the status of the user's active or most recent taxi ride.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { rideId: { type: STRING } },
      required: [],
    },
  },
  {
    name: "list_scheduled_rides",
    description: "List the user's scheduled (future/planned) taxi rides.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { status: { type: STRING, description: "Optional status filter." } },
      required: [],
    },
  },
  {
    name: "my_coupons",
    description: "List coupons/wallet campaigns available to the current user.",
    mode: "read",
    parameters: { type: OBJECT, properties: {}, required: [] },
  },
  {
    name: "applicable_campaigns",
    description: "List campaigns applicable to a given surface (e.g. 'market', 'delivery', 'taxi'), optionally scoped to a store.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: {
        surface: { type: STRING, description: "Surface name, e.g. 'market', 'delivery', 'taxi', 'reservation'." },
        storeId: { type: STRING },
      },
      required: ["surface"],
    },
  },
  {
    name: "list_my_addresses",
    description: "List the current user's saved addresses.",
    mode: "read",
    parameters: { type: OBJECT, properties: {}, required: [] },
  },
  {
    name: "faq",
    description: "Look up an FAQ answer for a given topic (e.g. no-show policy, payment methods) when nothing else applies.",
    mode: "read",
    parameters: {
      type: OBJECT,
      properties: { topic: { type: STRING } },
      required: ["topic"],
    },
  },

  // ─── WRITE TOOLS (12) — always produce a draft, never execute directly ──
  {
    name: "draft_reservation",
    description:
      "Prepare a draft to create a new restaurant reservation. Does not book anything yet; the server recomputes price/deposit and returns a confirmation card.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        restaurantId: { type: STRING, description: "The restaurant id from search_restaurants items[].restaurantId (NEVER the restaurant name)." },
        dateTimeISO: { type: STRING, description: "ISO 8601 date-time for the reservation." },
        partySize: { type: NUMBER },
        menuSelections: {
          type: ARRAY,
          description: "Optional pre-selected menu items.",
          items: {
            type: OBJECT,
            properties: {
              menuItemId: { type: STRING },
              qty: { type: NUMBER },
            },
            required: ["menuItemId", "qty"],
          },
        },
      },
      required: ["restaurantId", "dateTimeISO", "partySize"],
    },
  },
  {
    name: "draft_reservation_cancel",
    description: "Prepare a draft to cancel an existing reservation.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: { rid: { type: STRING, description: "Reservation id." } },
      required: ["rid"],
    },
  },
  {
    name: "draft_reservation_modify",
    description: "Prepare a draft to modify an existing reservation's date/time or party size.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        rid: { type: STRING, description: "Reservation id." },
        dateTimeISO: { type: STRING },
        partySize: { type: NUMBER },
      },
      required: ["rid"],
    },
  },
  {
    name: "draft_market_order",
    description:
      "Prepare a draft market/grocery order (cash or card-on-delivery only; online payment requires handoff). Server recomputes totals.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        storeId: { type: STRING, description: "The store id from search_market_stores items[].storeId (NEVER the store name)." },
        items: {
          type: ARRAY,
          items: {
            type: OBJECT,
            properties: {
              productId: { type: STRING, description: "The product id from search_products (NEVER the product name)." },
              qty: { type: NUMBER },
            },
            required: ["productId", "qty"],
          },
        },
        fulfillment: { type: STRING, description: "'delivery' (default) or 'pickup' (gel-al). Use 'pickup' when the user wants to collect the order themselves; no address is needed then." },
        addressId: { type: STRING, description: "Optional, delivery only. Address id from list_my_addresses; if omitted the user's default saved address is used automatically." },
        paymentMethod: { type: STRING, description: "'cash' or 'card_on_delivery'." },
        couponCampaignId: { type: STRING },
        outOfStockPreference: { type: STRING, description: "'substitute', 'remove', or 'call'." },
      },
      required: ["storeId", "items", "paymentMethod"],
    },
  },
  {
    name: "draft_market_order_cancel",
    description: "Prepare a draft to cancel a market order.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: { orderId: { type: STRING } },
      required: ["orderId"],
    },
  },
  {
    name: "draft_delivery_order",
    description:
      "Prepare a draft food delivery order (cash on delivery only; online payment requires handoff). Server recomputes totals.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        restaurantId: { type: STRING },
        items: {
          type: ARRAY,
          items: {
            type: OBJECT,
            properties: {
              itemId: { type: STRING },
              qty: { type: NUMBER },
              modifiers: {
                type: ARRAY,
                items: { type: STRING },
              },
            },
            required: ["itemId", "qty"],
          },
        },
        addressId: { type: STRING },
        paymentMethod: { type: STRING, description: "Cash-on-delivery payment method." },
        couponCampaignId: { type: STRING },
        note: { type: STRING },
      },
      required: ["restaurantId", "items", "addressId", "paymentMethod"],
    },
  },
  {
    name: "draft_delivery_order_cancel",
    description: "Prepare a draft to cancel a delivery order.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: { orderId: { type: STRING } },
      required: ["orderId"],
    },
  },
  {
    name: "draft_taxi_call",
    description: "Prepare a draft to call a taxi now (cash payment only). Server recomputes fare.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        pickup: geoPointSchema,
        dropoff: geoPointSchema,
        vehicleType: { type: STRING },
        acceptsPets: { type: BOOLEAN },
        paymentMethod: { type: STRING, description: "Must be 'cash'." },
      },
      required: ["pickup", "dropoff", "vehicleType", "paymentMethod"],
    },
  },
  {
    name: "draft_taxi_cancel",
    description: "Prepare a draft to cancel the user's active taxi ride.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: { rideId: { type: STRING } },
      required: ["rideId"],
    },
  },
  {
    name: "draft_scheduled_ride",
    description: "Prepare a draft to create a scheduled (future) taxi ride.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        pickup: geoPointSchema,
        dropoff: geoPointSchema,
        scheduledAtISO: { type: STRING, description: "ISO 8601 date-time for the scheduled ride." },
        vehicleType: { type: STRING },
        paymentMethod: { type: STRING },
      },
      required: ["pickup", "dropoff", "scheduledAtISO"],
    },
  },
  {
    name: "draft_scheduled_ride_edit",
    description: "Prepare a draft to edit an existing scheduled ride (time and/or points).",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: {
        scheduledRideId: { type: STRING },
        scheduledAtISO: { type: STRING },
        pickup: geoPointSchema,
        dropoff: geoPointSchema,
      },
      required: ["scheduledRideId"],
    },
  },
  {
    name: "draft_scheduled_ride_cancel",
    description: "Prepare a draft to cancel a scheduled ride.",
    mode: "write",
    parameters: {
      type: OBJECT,
      properties: { scheduledRideId: { type: STRING } },
      required: ["scheduledRideId"],
    },
  },

  // ─── HANDOFF (1) ─────────────────────────────────────────────────────
  {
    name: "handoff",
    description:
      "Ask the mobile app to open a specific screen instead of continuing in chat. Use for online payment, receipt upload, or complex modifier selection that needs a real UI.",
    mode: "handoff",
    parameters: {
      type: OBJECT,
      properties: {
        screen: { type: STRING, description: "Deep-link screen name, e.g. 'MarketCart', 'PaymentScreen', 'TaxiDestination'." },
        params: { type: OBJECT, description: "Parameters for the target screen.", properties: {}, required: [] },
        label: { type: STRING, description: "Short label for the handoff button, localized to the user's language." },
      },
      required: ["screen", "label"],
    },
  },
];

/**
 * Strip the internal `mode` field and produce Gemini-compatible
 * functionDeclarations (`{name, description, parameters}`).
 */
export function toGeminiDeclarations(tools) {
  return (Array.isArray(tools) ? tools : []).map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}
