// ✅ seating.service.js
import { pool } from "../db.js";

/**
 * Automatically assigns seats for students in a given exam
 * based on batch and venue capacity.
 */
export async function assignSeatsToStudents(examId, batchId, venueId) {
  // 🧑‍🎓 Fetch all students in the same batch
  const [students] = await pool.query(
    `SELECT id, fullName FROM stundent WHERE batch_id = ? ORDER BY id ASC`,
    [batchId]
  );

  // 🏛️ Get venue capacity
  const [[venue]] = await pool.query(
    `SELECT capacity, name FROM venues WHERE id = ?`,
    [venueId]
  );

  const totalStudents = students.length;
  const capacity = venue?.capacity || 0;

  // Decide how many can fit in the venue
  const assignedCount = Math.min(capacity, totalStudents);
  const unassignedCount = totalStudents - assignedCount;
  const assignedStudents = students.slice(0, assignedCount);

  // 🎟️ Prepare seat numbers like A001, A002, A003...
  const seatAssignments = assignedStudents.map((s, i) => [
    examId,
    s.id,
    `A${String(i + 1).padStart(3, "0")}`,
  ]);

  // 🪑 Insert seat assignments into exam_seats
  if (seatAssignments.length) {
    await pool.query(
      `INSERT INTO exam_seats (exam_id, student_id, seat_no) VALUES ?`,
      [seatAssignments]
    );
  }

  return {
    totalStudents,
    assigned: assignedCount,
    unassigned: unassignedCount,
    venueName: venue?.name,
  };
}
