const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();

// Database connection
mongoose.connect('mongodb+srv://soluwizy:test123@cluster0.x4sbgl2.mongodb.net/hostel_system?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'hostel_secret_key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: 'mongodb+srv://soluwizy:test123@cluster0.x4sbgl2.mongodb.net/hostel_system?retryWrites=true&w=majority&appName=Cluster0'
  }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Schemas
const UserSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  year: { type: String, required: true },
  department: { type: String, required: true },
  gender: { type: String, required: true, enum: ['male', 'female'] },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const HostelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['boys', 'girls'] },
  totalRooms: { type: Number, required: true },
  occupiedRooms: { type: Number, default: 0 },
  pricePerSemester: { type: Number, required: true },
  facilities: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true },
  capacity: { type: Number, required: true, default: 2 },
  occupiedBeds: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const AllocationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  semester: { type: String, required: true },
  academicYear: { type: String, required: true },
  allocationDate: { type: Date, default: Date.now },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paymentAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'inactive', 'cancelled'], default: 'active' }
});

const PaymentSchema = new mongoose.Schema({
  allocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Allocation', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, required: true },
  transactionId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  paymentDate: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', UserSchema);
const Hostel = mongoose.model('Hostel', HostelSchema);
const Room = mongoose.model('Room', RoomSchema);
const Allocation = mongoose.model('Allocation', AllocationSchema);
const Payment = mongoose.model('Payment', PaymentSchema);

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

const requireAdmin = (req, res, next) => {
  if (req.session.userId && req.session.isAdmin) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Routes

// Homepage
app.get('/', (req, res) => {
  res.render('index', { user: req.session.userId });
});

// Registration
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  try {
    const { studentId, name, email, password, phone, year, department, gender } = req.body;
    
    const existingUser = await User.findOne({ $or: [{ email }, { studentId }] });
    if (existingUser) {
      return res.render('register', { error: 'User already exists with this email or student ID' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      studentId, name, email, password: hashedPassword, phone, year, department, gender
    });
    await user.save();

    res.redirect('/login?message=Registration successful');
  } catch (error) {
    res.render('register', { error: 'Registration failed. Please try again.' });
  }
});

// Login
app.get('/login', (req, res) => {
  res.render('login', { error: null, message: req.query.message });
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.render('login', { error: 'Invalid credentials', message: null });
    }

    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin;
    req.session.userName = user.name;

    if (user.isAdmin) {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/dashboard');
    }
  } catch (error) {
    res.render('login', { error: 'Login failed. Please try again.', message: null });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Student Dashboard
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const allocation = await Allocation.findOne({ studentId: req.session.userId, status: 'active' })
      .populate('hostelId').populate('roomId');
    
    res.render('dashboard', { user, allocation });
  } catch (error) {
    res.render('dashboard', { user: null, allocation: null });
  }
});

// Hostel Selection
app.get('/hostels', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const hostels = await Hostel.find({ type: user.gender === 'male' ? 'boys' : 'girls', isActive: true });
    
    res.render('hostels', { hostels, user });
  } catch (error) {
    res.render('hostels', { hostels: [], user: null });
  }
});

// Room Selection
app.get('/hostels/:id/rooms', requireAuth, async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id);
    const rooms = await Room.find({ hostelId: req.params.id, isAvailable: true });
    
    res.render('rooms', { hostel, rooms });
  } catch (error) {
    res.redirect('/hostels');
  }
});

// Book Room
app.post('/book-room', requireAuth, async (req, res) => {
  try {
    const { hostelId, roomId, semester, academicYear } = req.body;
    
    // Check if student already has active allocation
    const existingAllocation = await Allocation.findOne({ 
      studentId: req.session.userId, 
      status: 'active' 
    });
    
    if (existingAllocation) {
      return res.redirect('/dashboard?error=You already have an active room allocation');
    }

    const hostel = await Hostel.findById(hostelId);
    const room = await Room.findById(roomId);
    
    if (room.occupiedBeds >= room.capacity) {
      return res.redirect(`/hostels/${hostelId}/rooms?error=Room is full`);
    }

    const allocation = new Allocation({
      studentId: req.session.userId,
      hostelId,
      roomId,
      semester,
      academicYear,
      paymentAmount: hostel.pricePerSemester
    });
    
    await allocation.save();

    // Update room occupancy
    await Room.findByIdAndUpdate(roomId, { 
      $inc: { occupiedBeds: 1 },
      isAvailable: room.occupiedBeds + 1 < room.capacity
    });

    res.redirect(`/payment/${allocation._id}`);
  } catch (error) {
    res.redirect('/hostels?error=Booking failed');
  }
});

// Payment Page
app.get('/payment/:allocationId', requireAuth, async (req, res) => {
  try {
    const allocation = await Allocation.findById(req.params.allocationId)
      .populate('hostelId').populate('roomId').populate('studentId');
    
    if (!allocation || allocation.studentId._id.toString() !== req.session.userId) {
      return res.redirect('/dashboard');
    }

    res.render('payment', { allocation });
  } catch (error) {
    res.redirect('/dashboard');
  }
});

