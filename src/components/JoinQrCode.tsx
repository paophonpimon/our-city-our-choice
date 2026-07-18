import { QRCodeSVG } from 'qrcode.react'

interface JoinQrCodeProps {
  joinUrl: string
  roomId: string
}

export const JoinQrCode = ({ joinUrl, roomId }: JoinQrCodeProps) => (
  <section className="teacher-join-card" aria-labelledby="join-room-title">
    <div className="teacher-join-card__qr" aria-label={`QR Code สำหรับเข้าห้อง ${roomId}`}>
      <QRCodeSVG
        bgColor="#ffffff"
        fgColor="#0a252d"
        level="M"
        marginSize={3}
        size={232}
        title={`เข้าห้อง ${roomId} — เมืองนี้อยู่ที่เรา`}
        value={joinUrl}
      />
    </div>
    <div className="teacher-join-card__details">
      <p className="teacher-join-card__label">สแกนเพื่อเข้าร่วมเกม</p>
      <h2 id="join-room-title">{roomId}</h2>
      <p className="teacher-join-card__url">{joinUrl.replace(/^https?:\/\//, '')}</p>
    </div>
  </section>
)
