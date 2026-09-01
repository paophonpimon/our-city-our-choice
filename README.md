# Our City, Our Choice — เมืองนี้อยู่ที่เรา

เกมจำลองสถานการณ์พลเมืองและการตัดสินใจเชิงจริยธรรมสำหรับกิจกรรมในชั้นเรียน ผู้เรียนรับบทเป็น 1 ใน 8 อาชีพ ตอบสถานการณ์ปกติ 10 ข้อและเหตุการณ์วิกฤต 2 ครั้ง การตัดสินใจของทุกคนถูกรวมเป็นคะแนนเมืองและคะแนนสะสมของอาคาร 7 แห่ง ภาพเมือง โมเดลอาคาร ป้ายระดับ และผลสรุปจะเปลี่ยนตามผลที่คำนวณจริง

โปรเจกต์นี้ไม่ใช่เกมตอบถูก/ผิดและไม่ให้คะแนนจากความเร็ว เป้าหมายคือทำให้ผู้เรียนเห็นความเชื่อมโยงระหว่างการตัดสินใจส่วนบุคคล ผลประโยชน์ส่วนรวม ความโปร่งใส และผลกระทบต่อเมือง

เอกสารสำหรับ AI และผู้พัฒนาที่ต้องเข้าใจสัญญาทางเทคนิคก่อนแก้โค้ดอยู่ที่ [AGENTS.md](./AGENTS.md)

## ภาพรวมกิจกรรม

หนึ่งรอบการเล่นมีลำดับดังนี้:

1. ครูสร้างห้องและแชร์รหัส/QR ให้ผู้เรียน
2. ผู้เรียนกรอกชื่อ ห้องเรียน และเลขที่ แล้วรอใน Lobby
3. ครูเปิดแบบประเมินก่อนกิจกรรม (PRE) 10 ข้อ มาตราส่วน 1–5
4. เมื่อผู้เรียนทำ PRE ครบ ครูเริ่มเกมและระบบแจกบทบาทอย่างสมดุล
5. ผู้เรียนดูบทบาทและเข้าสู่สถานการณ์ปกติข้อ 1–10
6. หลังข้อ 4 และข้อ 8 มีเหตุการณ์วิกฤต คะแนนสุจริต/ทุจริตแรงขึ้น 2 เท่า
7. ครูเป็นผู้ปิดรับ สรุปผล และเปิดขั้นถัดไป หน้าครูแสดงผลเมืองแบบ realtime
8. หลังข้อ 10 ครูเลือกเล่นรอบต่อไปโดยหมุนบทบาท หรือจบกิจกรรม
9. เมื่อจบกิจกรรม ผู้เรียนทำ POST 10 ข้อและ Reflection 3 ข้อ
10. ครูบันทึก Teacher Observation O1–O4 และเปิดแดชบอร์ดหลักฐานสำหรับกรรมการ

เกมรองรับสูงสุด 8 รอบ (`MAX_GAME_CYCLES = 8`) เพื่อให้ผู้เรียนหมุนผ่านบทบาททั้ง 8 บทบาทโดยไม่ซ้ำในประวัติของตนเอง

## บทบาทและอาคาร

| บทบาท | สถานที่/อาคารที่ได้รับผลกระทบ |
| --- | --- |
| หมอ | โรงพยาบาล |
| เจ้าหน้าที่เทศบาล | สำนักงานเทศบาล |
| ตำรวจ | สถานีตำรวจ |
| ครู | โรงเรียน |
| พ่อค้าแม่ค้า | ตลาด |
| ผู้รับเหมา | ไซต์ก่อสร้าง |
| นักเรียน | โรงเรียน |
| นักข่าว | สำนักข่าว |

ครูและนักเรียนใช้โรงเรียนร่วมกัน จึงมี 8 บทบาทแต่มี 7 อาคาร

## กติกาคะแนน

สถานการณ์ปกติ:

- สุจริต: `+50`
- ทุจริต: `-100`
- ไม่ตอบ/หมดเวลา: `-20`

เหตุการณ์วิกฤต:

- สุจริต: `+100`
- ทุจริต: `-200`
- ไม่ตอบ/หมดเวลา: `-20`