// Process Payment (Mock)
app.post('/process-payment', requireAuth, async (req, res) => {
  try {
    const { allocationId, paymentMethod, cardNumber, expiryDate, cvv } = req.body;
    
    const allocation = await Allocation.findById(allocationId);
    if (!allocation || allocation.studentId.toString() !== req.session.userId) {
      return res.redirect('/dashboard');
    }

    // Mock payment processing
    const transactionId = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    const payment = new Payment({
      allocationId,
      studentId: req.session.userId,
      amount: allocation.paymentAmount,
      paymentMethod,
      transactionId,
      status: 'success' // Mock success
    });
    
    await payment.save();
    
    // Update allocation payment status
    await Allocation.findByIdAndUpdate(allocationId, { paymentStatus: 'paid' });

    res.redirect('/payment-success?txn=' + transactionId);
  } catch (error) {
    res.redirect('/dashboard?error=Payment failed');
  }
});

// Payment Success
app.get('/payment-success', requireAuth, (req, res) => {
  res.render('payment-success', { transactionId: req.query.txn });
});

// Admin Routes

// Admin Dashboard
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ isAdmin: false });
    const totalHostels = await Hostel.countDocuments();
    const totalAllocations = await Allocation.countDocuments({ status: 'active' });
    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const stats = {
      totalStudents,
      totalHostels,
      totalAllocations,
      totalRevenue: totalRevenue[0]?.total || 0
    };

    res.render('admin/dashboard', { stats });
  } catch (error) {
    res.render('admin/dashboard', { stats: {} });
  }
});

// Manage Hostels
app.get('/admin/hostels', requireAdmin, async (req, res) => {
  try {
    const hostels = await Hostel.find().sort({ createdAt: -1 });
    res.render('admin/hostels', { hostels });
  } catch (error) {
    res.render('admin/hostels', { hostels: [] });
  }
});

// Add Hostel
app.get('/admin/hostels/add', requireAdmin, (req, res) => {
  res.render('admin/add-hostel', { error: null });
});

app.post('/admin/hostels/add', requireAdmin, async (req, res) => {
  try {
    const { name, type, totalRooms, pricePerSemester, facilities } = req.body;
    
    const hostel = new Hostel({
      name,
      type,
      totalRooms: parseInt(totalRooms),
      pricePerSemester: parseFloat(pricePerSemester),
      facilities: facilities.split(',').map(f => f.trim())
    });
    
    await hostel.save();

    // Create rooms for the hostel
    for (let i = 1; i <= totalRooms; i++) {
      const room = new Room({
        roomNumber: `${name}-${i.toString().padStart(3, '0')}`,
        hostelId: hostel._id,
        capacity: 2
      });
      await room.save();
    }

    res.redirect('/admin/hostels?success=Hostel added successfully');
  } catch (error) {
    res.render('admin/add-hostel', { error: 'Failed to add hostel' });
  }
});

// Manage Students
app.get('/admin/students', requireAdmin, async (req, res) => {
  try {
    const students = await User.find({ isAdmin: false }).sort({ createdAt: -1 });
    res.render('admin/students', { students });
  } catch (error) {
    res.render('admin/students', { students: [] });
  }
});

// Manage Allocations
app.get('/admin/allocations', requireAdmin, async (req, res) => {
  try {
    const allocations = await Allocation.find()
      .populate('studentId').populate('hostelId').populate('roomId')
      .sort({ allocationDate: -1 });
    
    res.render('admin/allocations', { allocations });
  } catch (error) {
    res.render('admin/allocations', { allocations: [] });
  }
});

// Manage Payments
app.get('/admin/payments', requireAdmin, async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate({
        path: 'allocationId',
        populate: { path: 'studentId hostelId' }
      })
      .sort({ paymentDate: -1 });
    
    res.render('admin/payments', { payments });
  } catch (error) {
    res.render('admin/payments', { payments: [] });
  }
});

// Create Admin User (Run once)
app.get('/create-admin', async (req, res) => {
  try {
    const adminExists = await User.findOne({ isAdmin: true });
    if (adminExists) {
      return res.send('Admin already exists');
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = new User({
      studentId: 'ADMIN001',
      name: 'System Administrator',
      email: 'admin@school.edu',
      password: hashedPassword,
      phone: '1234567890',
      year: 'Staff',
      department: 'Administration',
      gender: 'male',
      isAdmin: true
    });
    
    await admin.save();
    res.send('Admin created successfully. Email: admin@school.edu, Password: admin123');
  } catch (error) {
    res.send('Error creating admin: ' + error.message);
  }
});

// Error handler
app.use((req, res) => {
  res.status(404).render('404');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Visit http://localhost:3000/create-admin to create admin user');
});