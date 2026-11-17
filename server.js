const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Veritabanı ve Depolama Dosyaları (JSON tabanlı hafif ve ücretsiz 7/24 çözüm)
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const dbFiles = {
    users: path.join(DATA_DIR, 'users.json'),
    firestore: path.join(DATA_DIR, 'firestore.json'),
    realtime: path.join(DATA_DIR, 'realtime.json'),
    rules: path.join(DATA_DIR, 'rules.json')
};

// Başlangıç verileri
Object.keys(dbFiles).forEach(key => {
    if (!fs.existsSync(dbFiles[key])) {
        fs.writeFileSync(dbFiles[key], JSON.stringify({}));
    }
});

const readDB = (key) => JSON.parse(fs.readFileSync(dbFiles[key], 'utf8'));
const writeDB = (key, data) => fs.writeFileSync(dbFiles[key], JSON.stringify(data, null, 2));

// Multer (Storage / Depolama Ayarı)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- AUTH (GİRİŞ & KAYIT) ENDPOINTLERİ ---
app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    let users = readDB('users');
    if (users[email]) return res.status(400).json({ error: "Bu e-posta zaten kayıtlı!" });
    
    users[email] = { password, createdAt: new Date().toISOString() };
    writeDB('users', users);
    res.json({ success: true, message: "Kayıt başarılı, Kral!" });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    let users = readDB('users');
    if (!users[email] || users[email].password !== password) {
        return res.status(401).json({ error: "Hatalı e-posta veya şifre!" });
    }
    res.json({ success: true, token: "vantorium-token-" + Buffer.from(email).toString('base64') });
});

// --- FIRESTORE / DATABASE ENDPOINTLERİ ---
app.get('/api/db/:collection', (req, res) => {
    const db = readDB('firestore');
    res.json(db[req.params.collection] || {});
});

app.post('/api/db/:collection', (req, res) => {
    const { collection } = req.params;
    let db = readDB('firestore');
    if (!db[collection]) db[collection] = {};
    
    const docId = 'doc_' + Date.now();
    db[collection][docId] = req.body;
    writeDB('firestore', db);

    // WebSocket ile bağlı olan herkese anlık bildir (Realtime / FCM Benzeri)
    broadcast({ type: 'FIRESTORE_UPDATE', collection, docId, data: req.body });
    res.json({ success: true, id: docId });
});

// --- STORAGE (DEPOLAMA) ENDPOINTİ ---
app.post('/api/storage/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi!" });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl, name: req.file.originalname });
});

// --- FCM / BİLDİRİM GÖNDERME ---
app.post('/api/fcm/send', (req, res) => {
    const { title, body } = req.body;
    broadcast({ type: 'FCM_NOTIFICATION', title, body });
    res.json({ success: true, message: "Bildirim tüm istemcilere fırlatıldı!" });
});

// --- WEBSOCKET (Realtime 7/24 Senkronizasyon) ---
wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'WELCOME', message: 'Vantorium Base Realtime Socket Aktif!' }));
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Vantorium Base Sunucusu ${PORT} portunda 7/24 aktif!`);
});
