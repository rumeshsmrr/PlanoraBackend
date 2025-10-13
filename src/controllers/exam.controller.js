// ✅ exam.controller.js
import { pool } from "../db.js";
import {
  createItem,
  deleteItem,
  listItems,
  updateItem,
} from "../services/schedule.service.js";
import { logAudit } from "../services/audit.service.js";
import { assignSeatsToStudents } from "../services/seating.service.js";

/* =========================
   📘 Exam Controller
   ========================= */
export const ExamController = {
  // ✅ List all exams
  list: async (req, res) => {
    const rows = await listItems("exams", req.query);
    res.json(rows);
  },

  // ✅ Create new exam & assign seats automatically
  create: async (req, res) => {
    try {
      // Step 1️⃣ - Try to create exam (checks conflicts)
      const result = await createItem(
        "exams",
        req.valid.body,
        req.user?.id,
        res
      );
      if (!result?.id) return; // stopped due to conflict

      // Step 2️⃣ - Fetch created exam details
      const [[exam]] = await pool.query(
        `SELECT e.id, e.title, e.start_utc, e.end_utc,
                d.name AS departmentName,
                b.label AS batchName,
                v.name AS venueName, v.capacity
         FROM exams e
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN batches b ON e.batch_id = b.id
         LEFT JOIN venues v ON e.venue_id = v.id
         WHERE e.id=?`,
        [result.id]
      );

      // Step 3️⃣ - Log audit trail
      await logAudit({
        title: `Scheduled exam "${exam.title}"`,
        type: "schedule",
        actor: req.user?.name ?? "system",
        refId: exam.id,
        refType: "exam",
      });

      // Step 4️⃣ - Assign seats to students (auto)
      const seatingResult = await assignSeatsToStudents(
        exam.id,
        req.valid.body.batchId,
        req.valid.body.venueId
      );

      // Step 5️⃣ - Return combined result
      res.status(201).json({
        message: "Exam created and seat allocation completed successfully",
        exam,
        seating: seatingResult,
        conflicts: { venue: result.vconflicts, batch: result.bconflicts },
      });
    } catch (err) {
      console.error("❌ Failed to create exam:", err);
      res.status(500).json({ error: "Failed to create exam" });
    }
  },

  // ✅ List all seatings (for frontend overview)
  getAllSeatings: async (req, res) => {
    try {
      const [exams] = await pool.query(`
        SELECT 
          e.id, e.title, e.start_utc, e.end_utc,
          v.name AS venueName, v.capacity,
          b.label AS batchName
        FROM exams e
        LEFT JOIN venues v ON e.venue_id = v.id
        LEFT JOIN batches b ON e.batch_id = b.id
        ORDER BY e.start_utc ASC;
      `);

      const result = [];
      for (const exam of exams) {
        const [students] = await pool.query(
          `SELECT s.fullName, es.seat_no
           FROM exam_seats es
           JOIN stundent s ON es.student_id = s.id
           WHERE es.exam_id = ?
           ORDER BY es.seat_no ASC`,
          [exam.id]
        );

        const total = students.length;
        const assigned = total;
        const unassigned = Math.max(0, (exam.capacity || 0) - assigned);

        const seats = [];
        for (let i = 0; i < (exam.capacity || 0); i++) {
          const seatNo = `A${String(i + 1).padStart(3, "0")}`;
          const student = students.find((s) => s.seat_no === seatNo);
          seats.push({
            seatNo,
            studentName: student ? student.fullName : null,
          });
        }

        result.push({
          exam,
          stats: { total, assigned, unassigned },
          seats,
        });
      }

      res.json(result);
    } catch (err) {
      console.error("❌ Failed to load all seatings:", err);
      res.status(500).json({ error: "Failed to load exam seatings" });
    }
  },

  remove: async (req, res) => {
    const id = req.params.id;
    console.log("examController Exam");

    try {
      const result = await deleteItem("exams", id);

      if (!result.success) {
        if (result.message.includes("not found")) {
          return res.status(404).json({ error: result.message });
        }

        return res
          .status(500)
          .json({ error: result.error || "Failed to delete event." });
      }

      await logAudit({
        title: `Deleted exam ID ${id}`,
        type: "delete",
        actor: req.user?.name ?? "system admin",
        refId: id,
        refType: "event",
      });

      //Respond with sucess
      res.json({ message: "Exam Deleted Succcessfully" });
    } catch (err) {
      console.log("Error in examsController.remove :", err);
      res
        .status(500)
        .json({ errror: "Internal Server Error during deletion." });
    }
  },

  //get single exam by ID
  getExamByID: async (req, res) => {
    try {
      const { id } = req.params;
      console.log("idddd", id);

      const [[exam]] = await pool.query(
        `SELECT 
  e.title, e.venue_id as venueID, e.department_id as departementID, e.start_utc as start,
  e.end_utc as end, e.batch_id as batchID, b.label as batchName, v.capacity,
  d.name as departmentName, v.name as venueName
  FROM exams e
  LEFT JOIN batches b ON b.id = e.batch_id
  LEFT JOIN venues v on v.id = e.venue_id 
  LEFT JOIN departments d on d.id = e.department_id
  WHERE e.id=?`,
        [id]
      );

      if (!exam) {
        return res.status(404).json({
          error: "Exam not found",
        });
      }
      console.log("FETCHED EXAM:", exam);
      res.json(exam);
    } catch (error) {
      console.error("Error fetching exam : ", error);
      res.status(500).json({ error: "Internal server error", error });
    }
  },

  //update
  update: async (req, res) => {
    const id = req.params.id;
    const body = req.body;

    try {
      //call the service function to handle logic and update the database
      const result = await updateItem("exams", id, body, req.user?.id, res);

      if (!result.success) {
        //Handle the confilit error
        if (result.error.includes("confilict")) {
          return res.status(409).json({
            error: result.error,
            conflicts: result.conflicts,
          });
        }
        return res.status(400).json({ error: result.error });
      }

      await logAudit({
        title: `Update exam "${body.title}"`,
        type: "update",
        actor: req.user?.name ?? "system admin",
        refId: id,
        refType: "exam",
      });

      res.json({
        message: "Event update successfully",
        id: id,
        vconflicts: result.vconflicts, // Include conflict info if needed
        bconflicts: result.bconflicts,
      });
    } catch (err) {
      console.error("Error is examController.update :", err);
      res.status(500).json({ error: "Internal server error during update." });
    }
  },
};
