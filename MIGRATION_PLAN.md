# Our City, Our Choice — Migration Plan through Phase 4A

> สถานะเอกสาร: Reconciled through Phase 4A Simple Classroom Architecture
>
> วันที่ audit: 2026-07-18 (Asia/Bangkok)

### Phase 4A architecture override

- Teacher Client โหลด Google Sheets `QUESTIONS` ผ่าน CSV URL, parse/validate และเลือก 10 ข้อต่ออาชีพ
- Trusted snapshot พร้อม `integrity_choice` อยู่ใน React state/localStorage ของเครื่องครู; Firestore เก็บเฉพาะ public questions
- Student Client ส่งเฉพาะ `questionId`/`choiceId`; Teacher Client ฟัง answers, ปิดข้อ, deduplicate และคำนวณ aggregate city score
- Phase 4A ไม่ใช้ Firebase Functions, Service Account, Custom Claims, Cloud Tasks, IAM, Java, Firebase Emulator, server-only trusted collections หรือ Blaze plan
- ประเด็นเปิด: หลังปิดข้อจะเปิดข้อถัดไปอัตโนมัติหรือรอครูกด Next

## Current Architecture

### Audit basis and source-of-truth status

- Git baseline ที่ตรวจได้จริงคือ `a5a9b90 Baseline from Matana classroom game` และ `HEAD` อยู่ที่ commit นี้
- Branch ที่ตรวจได้จริงคือ `feature/our-city-migration`
- อ่านและ reconcile `PROJECT_HANDOFF_CONFIRMED_V2.md` ฉบับเต็มแล้ว และถือเป็น Source of Truth สูงสุด
- อ่าน `PROJECT_DECISIONS.json` และ `CONFIRMED_FILES_AND_ASSETS.md` ฉบับเต็มแล้ว ใช้ยืนยันข้อมูลเชิงโครงสร้าง รายชื่ออาชีพ และชื่อ assets โดยต้องไม่ขัดกับ handoff
- คำยืนยันล่าสุดจากผู้ใช้เรื่อง timer, จอครูเต็มจอ, เมืองเปลี่ยนตามผลรวม และไม่หักคะแนนเมื่อไม่ตอบ ถือเป็นข้อมูลยืนยันเพิ่มเติมของ Phase 1 reconciliation
- อ่าน `OUR_CITY_DEVELOPMENT_ROADMAP.md` ฉบับเต็มแล้ว และใช้ Phase 2–13 เป็นลำดับแนวทางพัฒนาหลัง Phase 1 โดยข้อเสนอใน Roadmap ไม่สามารถแทนที่ข้อยืนยันหรือเรื่องที่ยังเปิดใน canonical handoff ได้
- ไม่ใช้ `HANDOFF.md`, `README.md` หรือเอกสารเก่าเป็นข้อกำหนดเมื่อขัดกับ canonical handoff

### Decision status legend

- **ยืนยันแล้ว (CONFIRMED):** มาจาก canonical handoff, ไฟล์ประกอบที่ไม่ขัดกัน หรือคำยืนยันล่าสุดของผู้ใช้ นำไปเป็น requirement ได้หลังอนุมัติ Phase 2
- **เสนอแนะ (PROPOSED):** แนวทาง implementation จากผล audit ยังไม่ใช่ product decision และเปลี่ยนได้โดยไม่ขัด requirement
- **ยังต้องตัดสินใจ (OPEN):** canonical handoff ระบุว่ายังไม่ยืนยัน หรือเป็นรายละเอียดที่ต้องเลือกก่อนแตะ implementation ที่เกี่ยวข้อง

### Stack and entry points

- React 19 + TypeScript 5.9 + Vite 7
- React Router DOM 7 โดยใช้ `BrowserRouter`
- Tailwind CSS 4 ผ่าน Vite plugin พร้อม CSS แบบ custom ขนาดใหญ่ใน `src/styles.css`
- Firebase Web SDK 12: Anonymous Auth + Cloud Firestore
- Service abstraction เลือก `DemoGameService` เป็นค่าเริ่มต้น เว้นแต่ `VITE_DEMO_MODE=false`
- `GameProvider` สร้าง anonymous/demo session แล้วส่ง `service` และ `uid` ผ่าน Context
- Realtime state ใช้ `onSnapshot` ใน Firebase mode; Demo mode ใช้ local storage, custom browser events และ REST-style GET/PUT polling ทุก 300 ms ผ่าน Vite middleware

### Router and current routes

| Route | Current page | Current behavior | Migration classification |
|---|---|---|---|
| `/` | `HomePage` | หน้าแบรนด์ Matana และเลือกครู/นักเรียน | ADAPT |
| `/teacher` | `TeacherPage` | สร้างห้อง ตั้งเวลา ควบคุมรอบ และแสดงอันดับรายทีม | ADAPT โครงควบคุม, REPLACE กระดานอันดับ/ภาพหลัก |
| `/join` | `JoinPage` | เข้าห้องด้วยชื่อทีมและชื่อผู้พิทักษ์ | ADAPT route/form shell, REPLACE team identity |
| `/lobby/:roomCode` | `LobbyPage` | รอครูและแสดงข้อมูลทีม | ADAPT |
| `/game/:roomCode` | `GamePage` | คำถามชุดเดียวกันทุกทีม จับเวลา ตอบ/แก้คำตอบ และแสดงคะแนนทีม | ADAPT โครงคำถาม/เวลา, REPLACE domain และคะแนน |
| `/result/:roomCode` | `ResultPage` | ผลรายทีมแบบ fail/almost/success ตามคะแนน 0–10 | REPLACE เนื้อหาเป็นผลเมืองรวม |
| `/congratulations/:roomCode` | `CongratulationsPage` | ประกาศทีมแรก/ผู้ชนะ | REPLACE และถอด route จาก product flow |
| `/closed/:roomCode` | `ClosedPage` | ห้องสิ้นสุด | ADAPT |
| `*` | `NotFoundPage` | 404 ธีม Matana | ADAPT |

### Current source layers

