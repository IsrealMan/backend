/**
 * workers/changeStream.js
 *
 * MongoDB Change Stream bridge — equivalent to Project A's alertBridge.js (PG NOTIFY).
 *
 * Watches the 'alerts' and 'recommendations' collections for changes and
 * pushes real-time events to all connected WebSocket clients.
 *
 * Event types emitted:
 *   alert:changed        — an alert was inserted or its active status changed
 *   recommendations:changed — a recommendation was inserted/updated/deleted
 *
 * NOTE: Change Streams require a MongoDB replica set or Atlas cluster.
 * On a standalone local MongoDB the watcher will gracefully skip with a warning.
 */

import Alert from "../models/Alert.js";
import Recommendation from "../models/Recommendation.js";
import { broadcastToAll } from "../utils/websocket.js";

let alertStream = null;
let recommendationStream = null;

export async function startChangeStream() {
  try {
    // ── Watch alerts ──────────────────────────────────────────
    alertStream = Alert.watch([], { fullDocument: "updateLookup" });

    alertStream.on("change", (change) => {
      if (change.operationType === "insert" || change.operationType === "update") {
        const doc = change.fullDocument;
        broadcastToAll({
          type: "alert:changed",
          alert: {
            id:       doc._id,
            name:     doc.name,
            severity: doc.severity,
            active:   doc.active,
          },
          timestamp: new Date().toISOString(),
        });
        console.log(
          `[changeStream] alert:changed  name=${doc.name}  active=${doc.active}`
        );
      }
    });

    alertStream.on("error", async (err) => {
      console.error("[changeStream] Alert stream error:", err.message);
      await closeStreams();
      setTimeout(startChangeStream, 3000);
    });

    // ── Watch recommendations ─────────────────────────────────
    recommendationStream = Recommendation.watch([], { fullDocument: "updateLookup" });

    recommendationStream.on("change", () => {
      broadcastToAll({
        type: "recommendations:changed",
        timestamp: new Date().toISOString(),
      });
      console.log("[changeStream] recommendations:changed");
    });

    recommendationStream.on("error", async (err) => {
      console.error("[changeStream] Recommendation stream error:", err.message);
    });

    console.log("[changeStream] Watching: alerts, recommendations");
  } catch (err) {
    // Change streams are not available on standalone MongoDB (local dev without replica set)
    console.warn(
      "[changeStream] Not available — requires a replica set or Atlas cluster:",
      err.message
    );
  }
}

async function closeStreams() {
  if (alertStream) {
    await alertStream.close().catch(() => {});
    alertStream = null;
  }
  if (recommendationStream) {
    await recommendationStream.close().catch(() => {});
    recommendationStream = null;
  }
}

export async function stopChangeStream() {
  await closeStreams();
  console.log("[changeStream] Stopped");
}
