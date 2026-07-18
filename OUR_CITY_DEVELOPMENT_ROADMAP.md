# แผนพัฒนาโครงการแบบละเอียด
# เมืองนี้อยู่ที่เรา / Our City, Our Choice

**สถานะเอกสาร:** Development Roadmap สำหรับส่งต่อให้ Codex / ChatGPT / Claude / Gemini  
**วันที่:** 18 กรกฎาคม 2569 (2026-07-18)  
**โฟลเดอร์พัฒนา:** `C:\Users\jiras\Documents\Our City, Our Choice`

---

## 0. กติกาที่ถือว่ายืนยันแล้ว

1. ใช้ฐานสถาปัตยกรรมจาก Matana Must Survive
2. ใช้ Vite + React + TypeScript + React Router + React Context
3. ใช้ `GameService` เป็นชั้นกลางระหว่าง UI กับระบบข้อมูล
4. Production ใช้ Firebase Firestore แบบ Realtime ด้วย `onSnapshot`
5. การเปลี่ยนสถานะสำคัญใช้ transaction หรือ batch
6. มี DemoService ที่ใช้ interface เดียวกับ Production Service
7. รองรับ Session Restore หลัง refresh/reconnect
8. ใช้ Vitest และต้องรัน lint/typecheck/test/build หลังจบแต่ละ Phase
9. ห้ามเปลี่ยนกลับไปใช้ Next.js, vinext, Cloudflare D1 หรือ REST polling
10. ห้ามรวม UI และ game logic ไว้ใน `GameApp.tsx` ไฟล์เดียว
11. ผู้เล่น 1 คนได้รับ 1 อาชีพและถูกล็อกตลอดเกม
12. มี 8 อาชีพ อาชีพละ 10 คำถาม รวม 80 คำถาม
13. ไม่เปลี่ยนอาชีพระหว่างเกม
14. ฝั่งนักเรียนใช้ข้อความ `คำถามข้อที่ x/10`
15. ไม่มีผู้ชนะรายบุคคลและไม่มี Leaderboard เป็นแกนหลัก
16. คะแนนทุกคนรวมเป็นคะแนนเมืองเดียว
17. ครูกำหนดเวลาเป็นวินาทีต่อคำถามก่อนเริ่มเกม
18. จอครูเน้นภาพรวมเมืองเต็มจอ เพื่อให้นักเรียนเห็นผลของการตัดสินใจร่วมกัน
19. ไม่เปิดเผยบนจอครูว่านักเรียนคนใดเลือกอะไร
20. ไม่ตอบภายในเวลาไม่ควรถูกหักคะแนนเมืองโดยอัตโนมัติ

---

# ภาพรวมลำดับการพัฒนา

| Phase | งาน | ผลลัพธ์ |
|---|---|---|
| 0 | ตรวจ Git และทำ Baseline | ย้อนกลับได้ก่อนแก้โค้ด |
| 1 | Audit โปรเจกต์ | รู้ว่าไฟล์ใด KEEP / ADAPT / REPLACE / ADD |
| 2 | ออกแบบ State และ Data Model | Types และโครง Firestore ชัดเจน |
| 3 | สร้างโครง Role และ Question Bank | 8 อาชีพ × 10 ข้อ |
| 4 | ปรับ GameService และ DemoService | Logic ใช้งานได้โดยยังไม่ต่อ Firebase ใหม่ |
| 5 | พัฒนา Student Flow | Join → Lobby → Role → Questions → Summary |
| 6 | พัฒนา Timer | ครูกำหนดเวลาและทุกเครื่องเห็นเวลาตรงกัน |
| 7 | พัฒนา Teacher Dashboard | เมืองเต็มจอและผลกระทบแบบ Realtime |
| 8 | พัฒนา City Scoring | คะแนนรวมและภาพเมือง 5 ระดับ |
| 9 | เชื่อม Firebase ใหม่ | Production realtime และ transaction |
| 10 | Session Restore / Idempotency | Refresh ได้และไม่บวกคะแนนซ้ำ |
| 11 | Tests และ QA | ผ่าน lint/typecheck/test/build |
| 12 | Load Test | ทดสอบประมาณ 40 clients |
| 13 | Deploy และ Classroom Dry Run | พร้อมทดลองในห้องเรียน |

---

# PHASE 0 — ตรวจ Git และสร้างจุดย้อนกลับ

## เป้าหมาย

ยืนยันว่าฐาน Matana ที่คัดลอกมาถูก Commit แล้ว ก่อนเริ่มแก้ระบบเกม

## คำสั่ง PowerShell

```powershell
cd "C:\Users\jiras\Documents\Our City, Our Choice"

git status
git log --oneline --decorate -5
```

### กรณี `git log` แสดง Commit แล้ว

ตรวจว่ามีข้อความประมาณ:

```text
Baseline from Matana classroom game
```

ถ้ามี ให้ไปขั้นตอนสร้าง Branch

### กรณียังไม่มี Commit

```powershell
git commit -m "Baseline from Matana classroom game"
git log --oneline --decorate -5
```

### สร้าง Branch สำหรับการย้ายระบบ

```powershell
git switch -c feature/our-city-migration
git status
```

ถ้า Branch มีอยู่แล้ว:

```powershell
git switch feature/our-city-migration
```

## Definition of Done

- `git status` ไม่มีไฟล์ค้างจาก Baseline
- มี Baseline commit อย่างน้อย 1 commit
- อยู่บน Branch `feature/our-city-migration`
- ยังไม่มีการแก้ implementation

---

# PHASE 1 — Audit โครงสร้างโปรเจกต์และสร้าง MIGRATION_PLAN.md

## เป้าหมาย

ให้ AI อ่านระบบเดิมก่อนแก้ และจำแนกไฟล์ทุกส่วนเป็น:

- `KEEP` — ใช้ต่อแทบไม่ต้องแก้
- `ADAPT` — ใช้โครงเดิมแต่เปลี่ยนเนื้อหา/logic
- `REPLACE` — ต้องแทนที่ระบบเดิม
- `ADD` — ต้องเพิ่มใหม่

## ไฟล์และส่วนที่ต้องตรวจ

```text
package.json
vite.config.*
tsconfig*.json
src/main.*
src/App.*
src/router/
src/routes/
src/pages/
src/components/
src/context/
src/contexts/
src/services/
src/types/
src/data/
src/hooks/
src/utils/
src/assets/
src/__tests__/
tests/
firebase.json
firestore.rules
```

## ห้ามทำใน Phase นี้

