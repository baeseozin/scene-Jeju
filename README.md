# 분위기 메이커 — 제주 촬영 적합도 MVP

현재 위치에서 촬영 장소까지의 도착 예상 시각을 구하고, 그 시각의 날씨와 태양 위치를 합쳐 촬영 적합도를 `가능 / 보통 / 비추천`으로 판정하는 해커톤 MVP입니다.

기본값은 `mock` 모드라 API 키 없이 바로 실행됩니다. `auto` 또는 `real` 모드에서는 기상청 초단기예보의 `RN1(1시간 강수량)`, `WSD(풍속)`, `SKY(하늘상태)`를 사용합니다. 태양 고도와 방위각은 `pvlib`로 항상 실제 계산합니다.

## 포함 범위

- 장소 3개: 협재해수욕장, 사려니숲길, 도두동 무지개해안도로
- 콘셉트 3개: 청량한 여행, 감성 필름, 노을 실루엣
- 거리 기반 이동시간 추정 및 도착 예상 시각 계산
- 기상청 초단기예보 또는 결정론적 mock 날씨
- `pvlib` 기반 태양 고도·방위각
- 날씨 50% + 빛 35% + 장소 15%의 설명 가능한 점수
- 장소·콘셉트 조합별 15초 촬영 가이드 9세트
- 모바일 대응 React UI

## 빠른 실행

### 1. 백엔드

Python 3.11 이상이 필요합니다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API 문서는 [http://localhost:8000/docs](http://localhost:8000/docs)에서 확인할 수 있습니다.

### 2. 프론트엔드

새 터미널에서 실행합니다.

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 [http://localhost:5173](http://localhost:5173)을 엽니다. Vite 개발 서버가 `/api` 요청을 백엔드의 `8000` 포트로 전달합니다.

## 실행 모드

프로젝트 루트에서 환경 파일을 만듭니다.

```bash
cp .env.example .env
```

```dotenv
# 키 없이 항상 mock 사용
APP_MODE=mock

# 키가 있으면 실데이터, 조회 실패 시 mock으로 자동 전환
APP_MODE=auto
KMA_SERVICE_KEY=공공데이터포털_일반인증키

# 실데이터만 허용하며 조회 실패를 API 오류로 반환
APP_MODE=real
KMA_SERVICE_KEY=공공데이터포털_일반인증키
```

환경값을 바꾼 뒤에는 백엔드 서버를 다시 시작해야 합니다. `KMA_SERVICE_KEY`에는 공공데이터포털이 제공한 Encoding/Decoding 키 중 어느 쪽을 넣어도 서버에서 정규화합니다.

## 점수 산정

1. 현재 좌표와 장소 좌표의 Haversine 거리에 제주 도로 우회율과 평균 주행속도를 적용해 이동시간을 추정합니다.
2. 출발 시각에 이동시간을 더해 도착 예상 시각을 계산합니다.
3. 도착 시각과 가장 가까운 기상청 초단기예보를 선택합니다.
4. 강수, 풍속, 하늘상태를 콘셉트별 허용값과 비교합니다.
5. 도착 시각의 태양 고도와 방위각을 장소의 권장 촬영 방향 및 콘셉트의 광원 관계와 비교합니다.
6. `날씨 50% + 빛 35% + 장소 15%`로 합산합니다.

| 총점 | 판정 |
| --- | --- |
| 75점 이상 | 가능 |
| 50~74점 | 보통 |
| 49점 이하 | 비추천 |

태양 고도가 `-6°` 미만이거나 강수량이 `5mm` 이상이면 안전장치로 `비추천` 처리합니다.

## API 예시

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "current_location": {"latitude": 33.5104, "longitude": 126.4914},
    "place_id": "hyeopjae",
    "concept_id": "refreshing"
  }'
```

- `GET /api/health`: 서버 상태
- `GET /api/catalog`: 장소와 콘셉트 목록
- `POST /api/analyze`: 도착 시각 및 적합도 분석

## 테스트와 빌드

```bash
cd backend
pytest -q

cd ../frontend
npm run build
```

## 파일 구조

```text
.
├── .env.example
├── README.md
├── backend
│   ├── app
│   │   ├── main.py              # FastAPI 엔드포인트와 전체 흐름
│   │   ├── config.py            # mock/auto/real 설정
│   │   ├── data.py              # 장소·콘셉트·촬영 가이드
│   │   ├── models.py            # 요청/응답 스키마
│   │   └── services
│   │       ├── travel.py        # 거리와 이동시간
│   │       ├── weather.py       # 기상청 API, 격자 변환, mock
│   │       ├── solar.py         # pvlib 태양 위치
│   │       └── scoring.py       # 점수와 판정 근거
│   ├── requirements.txt
│   └── tests
└── frontend
    ├── package.json
    ├── vite.config.ts
    └── src
        ├── App.tsx              # 입력과 결과 화면
        ├── api.ts               # 백엔드 연동
        ├── types.ts             # TypeScript 타입
        └── styles.css           # 반응형 UI
```

## MVP에서 의도적으로 단순화한 부분

- 이동시간은 실제 교통·경로 API가 아니라 거리 기반 추정입니다. 발표에서 “실시간 내비게이션 시간”이라고 부르면 안 됩니다.
- `SKY`는 구름량 퍼센트가 아니라 `맑음 / 구름 많음 / 흐림` 분류입니다.
- 장소의 권장 촬영 방향과 9개 촬영 가이드는 사전 정의 데이터입니다. 현장을 영상으로 인식해 자동 생성한 결과가 아닙니다.
- 기상청 초단기예보 범위를 벗어난 시각은 실데이터 모드에서 조회할 수 없습니다. 해커톤 이후에는 단기예보 API를 함께 붙여 확장해야 합니다.

태양 위치 계산은 timezone이 포함된 시각을 사용합니다. `pvlib` 공식 문서도 timezone-aware `DatetimeIndex` 사용을 전제로 하며, 반환되는 고도·방위각의 단위는 degree입니다.