คะแนนเมืองเริ่มที่ `500` และถูกอัปเดตด้วยค่าเฉลี่ยของผู้เล่นที่ถูกล็อกไว้ในรอบนั้น จากนั้นจำกัดอยู่ในช่วง `0–1000`

| คะแนนเมือง | สถานะเมือง |
| ---: | --- |
| 0–199 | ระดับ -2 แย่มาก |
| 200–299 | ระดับ -1 แย่ |
| 300–599 | ระดับ 0 เมืองปกติ |
| 600–799 | ระดับ +1 กำลังพัฒนา |
| 800–1000 | ระดับ +2 พัฒนา |

แต่ละอาคารมีคะแนนสะสมแยกของตนเอง เริ่มที่ `500` และรับเฉพาะค่าเฉลี่ยของบทบาทที่ผูกกับสถานที่นั้น:

| คะแนนอาคาร | ระดับโมเดล |
| ---: | ---: |
| 0–199 | Lv.-2 |
| 200–399 | Lv.-1 |
| 400–599 | Lv.0 |
| 600–799 | Lv.1 |
| 800–1000 | Lv.2 |

`cityScore` และ `buildingScores` เป็นข้อมูลคนละชุด ห้ามคำนวณระดับอาคารจากคะแนนเมืองหรือคำนวณป้ายจากคะแนนดิบใน component

## สิ่งที่หน้าครูแสดง

- เมือง 3 ฉาก: โทรม ปกติ และพัฒนา
- อาคาร 7 แห่ง อาคารละ 5 ระดับ `-2..+2`
- ป้ายอาคารแสดงชื่อและ transition ล่าสุด เช่น `Lv.0 ▲ Lv.1`; ถ้าไม่เปลี่ยนแสดงเพียง `Lv.0`
- เอฟเฟกต์อาคารใช้ระบบกลางเดียวกันทุกอาคาร: upgrade, neutral, downgrade และ critical negative
- กล่องคะแนนสด `+50/-100` ยึดพิกัดเดียวกับป้ายอาคารและตาม zoom/pan ของเมือง
- แผง “ผลกระทบอาคารสะสม” เป็นเครือข่ายเส้นหลักและกิ่งเชื่อมครบ 7 อาคาร
- เพลง Lobby/Gameplay, เสียง UI, เสียงบรรยากาศ และเสียงวิกฤต โดยระดับ BGM ปกติตรงกับค่าที่ผู้ใช้ตั้ง

## แบบประเมินและหลักฐาน

- PRE และ POST: ข้อละ 1–5 จำนวน 10 ข้อ เก็บคำตอบดิบและจับคู่ด้วย `playerId`
- Reflection: R1–R3 เป็นข้อความเดิมของผู้เรียน ไม่มีการให้คะแนนหรือสรุปแท็กอัตโนมัติ
- Teacher Observation: O1–O4 มาตราส่วน 1–4 พร้อมบันทึกเพิ่มเติม
- แดชบอร์ดครูคำนวณเฉพาะผู้เรียนที่มี PRE และ POST ครบคู่ แสดงค่าเฉลี่ย การเปลี่ยนแปลง Improved/Unchanged/Decreased และอัตราการทำ Reflection
- เมื่อห้อง `finished` ครูเผยแพร่เฉพาะ aggregate ที่ whitelist แล้วไว้ใน `room.publicLearningEvidence` เพื่อให้หน้าผลสาธารณะอ่านได้ โดยไม่เปิดคำตอบรายบุคคล

## เทคโนโลยี

- React 19 + TypeScript + Vite
- React Router
- Firebase Anonymous Authentication
- Cloud Firestore realtime listeners, transactions และ security rules
- Vitest + ESLint
- CSS/SVG สำหรับฉากเมือง โมเดล เอฟเฟกต์ และ responsive UI

## โครงสร้างโค้ด

