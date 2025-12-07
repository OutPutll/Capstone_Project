import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Firebase 설정 파일 임포트
import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  getDocs, 
  Timestamp 
} from 'firebase/firestore';

// 백엔드 서버 주소
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001';

// 1일 권장 섭취량 기준
const DAILY_STANDARDS = {
  calories: 2000, carbs: 324, protein: 55, fat: 54, sodium: 2000, sugar: 100
};

function App() {
  // --- 상태 관리 ---
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('Home');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState('');
  
  const [todayNutrition, setTodayNutrition] = useState({ protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 });
  const [historyList, setHistoryList] = useState([]);
  const [supplementRecommendations, setSupplementRecommendations] = useState([]); // 영양제 (Result 탭용)
  const [foodRecommendations, setFoodRecommendations] = useState([]); // 음식 (Feedback 탭용)

  const fileInputRef = useRef(null);

  // --- 초기화 및 데이터 로드 ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadUserData(currentUser.uid);
      } else {
        setHistoryList([]);
        setTodayNutrition({ protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 });
        setSupplementRecommendations([]);
        setFoodRecommendations([]);
        setActiveTab('Home');
      }
    });
    return () => unsubscribe();
  }, []);

  const loadUserData = async (uid) => {
    try {
      const q = query(collection(db, `users/${uid}/history`), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistoryList(data);
      calculateStats(data);
    } catch (err) {
      console.error("데이터 로드 실패:", err);
    }
  };

  const calculateStats = (data) => {
    // 1. 오늘 날짜 기준 누적 섭취량
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayData = data.filter(item => item.timestamp.toDate() >= today);
    const todaySum = todayData.reduce((acc, item) => {
      acc.protein += item.nutrition.protein || 0;
      acc.carbs += item.nutrition.carbs || 0;
      acc.fat += item.nutrition.fat || 0;
      acc.sodium += item.nutrition.sodium || 0;
      acc.sugar += item.nutrition.sugar || 0;
      return acc;
    }, { protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 });
    
    setTodayNutrition(todaySum);

    // 2. [Feedback 탭용] 오늘 부족한 영양소를 채워줄 '음식' 추천
    const foods = [];
    if (todaySum.protein < DAILY_STANDARDS.protein) {
      foods.push({ name: '닭가슴살 샐러드', reason: '오늘 단백질이 부족합니다.', bg: '#e3f2fd', icon: '🥗' });
    }
    if (todaySum.carbs < DAILY_STANDARDS.carbs * 0.5) {
      foods.push({ name: '고구마/통곡물', reason: '에너지를 위한 탄수화물이 필요해요.', bg: '#fff3e0', icon: '🍠' });
    }
    if (todaySum.fat < DAILY_STANDARDS.fat * 0.5) {
      foods.push({ name: '아보카도/견과류', reason: '건강한 지방을 섭취해보세요.', bg: '#e8f5e9', icon: '🥑' });
    }
    if (todaySum.sodium > DAILY_STANDARDS.sodium) {
      foods.push({ name: '바나나/토마토', reason: '나트륨 배출을 돕는 칼륨 식품입니다.', bg: '#fce4ec', icon: '🍌' });
    }
    if (foods.length === 0) {
      foods.push({ name: '균형 잡힌 가정식', reason: '현재 영양 밸런스가 아주 좋습니다!', bg: '#f3e5f5', icon: '🍱' });
    }
    setFoodRecommendations(foods);

    // 3. [Result 탭용] 전체 평균 기반 '영양제' 추천
    if (data.length > 0) {
      const totalSum = data.reduce((acc, item) => {
        acc.protein += item.nutrition.protein || 0;
        acc.fat += item.nutrition.fat || 0;
        acc.sodium += item.nutrition.sodium || 0;
        acc.carbs += item.nutrition.carbs || 0;
        return acc;
      }, { protein: 0, fat: 0, sodium: 0, carbs: 0 });

      const count = data.length;
      const avgProtein = totalSum.protein / count;
      const avgFat = totalSum.fat / count;
      const avgSodium = totalSum.sodium / count;

      const supplements = [];
      
      if (avgProtein < DAILY_STANDARDS.protein * 0.7) {
        supplements.push({ name: '웨이 프로틴', reason: '평소 단백질 섭취가 부족한 편입니다.', bg: '#e3f2fd' });
      }
      if (avgFat < DAILY_STANDARDS.fat * 0.5) {
        supplements.push({ name: '오메가-3', reason: '필수 지방산 보충이 필요합니다.', bg: '#fff3e0' });
      }
      if (avgSodium > DAILY_STANDARDS.sodium * 1.2) {
        supplements.push({ name: '칼륨 (코코넛워터)', reason: '평소 나트륨 섭취가 많습니다.', bg: '#e8f5e9' });
      }
      if (supplements.length === 0) {
        supplements.push({ name: '종합 비타민', reason: '꾸준한 건강 관리를 위해 추천합니다.', bg: '#f3e5f5' });
      }
      
      setSupplementRecommendations(supplements);
    }
  };

  // --- 핸들러 ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isLoginMode) await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError('인증 실패: ' + err.message);
    }
  };

  const handleLogout = async () => { await signOut(auth); };

  const handleFileSelect = (e) => { if (e.target.files[0]) processFile(e.target.files[0]); };

  const processFile = (file) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAnalysisResult(null);
  };

  const uploadAndAnalyze = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('userId', user.uid);
      formData.append('image', selectedFile);
      
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        const detections = data.data.detections || [];
        const validItems = detections.filter(item => item.class_id !== 0);
        
        const mealNutrition = validItems.reduce((acc, item) => ({
          protein: acc.protein + (item.nutrition?.protein || 0),
          carbs: acc.carbs + (item.nutrition?.carbs || 0),
          fat: acc.fat + (item.nutrition?.fat || 0),
          sodium: acc.sodium + (item.nutrition?.sodium || 0),
          sugar: acc.sugar + (item.nutrition?.sugar || 0),
          calories: acc.calories + (item.nutrition?.calories || 0),
        }), { protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0, calories: 0 });

        const serverImageUrl = data.data.imagePath;
        const newDoc = {
          timestamp: Timestamp.now(),
          imagePath: serverImageUrl,  
          nutrition: mealNutrition,
          foods: validItems.map(i => i.name),
          analysisRaw: data.data
        };

        await addDoc(collection(db, `users/${user.uid}/history`), newDoc);

        setAnalysisResult({ ...data.data, imagePath: serverImageUrl, currentMealNutrition: mealNutrition });
        loadUserData(user.uid);
        setActiveTab('Analyzing');
      } else {
        setError('분석 실패: ' + data.message);
      }
    } catch (err) {
      setError('서버 통신 오류: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- 렌더링 헬퍼 ---
  const renderMealGauge = (label, value, standard, unit) => {
    const percentage = Math.round((value / standard) * 100);
    const filledPct = Math.min(percentage, 100);
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontWeight: '600', fontSize: '0.9rem' }}>
          <span>{label}</span>
          <span style={{ color: '#666' }}>{percentage}% ({value.toFixed(0)}{unit})</span>
        </div>
        <div style={{ width: '100%', height: '10px', backgroundColor: '#eee', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ width: `${filledPct}%`, height: '100%', backgroundColor: '#6c5ce7', borderRadius: '5px', transition: 'width 1s' }} />
        </div>
      </div>
    );
  };

  const renderFeedbackGauge = (label, current, standard, unit) => {
    const percentage = Math.round((current / standard) * 100);
    let missing = standard - current;
    let isExcess = false;

    if (missing < 0) {
      missing = Math.abs(missing);
      isExcess = true;
    }

    const filledPct = Math.min(percentage, 100);
    const barColor = isExcess ? '#FF5252' : '#007BFF';
    const statusText = isExcess 
      ? `⚠️ ${percentage}% (${missing.toFixed(0)}{unit} 초과)` 
      : `${missing.toFixed(0)}{unit} 필요 (${percentage}% 섭취)`;

    return (
      <div style={{ marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: '600' }}>
          <span>{label}</span>
          <span style={{ color: isExcess ? '#d63031' : '#2e86de', fontWeight: 'bold', fontSize: '0.9rem' }}>
            {statusText}
          </span>
        </div>
        <div style={{ width: '100%', height: '16px', backgroundColor: '#eee', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${filledPct}%`, height: '100%', backgroundColor: barColor, transition: 'width 1s ease', borderRadius: '8px' }} />
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1 className="auth-title">OutPut</h1>
          <p className="auth-subtitle">{isLoginMode ? '로그인하여 건강을 관리하세요' : '회원가입하고 시작하세요'}</p>
          <form onSubmit={handleAuth} className="auth-form">
            <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit" className="auth-btn">{isLoginMode ? '로그인' : '회원가입'}</button>
          </form>
          {authError && <p className="error-text">{authError}</p>}
          <button className="toggle-btn" onClick={() => setIsLoginMode(!isLoginMode)}>
            {isLoginMode ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="app-logo">OutPut</div>
          <nav className="app-nav">
            {['Home', 'Analyzing', 'Result', 'Feedback'].map(tab => (
              <button key={tab} className={`nav-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
            <button className="logout-btn" onClick={handleLogout}>로그아웃</button>
          </nav>
        </div>
      </header>

      <main className="app-main-content">
        {activeTab === 'Home' && (
          <div className="content-grid">
            <div className="upload-section">
              <h2 className="section-title">오늘의 식사를 기록하세요</h2>
              <div className="image-upload-area" onClick={() => fileInputRef.current?.click()}>
                {!previewUrl ? (
                  <><p className="upload-text">이미지 업로드 (클릭)</p><p className="upload-subtext">오늘 먹은 음식을 촬영해서 올려주세요</p></>
                ) : (
                  <div className="image-preview-container">
                    <img src={previewUrl} alt="Preview" className="image-preview" />
                    <button className="remove-image-button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setPreviewUrl(''); }}>X</button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" hidden onChange={handleFileSelect} accept="image/*" />
              </div>
              {selectedFile && (
                <button className="upload-button" onClick={uploadAndAnalyze} disabled={loading} style={{ marginTop: '20px' }}>
                  {loading ? 'AI 분석 및 저장 중...' : '식사 기록하기'}
                </button>
              )}
              {error && <div className="error-message" style={{marginTop: '15px'}}>{error}</div>}
            </div>
          </div>
        )}

        {activeTab === 'Analyzing' && (
          <div className="analysis-container">
            {analysisResult ? (
              <div className="result-layout">
                <div className="result-card result-left">
                  <div className="result-image-wrapper">
                    <img src={analysisResult.imagePath} alt="Analyzed" />
                  </div>
                  <div className="detected-food-section">
                    <h3>🥣 인식된 음식</h3>
                    <ul className="food-detected-list">
                      {analysisResult.detections?.filter(d => d.class_id !== 0).map((item, idx) => (
                        <li key={idx}>
                          <span className="food-name">{item.name}</span>
                          <span className="food-cal">{item.nutrition?.calories?.toFixed(0)} kcal</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button className="action-btn" onClick={() => setActiveTab('Feedback')}>피드백 보기</button>
                </div>
                <div className="result-card result-right">
                  <h3 className="panel-title">&lt;영양성분 분석 결과&gt;</h3>
                  <p className="panel-subtitle">이번 식사의 영양소 함량 분석</p>
                  <div className="nutrition-gauges">
                    {(() => {
                      const nutri = analysisResult.currentMealNutrition || analysisResult.detections?.reduce((acc, item) => ({
                         protein: acc.protein + (item.nutrition?.protein || 0),
                         carbs: acc.carbs + (item.nutrition?.carbs || 0),
                         fat: acc.fat + (item.nutrition?.fat || 0),
                         sodium: acc.sodium + (item.nutrition?.sodium || 0),
                         sugar: acc.sugar + (item.nutrition?.sugar || 0),
                      }), { protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 });
                      return (
                        <>
                          {renderMealGauge('단백질', nutri.protein, DAILY_STANDARDS.protein, 'g')}
                          {renderMealGauge('탄수화물', nutri.carbs, DAILY_STANDARDS.carbs, 'g')}
                          {renderMealGauge('지방', nutri.fat, DAILY_STANDARDS.fat, 'g')}
                          {renderMealGauge('나트륨', nutri.sodium, DAILY_STANDARDS.sodium, 'mg')}
                          {renderMealGauge('당류', nutri.sugar, DAILY_STANDARDS.sugar, 'g')}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state"><p>분석된 결과가 없습니다.</p></div>
            )}
          </div>
        )}

        {/* Result 탭: 영양제 추천 + 히스토리 목록 */}
        {activeTab === 'Result' && (
          <div className="history-section">
            
            {/* 1. AI 영양제 추천 (Result 탭으로 이동됨) */}
            <section className="recommendation-container" style={{ marginBottom: '50px' }}>
              <h2 className="section-title">💊 AI 맞춤 영양제 추천</h2>
              <p className="section-desc">평소 식습관 데이터를 분석하여 부족한 부분을 채워줄 영양제를 선정했습니다.</p>
              <div className="recommendation-grid">
                {supplementRecommendations.length > 0 ? supplementRecommendations.map((rec, idx) => (
                  <div key={idx} className="rec-card" style={{ backgroundColor: rec.bg }}>
                    <div className="rec-icon">💊</div>
                    <div className="rec-content">
                      <h3>{rec.name}</h3>
                      <p>{rec.reason}</p>
                    </div>
                  </div>
                )) : (
                  <p className="empty-text">데이터가 충분하지 않아 추천할 수 없습니다.</p>
                )}
              </div>
            </section>

            <div className="divider" style={{ borderBottom: '2px dashed #ddd', margin: '40px 0' }}></div>

            {/* 2. 히스토리 목록 */}
            <h2 className="section-title">📅 나의 식사 히스토리</h2>
            {historyList.length > 0 ? (
              <div className="history-grid">
                {historyList.map((item) => (
                  <div key={item.id} className="history-card" onClick={() => {
                    setAnalysisResult({ 
                      imagePath: item.imagePath, 
                      detections: item.foods.map((f) => ({ name: f, nutrition: item.nutrition, class_id: 99 })), 
                      currentMealNutrition: item.nutrition 
                    });
                    setActiveTab('Analyzing');
                  }}>
                    <div className="history-img-wrapper">
                      <img src={item.imagePath} alt="meal" onError={(e) => {e.target.src = 'https://via.placeholder.com/150?text=Error'}}/>
                    </div>
                    <div className="history-info">
                      <span className="date">{item.timestamp.toDate().toLocaleDateString()}</span>
                      <span className="time">{item.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <p className="foods">{item.foods.join(', ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state"><p>아직 기록된 식사가 없습니다.</p></div>
            )}
          </div>
        )}

        {/* Feedback 탭: 누적 게이지 + 음식 추천 */}
        {activeTab === 'Feedback' && (
          <div className="feedback-container">
            <section className="feedback-section">
              <h2 className="section-title">📊 오늘 누적 섭취량 피드백</h2>
              <div className="feedback-card">
                {renderFeedbackGauge('단백질', todayNutrition.protein, DAILY_STANDARDS.protein, 'g')}
                {renderFeedbackGauge('탄수화물', todayNutrition.carbs, DAILY_STANDARDS.carbs, 'g')}
                {renderFeedbackGauge('지방', todayNutrition.fat, DAILY_STANDARDS.fat, 'g')}
                {renderFeedbackGauge('나트륨', todayNutrition.sodium, DAILY_STANDARDS.sodium, 'mg')}
                {renderFeedbackGauge('당류', todayNutrition.sugar, DAILY_STANDARDS.sugar, 'g')}
                <div className="gauge-legend">
                  <span className="legend-item"><span className="dot blue"></span>부족 (더 드세요)</span>
                  <span className="legend-item"><span className="dot red"></span>초과 (주의하세요)</span>
                </div>
              </div>
            </section>

            <section className="feedback-section">
              <h2 className="section-title">🥗 부족한 영양소를 채워줄 추천 음식</h2>
              <p className="section-desc">오늘의 영양 밸런스를 맞추기 위해 지금 드시면 좋은 음식들입니다.</p>
              <div className="recommendation-grid">
                {foodRecommendations.map((rec, idx) => (
                  <div key={idx} className="rec-card" style={{ backgroundColor: rec.bg }}>
                    <div className="rec-icon">{rec.icon}</div>
                    <div className="rec-content">
                      <h3>{rec.name}</h3>
                      <p>{rec.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <button className="upload-button center-btn" onClick={() => { setSelectedFile(null); setPreviewUrl(''); setActiveTab('Home'); }}>추가 식사 기록하기</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;