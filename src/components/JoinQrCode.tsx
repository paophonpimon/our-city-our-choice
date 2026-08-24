import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface JoinQrCodeProps {
  joinUrl: string
  roomId: string
}

export const JoinQrCode = ({ joinUrl, roomId }: JoinQrCodeProps) => {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return undefined
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [expanded])

  return (
    <>
      <section className="teacher-join-card" aria-labelledby="join-room-title">
        <div className="teacher-join-card__details">
          <p className="teacher-join-card__label">ห้องของคุณ</p>
          <h2 id="join-room-title">{roomId}</h2>
          <p className="teacher-join-card__url">แชร์ให้เพื่อนเข้าร่วม</p>
        </div>
        <div className="teacher-join-card__qr" aria-label={`QR Code สำหรับเข้าห้อง ${roomId}`}>
          <QRCodeSVG bgColor="#ffffff" fgColor="#102a4d" level="M" marginSize={3} size={156} title={`เข้าห้อง ${roomId} — เมืองนี้อยู่ที่เรา`} value={joinUrl} />
        </div>
        <button aria-haspopup="dialog" className="teacher-join-card__expand" onClick={() => setExpanded(true)} type="button">ขยาย QR สำหรับนักเรียน</button>
      </section>
      {expanded ? (
        <div className="teacher-join-qr-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false) }} role="presentation">
          <section aria-labelledby="teacher-join-qr-title" aria-modal="true" role="dialog">
            <button aria-label="ปิด QR ขนาดใหญ่" className="teacher-join-qr-modal__close" onClick={() => setExpanded(false)} type="button">×</button>
            <h2 id="teacher-join-qr-title">เข้าร่วมห้องเรียน</h2>
            <div className="teacher-join-qr-modal__code" aria-label={`QR Code ขนาดใหญ่สำหรับเข้าห้อง ${roomId}`}>
              <QRCodeSVG bgColor="#ffffff" fgColor="#102a4d" level="M" marginSize={3} size={460} title={`เข้าห้อง ${roomId} — เมืองนี้อยู่ที่เรา`} value={joinUrl} />
            </div>
            <strong>รหัสห้อง {roomId}</strong>
            <p>สแกน QR หรือกรอกรหัสห้อง</p>
          </section>
        </div>
      ) : null}
    </>
  )
}