```text
src/
├─ components/   UI ที่ใช้ร่วมกัน ฉากเมือง ป้าย ผลกระทบ เสียง และ evidence
├─ context/      เลือก backend, session bootstrap และ city-layout provider
├─ debug/        flight recorder แบบ opt-in (?debug=2)
├─ domain/       กติกา pure functions: คะแนน บทบาท วิกฤต อาคาร การประเมิน
├─ hooks/        realtime subscriptions, countdown, fullscreen และ publisher
├─ lib/          flow helpers และ sound pack
├─ pages/        route ของครู ผู้เรียน แบบประเมิน ผลลัพธ์ และ layout editor
├─ services/     Firebase backend, Demo backend, Google Sheets และ session
└─ types/        Firestore/application data contracts

scripts/         bots, staging guards, layout freeze และ load test
e2e/             end-to-end classroom flows
public/audio/    BGM, SFX และ ambience
public/images/   ฉากเมืองและโมเดลอาคาร
```

ไฟล์สำคัญ:

- `src/types/classroomGame.ts` — room/player/answer/assessment contracts
- `src/services/classroomGameService.ts` — interface ที่ทั้ง Firebase และ Demo ต้องทำตาม
- `src/services/firebaseClassroomService.ts` — backend จริงและ transaction flow
- `src/domain/classroomGameLoop.ts` — routing, timer และ live-score helpers
- `src/domain/cityScoring.ts` — คะแนนสถานการณ์ปกติและระดับเมือง
- `src/domain/cityCrisisEvents.ts` — วิกฤต 2 เหตุการณ์และคะแนน ×2
- `src/domain/cityBuildings.ts` — อาคาร 7 แห่ง คะแนน ระดับ asset และ frozen layout
- `src/domain/cityPresentation.ts` — transition/effect ที่เป็น presentation-only
- `src/pages/TeacherPage.tsx` — orchestration หลักของหน้าครู
- `src/pages/GamePage.tsx` — การเล่นฝั่งผู้เรียน
- `src/pages/ResultPage.tsx` — ผลรายรอบ ผลสุดท้าย และภาพเมืองล่าสุด

## Routes

| Route | ผู้ใช้/หน้าที่ |
| --- | --- |
| `/` | หน้าแรก |
| `/teacher` | สร้างและควบคุมห้อง |
| `/join?room=ABCD` | เข้าร่วมห้องด้วยรหัส 4 ตัว |
| `/assessment/pre/:roomCode` | แบบประเมินก่อนกิจกรรม |
| `/lobby/:roomCode` | ห้องรอ |
| `/role-draw/:roomCode` | เปิดเผยบทบาท |
| `/game/:roomCode` | สถานการณ์ปกติ/วิกฤตของผู้เรียน |
| `/result/:roomCode` | ผลรายรอบ/ผลสาธารณะ/ผลส่วนตัว |
| `/assessment/post/:roomCode` | POST ต่อด้วย Reflection |
| `/teacher/evidence/:roomCode` | หลักฐานฉบับครูหลังห้อง finished |
| `/layout-editor` | ปรับโมเดล/ป้ายบน staging |

## ติดตั้งและรัน

ต้องใช้ Node.js ที่ Vite รองรับ (แนะนำ Node 22 LTS) และ npm

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

โหมดปกติของ `.env.example` ใช้ Firebase (`VITE_DEMO_MODE=false`) ถ้าต้องการ backend จำลองในเครื่องให้ตั้ง `VITE_DEMO_MODE=true`

คำสั่งหลัก:

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rules
```

## Google Sheets Question Bank

ครูโหลด CSV จากชีต `QUESTIONS` ก่อนสร้าง/เริ่มห้อง ต้องมีคำถาม active อย่างน้อย 10 ข้อต่อบทบาท และคอลัมน์:

```text
active, role_id, question_id, sort_order, question,
choice_1, choice_2, integrity_choice, image_url
```

ระบบสร้าง trusted snapshot 80 รายการ (8 บทบาท × 10 ข้อ) ไว้เฉพาะเครื่องครูและเผยแพร่ Firestore เฉพาะคำถาม/ตัวเลือกที่ปลอดภัย รายละเอียดอยู่ใน [GOOGLE_SHEETS_QUESTION_SYNC.md](./GOOGLE_SHEETS_QUESTION_SYNC.md)

## Firebase และข้อมูล

โครงสร้างหลัก:

```text
rooms/{roomId}
  players/{playerId}
  questions/{questionId}
  answers/{answerId}
  rounds/{gameCycle}::{questionNumber}
  crisisResults/{gameCycle}::{eventIndex}
  personalResults/{decisionId}
  assessments/{assessmentId}
