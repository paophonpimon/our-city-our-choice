import { Link } from 'react-router-dom'

const HOME_VALUES = [
  ['/images/home/home-integrity.png', 'เรียนรู้', 'เรื่องความสุจริต'],
  ['/images/home/home-collaboration.png', 'ร่วมตัดสินใจ', 'เพื่ออนาคตที่ดี'],
  ['/images/home/home-growth.png', 'สร้างเมืองโปร่งใส', 'ไร้ทุจริต'],
] as const

export const HomePage = () => (
  <main className="game-home-page">
    <div className="game-home-page__city" aria-hidden="true">
      <img src="/images/new-city/backgrounds/city-overview-normal.webp" alt="" />
    </div>
    <header className="game-public-header">
      <Link className="game-brand" to="/" aria-label="Our City, Our Choice หน้าหลัก">
        <span className="game-brand__mark" aria-hidden="true"><img src="/images/home/home-city-logo.png" alt="" /></span>
        <strong>OUR CITY<br /><b>OUR CHOICE</b><small>เมืองนี้...อยู่ที่เรา</small></strong>
      </Link>
      <span className="game-public-header__tag"><img src="/images/home/home-classroom.png" alt="" /> กิจกรรมห้องเรียน · เมืองโปร่งใส ไร้ทุจริต</span>
    </header>
    <section className="game-home-hero">
      <div className="game-home-copy">
        <p className="game-kicker">เกมสร้างเมืองเพื่อการเรียนรู้</p>
        <div className="game-home-title" aria-label="Our City, Our Choice เมืองนี้อยู่ที่เรา">
          <span>OUR CITY</span>
          <strong>OUR CHOICE</strong>
          <small>เมืองนี้...อยู่ที่เรา</small>
        </div>
        <span className="game-home-copy__accent" aria-hidden="true" />
        <h1>ร่วมกันเลือก<br /><em>อนาคตของเมือง</em></h1>
        <p>สวมบทบาทเป็นหนึ่งใน 8 อาชีพ ตัดสินใจไปพร้อมกัน แล้วดูความสุจริตและทุกทางเลือกเปลี่ยนเมืองของพวกเรา ให้เป็นเมืองโปร่งใส ไร้ทุจริต</p>
        <div className="game-home-actions">
          <Link className="game-button game-button--primary game-button--city" to="/join"><span aria-hidden="true"><img src="/images/home/home-city-logo.png" alt="" /></span><strong>เข้าสู่เมือง</strong><small>นักเรียนกรอกรหัสเพื่อเริ่มเล่น</small><b aria-hidden="true">›</b></Link>
          <Link className="game-home-teacher-link" to="/teacher"><img src="/images/home/home-school.png" alt="" /> สำหรับครู <b aria-hidden="true">→</b></Link>
        </div>
      </div>
      <div className="game-home-showcase" aria-label="ตัวอย่างอาชีพและเมืองในเกม">
        <img className="game-home-cast" src="/images/home/home-city-roles.png" alt="ตัวละคร 8 อาชีพของเมือง" />
      </div>
      <div className="game-home-value-strip" aria-label="สิ่งที่จะได้เรียนรู้จากเกม">
        {HOME_VALUES.map(([icon, title, detail]) => (
          <article key={title}><img src={icon} alt="" aria-hidden="true" /><div><strong>{title}</strong><small>{detail}</small></div></article>
        ))}
      </div>
    </section>
  </main>
)