| Layer | Files | Audit finding |
|---|---|---|
| Entry/router | `src/main.tsx`, `src/App.tsx` | โครง SPA ใช้ต่อได้ แต่ routes และ provider ยังอิง Matana |
| Shared components | `src/components/Layout.tsx` | มี scene, header, loading/error, status, confirm dialog ที่นำโครงกลับใช้ได้; branding/status copy ต้องเปลี่ยน |
| Context | `src/context/GameContext.tsx` | service injection + session bootstrap ใช้ต่อได้;ชื่อและ error copy ต้องปรับ |
| Hooks | `src/hooks/useGameData.ts` | subscribe room/teams/team แบบ reusable; ต้องเปลี่ยน Team เป็น Player และเพิ่ม city/aggregate subscriptions |
| Types | `src/types/game.ts` | domain หลักคือ Question แบบถูก/ผิด, Room, Team, Winner และคะแนนรายทีม; ต้องเปลี่ยนอย่างมีนัยสำคัญ |
| Pure logic | `src/lib/game.ts`, `src/lib/gameFlow.ts` | มี room code, validation, routing, timer helpers และ score visibility; timer helper ใช้ต่อได้บางส่วน ส่วน winner/team scoring ต้องเปลี่ยน |
| Data | `src/data/questions.ts` | มีคำถาม Matana 25 ข้อ แบ่ง 5 หมวด หมวดละ 5; ไม่ตรง 8 อาชีพ × 10 ข้อ |
| Service contract | `src/services/gameService.ts` | มี abstraction ที่ดี แต่ API และ return types ยังเป็น Team/Winner |
| Demo service | `src/services/demoService.ts` | จำลอง room/team ครบ แต่ shared demo ใช้ endpoint `/__matana_demo_state` และ polling 300 ms ซึ่งขัดข้อห้าม REST polling |
| Firebase service | `src/services/firebaseService.ts` | ใช้ anonymous auth, snapshots, transactions และ batches; schema/security/scoring ยังเป็นของ Matana และ client เป็นผู้ตัดสินคะแนน |
| Service selection | `src/services/index.ts` | lazy-load Firebase และสลับ demo ผ่าน env; pattern ใช้ต่อได้ |
| Session restore | `src/services/sessionStorage.ts` | ชื่อไฟล์สื่อ session แต่เก็บ team/teacher session ใน `localStorage`; keys ยังเป็น `matana_*` และไม่มี version/schema validation |
| Styling | `src/styles.css` | generic layout/form/modal/timer styles บางส่วนใช้ต่อได้ แต่ส่วนใหญ่ผูกกับ Matana, winner, rank, podium และ ending states |
| Tests | 4 test files, 24 test cases จาก static inventory | ครอบคลุม pure logic, timed flow, DemoService และ error mapping; ไม่มี Firebase emulator/integration test และไม่มี component/e2e test |
| Load test | `scripts/load-test-40.mjs` | เป็นสคริปต์ Matana schema และเชื่อม Firebase จาก `.env.local`; ห้ามรันกับ Matana Production และต้องปรับก่อนใช้กับ schema ใหม่ |

### Current data and synchronization flow

1. ครูสร้าง room; room เก็บ `questionIds`, `currentQuestionIndex`, `questionDurationSeconds`, `questionStartedAt` และ `teacherSessionId`
2. นักเรียนสร้าง team document ใต้ `rooms/{roomCode}/teams/{teamId}`
3. ทุกทีมอ่าน question ID เดียวกันจาก room
4. นักเรียนคำนวณ `isCorrect` ใน client แล้ว transaction อัปเดต `answers[]` และ `score` ของทีมตน
5. จอครู subscribe room และทุก team document แล้วจัดอันดับใน browser
6. `TeacherPage` เป็น coordinator ของ timer: interval 250 ms เรียก `advanceQuestion` หลัง deadline + reveal 4 วินาที
7. หลังข้อ 10 room เป็น `completed` และทุกทีมเป็น `submitted`

### Current storage

- `localStorage.matana_team_session`: room, team identity และ student role
- `localStorage.matana_teacher_session`: teacher session และ room
- `sessionStorage.matana_demo_uid`: demo UID ต่อ browser tab/session
- `localStorage.matana_demo_state_v2`: state ทั้งหมดของ demo
- Restore ปัจจุบันเชื่อ client-side record แล้วค่อย subscribe document; ไม่มี schema version, expiry, UID binding check หรือ recovery path เมื่อ local storage หาย

### Current Firebase configuration and rules

- `firebaseService.ts` อ่านค่า config จากตัวแปร `VITE_FIREBASE_*`; ไม่มีค่า project จริงใน repo
- มีเพียง `.env.example`; ไม่พบ `.env.local`
- `firebase.json` ชี้ rules ไป `firestore.rules`, ตั้ง SPA rewrites และ no-cache headers สำหรับ routes เดิม
- ไม่พบ Firebase project alias, emulator config, Firestore indexes หรือ Cloud Functions ใน repo
- Rules อนุญาต signed-in user ทุกคนอ่าน room, ครูอ่านทุก team, นักเรียนอ่าน team ของ UID ตนเอง
- Student update จำกัด field เป็น `answers` และ `score` แต่ rules ไม่ยืนยันว่า choice ถูกต้อง, `isCorrect` ถูกต้อง, question ID ตรง current question หรือเขียนก่อน deadline
- Firebase transactions ป้องกัน lost update ภายใน team document ได้ระดับหนึ่ง แต่ room update และ team batch ของ start/complete/close เป็นคนละ commit จึงมี transient states

### Assets and temporary files

- Public Matana assets 6 ไฟล์: `hero-curse.png`, `ending-win.png`, `ending-fail.png`, `ending-almost.png`, `ending-fail-icon.png`, `ending-almost-icon.png`
- Background 4 ไฟล์มีขนาด 1672×941; icon 2 ไฟล์มีขนาด 1254×1254
- `tmp/imagegen` มีไฟล์ tracked 6 ไฟล์; สองไฟล์เป็นสำเนา byte-identical กับ public icons และอีกสี่ไฟล์เป็น image-generation intermediates
- `tmp/dev-server` เป็น ignored directory; `stderr.log` ว่าง และ `stdout.log` เป็น log Vite/HMR เก่า รวม warning เรื่อง Fast Refresh ของ `GameContext.tsx`
- Confirmed city asset inventory คือ `public/images/city/city-critical.png` (ระดับ 1 เมืองทุจริตรุนแรงที่สุด), `public/images/city/city-declining.png` (ระดับ 2 เมืองเสื่อมโทรม), `public/images/city/city-neutral.png` (ระดับ 3 เมืองปกติ), `public/images/city/city-improving.png` (ระดับ 4 เมืองกำลังเจริญ) และ `public/images/city/city-prosperous.png` (ระดับ 5 เมืองเจริญสูงสุด); ทั้ง 5 ภาพต้องใช้มุมกล้อง/องค์ประกอบหลักเดียวกันและเปลี่ยนด้วย Crossfade
- Confirmed teacher UI reference คือ `แดชบอร์ดครูในเมืองเราสร้าง.png` สำหรับโครง full-screen/projector แต่ไฟล์ภาพจริงยังไม่พบใน workspace ณ เวลา reconcile
- MVP ไม่ทำเมือง 3D; Matana assets และ tracked imagegen intermediates ไม่ใช่ assets ปลายทางของเกมใหม่

### Legacy Matana logic found

- `Winner` type, `room.winner`, winner route resolution และ `CongratulationsPage` ยังอยู่
- Service ปัจจุบันคืน `winner: null` และไม่มี first-finish claim แล้ว แต่ route/UI สำหรับ “ทีมแรก” และ winner lock ยังเป็น dead/legacy path ที่อาจถูกกระตุ้นจากข้อมูลเก่า
- `ResultPage` มี `failed`, `successful`, `almost` และเลือก ending image จากคะแนนรายทีม
- `TeacherPage` คำนวณ `rankedTeams`, leader, champion, podium, highest/average score และ projector layout ที่เน้น leaderboard
- `GamePage` และ `ResultPage` แสดงคะแนนสะสมรายทีม
- เมื่อ `room.winner` มีค่า นักเรียนถูก redirect ไป `/congratulations`, เท่ากับมี legacy game lock/ending path หลัง winner
- CSS และ public images มี winner/congratulations/fail/almost/ending/rank/podium จำนวนมาก

