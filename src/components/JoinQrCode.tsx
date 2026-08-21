import { QRCodeSVG } from 'qrcode.react'

interface JoinQrCodeProps {
  joinUrl: string
  roomId: string
}

export const JoinQrCode = ({ joinUrl, roomId }: JoinQrCodeProps) => (
  <section className="teacher-join-card" aria-labelledby="join-room-title">
    <div className="teacher-join-card__details">
      <p className="teacher-join-card__label">ห้องของคุณ</p>
      <h2 id="join-room-title">{roomId}</h2>
      <p className="teacher-join-card__url">แชร์ให้เพื่อนเข้าร่วม</p>
    </div>
    <div className="teacher-join-card__qr" aria-label={`QR Code สำหรับเข้าห้อง ${roomId}`}>
      <QRCodeSVG
        bgColor="#ffffff"
        fgColor="#102a4d"
        level="M"
        marginSize={3}
        size={232}
        title={`เข้าห้อง ${roomId} — เมืองนี้อยู่ที่เรา`}
        value={joinUrl}
      />
    </div>
  </section>
)
