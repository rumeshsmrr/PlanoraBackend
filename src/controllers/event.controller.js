// 📂 src/controllers/event.controller.js
import { pool } from "../db.js";
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
} from "../services/schedule.service.js";
import { logAudit } from "../services/audit.service.js";

export const EventController = {
  // ✅ List all events
  list: async (req, res) => {
    const rows = await listItems("events", req.query);
    res.json(rows);
  },

  // ✅ Create new event (with conflict detection + audit)
  create: async (req, res) => {
    console.log("Creating event with data:", req.valid.body);
    const result = await createItem(
      "events",
      req.valid.body,
      req.user?.id,
      res
    );
    if (!result?.id) return; // blocked due to conflict
    console.log("Event creation result:", result);

    // fetch inserted event + joins
    const [[row]] = await pool.query(
      `SELECT e.id, e.title, e.start_utc, e.end_utc,
              d.name AS departmentName,
              b.label AS batchName,
              v.name AS venueName, v.capacity
       FROM events e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN batches b ON e.batch_id = b.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE e.id=?`,
      [result.id]
    );

    console.log("Created event:", row);
    // log creation
    await logAudit({
      title: `Created event "${row.title}"`,
      type: "create",
      actor: req.user?.name ?? "system",
      refId: row.id,
      refType: "event",
    });

    // optional: if this is a campus event, calculate total affected students (for analytics)
    let affectedStudents = 0;
    if (row.batchName?.toLowerCase() === "campus") {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM stundent`
      );
      affectedStudents = count;
    } else {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM stundent WHERE batch_id = ?`,
        [req.valid.body.batchId]
      );
      affectedStudents = count;
    }

    res.status(201).json({
      message: "Event created successfully",
      event: row,
      stats: { affectedStudents },
      conflicts: {
        venue: result.vconflicts,
        batch: result.bconflicts,
      },
    });
  },

  // ✅ Update event
  update: async (req, res) => {
    const id = req.params.id;
    const body = req.body;

    try {
      // Call the service function to handle logic and update the database
      const result = await updateItem("events", id, body, req.user?.id, res);

      if (!result.success) {
        // Handle conflict errors (returned from the service)
        if (result.error.includes("conflict")) {
          return res.status(409).json({
            error: result.error,
            conflicts: result.conflicts,
          });
        }
        // Handle other service errors (e.g., validation, internal)
        return res.status(400).json({ error: result.error });
      }

      // Log successful update audit
      await logAudit({
        title: `Updated event "${body.title}"`,
        type: "update",
        actor: req.user?.name ?? "system",
        refId: id,
        refType: "event",
      });

      // Respond with success
      res.json({
        message: "Event updated successfully",
        id: id,
        vconflicts: result.vconflicts, // Include conflict info if needed
        bconflicts: result.bconflicts,
      });
    } catch (error) {
      console.error("Error in eventController.update:", error);
      res.status(500).json({ error: "Internal server error during update." });
    }
  },

  // -----------------------------------------------------------------------

  // ✅ Delete event
  delete: async (req, res) => {
    const id = req.params.id;

    try {
      // Call the service function to delete the record
      const result = await deleteItem("events", id);

      if (!result.success) {
        // Handle case where item wasn't found
        if (result.message.includes("not found")) {
          return res.status(404).json({ error: result.message });
        }
        // Handle other deletion errors
        return res
          .status(500)
          .json({ error: result.error || "Failed to delete event." });
      }

      // Log successful deletion audit
      await logAudit({
        title: `Deleted event ID ${id}`,
        type: "delete",
        actor: req.user?.name ?? "system",
        refId: id,
        refType: "event",
      });

      // Respond with success
      res.json({ message: "Event deleted successfully", id: id });
    } catch (error) {
      console.error("Error in eventController.delete:", error);
      res.status(500).json({ error: "Internal server error during deletion." });
    }
  },

  //get single event by id
  getEventById: async (req, res) => {
    try {
      const { id } = req.params;
      const [[event]] = await pool.query(
        `SELECT e.id, e.title, 
              e.start_utc AS start, -- Renamed to 'start'
              e.end_utc AS end,     -- Renamed to 'end'
              e.department_id AS departmentId,  -- ADDED: Required for form
              e.batch_id AS batchId,            -- ADDED: Required for form
              e.venue_id AS venueId,            -- ADDED: Required for form
              d.name AS departmentName,
              b.label AS batchName,
              v.name AS venueName, v.capacity
       FROM events e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN batches b ON e.batch_id = b.id
       LEFT JOIN venues v ON e.venue_id = v.id
       WHERE e.id=?`,
        [id]
      );

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      console.log("Fetched event:", event);
      res.json(event);
    } catch (err) {
      console.error("Error fetching event:", err);
      res.status(500).json({ error: "Internal server error", err });
    }
  },
};
