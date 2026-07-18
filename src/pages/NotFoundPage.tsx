import { Link } from 'react-router-dom'
import { ScenePage } from '../components/Layout'

export const NotFoundPage = () => (
  <ScenePage>
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-5 py-8">
      <section className="glass-panel w-full p-8 text-center">
        <p className="eyebrow">Our City, Our Choice</p>
        <h1 className="mt-3 text-4xl font-semibold">ไม่พบหน้านี้</h1>
        <p className="mt-3 text-[#d8d1c5]">ไม่พบเส้นทางนี้ในเกมเมืองนี้อยู่ที่เรา</p>
        <Link className="primary-button mx-auto mt-7 w-full max-w-sm" to="/">กลับหน้าแรก</Link>
      </section>
    </div>
  </ScenePage>
)
