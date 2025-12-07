# ai_server_fastapi.py
# Python FastAPI AI 서버 (YOLOv8 + CSV DB)
# 실행: python ai_server_fastapi.py

import torch
import cv2
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import uvicorn
import os
import sys
import csv
from ultralytics import YOLO

# --- 1. 설정 및 전역 변수 ---
MODEL_PATH = 'best.pt'       # 학습된 YOLO 모델 파일
CSV_PATH = 'food_list.csv'   # 영양 정보 데이터베이스

# 전역 변수로 관리 (lifespan에서 초기화됨)
ml_models = {}
food_db = {}

# --- 2. 데이터베이스 및 모델 로드 함수 ---
def load_food_database(csv_file):
    """
    food_list.csv를 읽어서 ID를 키로 하는 상세 정보 딕셔너리를 만듭니다.
    """
    database = {}
    if not os.path.exists(csv_file):
        print(f"[AI 서버] ⚠️ 경고: 데이터 파일을 찾을 수 없습니다: {csv_file}")
        return database

    print(f"[AI 서버] 📂 음식 데이터 로드 중... ({csv_file})")
    try:
        # utf-8-sig는 엑셀 CSV의 BOM 문제를 해결해줍니다.
        with open(csv_file, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    # CSV의 'id' 컬럼을 정수형 키로 사용
                    food_id = int(row['id'].strip())
                    
                    # 데이터 매핑 (CSV 컬럼명과 일치해야 함)
                    database[food_id] = {
                        "name": row['name'].strip(),
                        "calories": float(row.get('calories', 0)),
                        "carbs": float(row.get('carbs', 0)),
                        "protein": float(row.get('protein', 0)),
                        "fat": float(row.get('fat', 0)),
                        "sodium": float(row.get('sodium', 0)),
                        "sugar": float(row.get('sugar', 0)),
                        "supplements": row.get('supplements', '') # 추천 영양제 정보 등
                    }
                except ValueError:
                    continue # 숫자 변환 실패 시 건너뜀
                        
        print(f"[AI 서버] ✅ DB 구축 완료! 총 {len(database)}개의 음식 정보를 로드했습니다.")
    except Exception as e:
        print(f"[AI 서버] ❌ CSV 읽기 실패: {e}")
    
    return database

# --- 3. Lifespan (서버 시작/종료 시 실행될 로직) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n" + "="*50)
    print("[AI 서버] 시스템 초기화 시작...")
    
    # 1. 음식 DB 로드
    db_data = load_food_database(CSV_PATH)
    food_db.update(db_data)

    # 2. YOLO 모델 로드
    try:
        if os.path.exists(MODEL_PATH):
            print(f"[AI 서버] YOLO 모델 로드 시도: {MODEL_PATH}")
            ml_models["yolo"] = YOLO(MODEL_PATH)
            print("[AI 서버] ✅ 모델 로드 성공")
        else:
            print(f"[AI 서버] ❌ 치명적 오류: 모델 파일을 찾을 수 없습니다 ({MODEL_PATH})")
            print("   -> 프로젝트 폴더에 best.pt 파일이 있는지 확인해주세요.")
    except Exception as e:
        print(f"[AI 서버] ❌ 모델 로드 중 에러 발생: {e}")
    
    print("="*50 + "\n")
    
    yield # 서버가 실행되는 동안 대기
    
    # 서버 종료 시 정리할 작업이 있다면 여기에 작성
    ml_models.clear()
    food_db.clear()
    print("[AI 서버] 시스템 종료 및 리소스 해제")

# --- 4. FastAPI 앱 설정 ---
app = FastAPI(lifespan=lifespan)

# CORS 설정 (모든 출처 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 5. Pydantic 모델 (요청 데이터 검증용) ---
class AnalyzeRequest(BaseModel):
    image_path: str

# --- 6. API 엔드포인트 ---

@app.get("/health")
async def health_check():
    """서버 상태 및 모델 로드 여부 확인"""
    return {
        "status": "running",
        "model_loaded": "yolo" in ml_models,
        "db_loaded": len(food_db) > 0
    }

@app.post("/analyze")
async def analyze_image(request_data: AnalyzeRequest):
    """
    이미지 경로를 받아 예측 후, 영양 정보와 함께 결과를 반환
    요청 바디: { "image_path": "C:/.../uploads/user1/img.jpg" }
    """
    # 모델 로드 확인
    if "yolo" not in ml_models:
        raise HTTPException(status_code=500, detail="AI 모델이 로드되지 않았습니다.")

    image_path = request_data.image_path

    # 이미지 경로 확인
    if not image_path:
        raise HTTPException(status_code=400, detail="image_path 파라미터가 없습니다.")

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"이미지 파일을 찾을 수 없습니다: {image_path}")

    try:
        model = ml_models["yolo"]
        
        # 1. YOLO 예측 실행
        print(f"[AI 서버] 분석 요청 수신: {image_path}")
        # conf: 신뢰도 임계값 (0.25 이상만 검출)
        results = model.predict(image_path, save=False, conf=0.25, verbose=False)
        
        detections = []
        
        # 2. 결과 파싱 및 DB 매칭
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                confidence = float(box.conf[0])
                
                # 좌표 정보 (필요시 사용)
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                # DB에서 음식 정보 조회
                info = food_db.get(cls_id)
                
                if info:
                    # DB에 정보가 있는 경우 (음식)
                    detection = {
                        "class_id": cls_id,
                        "name": info['name'],
                        "confidence": confidence,
                        "box": [x1, y1, x2, y2],
                        # 영양 정보 매핑
                        "nutrition": {
                            "calories": info['calories'],
                            "carbs": info['carbs'],
                            "protein": info['protein'],
                            "fat": info['fat'],
                            "sodium": info['sodium'],
                            "sugar": info['sugar']
                        },
                        "solution": {
                            "supplements": info['supplements']
                        }
                    }
                else:
                    # DB에 정보가 없는 경우 (그릇, 식기 등 ID 0번 혹은 미등록 객체)
                    detection = {
                        "class_id": cls_id,
                        "name": f"Unknown (ID: {cls_id})",
                        "confidence": confidence,
                        "box": [x1, y1, x2, y2],
                        "nutrition": None,
                        "solution": None
                    }

                detections.append(detection)

        print(f"[AI 서버] 분석 완료: {len(detections)}개 객체 검출됨")

        # 3. 결과 반환
        return {
            "success": True,
            "count": len(detections),
            "detections": detections,
            "image_path": image_path
        }

    except Exception as e:
        print(f"[AI 서버] 분석 중 예외 발생: {e}")
        # FastAPI에서는 HTTPException을 사용하여 에러 응답을 보냅니다.
        raise HTTPException(status_code=500, detail=str(e))

# --- 7. 서버 실행 ---
if __name__ == '__main__':
    # Uvicorn을 사용하여 서버 실행 (기존 Flask와 동일하게 5000번 포트 사용)
    uvicorn.run(app, host="0.0.0.0", port=5000)
