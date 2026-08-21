import { DotLottieReact } from '@lottiefiles/dotlottie-react'

const FLIGHTS = [
  { route: 'route-a', species: 'toucan', direction: 'west', src: '/animations/city-birds.lottie' },
  { route: 'route-b', species: 'quetzal', direction: 'east', src: '/animations/city-birds-quetzal.lottie' },
  { route: 'route-c', species: 'toucan', direction: 'east', src: '/animations/city-birds.lottie' },
  { route: 'route-d', species: 'quetzal', direction: 'west', src: '/animations/city-birds-quetzal.lottie' },
  { route: 'route-e', species: 'toucan', direction: 'west', src: '/animations/city-birds.lottie' },
  { route: 'route-f', species: 'quetzal', direction: 'east', src: '/animations/city-birds-quetzal.lottie' },
] as const

export const CityBirdsAnimation = () => (
  <div className="city-birds" aria-hidden="true">
    {FLIGHTS.map((flight) => (
      <div
        className={`city-birds-lottie city-birds-lottie--${flight.species} city-birds-lottie--${flight.direction} city-birds-lottie--${flight.route}`}
        key={flight.route}
      >
        <DotLottieReact
          autoplay
          className="city-birds-lottie__canvas"
          layout={{ fit: 'contain', align: [0.5, 0.5] }}
          loop
          src={flight.src}
        />
      </div>
    ))}
  </div>
)
