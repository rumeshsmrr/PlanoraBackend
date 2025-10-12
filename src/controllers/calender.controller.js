import { getAllSchedules } from "../services/calander.service.js";

export async function getCalendarSchedules(req, res) {
  try {
    const schedules = await getAllSchedules();

    if (!schedules.length) {
      return res.status(200).json([]);
    }

    res.status(200).json(schedules);
  } catch (err) {
    console.error("Failed to get calendar schedules:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