- ห้ามแก้ implementation
- ห้ามติดตั้ง dependency
- ห้ามลบไฟล์
- ห้ามเปลี่ยน Firebase config
- ห้ามสร้าง UI ใหม่
- ห้ามย้ายโครงสร้างครั้งใหญ่

## พรอมต์ก๊อปวางให้ Codex

```text
โปรดทำงานในโฟลเดอร์:

C:\Users\jiras\Documents\Our City, Our Choice

อ่านไฟล์ PROJECT_HANDOFF_CONFIRMED_V2.md เป็น Source of Truth ก่อนทุกอย่าง

งาน Phase 1:
1. ตรวจ git status และ git log เพื่อยืนยัน Baseline commit
2. อ่าน package.json และโครงสร้าง src ทั้งหมด
3. Audit router, pages, context, services, types, tests และ Firebase-related files
4. สร้างไฟล์ MIGRATION_PLAN.md
5. แบ่งไฟล์และระบบเป็น KEEP / ADAPT / REPLACE / ADD
6. ระบุไฟล์ที่จะเปลี่ยนตามลำดับ
7. ระบุ dependency ที่มีอยู่แล้วและ dependency ที่ไม่จำเป็นต้องเพิ่ม
8. ระบุความเสี่ยงต่อระบบ Session Restore, realtime, scoring และ tests
9. สรุปคำถามที่ต้องให้เจ้าของโครงการตัดสินใจก่อน implement

ข้อห้าม:
- ห้ามแก้ implementation
- ห้ามติดตั้ง dependency
- ห้ามลบหรือ rename ไฟล์
- ห้ามเปลี่ยน framework
- ห้ามเชื่อม Firebase Production ของ Matana
- ห้ามใช้ Next.js, vinext, Cloudflare D1 หรือ REST polling

ส่งผลลัพธ์:
- MIGRATION_PLAN.md
- สรุปไฟล์ที่อ่าน
- สรุป KEEP / ADAPT / REPLACE / ADD
- สรุปคำสั่งทดสอบที่มีอยู่ใน package.json
```

## โครงสร้าง MIGRATION_PLAN.md ที่ควรได้

```markdown
# MIGRATION PLAN

## Current Architecture
## Confirmed Product Rules
## KEEP
## ADAPT
## REPLACE
## ADD
## Proposed File Order
## Data Model Changes
## Service Layer Changes
## Student Flow Changes
## Teacher Dashboard Changes
## Timer Changes
## City Scoring Changes
## Firebase Changes
## Session Restore Changes
## Test Plan
## Risks
## Decision Gates
```

## Definition of Done

- มี `MIGRATION_PLAN.md`
- ไม่มี implementation ถูกแก้
- ไม่มี dependency เพิ่ม
- รู้ลำดับไฟล์ที่จะเปลี่ยน
- รู้คำสั่ง lint/typecheck/test/build ที่มีอยู่จริง

## Commit

```powershell
git add MIGRATION_PLAN.md
git commit -m "docs: add Our City migration plan"
```

---

# PHASE 2 — ออกแบบ Domain Model และ State Model

## เป้าหมาย

เปลี่ยนแนวคิดจากเกม Matana ที่มีผู้ชนะรายบุคคล ไปเป็นเกมเมืองร่วมกันที่ผู้เล่นมีอาชีพคงที่และตอบ 10 คำถาม

## Types หลักที่ควรมี

```ts
type RoleId =
  | "mayor"
  | "municipal"
  | "police"
  | "teacher"
  | "merchant"
  | "contractor"
  | "student"
  | "journalist";

type GameStatus =
  | "lobby"
  | "role-reveal"
  | "question"
  | "question-closed"
  | "finished";

type CityLevel =
  | "critical"
  | "declining"
  | "neutral"
  | "improving"
  | "prosperous";

interface RoomSettings {
  questionDurationSec: number;
  totalQuestionsPerPlayer: 10;
}

interface PlayerState {
  id: string;
  nickname: string;
  roleId: RoleId | null;
  currentQuestionIndex: number;
  completedQuestionIds: string[];
  isFinished: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

interface Choice {
  id: string;
  text: string;
}

interface Question {
  id: string;
  roleId: RoleId;
  situation: string;
  choices: Choice[];
  feedbackByChoiceId: Record<string, string>;
  topic: string;
}

interface AnswerRecord {
  id: string;
  roomId: string;
  playerId: string;
  questionId: string;
  choiceId: string;
  submittedAt: number;
  impactApplied: boolean;
}

interface RoomState {
  id: string;
  status: GameStatus;
  settings: RoomSettings;
  currentQuestionIndex: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  totalPlayers: number;
  totalAnswers: number;
  completedPlayers: number;
  cityScore: number;
  cityLevel: CityLevel;
}
```

## ข้อสำคัญ

- Client ส่ง `choiceId` เท่านั้น
- Impact ของ choice ต้องอยู่ใน Service/Backend หรือ question data ที่ Client แก้ไม่ได้
- การบวกคะแนนต้องป้องกันซ้ำด้วย transaction
- ห้ามเก็บสถานะ authoritative ไว้ใน localStorage
- localStorage ใช้เก็บเพียง roomId/playerId/session token ที่จำเป็นต่อ Session Restore
- Role Assignment ต้องถูกเขียนลง Firestore แล้วล็อกไว้
- Refresh ต้องอ่าน role เดิมจาก authoritative state

## จุดตัดสินใจก่อน Implement Timer

ต้องเลือก 1 แบบ:

### แบบแนะนำสำหรับห้องเรียน

`Teacher-synchronized`

- ครูเริ่มคำถาม
- ทุกคนเห็นคำถามลำดับเดียวกัน แต่เนื้อหาแตกต่างตามอาชีพ
- ทุกคนเริ่มและหมดเวลาพร้อมกัน
- จอครูแสดงเวลาที่เหลือของทั้งห้องได้ชัดเจน
- เมื่อหมดเวลา ปิดรับคำตอบ
- ครูกดไปข้อถัดไป หรือระบบเดินต่ออัตโนมัติตามค่าที่กำหนด

### แบบ Self-paced

- ผู้เล่นเริ่มเวลาของแต่ละข้อไม่พร้อมกัน
- จอครูไม่สามารถแสดงเวลารวมทั้งห้องแบบเดียวได้
- ภาพเมืองยังเปลี่ยนตามคำตอบ แต่ความคืบหน้ากระจาย
- ซับซ้อนกว่าในการอธิบายบนโปรเจกเตอร์

**ข้อเสนอสำหรับ MVP:** ใช้ `Teacher-synchronized` เพราะสอดคล้องกับการกำหนดเวลาต่อคำถามและจอเมืองรวม

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 2 ตาม MIGRATION_PLAN.md