## Confirmed Product Rules

### ยืนยันแล้ว: product identity and audience

1. ชื่อไทย `เมืองนี้อยู่ที่เรา`; ชื่ออังกฤษ `Our City, Our Choice`
2. Tagline: `Different roles. Different choices. One shared city.`
3. กลุ่มเป้าหมายหลัก ม.1 และเป้าหมายผู้เล่นพร้อมกันประมาณ 30–40 คน

### ยืนยันแล้ว: roles, questions and student flow

1. ผู้เล่นเข้าห้องด้วยรหัสห้องและชื่อเล่น แล้วรอใน Lobby
2. ครูสร้างห้องและระบบต้องแสดงทั้งรหัสห้องและ QR Code
3. ระบบแจกอาชีพเมื่อครูเริ่มเกม โดยแจกแบบสมดุลให้จำนวนผู้เล่นแต่ละอาชีพต่างกันไม่เกิน 1 คน
4. ผู้เล่นหนึ่งคนได้รับหนึ่งอาชีพเท่านั้น อาชีพถูกล็อกตลอดเกม ไม่มี reroll และ refresh/reconnect ต้องได้อาชีพเดิม
5. อาชีพ 8 รายการที่ยืนยันแล้วคือ `doctor` หมอ, `municipal` เจ้าหน้าที่เทศบาล, `police` ตำรวจ, `teacher` ครู, `merchant` พ่อค้าแม่ค้า, `contractor` ผู้รับเหมา, `student` นักเรียน และ `journalist` นักข่าว
6. แต่ละอาชีพมีคำถามเฉพาะ 10 ข้อ รวม MVP 80 ข้อ; ไม่มีการเปลี่ยนอาชีพระหว่างคำถาม
7. ฝั่งนักเรียนใช้ข้อความ `คำถามข้อที่ x/10` และใช้แนวคิด `questionIndex/currentQuestionIndex` แทนคำว่า “รอบ” เมื่อหมายถึงความคืบหน้าของบุคคล
8. คำถามแต่ละข้อมีสถานการณ์สั้นและตัวเลือก 2 ทาง; trusted snapshot ฝั่งครู map integrity `+50` และ corruption `-100` โดย public question ไม่มี impact
9. ห้ามใช้สีเขียว/แดงชี้นำก่อนตอบและไม่แสดงถูก/ผิดแบบข้อสอบทั่วไป; หลังเลือกต้องมีขั้นยืนยันเพื่อลดการแตะผิด
10. Student Client ส่งเพียง `questionId`/`choiceId`; Teacher Client ตรวจ trusted snapshot และคำนวณคะแนน โดยคำตอบเดียวต้องไม่ถูกนับซ้ำ
11. เกมมี Timer ต่อคำถาม ครูกำหนดจำนวนวินาทีก่อนเริ่มเกม และค่าที่เลือกหนึ่งครั้งใช้กับคำถามทั้ง 10 ข้อในเกมนั้น
12. ทุกคนเล่น question number เดียวกันพร้อมกัน; เมื่อทุกคนตอบครบหรือหมดเวลา ระบบปิดคำถาม โดยผู้ไม่ตอบได้รับ `-20`

### ยืนยันแล้ว: shared city and teacher experience

1. ผลจากทุกคนรวมเป็นคะแนนเมืองเดียว ไม่มีคะแนนส่วนบุคคลเป็นเป้าหมาย ไม่มีผู้ชนะรายบุคคล และไม่ใช้ Leaderboard เป็นแกนหลัก
2. เมืองเปลี่ยนสภาพตามผลรวมการตัดสินใจ และต้องสื่อผลเสียจากการทุจริตหรือความไม่รับผิดชอบ
3. เมืองมี 5 visual states: `critical`, `declining`, `neutral`, `improving`, `prosperous` ใช้ไฟล์ที่ยืนยันไว้และ Crossfade จากมุมกล้องเดียวกัน
4. จอครูใช้โครง full-screen เน้นภาพเมืองขนาดใหญ่สำหรับ projector พร้อมแถบสถานะด้านบน ไม่ใช่ admin table ล้วน
5. จอครูแสดง question number กลางของห้องร่วมกับจำนวนคำตอบทั้งหมดและจำนวนผู้เล่นที่ทำครบ
6. ห้ามเปิดเผยต่อหน้าห้องว่าผู้เล่นคนใดเลือกอะไร
7. ครูดูรายชื่อ/จำนวนผู้เล่น, เริ่มเกม, ดู city state/realtime progress, จบหรือ reset และเริ่มใหม่โดยคงรายชื่อเดิมได้
8. MVP ใช้ภาพเมือง 2D ห้ามทำเมือง 3D

### ยืนยันแล้ว: architecture constraints

1. รักษา Vite, React, TypeScript, React Router, React Context, `GameService`, Firebase Firestore, `onSnapshot`, Anonymous Auth, transactions/batches, DemoService, Session Restore และ Vitest
2. Firestore เป็น public realtime classroom state; Teacher Client เก็บ trusted snapshot และเป็นผู้คำนวณ aggregate score
3. localStorage ฝั่งนักเรียนเก็บเฉพาะ session identifier ส่วนเครื่องครูเก็บ trusted room snapshot เพื่อ restore
4. ห้าม Next.js, vinext, Cloudflare D1, REST polling, giant `GameApp.tsx`, global mutable state และ Student Client ส่ง score/impact
4. ห้ามเชื่อม/deploy ทับ Firebase Production ของ Matana และไม่ rewrite ทั้งโปรเจกต์โดยไม่จำเป็น

### ยังต้องตัดสินใจ

- เกมจบอัตโนมัติเมื่อทุกคนครบหรือครูกดจบ
- Late join policy
- ลำดับ/การเลือกคำถามเมื่อมี active มากกว่า 10 ข้อต่ออาชีพ
- Answer editing policy หลังเลือก/ก่อนยืนยัน/ก่อนหมดเวลา
- รูปแบบตัวเลขคะแนนที่แสดงบน UI
- Firebase project/deployment details และ room data retention

## Current Git Status

สถานะก่อนสร้างเอกสารนี้:

- Branch: `feature/our-city-migration`
- HEAD: `a5a9b90 (HEAD -> feature/our-city-migration, main) Baseline from Matana classroom game`
- `git status`: working tree clean
- `git diff --stat`: ไม่มี output
- ไม่มี `MIGRATION_PLAN.md`

ผลที่คาดหลัง Phase 1: มีเพียง `MIGRATION_PLAN.md` เป็นไฟล์ใหม่ที่ยังไม่ commit; implementation และ config ต้องไม่มี diff

สถานะระหว่าง reconciliation: canonical documents และ `MIGRATION_PLAN.md` เป็น untracked files ที่ผู้ใช้นำมาวาง/อนุญาตให้แก้; ไม่มี tracked implementation diff และ `NEW_CHAT_STARTER.txt` เป็นไฟล์ผู้ใช้ที่ไม่ได้แตะต้อง