```

ครูเป็นผู้เขียน room/questions/round results และคำนวณ trusted scoring ผู้เรียนอ่าน public question ของบทบาทตนเองและสร้างคำตอบของตนเองเท่านั้น คำตอบแรกที่ Firestore ยอมรับเป็น immutable และใช้ stable document ID เพื่อให้ retry แบบ idempotent

Firebase project ที่อนุญาต:

- Production: `our-city-our-choice`
- Staging: `our-city-our-choice-staging`

ห้ามใส่ service-account, token หรือไฟล์ `.env*.local` ลง Git

## Staging, Layout Editor และ Deploy

สร้าง `.env.staging.local` ด้วย config ของ staging ครบทั้ง 6 ค่า แล้วใช้:

```powershell
npm run dev:staging
npm run build:staging
npm run test:rules:staging
npm run deploy:staging
```

Staging URL: <https://our-city-our-choice-staging.web.app/>

`npm run deploy:staging` จะ validate environment, สร้าง staging rules, build และ deploy `firestore:rules,hosting` ไปยัง alias `staging`

หน้า `/layout-editor` บันทึก Draft กลางและ Publish layout ครบ `3 ฉาก × 7 อาคาร × 5 ระดับ = 105` ชุด Production ไม่อ่าน layout จาก Firestore; ต้อง freeze published staging layout ลง source ก่อน:

```powershell
npm run layout:freeze-staging
npm run lint
npm run typecheck
npm test
npm run build
```

## Classroom Bots

บอต Firebase รองรับ 1–40 คน, PRE, คำถาม 10 ข้อ, วิกฤต 2 ครั้ง, POST และ Reflection และปฏิเสธ production project เสมอ

ตัวอย่างส่งบอต 30 คนไปยัง staging:

```powershell
node scripts/classroom-bots.mjs `
  --room ABCD `
  --count 30 `
  --env-file .env.staging.local `
  --target firebase `
  --integrity-rate 0.75
```

โปรไฟล์ที่ใช้ได้ครั้งละหนึ่งแบบ:

- `--early-corrupt-through N`
- `--late-corrupt-from N`
- `--cycle-flip`
- `--building-spread-worst-city`
- `--building-spread-best-city` (alias `--building-spread-prosperous-city`)
- `--post-only` ใช้เติม POST/Reflection ให้บอตเดิมหลังจบห้อง

ห้ามรันบอตหรือ load test กับ production รายงาน load test เดิมอยู่ใน [LOAD_TEST_REPORT.md](./LOAD_TEST_REPORT.md)

## ข้อจำกัดและขอบเขตความเชื่อถือ

- ใช้ Anonymous Authentication; สิทธิ์ครูผูกกับ anonymous UID และ browser profile ที่สร้างห้อง
- trusted question snapshot/answer key อยู่ใน localStorage ของเครื่องครูเดียว การล้าง site data หรือเปลี่ยนเครื่องทำให้ครูไม่สามารถสรุปคำถามต่อได้
- ครู client เป็น trusted controller ของกิจกรรม ไม่ใช่ backend server สำหรับการสอบเดิมพันสูง
- Firestore rules ปกป้องขอบเขตการเขียนและข้อมูลส่วนตัว แต่ผู้ใช้ที่รู้รหัสห้องยังเข้าถึงข้อมูลสาธารณะที่ rules อนุญาต
- ต้องทดสอบบนอุปกรณ์และ Wi‑Fi จริงก่อนใช้ในชั้นเรียนขนาดใหญ่

## Checklist ก่อน merge/deploy

```powershell
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

ก่อนเปลี่ยนกติกา ให้เพิ่ม/แก้ pure-function tests ใน `src/domain`. ก่อนเปลี่ยน Firestore ให้รัน rules tests. ก่อนเปลี่ยนฉากเมือง ให้ตรวจทั้ง 3 scene, ทั้ง 5 ระดับอาคาร, zoom/pan, tablet และ portrait