เป้าหมาย:
- ปรับเฉพาะ types, interfaces, constants และ pure mapping functions
- ยังไม่ทำ UI
- ยังไม่เชื่อม Firebase Project ใหม่
- ยังไม่ลบ flow เดิมจนกว่า typecheck จะผ่าน

กติกา:
- ผู้เล่น 1 คนมี 1 roleId ตลอดเกม
- มี 8 roles
- ผู้เล่นตอบ 10 คำถามของ role ตนเอง
- ใช้ currentQuestionIndex และข้อความคำถามข้อที่ x/10
- RoomSettings ต้องมี questionDurationSec
- คะแนนเป็น cityScore ร่วมกัน
- มี cityLevel 5 ระดับ
- ไม่มี individual winner และไม่มี leaderboard
- Client ส่ง choiceId เท่านั้น
- ต้องเตรียม idempotent answer model

หลังแก้:
1. รัน formatter ถ้ามี
2. รัน lint
3. รัน typecheck
4. รัน tests
5. รัน build
6. รายงานไฟล์ที่แก้และเหตุผล
7. ห้ามติดตั้ง dependency เพิ่ม
```

## Definition of Done

- Types ใหม่สะท้อนกติกาปัจจุบัน
- ไม่มี `winnerId`, `firstWinner`, `roundRoleReroll` ใน Core Model
- Typecheck ผ่าน
- Tests เดิมที่ยังเกี่ยวข้องผ่าน
- Build ผ่าน

## Commit

```powershell
git add .
git commit -m "refactor: define Our City domain model"
```

---

# PHASE 3 — Role Assignment และ Question Bank

## เป้าหมาย

สร้าง 8 อาชีพ และเตรียมคำถามอาชีพละ 10 ข้อ

## รายการอาชีพ

```ts
export const ROLES = [
  { id: "mayor", label: "นายกเทศมนตรี" },
  { id: "municipal", label: "เจ้าหน้าที่เทศบาล" },
  { id: "police", label: "ตำรวจ" },
  { id: "teacher", label: "ครู" },
  { id: "merchant", label: "พ่อค้าแม่ค้า" },
  { id: "contractor", label: "ผู้รับเหมา" },
  { id: "student", label: "นักเรียน" },
  { id: "journalist", label: "นักข่าว" },
] as const;
```

## การแจกอาชีพแบบสมดุล

จำนวนผู้เล่นในแต่ละอาชีพต่างกันไม่เกิน 1 คน

แนวทาง:

1. นับผู้เล่นทั้งหมด
2. สร้าง role pool แบบวนครบ 8 อาชีพ
3. Shuffle role pool ฝั่ง Service
4. เขียน roleId ให้ผู้เล่นทั้งหมดด้วย batch/transaction
5. ถ้าผู้เล่นมี roleId อยู่แล้ว ห้ามเปลี่ยน
6. Refresh/reconnect ต้องได้ role เดิม

## Question Bank Structure

แนะนำแยกไฟล์:

```text
src/data/questions/
  mayor.ts
  municipal.ts
  police.ts
  teacher.ts
  merchant.ts
  contractor.ts
  student.ts
  journalist.ts
  index.ts
```

แต่ละไฟล์ต้องมี 10 ข้อพอดี และทุก `id` ต้องไม่ซ้ำ

ตัวอย่าง:

```ts
export const policeQuestions: Question[] = [
  {
    id: "police-01",
    roleId: "police",
    situation: "เพื่อนของคุณขับรถฝ่าไฟแดงและขอไม่ให้เขียนใบสั่ง",
    choices: [
      { id: "enforce-law", text: "ดำเนินการตามกฎหมายอย่างเท่าเทียม" },
      { id: "help-friend", text: "ปล่อยไปเพราะเป็นเพื่อน" },
    ],
    feedbackByChoiceId: {
      "enforce-law": "การใช้กฎหมายอย่างเท่าเทียมช่วยสร้างความเชื่อมั่นให้เมือง",
      "help-friend": "การใช้ความสัมพันธ์ส่วนตัวเหนือกฎหมายทำลายความยุติธรรม",
    },
    topic: "ผลประโยชน์ทับซ้อน",
  },
];
```

## ข้อห้าม

- ห้ามใส่สีเขียว/แดงในตัวเลือกก่อนตอบ
- ห้ามใช้คำว่า “คำตอบถูก” หรือ “คำตอบผิด” เป็นแกนหลัก
- ห้ามส่ง impact จาก Client
- ห้ามให้คำถามแต่ละอาชีพมีจำนวนไม่เท่ากัน
- ห้ามสุ่มเปลี่ยนอาชีพหลังตอบ

## Tests ที่ต้องมี

- มี 8 roles
- Role ID ไม่ซ้ำ
- ทุก role มี 10 questions
- รวมทั้งหมด 80 questions
- Question ID ไม่ซ้ำ
- Question roleId ตรงกับไฟล์
- ทุกข้อมี 2 choices
- ทุก choice มี feedback
- Role assignment balance ต่างกันไม่เกิน 1
- ผู้เล่นที่มี role แล้วไม่ถูกเปลี่ยน

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 3: Role Assignment และ Question Bank

งาน:
1. สร้าง roles 8 อาชีพตาม canonical list
2. สร้าง balanced role assignment เป็น pure function ก่อน
3. เพิ่ม unit tests สำหรับ role assignment
4. สร้างโครง Question Bank แยกตามอาชีพ
5. ตรวจให้แต่ละอาชีพมี 10 ข้อ รวม 80 ข้อ
6. เพิ่ม validation tests สำหรับ question IDs, role IDs, choices และ feedback
7. ยังไม่แก้ UI เต็มรูปแบบ
8. ยังไม่เชื่อม Firebase Project ใหม่
9. ห้ามติดตั้ง dependency

หลังแก้ให้รัน lint/typecheck/tests/build และรายงานผล
```

## Commit

```powershell
git add .
git commit -m "feat: add roles and role-based question bank"
```

---

# PHASE 4 — ปรับ GameService และ DemoService ก่อน Firebase

## เป้าหมาย

ทำให้เกมใหม่เล่นได้ครบ Flow ด้วย DemoService ก่อน เพื่อแยกปัญหา UI/logic ออกจาก Firebase

## GameService Interface ที่ควรมี

