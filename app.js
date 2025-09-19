const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer'); // Ditambahkan

const app = express();
const PORT = process.env.PORT || 3000;

// --- Konfigurasi Multer untuk Unggahan File --- DITAMBAHKAN
// Menentukan tempat penyimpanan dan nama file
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: function(req, file, cb){
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

// Inisialisasi upload middleware
const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 } // Batas ukuran file 10MB
}).single('requestImage'); // 'requestImage' harus sama dengan atribut 'name' di input file Anda

// Koneksi ke MongoDB Anda
mongoose.connect('mongodb+srv://zanssxploit:pISqUYgJJDfnLW9b@cluster0.fgram.mongodb.net/scmarket_db?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Could not connect to MongoDB:', err));

// --- Definisi Skema Mongoose DIPERBARUI ---
const requestSchema = new mongoose.Schema({
  title: String,
  description: String,
  url: String, // Field baru untuk URL
  imageUrl: String, // Field baru untuk path gambar
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model('Request', requestSchema);

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true })); // Untuk parsing body dari form

// Routes

// Halaman Utama (Form Request)
app.get('/', (req, res) => {
  res.render('index', { title: 'Buat Permintaan Baru' });
});

// --- Route '/request' DIPERBARUI untuk menangani unggahan file ---
app.post('/request', (req, res) => {
  upload(req, res, async (err) => {
    if(err){
      // Jika ada error dari multer (misal, file terlalu besar)
      console.error('Multer Error:', err);
      // Anda bisa merender halaman dengan pesan error
      res.render('index', { title: 'Buat Permintaan Baru', msg: err });
    } else {
      // Jika tidak ada error upload, lanjutkan menyimpan ke database
      try {
        const newRequest = new Request({
          title: req.body.title,
          description: req.body.description,
          url: req.body.requestUrl, // Nama dari input URL
          // Cek apakah file diunggah. Jika ya, simpan path-nya. Jika tidak, simpan string kosong.
          imageUrl: req.file ? `/uploads/${req.file.filename}` : ''
        });
        await newRequest.save();
        res.redirect('/');
      } catch (dbErr) {
        console.error(dbErr);
        res.status(500).send('Error submitting request to database');
      }
    }
  });
});


// Halaman Admin (Daftar Request) - Tidak perlu diubah
app.get('/admin', async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.render('admin', { title: 'Daftar Permintaan (Admin)', requests });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching requests');
  }
});

// Update Status Request - Tidak perlu diubah
app.post('/admin/update-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await Request.findByIdAndUpdate(id, { status: status });
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating request status');
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});