## KEEP

| System/file | What to keep | Boundary |
|---|---|---|
| React + TypeScript + Vite | Framework/toolchain ปัจจุบัน | ไม่เปลี่ยนเป็น Next.js/vinext |
| `BrowserRouter` SPA approach | รูปแบบ client routes และ SPA fallback | routes เนื้อหาเดิมต้องปรับ |
| `GameProvider` pattern | service abstraction, bootstrap, retry UI | rename/domain copy และ restore validation ต้องปรับ |
| `useRoom` subscription pattern | realtime hook lifecycle และ unsubscribe | เพิ่ม hooks ของ player/city/aggregate |
| `GameService` abstraction concept | interface เดียวสำหรับ Demo/Firebase | method/type เดิมต้องเปลี่ยน |
| Firebase `onSnapshot` | realtime push model | ห้ามแทนด้วย REST polling |
| Firebase transactions/batches | atomic/idempotent write primitives | ต้องออกแบบ boundary ใหม่ให้ city aggregate ปลอด duplicate |
| Anonymous Auth concept | low-friction classroom identity | ต้อง validate restore/ownership และใช้ Firebase project ใหม่ของ Our City |
| Room code generation | รหัส 6 ตัวที่อ่านง่าย | rebrand validation messages |
| Teacher timer setting | ครูตั้งจำนวนวินาทีก่อน start และใช้ค่าหนึ่งตลอด 10 ข้อ | pacing/start timestamp อาจเป็นระดับ player หรือ room ตาม decision ที่ยังเปิด |
| Generic UI primitives | scene shell, loading/error, confirm dialog, buttons/forms, accessibility/reduced motion | rebrand และลบ winner-specific styles |
| Missed-answer behavior | ปัจจุบันไม่มีการเพิ่มคำตอบหรือหักคะแนนเมื่อ timeout | เปลี่ยน trusted scoring ให้ timeout มีผล `-20` |
| SPA hosting rewrites/no-cache intent | refresh deep routes ได้ | เอา route legacy ออกและเพิ่ม route ใหม่ถ้ามี |

## ADAPT

| System/file | Required adaptation |
|---|---|
| `src/App.tsx` | คง routes หลักที่เหมาะสม แต่ถอด congratulations flow และชี้ result ไปผลเมือง |
| `src/components/Layout.tsx` | เปลี่ยนแบรนด์/ข้อความ/status จาก Matana เป็น Our City; คง generic components |
| `src/context/GameContext.tsx` | เปลี่ยนชื่อ domain, รองรับ validated restored session และ service readiness ของโปรเจกต์ Firebase ใหม่ |
| `src/hooks/useGameData.ts` | `useTeams/useTeam` เป็น player-oriented hooks; เพิ่ม city state และ anonymous aggregate hooks |
| `src/lib/gameFlow.ts` | คง deadline helpers แต่ใช้ room-level synchronized timestamps และผลเมืองแทน score visibility รายทีม |
| `src/pages/HomePage.tsx` | rebrand และอธิบาย collaborative city game |
| `src/pages/JoinPage.tsx` | เปลี่ยน team/guardian fields เป็นรหัสห้อง + ชื่อเล่น และรองรับทางเข้า QR Code |
| `src/pages/LobbyPage.tsx` | แสดง waiting/readiness ก่อนครูเริ่ม; หลัง start จึงเข้าสู่ role reveal ตาม flow ที่ยืนยัน |
| `src/pages/GamePage.tsx` | แสดงคำถามตามอาชีพ, label ที่ยืนยัน, timer ต่อข้อ, confirmation ก่อน submit, consequence และไม่แสดงคะแนนรายบุคคล |
| `src/pages/ResultPage.tsx` | เปลี่ยนเป็น city outcome/lesson reflection ไม่มี fail/almost ของบุคคล |
| `src/pages/ClosedPage.tsx`, `NotFoundPage.tsx` | rebrand copy/visuals |
| `src/pages/TeacherPage.tsx` | คง create/start/stop/close/timer controls; เพิ่ม QR Code และเปลี่ยนแกน UI เป็น full-screen city projection พร้อม total answers/completed players |
| `src/services/gameService.ts` | เปลี่ยน contract Team/Winner เป็น Player/Occupation/CityState และ idempotent decision submission |
| `src/services/index.ts` | คง env-based service selection; default/demo naming และ validation ต้องเปลี่ยน |
| `src/services/sessionStorage.ts` | ใช้ versioned Our City keys, runtime validation, UID/room/game binding และ safe invalidation |
| `src/services/firebaseService.ts` | คง auth/snapshot/transaction primitives แต่ปรับ schema, privacy, server-time validation และ aggregate writes |
| `firestore.rules` | ปรับ ownership, immutable occupation, answer uniqueness/deadline และห้ามอ่าน player choices ข้ามคน |
| `firebase.json` | คงเฉพาะ Firestore rules และ Hosting; Phase 4A ไม่มี Functions/Emulator config |
| `src/styles.css` | เก็บ generic responsive/accessibility rules; เปลี่ยน palette/layout/projector mode และลบ rank/winner styling |
| Existing tests | เปลี่ยน fixtures/expectations จาก team score เป็น role lock/city score/privacy/timer |
| `scripts/load-test-40.mjs` | เปลี่ยน schema และ target guard; ใช้เฉพาะ Demo/staging Our City หลังอนุมัติ |

## REPLACE

1. `QuestionCategory`, `Difficulty`, `correctChoiceId` และ question-selection model แบบ Matana ด้วย occupational decision model
2. คลัง `src/data/questions.ts` 25 ข้อ ด้วยข้อมูลยืนยัน 80 ข้อ (8 อาชีพ × 10)
3. `Team`, `Winner`, team score, guardian/team naming และ submitted winner semantics ด้วย Player/Occupation/City aggregate domain
4. `selectRoundQuestions` ที่สุ่มชุดเดียวให้ทุกทีม ด้วยการ resolve คำถามลำดับ x ตามอาชีพที่ lock
5. `/congratulations/:roomCode` และ `CongratulationsPage` รวมถึง first-team copy
6. individual fail/almost/success thresholds และ ending selection ใน `ResultPage`
7. Teacher leaderboard, ranking, leader spotlight, champion และ podium เป็น city projection + anonymous aggregate
8. คะแนนรายทีมบน `GamePage`, `ResultPage` และ teacher scoreboard
9. `getTeacherVisibleScore` ซึ่งเป็นการซ่อนคะแนนชั่วคราวรายทีม ด้วย public city projection ที่ไม่ถือ choice รายคน
10. Demo shared-state endpoint/polling ใน `demoService.ts` และ `vite.config.ts`
11. Matana session/storage keys และ seeded demo room/code/content
12. Matana public assets และ tracked `tmp/imagegen` intermediates ด้วยชุดเมือง 5 ไฟล์ที่ยืนยันแล้วเมื่อ assets พร้อมและ Phase ลบ/แทนไฟล์ได้รับอนุมัติ
13. Firestore schema/rules ที่ให้ client ระบุ `isCorrect`/score delta และให้ครูอ่าน answer arrays รายคน
14. Matana metadata ใน `package.json`, `index.html`, CSS และ deployment route headers ในขั้น rebrand