```ts
interface GameService {
  createRoom(settings: RoomSettings): Promise<string>;
  joinRoom(roomId: string, nickname: string): Promise<PlayerState>;
  subscribeRoom(roomId: string, listener: (room: RoomState) => void): Unsubscribe;
  subscribePlayers(roomId: string, listener: (players: PlayerState[]) => void): Unsubscribe;
  startGame(roomId: string): Promise<void>;
  submitAnswer(input: {
    roomId: string;
    playerId: string;
    questionId: string;
    choiceId: string;
  }): Promise<void>;
  closeCurrentQuestion(roomId: string): Promise<void>;
  advanceQuestion(roomId: string): Promise<void>;
  finishGame(roomId: string): Promise<void>;
  resetGame(roomId: string, keepPlayers: boolean): Promise<void>;
  restoreSession(): Promise<RestoredSession | null>;
}
```

## DemoService ต้องจำลองได้

- สร้างห้อง
- Join ผู้เล่นหลายคน
- แจกอาชีพสมดุล
- เริ่มเกม
- เริ่มและปิด Timer
- รับคำตอบ
- กันคำตอบซ้ำ
- บวก cityScore
- เปลี่ยน cityLevel
- ทำครบ 10 ข้อ
- Reset โดยคงผู้เล่นเดิม
- Restore session

## หลักการ

- UI ต้องเรียกผ่าน GameService เท่านั้น
- ห้าม UI เขียน Firestore โดยตรง
- DemoService และ FirebaseGameService ต้องใช้ interface เดียวกัน
- Pure logic ควรแยกออกจาก service เพื่อทดสอบง่าย

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 4: ปรับ GameService และ DemoService

เป้าหมาย:
- ให้ flow ใหม่ทำงานครบใน Demo Mode ก่อน Firebase
- รักษา GameService abstraction เดิม
- UI ห้ามเรียก Firestore โดยตรง
- เพิ่ม idempotency ป้องกัน submitAnswer ซ้ำ
- เพิ่ม room settings สำหรับ questionDurationSec
- เพิ่ม city score และ city level mapping
- รองรับ reset โดยเลือก keepPlayers
- รองรับ restoreSession

ยังไม่ทำ:
- ยังไม่เชื่อม Firebase Project ใหม่
- ยังไม่ deploy
- ยังไม่ติดตั้ง dependency

เพิ่ม tests สำหรับ:
- startGame แจก role ครั้งเดียว
- submitAnswer เดิมสองครั้งนับคะแนนครั้งเดียว
- ผู้เล่นตอบครบ 10 ข้อแล้ว isFinished = true
- reset แบบ keepPlayers คงรายชื่อแต่ล้าง progress
- restore session คืน room/player เดิม

รัน lint/typecheck/tests/build และรายงานผล
```

## Commit

```powershell
git add .
git commit -m "feat: migrate game service to shared-city flow"
```

---

# PHASE 5 — พัฒนา Student Flow

## หน้าที่ต้องมี

```text
/student/join
/student/lobby
/student/role
/student/question
/student/feedback
/student/waiting
/student/summary
```

ชื่อ route จริงปรับตามโครง Router เดิมได้ แต่ต้องแยกเป็นหน้า ไม่ใช้ local state จำลอง route

## Flow

1. นักเรียนกรอกรหัสห้องและชื่อเล่น
2. เข้าสู่ Lobby
3. ครูเริ่มเกม
4. ระบบแสดง Role Reveal
5. แสดงรายละเอียดอาชีพสั้น ๆ
6. เข้าคำถามข้อที่ 1/10
7. เลือกคำตอบ
8. เปิด Confirmation Dialog
9. ยืนยันแล้วส่ง `choiceId`
10. แสดง feedback เชิงเหตุและผล
11. รอคำถามถัดไป หรือไปข้อถัดไปตามโหมดที่ยืนยัน
12. ครบ 10 ข้อไป Final City Summary

## UI Requirements

- Mobile-first
- ใช้งานได้ตั้งแต่ 360px
- ปุ่มสูงอย่างน้อยประมาณ 48px
- ตัวเลือกสองข้างมีน้ำหนักเท่ากัน
- ไม่ใช้สีเขียว/แดงก่อนตอบ
- แสดง `คำถามข้อที่ x/10`
- แสดงเวลาที่เหลือชัดเจน
- ปุ่มยืนยันลดการแตะผิด
- เมื่อหมดเวลา ปิดตัวเลือก
- ไม่ตอบให้แสดงสถานะ “หมดเวลา” ไม่ใช่ “ตอบผิด”
- Refresh ต้องกลับหน้าถูกต้อง

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 5: Student Flow

ปรับ route และ page components ให้รองรับ:
Join → Lobby → Role Reveal → Role Detail → Question → Confirm → Feedback/Waiting → Summary

ข้อกำหนด:
- ใช้ React Router จริง
- ใช้ Context/Service เป็น state source
- แสดงคำถามข้อที่ x/10
- แสดง timer
- ปิดคำตอบเมื่อหมดเวลา
- ไม่ใช้สีชี้นำก่อนตอบ
- Confirmation Dialog ก่อน submit
- submit choiceId เท่านั้น
- refresh/reconnect ต้อง restore ไปหน้าที่ถูกต้อง
- ไม่แสดงคะแนนส่วนตัว
- ไม่สร้าง leaderboard
- ไม่ติดตั้ง dependency

เพิ่ม component tests หรือ route tests เท่าที่โครงเดิมรองรับ
รัน lint/typecheck/tests/build
```

## Commit

```powershell
git add .
git commit -m "feat: build student role-based game flow"
```

---

# PHASE 6 — ระบบ Timer แบบเวลาจากศูนย์กลาง

## เป้าหมาย

ครูกำหนดจำนวนวินาทีต่อคำถาม และทุกเครื่องคำนวณเวลาที่เหลือจาก timestamp เดียวกัน

## Room Fields

```ts
questionDurationSec: number;
questionStartedAt: Timestamp | null;
questionEndsAt: Timestamp | null;
```

## วิธีคำนวณ

```ts
remainingMs = questionEndsAtMs - estimatedServerNowMs;
remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
```

## ห้ามใช้

- ห้ามให้แต่ละเครื่องเริ่ม `setInterval(duration)` ของตัวเองแล้วถือว่า authoritative
- ห้ามเชื่อถือเวลาจาก Client ในการตัดสินว่าคำตอบทันหรือไม่
- ห้ามให้ refresh แล้ว Timer เริ่มใหม่
- ห้ามให้การสลับแท็บหยุดเวลา

## พฤติกรรมเมื่อหมดเวลา

