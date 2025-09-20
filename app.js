require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const telegramBot = require('./telegram');
const { Request } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: function(req, file, cb){
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }
}).single('requestImage');

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://zanssxploit:pISqUYgJJDfnLW9b@cluster0.fgram.mongodb.net/scmarket_db?retryWrites=true&w=majority')
.then(() => {
    console.log('Connected to MongoDB');
    telegramBot.initializeBot();
})
.catch(err => console.error('Could not connect to MongoDB:', err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render('index', { title: 'Buat Permintaan Baru' });
});

app.post('/request', (req, res) => {
  upload(req, res, async (err) => {
    if(err){
      res.render('index', { title: 'Buat Permintaan Baru', msg: err });
    } else {
      try {
        const newRequest = new Request({
          title: req.body.title,
          description: req.body.description,
          url: req.body.requestUrl,
          imageUrl: req.file ? `/uploads/${req.file.filename}` : null
        });
        await newRequest.save();
        
        telegramBot.sendNotification(newRequest).catch(console.error);
        
        res.redirect('/');
      } catch (dbErr) {
        console.error(dbErr);
        res.status(500).send('Error submitting request to database');
      }
    }
  });
});

app.get('/admin', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const requestsPerPage = 6;

    const totalRequests = await Request.countDocuments();
    const totalPages = Math.ceil(totalRequests / requestsPerPage);

    const requests = await Request.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * requestsPerPage)
      .limit(requestsPerPage);

    res.render('admin', { 
      title: 'Daftar Permintaan (Admin)', 
      requests,
      totalPages,
      currentPage: page
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching requests');
  }
});

app.post('/admin/update-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await Request.findByIdAndUpdate(id, { status: status });
    const referer = req.header('Referer') || '/admin';
    res.redirect(referer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating request status');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});