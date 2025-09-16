Online To-Do / Timetable app (Teacher/Admin + Students)
-------------------------------------------------------

Features:
- Teacher (admin) can create, edit, delete tasks/timetable entries from /admin
- Students view tasks at / and can mark tasks as complete
- Browser notifications: students can enable notifications; when teacher posts tasks with 'Send browser notification' checked, the client will receive notifications when polling detects new items
- Data stored in data/db.json (JSON file) — easy to migrate later
- Simple admin auth using session (default admin/teacher123) — change in server.js for production

How to run:
1. unzip folder
2. npm install
3. npm start
4. Open http://localhost:3000

Security notes:
- This is a demo. Change ADMIN_PASS and session secret before deploying.
- Consider moving to real database and add authentication for students for production.