- UI ปิดตัวเลือกทันทีเมื่อ `remainingSec <= 0`
- Service ตรวจเวลาอีกครั้งก่อนยอมรับคำตอบ
- คำตอบหลัง `questionEndsAt` ต้องไม่ถูกนับ
- ไม่ตอบไม่หักคะแนนอัตโนมัติ
- จอครูเห็นจำนวนคนตอบแล้วแบบ realtime

## ตัวเลือกการเดินเกม

### ทางเลือก A — ครูกดข้อถัดไป

- หมดเวลาแล้วสถานะเป็น `question-closed`
- ครูดูผลเมืองชั่วครู่
- ครูกด “คำถามถัดไป”
- เหมาะกับการอภิปราย

### ทางเลือก B — ระบบเดินต่ออัตโนมัติ

- หมดเวลาแล้วรอ 2–5 วินาที
- ระบบเปิดคำถามถัดไป
- เล่นเร็วกว่าแต่ครูควบคุมน้อยกว่า

**ข้อเสนอสำหรับกิจกรรมการเรียนรู้:** ทางเลือก A เหมาะกว่า เพราะให้นักเรียนดูผลเมืองและครูอธิบายสั้น ๆ ก่อนข้อต่อไป

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 6: Central Timer

กติกา:
- ครูกำหนด questionDurationSec ก่อนเริ่มเกม
- ใช้ questionStartedAt และ questionEndsAt จาก authoritative state
- Client คำนวณ remaining time จาก timestamp
- refresh ต้องไม่รีเซ็ตเวลา
- Service ปฏิเสธคำตอบที่ส่งหลัง questionEndsAt
- คำตอบที่ไม่ส่งไม่ถูกหักคะแนน
- เมื่อหมดเวลาเปลี่ยนสถานะเป็น question-closed
- ยังไม่เดินข้อถัดไปอัตโนมัติ ให้ครูกดคำถามถัดไป
- ห้ามเชื่อถือเวลาจาก Client เป็นตัวตัดสินสุดท้าย

เพิ่ม tests:
- refresh กลาง Timer ได้เวลาเดิม
- answer ก่อนหมดเวลาถูกยอมรับ
- answer หลังหมดเวลาถูกปฏิเสธ
- non-answer ไม่เปลี่ยน cityScore
- timer ไม่ติดลบใน UI

รัน lint/typecheck/tests/build
```

## Commit

```powershell
git add .
git commit -m "feat: add synchronized question timer"
```

---

# PHASE 7 — Teacher Projector Dashboard

## เป้าหมาย

สร้างจอครูสำหรับฉายโปรเจกเตอร์ โดยให้ภาพเมืองเป็นองค์ประกอบหลัก ไม่ใช่ตาราง Admin

## โครงหน้าจอ

### แถบบนแบบบาง

- ชื่อเกม
- รหัสห้อง
- เวลาที่เหลือ
- จำนวนคำตอบ เช่น `ตอบแล้ว 24 / 32 คน`
- จำนวนผู้เล่นที่ทำครบ เช่น `ทำครบแล้ว 8 / 32 คน`
- สถานะเมือง เช่น `เมืองกำลังเสื่อมโทรม`

### พื้นที่หลัก

- ภาพเมืองขนาดใหญ่เต็มพื้นที่
- เปลี่ยนระดับเมืองด้วย Crossfade
- แสดงผลสะสมให้เห็นชัดแต่ไม่กระพริบรุนแรง
- ใช้ภาพมุมกล้องเดียวกันทั้ง 5 ระดับ

### แถบควบคุมครู

- เริ่มเกม
- ปิดคำถาม
- คำถามถัดไป
- จบเกม
- Reset เกม
- เปิด Fullscreen
- คัดลอกรหัส/แสดง QR

## ห้ามแสดง

- รายชื่อนักเรียนพร้อมคำตอบ
- ใครเลือกตัวเลือกใด
- Leaderboard
- ผู้ชนะรายบุคคล
- `รอบที่ 3/10` แบบเหมือนทุกคนอยู่ progress เดียวกัน เว้นแต่ใช้ teacher-synchronized จริง
- ตัวเลข Mockup เช่นคะแนน 845 แบบ hardcode

## Visual Feedback ของเมือง

เมืองควรเปลี่ยนให้เห็นผล เช่น:

- ท้องฟ้าหม่นหรือสว่าง
- ขยะเพิ่มหรือลด
- น้ำเสียหรือสะอาด
- อาคารทรุดโทรมหรือได้รับการดูแล
- พื้นที่สีเขียวลดหรือเพิ่ม
- ถนนชำรุดหรือดีขึ้น
- ตลาด โรงเรียน สถานีตำรวจ และเทศบาลมีสภาพเปลี่ยนตามเมือง

ไม่ควรสร้าง animation รายการย่อยจำนวนมากใน MVP  
ใช้ภาพเมือง 5 ระดับ + Crossfade เป็นระบบหลัก

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 7: Teacher Projector Dashboard

อ้างอิงภาพ:
แดชบอร์ดครูในเมืองเราสร้าง.png

เป้าหมาย:
- ภาพเมืองเต็มจอเป็นพระเอก
- แถบบนบางและอ่านง่ายบนโปรเจกเตอร์
- แสดง room code, timer, answers received, completed players และ city status
- มีปุ่ม teacher controls ที่จำเป็น
- มี fullscreen mode
- เปลี่ยน city image ด้วย crossfade ตาม cityLevel
- ไม่ทำหน้า admin แบบตาราง
- ไม่แสดงว่าใครตอบอะไร
- ไม่สร้าง leaderboard
- ไม่ใช้ข้อความ mockup แบบ hardcode

รองรับ:
- 1366×768
- 1920×1080
- Tablet landscape สำหรับครู

รัน lint/typecheck/tests/build และแนบรายการ route/component ที่แก้
```

## Commit

```powershell
git add .
git commit -m "feat: add city-focused teacher dashboard"
```

---

# PHASE 8 — City Scoring และภาพเมือง 5 ระดับ

## เป้าหมาย

คำนวณผลรวมจากการตัดสินใจของทั้งห้อง และเปลี่ยนภาพเมืองให้เห็นผลชัดเจน

## สิ่งที่ต้องตัดสินก่อนล็อกสูตร

1. คะแนนเริ่มต้น
2. Impact ต่อ choice เช่น `-1 / +1` หรือ `-8 / +2`
3. ช่วงคะแนนของ 5 ระดับ
4. แสดงคะแนนเป็นเลขหรือซ่อนเลขไว้
5. เปลี่ยนเมืองทันทีทุกคำตอบ หรือสรุปเมื่อหมดเวลาของข้อ

## ข้อเสนอที่เหมาะกับเป้าหมายการสอน