## ADD

1. `Occupation` registry ตาม IDs ที่ยืนยันแล้ว: `doctor`, `municipal`, `police`, `teacher`, `merchant`, `contractor`, `student`, `journalist`
2. Data validation ที่ fail build/test หากไม่ครบ 8 อาชีพ, 10 ข้อต่ออาชีพ, 80 ข้อรวม หรือ question index ซ้ำ
3. Decision choice effect model ที่บอกผลต่อเมืองและรองรับการอธิบาย “ทุจริต/ไม่รับผิดชอบ”
4. Immutable occupation assignment พร้อม atomic claim/lock และ restore จาก server
5. `CityState`/`CityScore` ระดับ room พร้อม score policy `+50/-100/-20`, ค่าเริ่มต้น `500`, ช่วง `0–1000` และ 5 thresholds ที่ยืนยัน
6. Idempotency record ต่อ player + question number เพื่อกันคะแนนซ้ำและรองรับการแก้คำตอบก่อน deadlineแบบ delta-safe หากอนุญาต
7. Privacy-safe public aggregates เช่น answered count, city score และ city stage โดยไม่มี mapping choice → player
8. Full-screen projector city component/scene, Crossfade และ mapping `critical` → `prosperous`
9. Reconnect/session recovery states สำหรับ refresh, offline, expired auth และ stale local storage
10. Unit/rules contract tests สำหรับ deadline, role immutability, duplicate answer และ public question privacy
11. Integration/concurrency tests สำหรับ shared city aggregate และ simultaneous answers
12. QR Code join flow และ guard ที่ป้องกัน scripts/tests ชี้ไป Matana Production โดยไม่ตั้งใจ

## Proposed File Change Order

> **เสนอแนะ:** ลำดับต่อไปนี้ยึด Phase 2–13 ของ `OUR_CITY_DEVELOPMENT_ROADMAP.md` โดยตรง ส่วนรายชื่อไฟล์ภายในแต่ละ Phase มาจาก dependency audit และอาจปรับได้เมื่อเริ่ม Phase นั้นโดยไม่ข้าม decision gate ที่เกี่ยวข้อง

1. **Phase 2 — Domain Model and State Model:** เริ่มที่ `src/types/game.ts` และ pure state helpers/tests เพื่อกำหนด Room/Player/Role/Decision/CityState; ถอด Winner/Team score ออกจาก target model
2. **Phase 3 — Role Assignment and Question Bank:** เพิ่ม role registry/pure balanced assignment แล้วแทน `src/data/questions.ts` ด้วยโครง 8 อาชีพ × 10 ข้อ พร้อม validation tests
3. **Phase 4 — GameService and DemoService:** ปรับ `src/services/gameService.ts`, `src/services/demoService.ts`, `src/services/index.ts` ให้ flow ใหม่เล่นจบได้ใน Demo mode ก่อนเชื่อม Firebase และนำ REST polling/middleware เดิมออก
4. **Phase 5 — Student Flow:** ปรับ `src/hooks/useGameData.ts`, `src/context/GameContext.tsx`, `src/App.tsx` และหน้า Join → Lobby → Role Reveal/Detail → Question/Confirm → Feedback/Waiting → Shared Summary
5. **Phase 6 — Central Timer:** เพิ่ม authoritative timestamps/deadline ใน state/service และ UI countdown; พฤติกรรมเดินข้อถัดไปต้องรอปิด pacing/timeout gate
6. **Phase 7 — Teacher Projector Dashboard:** ปรับ `src/pages/TeacherPage.tsx`, QR Code, full-screen city scene และ privacy-safe realtime aggregates
7. **Phase 8 — City Scoring and Five Visual States:** ใช้ score policy/threshold ที่ยืนยันแล้ว เพิ่ม mapping tests, confirmed asset mapping และ Crossfade
8. **Phase 9 — New Firebase Project and Classroom Service:** ปรับ `src/services/firebaseService.ts`, `firestore.rules` และ environment separation โดยใช้โครงการ Our City ใหม่เท่านั้น
9. **Phase 10 — Session Restore and Idempotency:** ปรับ `src/services/sessionStorage.ts` และ restore/duplicate/two-tab/concurrency tests
10. **Phase 11 — QA and Automated Tests:** ปรับ unit/component/route/integration/rules tests แล้วรัน lint → typecheck → test → build ตาม scripts จริง
11. **Phase 12 — Load Test About 40 Clients:** ปรับ `scripts/load-test-40.mjs` สำหรับ schema ใหม่และทดสอบผ่าน Demo/staging ที่มี safety guard; ห้ามยิง Matana Production
12. **Phase 13 — Deploy and Classroom Dry Run:** deploy เฉพาะหลัง QA ผ่าน, Firebase target/asset/QR ได้รับการตรวจ และได้รับอนุมัติแยกต่างหาก

งาน shared UI/style/rebrand (`src/components/Layout.tsx`, `src/styles.css`, `HomePage`, `index.html`, package metadata และ public assets) ให้ทำภายใน Phase 5–8 ตามหน้าที่ของแต่ละส่วน ไม่สร้าง Phase แทรกหรือ rewrite ทั้งระบบ

## Domain Model Changes

### ยืนยันแล้ว: domain requirements

- stable role IDs: `doctor`, `municipal`, `police`, `teacher`, `merchant`, `contractor`, `student`, `journalist`
- หนึ่ง player ต่อหนึ่ง role ต่อ game, แจกเมื่อ start แบบสมดุลและ immutable ตลอด game
- 10 occupational questions ต่อ role, 2 choices ต่อ question, client ส่งเฉพาะ `choiceId`
- shared city score, 5 city states, no individual Winner/rank และ missing answer มี timeout impact `-20`

### เสนอแนะ: core types

- `OccupationId`: union ของ stable IDs 8 ค่าที่ canonical ระบุ
- `Occupation`: id, display name, description, optional visual key และ questions 1–10
- `DecisionQuestion`: id, occupationId, questionNumber 1–10, short scenario, 2 choices, topic และ feedback/consequence
- `DecisionChoice`: id, text, city impact และ ethical marker/feedback ตาม scoring specification ที่ยืนยัน
- `Player`: id/ownerUid, roomCode, nickname, immutable occupationId, joinedAt, currentQuestionIndex/progress/status
- `PlayerDecision`: questionNumber, questionId, selectedChoiceId, submittedAt, revision/version; ห้ามเผยแพร่ต่อ player อื่นหรือ projector
- `Room`: status, game version, synchronized current question number/deadline, assignment state, total/completed counts และ city aggregate reference
- `CityState`: shared score/normalized score, dimension totals (ถ้ามี), visual stage, answered count และ updatedAt

### Invariants

