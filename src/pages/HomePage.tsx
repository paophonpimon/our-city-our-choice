import { Link } from 'react-router-dom'

export const HomePage = () => (
  <main className="our-city-page relative grid min-h-dvh place-items-center overflow-hidden px-5 py-12">
    <img className="absolute inset-0 h-full w-full object-cover opacity-30" src="/images/city/city-neutral.png" alt="" />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,11,16,.4),rgba(3,11,16,.95))]" />
    <section className="our-city-panel relative z-10 w-full max-w-3xl p-8 text-center md:p-12">
      <p className="text-sm font-bold tracking-[.22em] text-[#f4c96d] uppercase">Our City, Our Choice</p>
      <h1 className="mt-5 text-4xl font-black md:text-6xl">เมืองนี้อยู่ที่เรา</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#d4e1df]">
        Different roles. Different choices. One shared city.<br />ทุกการตัดสินใจร่วมกันเปลี่ยนเมืองของเรา
      </p>
      <div className="mt-9 grid gap-3 sm:grid-cols-2">
        <Link className="home-action home-action--primary" to="/join">
          <span aria-hidden="true">ร่วมเมือง</span>
          <strong>นักเรียนเข้าร่วมเกม</strong>
        </Link>
        <Link className="home-action home-action--secondary" to="/teacher">
          <span aria-hidden="true">ควบคุมเกม</span>
          <strong>ครูเปิดจอควบคุม</strong>
        </Link>
      </div>
    </section>
  </main>
)