เพื่อให้ “การทุจริตแม้เพียงบางส่วนทำร้ายเมืองได้ชัด” ใช้คะแนนเชิงอสมมาตร เช่น:

```text
ทางเลือกซื่อสัตย์      +2
ทางเลือกหลีกเลี่ยง     0
ทางเลือกทุจริต         -8
```

แต่ควร Normalize ตามจำนวนผู้เล่น เพื่อให้ห้อง 20 คนกับ 40 คนได้ระดับเมืองเทียบกันได้

ตัวอย่างแนวคิด:

```ts
normalizedScore =
  totalPossibleImpact === 0
    ? 0
    : actualImpact / totalPossiblePositiveImpact;
```

หรือคำนวณเป็นคะแนนเฉลี่ยต่อคำตอบ

## Mapping ตัวอย่าง

```ts
function getCityLevel(scorePercent: number): CityLevel {
  if (scorePercent <= 20) return "critical";
  if (scorePercent <= 40) return "declining";
  if (scorePercent <= 60) return "neutral";
  if (scorePercent <= 80) return "improving";
  return "prosperous";
}
```

ตัวเลขนี้เป็นตัวอย่าง ต้องยืนยันก่อน Production

## ไฟล์ภาพ

```text
city-critical.webp
city-declining.webp
city-neutral.webp
city-improving.webp
city-prosperous.webp
```

## Asset Rules

- Aspect ratio เดียวกัน
- Resolution เดียวกัน
- มุมกล้องเดียวกัน
- ตำแหน่งอาคารหลักตรงกัน
- ไม่มีข้อความบนภาพ
- ใช้ WebP
- ขนาดไฟล์ต้องเหมาะกับการโหลดพร้อมกัน
- Preload ภาพทั้งหมดก่อนเริ่มเกม
- Crossfade 500–1000ms

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 8: City Scoring และ City Level

ก่อนแก้:
- อ่านค่าที่เจ้าของโครงการยืนยันเรื่อง scoring
- ห้ามเลือก threshold เองถ้ายังไม่ได้รับคำตอบ

งาน:
1. แยก pure scoring functions
2. เพิ่ม normalization ให้รองรับจำนวนผู้เล่นต่างกัน
3. map score เป็น cityLevel 5 ระดับ
4. ป้องกัน answer ซ้ำเปลี่ยนคะแนนซ้ำ
5. preload city images
6. ทำ crossfade ระหว่างภาพเมือง
7. เพิ่ม tests ครอบคลุม threshold boundaries
8. ห้ามให้ Client ส่ง impact
9. ห้าม hardcode คะแนนใน component

รัน lint/typecheck/tests/build
```

## Commit

```powershell
git add .
git commit -m "feat: add shared city scoring and visual states"
```

---

# PHASE 9 — สร้าง Firebase Project ใหม่และเชื่อม Production Service

## เป้าหมาย

แยกเกมนี้ออกจาก Firebase Production ของ Matana โดยเด็ดขาด

## สิ่งที่ต้องสร้าง

- Firebase Project ใหม่
- Web App ใหม่
- Firestore Database
- Anonymous Authentication
- Hosting
- Security Rules
- Indexes ถ้าจำเป็น
- `.env.local` สำหรับ config
- `.env.example` ที่ไม่มี secret จริง

## โครง Firestore ที่แนะนำ

```text
rooms/{roomId}
rooms/{roomId}/players/{playerId}
rooms/{roomId}/answers/{answerId}
```

### rooms/{roomId}

```ts
{
  status,
  settings,
  currentQuestionIndex,
  questionStartedAt,
  questionEndsAt,
  totalAnswers,
  completedPlayers,
  cityScore,
  cityLevel,
  createdAt,
  updatedAt
}
```

### players/{playerId}

```ts
{
  nickname,
  roleId,
  currentQuestionIndex,
  completedQuestionIds,
  isFinished,
  joinedAt,
  lastSeenAt
}
```

### answers/{answerId}

ใช้ ID ที่ deterministic เช่น:

```text
{playerId}_{questionId}
```

เพื่อป้องกันคำตอบซ้ำระดับเอกสาร

## Transaction ที่ต้องมี

### Submit Answer

1. อ่าน room
2. ตรวจ status และเวลา
3. ตรวจ player
4. ตรวจว่า question ตรงกับ role และ current index
5. ตรวจ answer document ว่ายังไม่มี
6. อ่าน impact จาก trusted question data
7. สร้าง answer
8. อัปเดต player progress
9. อัปเดต room cityScore / totalAnswers
10. Commit พร้อมกัน

## Security Rules เป้าหมาย

- ผู้เล่นอ่านห้องที่ตนเข้าร่วม
- ผู้เล่นสร้าง/แก้เฉพาะสถานะที่อนุญาต
- ห้าม Client เขียน cityScore โดยตรง
- ห้าม Client เขียน roleId เอง
- ห้าม Client เขียน impact
- Teacher action ต้องแยกสิทธิ์หรือใช้ room host token/ownership pattern
- Production rules ห้ามเปิด `allow read, write: if true`

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 9: Firebase Production Integration

เงื่อนไข:
- ต้องใช้ Firebase Project ใหม่ของ Our City
- ห้ามแก้หรือ deploy ทับ Matana
- ใช้ GameService interface เดิม
- ใช้ Firestore onSnapshot
- ใช้ transaction/batch
- ใช้ anonymous auth
- answer document ต้อง idempotent
- Client ห้ามเขียน cityScore, impact หรือ roleId โดยตรง
- เพิ่ม firestore rules และ emulator tests ถ้าโครงเดิมรองรับ
- config จริงอยู่ใน .env.local
- commit ได้เฉพาะ .env.example
- ห้าม commit secrets

หลังแก้:
- รัน lint/typecheck/tests/build
- ทดสอบ DemoService และ FirebaseGameService
- รายงาน Firebase collections และ rules
```

## Commit

```powershell
git add .
git commit -m "feat: connect Our City Firebase service"
```

---

# PHASE 10 — Session Restore และป้องกันคะแนนซ้ำ

## เป้าหมาย

Refresh, ปิดแท็บ, เน็ตหลุด แล้วกลับมาเล่นต่อได้โดยไม่เปลี่ยนอาชีพและไม่บวกคะแนนซ้ำ

## localStorage เก็บได้

```ts
{
  roomId,
  playerId,
  sessionVersion
}
```

## localStorage ห้ามเก็บเป็น authoritative

- roleId
- cityScore
- currentQuestionIndex
- completedQuestionIds
- answer impact
- room status

ค่าดังกล่าวต้องอ่านจาก Firestore/Service

## Restore Flow