1. ผู้เล่นหนึ่งคนมี occupation เดียวต่อ game และ field นี้แก้ไม่ได้หลัง assignment
2. occupation แต่ละอันมีคำถามหมายเลข 1–10 ครบและไม่ซ้ำ
3. ผู้เล่น resolve คำถามจาก `(occupationId, room.currentQuestionNumber)` ใน synchronized flow
4. timer duration เป็น room/game field เดียว ไม่เปลี่ยนระหว่าง playing
5. decision หนึ่งผลต่อเมืองได้สูงสุดหนึ่ง contribution ต่อ player/question revision ล่าสุด
6. missing decision ได้ timeout contribution `-20` เมื่อ question ถูกปิด
7. ไม่มี `Winner`, rank หรือ individual score ใน public domain
8. public city projection ไม่มี selectedChoiceId ที่ผูกกับ player identity

## Service Layer Changes

### Proposed service responsibilities

- `createRoom(teacherUid, settings)` สร้าง game version และค่า timer พร้อมข้อมูลสำหรับ QR Code
- `joinRoom(roomCode, nickname, ownerUid)` สร้าง/recover player ใน waiting state โดยยังไม่ reroll role
- `subscribeRoom`, `subscribePlayer`, `subscribeParticipantsSummary`, `subscribeCityState`
- `startGame(...)` แจกอาชีพแบบสมดุลและ lock roster assignments แบบ atomic เท่าที่ schema รองรับ แล้วเริ่มข้อ 1
- `submitDecision(...)` ตรวจ room/index/deadline/ownership แล้วเขียนแบบ idempotent
- progression API เป็น synchronized room-level และต้อง idempotent
- `completeGame`, `closeRoom` และ recovery action ที่ชัดเจน

### Required changes by implementation

- DemoService ต้องใช้ deterministic in-memory/local event model สำหรับ automated/demo scope หรือใช้ Firebase staging สำหรับ cross-device demo; ห้าม GET/PUT polling
- FirebaseService ต้องไม่เชื่อ `isCorrect`, city delta หรือ timestamps จาก client โดยไม่มี validation
- Teacher Client deduplicate stable answer IDs และเขียน round aggregate/city state ด้วย Firestore batch
- `AnswerResult` ไม่ควรคืน Winner; คืน accepted revision และ public city projection/ack ที่เหมาะสม
- Error mapping ต้องแยก stale question, deadline, duplicate/revision conflict, role lock, restore mismatch และ permission failure

## Student Flow Changes

1. เข้า `/join` ผ่านรหัสหรือ QR Code แล้วกรอกรหัสห้องและชื่อเล่น
2. ระบบสร้างหรือ restore waiting player ด้วย UID; Lobby ยังไม่ให้ reroll/เลือกอาชีพ
3. เมื่อครู start ระบบแจกอาชีพแบบสมดุลและ lock จากนั้นแสดง Role Reveal/รายละเอียดอาชีพ
4. ทุกคนอยู่ question number เดียวกันพร้อมกัน แต่เห็นคำถามตามอาชีพที่ล็อกไว้ของตน
5. Header/progress ใช้ข้อความตรงตามที่ยืนยัน: `คำถามข้อที่ x/10`
6. ผู้เล่นเลือกหนึ่งใน 2 ทางที่ไม่ถูกชี้นำด้วยสี แล้วผ่าน confirmation ก่อนส่ง; answer editing หลัง confirmation รอ decision gate
7. หลัง accepted answer/deadline แสดง feedback เชิงเหตุและผลโดยไม่ใช้รูปแบบถูก/ผิดและไม่แสดงคะแนน/อันดับรายบุคคล
8. ถ้าไม่ตอบ แสดง missed state แบบเป็นกลาง และ Teacher Client ใช้ timeout contribution `-20` ตอนปิดข้อ
9. หลังข้อ 10 ไปผลเมืองรวม/บทสะท้อน ไม่ไป congratulations หรือผล fail/almost รายบุคคล
10. Refresh/reconnect ต้อง restore public room/player state จาก Firestore และ trusted question snapshot จาก localStorage เครื่องครู

## Teacher Dashboard Changes

- **ยืนยันแล้ว:** ก่อนเกมครูสร้างห้อง เห็นรหัสและ QR Code ดูรายชื่อ/จำนวนผู้เล่น ตั้ง “วินาทีต่อคำถาม” หนึ่งครั้ง และ start
- ระหว่างเกม: ใช้เมืองเต็มจอเป็นแกนหลักสำหรับ projector; เมืองเปลี่ยนตาม aggregate ที่ publish แล้ว
- แสดงข้อมูลประกอบที่ไม่ละเมิด privacy ได้แก่จำนวนคำตอบทั้งหมด, จำนวนผู้เล่นทำครบ, city direction/state และสถานะ connection; ไม่แสดง “รอบกลาง” จนกว่าจะยืนยัน synchronized mode
- ไม่แสดง rank, leader, champion, podium, คะแนนรายคน หรือ choice ของคนใด
- แสดง roster/readiness ใน setup mode ได้ แต่ต้องไม่เชื่อมชื่อกับตัวเลือก
- คง emergency stop/close controls โดยแยกจาก projector view และมี confirm dialog
- ใช้ reference `แดชบอร์ดครูในเมืองเราสร้าง.png`: full-screen, ภาพเมืองเด่น, top status bar และ projector landscape; ตัวเลข mockup เดิมห้ามคัดตรง ๆ

## Timer Changes

### ยืนยันแล้ว

- ครูกำหนด `questionDurationSeconds` ก่อน start และค่าหนึ่งเดียวนี้ใช้กับคำถามทั้ง 10 ข้อของ game
- การมี Timer และสิทธิ์ของครูในการตั้งเวลาไม่ใช่ decision gate อีกต่อไป
- เมื่อหมดเวลาแล้วไม่ตอบ trusted scoring ใช้ timeout impact `-20`
- Timer เป็น teacher-synchronized และ Teacher Client ปิดคำถามเมื่อทุกคนตอบครบหรือหมดเวลา
- Student Client ไม่เป็นผู้ตัดสิน deadline/impact/score; Teacher Client ใช้ room deadline และ trusted local snapshot เป็น authority ของห้องเรียน

### เสนอแนะ

- เก็บ deadline เดียวใน room ให้ทุก client countdown จากค่านั้น; Firestore rules ใช้ `request.time` ปฏิเสธ student answer ที่ช้า และ Teacher Client finalize จาก deadline เดียวกัน
- เก็บ idempotency key ต่อ player/question และทดสอบ clock skew, background throttling, reconnect และ delayed snapshots

### ยังต้องตัดสินใจ

- ค่าต่ำสุด/สูงสุดและชุดตัวเลือกจำนวนวินาทีที่แสดงใน UI
- เกมจบอัตโนมัติเมื่อทุกคนครบหรือครูกดจบ
- Reveal/feedback duration และอนุญาตให้เปลี่ยนตัวเลือกก่อนกดยืนยันหรือไม่

## City Scoring Changes

### ยืนยันแล้ว

