import { Link } from 'react-router-dom'

export const HomePage = () => (
  <main className="our-city-page relative grid min-h-dvh place-items-center overflow-hidden px-5 py-12">
    <img className="absolute inset-0 h-full w-full object-cover opacity-30" src="/images/city/city-neutral.png" alt="" />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,11,16,.4),rgba(3,11,16,.95))]" />
    <section className="our-city-panel relative z-10 w-full max-w-3xl p-8 text-center md:p-12">
      <p className="text-sm font-bold tracking-[.22em] text-[#f4c96d] uppercase">Different roles. Different choices. One shared city.</p>
      <h1 className="mt-5 text-4xl font-black md:text-6xl">เมืองนี้อยู่ที่เรา</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#d4e1df]">
        เกมสถานการณ์จำลองที่ทุกอาชีพตัดสินใจต่างกัน แต่ทุกคำตอบเปลี่ยนเมืองเดียวกัน
      </p>
      <div className="mt-9 grid gap-3 sm:grid-cols-2">
        <Link className="rounded-2xl bg-[#f0c866] px-6 py-4 text-lg font-black text-[#12242a] transition hover:brightness-110" to="/teacher">
          เริ่มสำหรับครู
        </Link>
        <Link className="rounded-2xl border border-white/25 bg-white/10 px-6 py-4 text-lg font-black text-white transition hover:bg-white/15" to="/join">
          เข้าห้องสำหรับนักเรียน
        </Link>
      </div>
    </section>
  </main>
)