1. อ่าน roomId/playerId จาก localStorage
2. ตรวจว่าห้องยังอยู่
3. ตรวจว่าผู้เล่นยังอยู่
4. subscribe room และ player
5. route ไปหน้าตาม authoritative state
6. ถ้าห้องถูกลบหรือ session ใช้ไม่ได้ ให้ clear session และกลับ Join
7. ถ้า reconnect หลังหมดเวลา ต้องไม่เปิดให้ตอบย้อนหลัง
8. ถ้าคำตอบถูกส่งแล้ว ให้แสดงสถานะตอบแล้ว ไม่ส่งซ้ำ

## Tests

- Refresh ใน Lobby
- Refresh ใน Role Reveal
- Refresh ระหว่าง Timer
- Refresh หลังตอบ
- Refresh หลังหมดเวลา
- Refresh ใน Summary
- Offline/online reconnect
- Double-click submit
- สองแท็บ submit พร้อมกัน
- Reset แล้ว session เดิมอัปเดตถูกต้อง

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 10: Session Restore และ Idempotency

เป้าหมาย:
- refresh/reconnect แล้วกลับ state ที่ถูกต้อง
- roleId เดิม
- progress เดิม
- timer เดิม
- คำตอบเดิมไม่ถูกส่งซ้ำ
- ใช้ authoritative state จาก service
- localStorage เก็บเฉพาะ session identifiers
- เพิ่ม tests สำหรับ double submit และ two-tab race
- ห้ามแก้คะแนนจาก client state

รัน lint/typecheck/tests/build
```

## Commit

```powershell
git add .
git commit -m "feat: harden session restore and answer idempotency"
```

---

# PHASE 11 — QA และ Automated Tests

## คำสั่ง

ให้ตรวจ scripts จริงก่อน:

```powershell
npm run
```

จากนั้นใช้ script ที่มีอยู่ เช่น:

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

ถ้า script ต่างจากนี้ ให้ใช้ชื่อจาก `package.json`  
ห้ามติดตั้ง dependency เพียงเพราะชื่อคำสั่งไม่ตรง

## Test Matrix

### Room

- ครูสร้างห้องได้
- รหัสห้องไม่ซ้ำ
- QR เข้าห้องถูก
- ชื่อซ้ำจัดการตามกติกา
- Late join ตาม policy ที่ยืนยัน

### Role

- แจกครบ 8 อาชีพ
- จำนวนสมดุล
- ผู้เล่นมีอาชีพเดียว
- Refresh ไม่เปลี่ยนอาชีพ
- Reset แบบ keep players จัดการ role ตามกติกาที่กำหนด

### Questions

- คนละอาชีพเห็นคำถามคนละชุด
- ทุกคนเห็น progress x/10
- Question ID ไม่ซ้ำ
- ส่ง choiceId เท่านั้น

### Timer

- เริ่มพร้อมกัน
- หมดพร้อมกัน
- refresh ไม่เริ่มใหม่
- background tab ไม่หยุดเวลา
- หลังหมดเวลาตอบไม่ได้

### Scoring

- คำตอบเดียวบวกครั้งเดียว
- Client ปลอม impact ไม่ได้
- ไม่ตอบไม่ถูกหักคะแนน
- cityLevel เปลี่ยนตาม threshold
- จำนวนผู้เล่นต่างกันยัง normalize ถูกต้อง

### Teacher Dashboard

- ภาพเมืองเต็มจอ
- Crossfade
- ตัวเลข realtime
- ไม่เปิดเผยคำตอบรายบุคคล
- Fullscreen ใช้ได้
- 1366×768 และ 1920×1080 อ่านได้

### Session

- Refresh ทุกหน้า
- เน็ตหลุดแล้วกลับมา
- เปิดสองแท็บ
- Reset
- Finish

## QA Report

สร้าง:

```text
QA_REPORT.md
```

ควรมี:

```markdown
# QA REPORT

## Environment
## Commands Run
## Automated Test Results
## Manual Test Cases
## Responsive Screens
## Realtime Tests
## Session Restore Tests
## Timer Tests
## Scoring Tests
## Known Issues
## Release Decision
```

## Commit

```powershell
git add .
git commit -m "test: complete Our City QA coverage"
```

---

# PHASE 12 — Load Test ประมาณ 40 Clients

## เป้าหมาย

จำลองผู้เล่น 40 คนเข้าห้องและตอบพร้อมกันโดยไม่เกิดคะแนนซ้ำหรือ Dashboard ค้าง

## Scenarios

1. 40 คน Join ภายใน 30–60 วินาที
2. ครู Start ครั้งเดียว
3. แจก role แบบสมดุล
4. 40 คน submit ใกล้กันในช่วง 2–5 วินาที
5. บางคน double-click
6. บางคน refresh ระหว่างคำถาม
7. บางคนเน็ตหลุดแล้ว reconnect
8. ครูกดปิดคำถาม
9. ไปครบ 10 ข้อ
10. Reset โดยคงรายชื่อ

## Metrics

- จำนวน Firestore reads/writes ต่อคำถาม
- เวลาตอบสนอง submit
- onSnapshot latency
- Duplicate answer count ต้องเป็น 0
- cityScore mismatch ต้องเป็น 0
- role reassignment ต้องเป็น 0
- UI crash ต้องเป็น 0
- memory leak จาก unsubscribe ต้องเป็น 0

## ข้อควรระวัง

- ใช้ Firebase Emulator ก่อนถ้าเป็นไปได้
- ห้ามยิง Production โดยไม่จำกัด
- ห้ามสร้าง polling
- ตรวจ unsubscribe ทุก subscription
- อย่า subscribe collection ใหญ่โดยไม่จำเป็น

## พรอมต์ก๊อปวางให้ Codex

```text
ทำ Phase 12: Load Test Plan สำหรับ 40 clients

งาน:
1. สร้าง LOAD_TEST_PLAN.md
2. ใช้ Firebase Emulator หรือ DemoService ก่อน
3. จำลอง join 40 คน
4. จำลอง submit พร้อมกัน
5. จำลอง double submit, refresh และ reconnect
6. ตรวจ duplicate answer, cityScore mismatch และ role reassignment
7. วัดจำนวน reads/writes โดยประมาณ
8. ห้ามใช้ REST polling
9. ห้ามยิง Production โดยไม่มี safety limit
10. สรุป bottleneck และข้อเสนอปรับปรุง

ยังไม่ deploy จนกว่าผล QA ผ่าน
```

## Commit

```powershell
git add .
git commit -m "test: add 40-client load test plan"
```

---

# PHASE 13 — Deploy และ Classroom Dry Run

## ก่อน Deploy

```powershell
git status
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