- ย้าย score จากแต่ละ Team ไป `CityState` ระดับ room; ทุก accepted decision รวมเป็นคะแนนเมืองเดียว
- Choices ใช้ trusted impact: integrity `+50`, corruption `-100`; missing answer ใช้ timeout `-20` และคำตอบเดียวต้องไม่ถูกนับซ้ำ
- `initialCityScore=500`, clamp `0–1000`, และ `newCityScore = previousCityScore + roundTotal/lockedPlayerCount`
- Thresholds: `0–199 critical`, `200–399 declining`, `400–599 neutral`, `600–799 improving`, `800–1000 prosperous`
- Visual states 5 ระดับใช้ `city-critical.png`, `city-declining.png`, `city-neutral.png`, `city-improving.png`, `city-prosperous.png` จาก `public/images/city/` โดยเรียงความหมายจากระดับ 1 เมืองทุจริตรุนแรงที่สุดถึงระดับ 5 เมืองเจริญสูงสุด ใช้มุมกล้องเดียวกันและ Crossfade
- Projector ต้องไม่เปิดเผย mapping ระหว่าง player identity กับ choice

### เสนอแนะ

- Projector subscribe เฉพาะ aggregate/visual stage; เก็บ contribution/idempotency แยกจาก public projection
- หากอนุญาตแก้คำตอบหลัง submit ให้ reverse contribution เดิมและ apply contribution ใหม่แบบ atomic
- ใช้ `roundAverage` ตามจำนวน locked players เพื่อ normalize ห้องขนาดต่างกัน

### ยังต้องตัดสินใจ

- รูปแบบคะแนนที่จอครูแสดง (เลข, เปอร์เซ็นต์ หรือมาตรวัด) และ timing ที่เมือง Crossfade

## Firebase Changes

### Current risks to fix

- ห้ามใช้/เชื่อม Matana Production; ต้องมี Our City Firebase project/staging ที่ยืนยัน
- Rules ปัจจุบันเชื่อ score delta และ `isCorrect` จาก client มากเกินไป
- Teacher read permission ปัจจุบันเปิด answer arrays รายคน ซึ่งไม่สอดคล้อง privacy requirement
- Start/complete/close ทำ room commit และ team batch แยกกัน ทำให้เกิด transient inconsistency
- Teacher tab เป็น timer coordinator จุดเดียว
- Room read เปิดให้ signed-in ทุกคน ไม่ได้จำกัด membership และเผย `teacherSessionId`/questionIds

### Proposed data separation

- Public room/control document: status, timer, question index, counts และ city projection
- Participant document: owner UID, occupation assignment และ progress ที่จำเป็น; field visibility จำกัด
- Private decision records: owner/trusted authority เท่านั้น ห้าม player อื่นและ projector อ่าน
- Public aggregate document: city score/stage/counts ไม่มี player-choice mapping
- Idempotency/contribution record: key จาก player + question number/revision เพื่อป้องกัน duplicate scoring

### Verification requirements

- Phase 4A ใช้ unit tests และ rules review; ไม่กำหนด Java/Firebase Emulator เป็น gate
- Test signed-out, wrong room, wrong UID, teacher, player, late write, duplicate write, occupation mutation และ cross-player read
- Staging smoke test ต้องใช้ project ID allowlist/guard และไม่ใช้ credentials ของ Matana

## Session Restore Changes

### ยืนยันแล้ว

- Refresh/reload/reconnect ต้องกลับหน้าที่ถูกต้อง ได้อาชีพเดิมและความคืบหน้าเดิม
- localStorage ฝั่งนักเรียนเก็บเฉพาะ session identifier; เครื่องครูเก็บ trusted room question snapshot เพื่อ restore หลัง refresh

### เสนอแนะ

- เปลี่ยน keys เป็นชื่อ Our City และเพิ่ม schema version เช่น `our_city_player_session_v1`
- เก็บเฉพาะ identifiers ที่จำเป็น; occupation และ score/city state ต้อง restore จาก server ไม่เชื่อ local copy
- ตรวจ `ownerUid`, roomCode, playerId, gameVersion และ membership ทุกครั้งหลัง bootstrap
- ถ้า local data เสีย/เก่า ให้ clear เฉพาะ key ที่เกี่ยวข้องและพาไป recovery/join อย่างปลอดภัย
- ถ้า auth UID เปลี่ยนหลัง clear browser data ต้องมี policy ว่าจะ recover ผู้เล่นเดิมอย่างไร หรือสร้างคนใหม่โดยไม่เปลี่ยนสมดุลอาชีพ
- Teacher restore ต้องตรวจว่า current UID เป็น owner ของ room ก่อนแสดง controls
- ต้องทดสอบ refresh ใน waiting/playing/reveal/completed/closed และ offline→online

## Test Plan

### Existing test audit

- `src/lib/game.test.ts`: 4 suites / 9 tests; question sampling, scoring, validation และ winner route expectations ส่วนใหญ่ต้อง replace
- `src/lib/gameFlow.test.ts`: 1 suite / 5 tests; deadline/reveal/lock helpers ใช้เป็นฐานได้ แต่ team score visibility ต้อง replace
- `src/services/demoService.test.ts`: 1 suite / 8 tests; shared question/team score/demo REST behavior ต้อง rewrite
- `src/services/gameService.test.ts`: 1 suite / 2 tests; error mapping ปรับเพิ่มได้
- รวม static inventory ปัจจุบัน 24 tests ใน 4 files
- `QA_REPORT.md` ระบุผลเก่า 22 tests ใน 3 files จึง stale เมื่อเทียบ source ปัจจุบัน และใช้เป็นหลักฐาน pass ปัจจุบันไม่ได้
- ยังไม่พบ automated integration tests ของ `FirebaseGameService`, React components/routes หรือ end-to-end flow
- Phase 1 ไม่รัน scripts เพื่อหลีกเลี่ยงการสร้าง `dist`/build info ตามข้อกำหนดที่อนุญาตให้สร้างได้เฉพาะ `MIGRATION_PLAN.md`

### Required tests for Phase 2+

1. Data contract: confirmed role IDs, 8 occupations × 10 questions = 80, exactly 2 choices, IDs/index unique และ effects valid
2. Assignment: แจกเมื่อ start, balance count ต่างกันไม่เกิน 1, immutable role, reconnect keeps role และ concurrent starts/joins
3. Timer: ครูเลือกหนึ่ง duration สำหรับทั้ง 10, synchronized server deadline, late reject และ automatic close tests
4. Scoring: integrity `+50`, corruption `-100`, timeout `-20`, round average, clamp และ mapping 5 confirmed city states
5. Duplicate/revision: simultaneous clicks/tabs, retry after network failure, no double contribution, optional answer change delta
6. Privacy: no cross-player decision reads, projector only aggregate, no API payload mapping choice to identity
7. Session restore: stale/corrupt keys, UID mismatch, refresh at every room status
8. Demo/Firebase contract parity without REST polling
9. Route tests: no congratulations/winner redirects; result is shared city outcome
10. Teacher view: QR Code + city-first full-screen projector + total answers/completed players, no leaderboard/individual score/choice และไม่คัด mockup numbers
11. Firestore adapter/rules contract tests สำหรับ public questions, answer ownership และ teacher-only aggregate writes
12. Staging concurrency/load rehearsal using new schema and explicit non-production target guard

### Package scripts found (not executed in Phase 1)

