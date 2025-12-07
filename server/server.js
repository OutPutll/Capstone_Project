/*
 * server.js
 * Node.js 백엔드 서버
 * 기능: 이미지 로컬 저장 + AI 서버 중계(통신 수정됨) + Firebase 저장 + React 웹 호스팅
 * 실행: node server.js
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// ★ Firebase Admin SDK 추가
const admin = require('firebase-admin');

// Firebase 서비스 계정 키 파일 경로
let firebaseInitialized = false;
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('[Firebase] Admin SDK 초기화 성공');
} catch (error) {
    console.log('[Firebase] serviceAccountKey.json 파일 없음. Firebase 기능 비활성화.');
}

const db = firebaseInitialized ? admin.firestore() : null;

const app = express();
const port = 8001;

// ★ 서버 IP 설정
const SERVER_HOST = process.env.SERVER_HOST || '123.212.210.230';
const SERVER_BASE_URL = `http://${SERVER_HOST}:${port}`;

// ★ [수정 1] AI 서버 주소 (IPv4 명시)
// localhost 대신 127.0.0.1을 사용하여 Node-Python 간 통신 오류 방지
const AI_SERVER_URL = 'http://127.0.0.1:5000';

// --- 미들웨어 설정 ---
app.use(cors());
app.use(express.json());

// ★ 1. 이미지 파일 제공 (http://IP:8001/uploads/...)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ★ 2. 리액트 빌드 파일 제공 (http://IP:8001/)
app.use(express.static(path.join(__dirname, 'build')));

// --- 폴더 준비 ---
const uploadBaseDir = path.join(__dirname, 'uploads');
const tempDir = path.join(uploadBaseDir, 'temp');

if (!fs.existsSync(uploadBaseDir)) fs.mkdirSync(uploadBaseDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// --- Multer 설정 ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// --- API 엔드포인트 ---

/**
 * 1. 서버 상태 확인
 */
app.get('/health', async (req, res) => {
    try {
        const response = await axios.get(`${AI_SERVER_URL}/health`);
        res.json({
            status: 'running',
            server: 'Node.js',
            serverUrl: SERVER_BASE_URL,
            aiServer: {
                url: AI_SERVER_URL,
                connected: response.data.model_loaded === true
            },
            firebaseConnected: firebaseInitialized
        });
    } catch (error) {
        res.json({
            status: 'running',
            server: 'Node.js',
            serverUrl: SERVER_BASE_URL,
            aiServer: {
                url: AI_SERVER_URL,
                connected: false,
                error: error.message
            },
            firebaseConnected: firebaseInitialized
        });
    }
});

/**
 * 2. 이미지 업로드 및 분석 요청 (핵심 수정 부분)
 */
app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: '파일 없음' });
    }

    const userId = req.body.userId || 'anonymous';
    
    try {
        // 1. 폴더 이동
        const userDir = path.join(uploadBaseDir, userId);
        if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

        const oldPath = req.file.path;
        const newPath = path.join(userDir, req.file.filename);
        fs.renameSync(oldPath, newPath);

        const webPath = `${SERVER_BASE_URL}/uploads/${userId}/${req.file.filename}`;
        
        // ★ [수정 2] 경로 포맷팅 (Windows 역슬래시 문제 해결)
        // Python으로 보낼 때는 절대 경로를 사용하고, 슬래시(/)로 통일
        const absolutePath = path.resolve(newPath).replace(/\\/g, '/');
        
        console.log(`[분석 요청] User: ${userId}`);
        console.log(`[AI 전송 경로] ${absolutePath}`);

        // 2. AI 분석 요청
        let aiResult = null;
        try {
            const aiResponse = await axios.post(
                `${AI_SERVER_URL}/analyze`, 
                { image_path: absolutePath },
                { 
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000 // 10초 타임아웃
                }
            );
            aiResult = aiResponse.data;
            console.log(`[AI 응답 성공] 객체수: ${aiResult.count}`);
        } catch (aiError) {
            console.error(`[AI 통신 실패] ${aiError.message}`);
            if (aiError.code === 'ECONNREFUSED') {
                console.error(' -> Python 서버가 켜져 있지 않거나 포트(5000)가 다릅니다.');
            }
            
            // AI 실패해도 이미지는 저장되었으므로 부분 성공 처리
            return res.json({
                success: true,
                message: '저장은 완료되었으나 AI 분석 서버에 연결할 수 없습니다.',
                data: {
                    imagePath: webPath,
                    detections: [],
                    count: 0
                }
            });
        }

        // 3. Firebase 저장
        let savedDocId = null;
        if (firebaseInitialized && db && userId !== 'anonymous') {
            try {
                const validDetections = (aiResult.detections || []).filter(d => d.class_id !== 0);
                const foodNames = validDetections.map(d => d.name);
                
                const totalNutrition = validDetections.reduce((acc, item) => {
                    if (item.nutrition) {
                        acc.calories += item.nutrition.calories || 0;
                        acc.carbs += item.nutrition.carbs || 0;
                        acc.protein += item.nutrition.protein || 0;
                        acc.fat += item.nutrition.fat || 0;
                        acc.sodium += item.nutrition.sodium || 0;
                        acc.sugar += item.nutrition.sugar || 0;
                    }
                    return acc;
                }, { calories: 0, carbs: 0, protein: 0, fat: 0, sodium: 0, sugar: 0 });

                const docRef = await db.collection('users').doc(userId).collection('history').add({
                    imagePath: webPath,
                    foods: foodNames,
                    nutrition: totalNutrition,
                    detections: validDetections,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                savedDocId = docRef.id;
            } catch (fbError) {
                console.error(`[Firebase 에러] ${fbError.message}`);
            }
        }
        
        res.json({
            success: true,
            data: {
                ...aiResult,
                imagePath: webPath,
                savedToFirebase: savedDocId !== null,
                documentId: savedDocId
            }
        });

    } catch (error) {
        console.error('[서버 내부 에러]', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: '서버 내부 오류' });
    }
});

/**
 * 3. 히스토리 조회
 */
app.get('/history/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!firebaseInitialized || !db) return res.status(500).json({ success: false, message: 'DB 미연결' });

    try {
        const snapshot = await db.collection('users').doc(userId).collection('history')
            .orderBy('timestamp', 'desc').get();
        
        const history = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate()?.toISOString() || new Date().toISOString()
        }));
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * 4. 이미지 목록 조회
 */
app.get('/images/:userId', (req, res) => {
    const { userId } = req.params;
    const userDir = path.join(uploadBaseDir, userId);

    if (!fs.existsSync(userDir)) return res.json({ success: true, data: [] });

    try {
        const files = fs.readdirSync(userDir)
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => ({
                filename: file,
                url: `${SERVER_BASE_URL}/uploads/${userId}/${file}`,
                timestamp: fs.statSync(path.join(userDir, file)).mtime
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json({ success: true, data: files });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// --- 서버 시작 ---
app.listen(port, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`[Node.js 서버] http://localhost:${port}`);
    console.log(`[AI 서버 연결 대상] ${AI_SERVER_URL}`);
    console.log(`[Web Hosting] React build 폴더 서비스 중`);
    console.log('='.repeat(50));
});