ทุกคำสั่งต้องผ่าน

## Deploy Checklist

- Firebase Project ถูกต้อง
- `.env.local` ชี้ Project ใหม่
- Hosting target ไม่ใช่ Matana
- Firestore Rules deploy แล้ว
- Firestore Indexes deploy แล้ว
- Anonymous Auth เปิดแล้ว
- ไม่มี secret ใน Git
- Demo Mode ยังแยกจาก Production
- Asset เมืองโหลดครบ
- QR ชี้ URL Production ใหม่

## Classroom Dry Run

ทดสอบจริงอย่างน้อย:

- ครู 1 เครื่อง
- นักเรียน 5–10 เครื่องก่อน
- Wi-Fi เดียวกับห้องเรียนจริง
- เปิดโปรเจกเตอร์จริง
- ทดสอบ fullscreen
- ทดสอบเสียง/ภาพถ้ามี
- ทดสอบ refresh
- ทดสอบหมดเวลา
- ทดสอบไม่ตอบ
- ทดสอบ Reset
- หลังผ่านจึงทดสอบ 30–40 เครื่อง

## Release Tag

```powershell
git tag -a v0.1.0-classroom-beta -m "Our City classroom beta"
git push origin main --tags
```

ใช้เฉพาะเมื่อ remote repository ถูกตั้งค่าแล้ว

---

# Git Commit Strategy

หนึ่ง Phase ต่อหนึ่ง Commit หลัก เพื่อย้อนกลับง่าย

```text
Baseline from Matana classroom game
docs: add Our City migration plan
refactor: define Our City domain model
feat: add roles and role-based question bank
feat: migrate game service to shared-city flow
feat: build student role-based game flow
feat: add synchronized question timer
feat: add city-focused teacher dashboard
feat: add shared city scoring and visual states
feat: connect Our City Firebase service
feat: harden session restore and answer idempotency
test: complete Our City QA coverage
test: add 40-client load test plan
```

หลังจบแต่ละ Phase:

```powershell
git status
git diff
npm run lint
npm run typecheck
npm test -- --run
npm run build
git add .
git commit -m "ข้อความของ Phase"
```

ถ้า test ไม่ผ่าน ห้าม Commit ว่า Phase สำเร็จ

---

# MASTER PROMPT สำหรับเริ่มงานกับ Codex

```text
คุณกำลังพัฒนาเว็บไซต์เกมการศึกษา:

เมืองนี้อยู่ที่เรา / Our City, Our Choice

โฟลเดอร์:
C:\Users\jiras\Documents\Our City, Our Choice

Source of Truth:
PROJECT_HANDOFF_CONFIRMED_V2.md

กติกาหลัก:
- Vite + React + TypeScript + React Router + Context
- GameService abstraction
- Firebase Firestore onSnapshot + transaction/batch
- DemoService
- Session Restore
- Vitest
- ห้าม Next.js, vinext, Cloudflare D1 และ REST polling
- ห้าม giant GameApp.tsx
- ผู้เล่น 1 คนได้ 1 อาชีพและล็อกตลอดเกม
- 8 อาชีพ
- อาชีพละ 10 คำถาม
- ไม่เปลี่ยนอาชีพระหว่างเกม
- ใช้ข้อความคำถามข้อที่ x/10
- คะแนนรวมเป็นเมืองเดียว
- ไม่มีผู้ชนะรายบุคคล
- ไม่มี leaderboard เป็นแกนหลัก
- ครูกำหนดจำนวนวินาทีต่อคำถามก่อนเริ่มเกม
- จอครูเน้นภาพเมืองเต็มจอ
- เมืองเปลี่ยนตามผลของคำตอบร่วมกัน
- ไม่เปิดเผยว่าใครเลือกอะไร
- ไม่ตอบไม่ถูกหักคะแนนอัตโนมัติ
- Client ส่ง choiceId เท่านั้น
- Backend/Service เป็นผู้ตรวจ impact
- คำตอบเดียวต้องไม่ถูกนับซ้ำ
- Refresh/reconnect ต้องได้อาชีพและ progress เดิม

วิธีทำงาน:
1. อ่านเอกสารก่อน
2. ทำทีละ Phase
3. อย่าแก้เกินขอบเขต Phase
4. อย่าติดตั้ง dependency โดยไม่จำเป็น
5. อย่า Rewrite ทั้งโปรเจกต์
6. หลังทุก Phase รัน lint, typecheck, tests และ build
7. รายงานไฟล์ที่แก้ เหตุผล ผลทดสอบ และความเสี่ยง
8. ถ้าประเด็นใดยังไม่ยืนยัน ให้หยุดเฉพาะจุดนั้นและทำส่วนที่ไม่ขึ้นกับการตัดสินใจก่อนได้

เริ่มจาก:
- ตรวจ git status
- ตรวจ baseline commit
- Audit project
- สร้าง MIGRATION_PLAN.md
- ห้ามแก้ implementation ใน Phase แรก
```

---

# ลำดับที่ควรทำทันทีในตอนนี้

1. เปิด PowerShell
2. ตรวจ Baseline commit
3. สร้าง Branch
4. ส่ง Master Prompt ให้ Codex
5. ให้ Codex ทำเฉพาะ Phase 1
6. อ่าน `MIGRATION_PLAN.md`
7. ตรวจว่าไม่มี Framework ใหม่และไม่มี dependency เพิ่ม
8. Commit แผน
9. เริ่ม Phase 2 ทีละขั้น
10. ห้ามสั่ง Codex ว่า “ทำให้เสร็จทั้งหมด” ในคำสั่งเดียว

---

# จุดที่ยังต้องยืนยันก่อนเข้าสู่ Implementation บางส่วน

1. ใช้ Teacher-synchronized ตามข้อเสนอหรือไม่
2. เมื่อหมดเวลา ครูกดข้อถัดไป หรือระบบไปอัตโนมัติ
3. Late join หลังเริ่มเกม
4. Question order คงที่หรือสุ่ม
5. อนุญาตแก้ตัวเลือกก่อนกดยืนยันหรือไม่
6. สูตร City Score และ Threshold
7. คะแนนเริ่มต้น
8. Reset รอบใหม่จะคงอาชีพเดิมหรือแจกใหม่
9. ระยะเวลาเก็บข้อมูลห้อง
10. Google Sheets import ทำใน MVP หรือ Phase หลัง

ระบบควรออกแบบไม่ให้การตัดสินใจเหล่านี้บังคับ Rewrite ทั้งโปรเจกต์
