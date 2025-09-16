// ...existing code...
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

// Admin credentials (change in production)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'teacher123'; // change this before deploying

app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use('/public', express.static(path.join(__dirname,'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(session({ secret: 'replace-this-secret', resave:false, saveUninitialized:false }));

const DB = path.join(__dirname,'data','db.json');
function readDB(){ try{ return JSON.parse(fs.readFileSync(DB)); }catch(e){ return { tasks: [], lastUpdated: 0 }; } }
function writeDB(d){ fs.writeFileSync(DB, JSON.stringify(d,null,2)); }

// Helper to set lastUpdated
function bump(d){ d.lastUpdated = Date.now(); writeDB(d); return d.lastUpdated; }


// Student registration
app.get('/student/register', (req, res) => {
  res.render('student_register', { error: null });
});
app.post('/student/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.render('student_register', { error: 'All fields required.' });
  const d = readDB();
  d.students = d.students || [];
  if (d.students.find(s => s.username === username)) {
    return res.render('student_register', { error: 'Username already exists.' });
  }
  d.students.push({ username, password });
  bump(d);
  res.redirect('/student/login');
});

// Student login
app.get('/student/login', (req, res) => {
  res.render('student_login', { error: null });
});
app.post('/student/login', (req, res) => {
  const { username, password } = req.body;
  const d = readDB();
  d.students = d.students || [];
  const student = d.students.find(s => s.username === username && s.password === password);
  if (!student) {
    return res.render('student_login', { error: 'Invalid credentials.' });
  }
  req.session.isStudent = true;
  req.session.studentUser = username;
  res.redirect('/student/home');
});

// Student auth middleware
function requireStudent(req, res, next) {
  if (req.session && req.session.isStudent) return next();
  res.redirect('/student/login');
}


// Serve student registration form at root
app.get('/', (req, res) => {
  res.render('student_register', { error: null });
});

// Student main page (protected)
app.get('/student/home', requireStudent, (req,res)=>{
  const d = readDB();
  res.render('student',{ tasks: d.tasks, lastUpdated: d.lastUpdated });
});

// API for tasks (public read)
app.get('/api/tasks', (req,res)=>{
  const d = readDB();
  res.json({ tasks: d.tasks, lastUpdated: d.lastUpdated });
});

// Student marks complete
app.post('/api/tasks/complete', (req,res)=>{
  const { id, done } = req.body;
  const d = readDB();
  const t = d.tasks.find(x=>x.id===id);
  if(!t) return res.status(404).json({ error: 'Task not found' });
  t.completed = !!done;
  t.completedAt = t.completed ? new Date().toISOString() : null;
  const lu = bump(d);
  res.json({ ok:true, lastUpdated: lu, task: t });
});

// Simple "updates" endpoint returning lastUpdated
app.get('/api/lastUpdated', (req,res)=>{
  const d = readDB();
  res.json({ lastUpdated: d.lastUpdated });
});

// Admin login
app.get('/admin/login', (req,res)=> res.render('admin_login',{ error:null }));
app.post('/admin/login', (req,res)=>{
  const { username, password } = req.body;
  if(username===ADMIN_USER && password===ADMIN_PASS){
    req.session.isAdmin = true; res.redirect('/admin');
  } else res.render('admin_login',{ error: 'Invalid credentials' });
});

// Admin middleware
function requireAdmin(req,res,next){
  if(req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// Admin dashboard
app.get('/admin', requireAdmin, (req,res)=>{
  const d = readDB();
  res.render('admin',{ tasks: d.tasks, lastUpdated: d.lastUpdated });
});

// Create task
app.post('/admin/tasks', requireAdmin, upload.single('document'), (req,res)=>{
  const { title, description, due, tag, notify } = req.body;
  if(!title) return res.redirect('/admin');
  const d = readDB();
  let document = null;
  if (req.file) {
    document = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      path: '/uploads/' + req.file.filename
    };
  }
  const task = {
    id: uuidv4(),
    title,
    description: description||'',
    due: due||'',
    tag: tag||'',
    notify: notify === 'on',
    createdAt: new Date().toISOString(),
    completed:false,
    document
  };
  d.tasks.unshift(task);
  bump(d);
  res.redirect('/admin');
});

// Edit task
app.post('/admin/tasks/:id/edit', requireAdmin, (req,res)=>{
  const id = req.params.id;
  const { title, description, due, tag, notify } = req.body;
  const d = readDB();
  const t = d.tasks.find(x=>x.id===id);
  if(t){
    t.title = title || t.title; t.description = description||''; t.due = due||''; t.tag = tag||''; t.notify = notify === 'on';
    bump(d);
  }
  res.redirect('/admin');
});

// Delete task
app.post('/admin/tasks/:id/delete', requireAdmin, (req,res)=>{
  const id = req.params.id; const d = readDB();
  d.tasks = d.tasks.filter(x=>x.id!==id); bump(d); res.redirect('/admin');
});

// Admin logout
app.get('/admin/logout', (req,res)=>{ req.session.destroy(()=> res.redirect('/')); });

// Initialize DB if missing
if(!fs.existsSync(DB)){
  const initial = { tasks: [], lastUpdated: Date.now() };
  fs.writeFileSync(DB, JSON.stringify(initial,null,2));
}

app.listen(PORT, ()=> console.log('Server running on http://localhost:'+PORT));