| Purpose | Command from `package.json` |
|---|---|
| lint | `npm run lint` → `eslint .` |
| typecheck | `npm run typecheck` → `tsc -b --pretty false` |
| test | `npm run test` → `vitest run` |
| build | `npm run build` → `tsc -b && vite build` |
| existing load test | `npm run loadtest:40` → `node scripts/load-test-40.mjs` |

## Risks

| Risk | Severity | Evidence/current cause | Required mitigation |
|---|---|---|---|
| Realtime synchronization | High | room transaction และ participant batch แยก commit; Demo read-modify-write/polling เสี่ยง overwrite | ออกแบบ teacher-owned batch boundaries, idempotent operations และ reconnect tests; ห้าม REST polling |
| Timer/progression stalls | High | Teacher Client เป็น coordinator; ถ้าปิดแท็บอาจหยุดการปิดข้อ | restore trusted snapshot จาก localStorage, อ่าน room deadline และทำ close/finalize idempotent |
| Student clock/deadline bypass | High | Student UI clock อาจคลาดเคลื่อน | ใช้ room deadline เดียว, Teacher Client ปิดข้อ และ rules ตรวจ `request.time` ตอน create answer |
| Role locking | Critical | ไม่มี occupation field/assignment/immutability | atomic server assignment, immutable rules, restore from server |
| Shared city scoring | High | runtime เดิมมี score ราย team | Teacher Client trusted snapshot + stable answer ID + confirmed round-average policy |
| Duplicate answers/contributions | High | Firebase transaction กันบางกรณี แต่ rules ไม่ตรวจ question uniqueness; Demo เสี่ยง lost update | contribution key, revision/delta transaction, concurrency tests |
| Privacy | Critical | ครู subscribe team docs ที่มี selectedChoiceId/isCorrect; rules ให้ครูอ่านทั้งหมด | แยก private decisions จาก public aggregates และทดสอบ rules |
| Session restore | High | localStorage ไม่มี version/UID validation; clear storage ทำ identity หลุด | versioned schema, server ownership check, recovery policy |
| Firebase connection | Critical | ไม่มี confirmed Our City project/config; load scriptพร้อมยิง `.env.local` | project allowlist, Demo/staging first, ห้าม Matana Production |
| Existing tests give false confidence | High | ไม่มี Firebase runtime/UI tests; historical QA count stale | rewrite tests และเพิ่ม integration/e2e coverage |
| Legacy winner path | High | route/type/page/CSS ยัง active แม้ servicesคืน null | ถอน route/domain/data migration และ test ว่าไม่มี winner redirect |
| Content completeness | Critical | repo ปัจจุบันมี Matana 25 ข้อและยังไม่มี question bank Our City 80 ข้อ | นำ canonical content ที่อนุมัติเข้า schema และเพิ่ม 8×10 validation ก่อน content implementation |
| City visual thresholds | Medium | threshold ยืนยันแล้วแต่ runtime เดิมยังไม่ใช้ | เพิ่ม boundary tests และ migrate ผ่าน trusted score pipeline |
| Package manager ambiguity | Medium | มีทั้ง `package-lock.json` และ `pnpm-lock.yaml` tracked | ยืนยัน package manager หลักก่อนเปลี่ยน dependency; Phase 1 ไม่ติดตั้งอะไร |
| Tracked temporary assets | Medium | `tmp/imagegen` tracked และซ้ำ public assets | จัด cleanup เฉพาะเมื่อ approved asset list พร้อม; Phase 1 ห้ามลบ |

## Open Decision Gates

Decision gates ที่ยังเปิดหลัง Phase 4A:

### Product decisions ที่ยังเปิดจริง

1. **Timer UI range:** ค่าต่ำสุด/สูงสุดและชุดตัวเลือกจำนวนวินาทีที่ครูเลือกได้ใน UI
2. **Next question:** หลังปิดแต่ละข้อจะเปิดข้อถัดไปอัตโนมัติหรือรอครูกด Next
3. **Game finish:** หลัง question 10 จบอัตโนมัติหรือครูกดจบ
4. **Late join:** ปฏิเสธหลัง start หรือให้เข้าเป็นผู้ชม/รูปแบบอื่น
5. **Question selection:** เมื่อ role มี active มากกว่า 10 ข้อ จะเลือก 10 ข้อแรกตาม `sort_order` หรือใช้ policy อื่น
6. **Choice editing before confirmation:** ผู้เล่นเปลี่ยนตัวเลือกที่เลือกไว้ก่อนกดยืนยันได้หรือไม่
7. **Score display:** แสดงเลข, เปอร์เซ็นต์ หรือมาตรวัดบนจอครู
8. **Reset role policy:** เมื่อเริ่มเกมใหม่โดยคง roster จะคงอาชีพเดิมหรือแจกใหม่
9. **Room data retention:** อายุข้อมูลและ cleanup policy

### Technical design gates ที่ยังเปิดจริง

1. **Firebase project identity:** ยังไม่มี project ID/.firebaserc; ต้องยืนยัน Our City project ก่อนเชื่อมจริง
2. **Google Sheets browser access:** ต้อง smoke test CSV URL/CORS จาก origin ที่ใช้สาธิตจริง
3. **Teacher-device recovery:** ต้องกำหนดวิธีกู้ trusted snapshot หาก localStorage เครื่องครูถูกลบหรือเปลี่ยนเครื่อง
4. **Demo scope:** local/in-memory หรือ cross-device ผ่านกลไก realtime ที่ไม่ใช่ REST polling
5. **Asset delivery details:** dimensions/licensing/fallback ก่อน UI phase

### Gates ที่ปิดจาก Source of Truth reconciliation

- Source-of-Truth availability gate เดิมปิดแล้ว: อ่านไฟล์ทั้ง 4 (`PROJECT_HANDOFF_CONFIRMED_V2.md`, `PROJECT_DECISIONS.json`, `CONFIRMED_FILES_AND_ASSETS.md`, `OUR_CITY_DEVELOPMENT_ROADMAP.md`) ครบและ reconcile แล้ว
- ชื่อ/ID อาชีพ 8 รายการ, จำนวนคำถาม 8×10, 2 choices, role lock และ balanced allocation outcome ปิดแล้ว
- Identity ขั้นต้นเป็นชื่อเล่น, QR Code, เป้าหมาย 30–40 คน และ teacher roster/progress intent ปิดแล้ว
- Timer เป็น teacher-synchronized และปิดข้อเมื่อทุกคนตอบครบหรือหมดเวลาแล้ว; เปิดเฉพาะค่า min/max/ตัวเลือกใน UI
- Google Sheets trusted sync, stable choice IDs, immutable room snapshot และ score policy/threshold ปิดแล้ว
- City visual states/filenames 5 ระดับ, same-camera Crossfade, full-screen teacher reference และ no-3D MVP ปิดแล้ว
- No winner/leaderboard core/role switching/REST polling/Student Client score submission และ framework constraints ปิดแล้ว

---

Phase 1 stop condition: เอกสารนี้เป็น deliverable เดียว ไม่มีการแก้ source code, config, Firebase project, dependency, asset หรือ commit หลังจากนี้ต้องรอการตรวจและอนุมัติก่อนเริ่ม Phase 2
