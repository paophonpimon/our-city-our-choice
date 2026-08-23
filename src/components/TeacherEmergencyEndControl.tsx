import { useState } from 'react'
import { useGame } from '../context/GameContext'
import { classroomFriendlyError } from '../services'
import { ConfirmDialog } from './ConfirmDialog'

interface TeacherEmergencyEndControlProps {
  roomId: string
  className?: string
  disabled?: boolean
}

const CONFIRMATION_BODY = 'นักเรียนจะเข้าสู่ขั้นตอนหลังกิจกรรม และห้องนี้จะไม่สามารถเล่นต่อได้'

/** Teacher-only recovery escape hatch; it never clears or replaces the teacher session. */
export const TeacherEmergencyEndControl = ({ roomId, className = '', disabled = false }: TeacherEmergencyEndControlProps) => {
  const { service, uid } = useGame()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const terminate = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await service.terminateActivity(roomId, uid)
      setOpen(false)
    } catch (reason) {
      setError(classroomFriendlyError(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={`teacher-emergency-end${className ? ` ${className}` : ''}`}
        disabled={disabled || busy}
        onClick={() => { setError(''); setOpen(true) }}
        type="button"
      >
        จบกิจกรรม
      </button>
      <ConfirmDialog
        body={error ? `${CONFIRMATION_BODY}\n${error}` : CONFIRMATION_BODY}
        busy={busy}
        confirmLabel="ยุติกิจกรรมทันที"
        destructive
        onCancel={() => setOpen(false)}
        onConfirm={() => void terminate()}
        open={open}
        title="ยุติกิจกรรมทันที"
      />
    </>
  )
}
