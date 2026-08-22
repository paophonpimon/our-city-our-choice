import { useEffect, useId } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Reusable styled confirmation dialog, replacing window.confirm in the active classroom flow. */
export const ConfirmDialog = ({
  open, title, body, confirmLabel, cancelLabel = 'ยกเลิก', destructive = false, busy = false, onConfirm, onCancel,
}: ConfirmDialogProps) => {
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="confirm-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
      role="presentation"
    >
      <section
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`confirm-dialog${destructive ? ' confirm-dialog--destructive' : ''}`}
        role="alertdialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className="confirm-dialog__actions">
          <button autoFocus disabled={busy} onClick={onCancel} type="button">{cancelLabel}</button>
          <button className="confirm-dialog__confirm" disabled={busy} onClick={onConfirm} type="button">
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
