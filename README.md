# 캡스톤 프로젝트

이 프로젝트는 웹 애플리케이션과 서버를 포함한 통합 시스템입니다. 웹 애플리케이션은 React를 기반으로 개발되었으며, 서버는 Python과 Node.js를 사용하여 구현되었습니다.

---

## 프로젝트 구조

### 1. `my-web-app` 폴더
웹 애플리케이션 관련 파일들이 포함되어 있습니다.

- **`public/`**: 정적 파일들이 포함된 폴더입니다.
  - `index.html`: 웹 애플리케이션의 기본 HTML 파일입니다.
  - `favicon.ico`, `logo192.png`, `logo512.png`: 애플리케이션 아이콘 및 로고 파일입니다.
  - `manifest.json`, `robots.txt`: PWA 및 SEO 관련 설정 파일입니다.
  
- **`src/`**: 애플리케이션의 주요 소스 코드가 포함된 폴더입니다.
  - `App.js`: 애플리케이션의 메인 컴포넌트입니다.
  - `firebase.js`: Firebase 설정 파일입니다.
  - `index.js`: React 애플리케이션의 진입점입니다.
  - `App.css`, `index.css`: 스타일시트 파일입니다.
  - `setupTests.js`: 테스트 환경 설정 파일입니다.

- **`package.json`**: 프로젝트의 의존성과 스크립트가 정의된 파일입니다.

---

### 2. `server` 폴더
서버 관련 파일들이 포함되어 있습니다.

- **`ai_server.py`**: AI 모델을 활용한 서버 코드입니다.
- **`best.pt`**: AI 모델의 가중치 파일입니다.
- **`food_list.csv`, `food-num2label.csv`**: 음식 데이터와 관련된 CSV 파일입니다.
- **`make_food_list.py`**: 음식 데이터 전처리 스크립트입니다.
- **`server.js`**: Node.js 기반 서버 코드입니다.
- **`serviceAccountKey.json`**: Firebase 서비스 계정 키 파일입니다.
- **`build/`**: 웹 애플리케이션의 빌드 결과물이 포함된 폴더입니다.
  - `index.html`: 빌드된 애플리케이션의 진입점 HTML 파일입니다.
  - `static/`: 정적 리소스 파일들이 포함된 폴더입니다.

- **`uploads/`**: 업로드된 파일들이 저장되는 폴더입니다.

---

## 실행 방법

### 1. 웹 애플리케이션 실행
아래 명령어를 사용하여 웹 애플리케이션을 실행할 수 있습니다.

```bash
cd my-web-app
npm install
npm start
```

### 2. 서버 실행
아래 명령어를 사용하여 서버를 실행할 수 있습니다.

#### Python 서버 실행
```bash
cd server
python ai_server.py
```

#### Node.js 서버 실행
```bash
cd server
npm install
node server.js
```

---

## 주요 기능

1. **웹 애플리케이션**: 사용자 인터페이스를 제공하며, Firebase와 연동됩니다.
2. **AI 서버**: 음식 데이터를 분석하고 결과를 반환합니다.
3. **Node.js 서버**: 클라이언트와 AI 서버 간의 중계 역할을 수행합니다.

---

## 요구 사항

- Node.js
- Python 3.x
- Firebase 계정 및 설정

---

## 어플리케이션 다운로드 링크

https://drive.google.com/file/d/1QBfTdbYfip8z2gxKbheGzUAeGGp1eOZC/view?usp=sharing


