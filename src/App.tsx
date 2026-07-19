import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { GameProvider } from './context/GameContext'
import { ClosedPage } from './pages/ClosedPage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { JoinPage } from './pages/JoinPage'
import { LobbyPage } from './pages/LobbyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ResultPage } from './pages/ResultPage'
import { RoleDrawPage } from './pages/RoleDrawPage'
import { TeacherPage } from './pages/TeacherPage'

const App = () => (
  <GameProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/teacher" element={<TeacherPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/lobby/:roomCode" element={<LobbyPage />} />
        <Route path="/game/:roomCode" element={<GamePage />} />
        <Route path="/role-draw/:roomCode" element={<RoleDrawPage />} />
        <Route path="/result/:roomCode" element={<ResultPage />} />
        <Route path="/closed/:roomCode" element={<ClosedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </GameProvider>
)

export default App
